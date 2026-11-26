import { useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { renderTokens } from "../domain/mailer";
import type { EmailCopyRecipients, MailAttachment, QueueItem, Recipient } from "../domain/mailer";
import { sendEmail } from "../services/mailerApi";
import { useMailerStore } from "../store/mailerStore";

interface SendQueueInput extends EmailCopyRecipients {
  recipients: Recipient[];
  subject: string;
  body: string;
  attachments: MailAttachment[];
  fromEmail: string;
}

export interface SendQueueResult {
  sent: number;
  failed: number;
  historySaveErrors: string[];
  stopped: boolean;
}

export function useSendQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState(false);
  const stopRequested = useRef(false);
  const sendingRef = useRef(false);

  const send = async ({
    recipients,
    ccEmails,
    bccEmails,
    subject,
    body,
    attachments,
    fromEmail,
  }: SendQueueInput): Promise<SendQueueResult> => {
    if (!isTauri()) throw new Error("Email sending is available in the Tauri desktop app.");
    if (sendingRef.current) throw new Error("A send sequence is already running.");
    if (recipients.length === 0 || recipients.length > 100) {
      throw new Error("Add between 1 and 100 contacts before sending.");
    }

    sendingRef.current = true;
    stopRequested.current = false;
    setSending(true);
    const batch = recipients.slice(0, 100);
    setQueue(batch.map((recipient) => ({ recipient, status: "queued" })));
    let sent = 0;
    let failed = 0;
    const historySaveErrors: string[] = [];
    let stopped = false;

    try {
      for (let index = 0; index < batch.length; index += 1) {
        if (stopRequested.current) {
          stopped = true;
          break;
        }

        const recipient = batch[index];
        setQueue((items) =>
          items.map((item, itemIndex) =>
            itemIndex === index ? { ...item, status: "sending" } : item,
          ),
        );

        const personalizedSubject = renderTokens(subject, recipient);
        try {
          const receipt = await sendEmail({
            toEmail: recipient.email,
            toName: recipient.name,
            ccEmails,
            bccEmails,
            subject: personalizedSubject,
            body: renderTokens(body, recipient),
            attachments,
          });
          sent += 1;
          setQueue((items) =>
            items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, status: "sent" } : item,
            ),
          );
          if (receipt.historySaveError) historySaveErrors.push(receipt.historySaveError);
          try {
            useMailerStore.getState().addSentMail({
              messageId: receipt.messageId,
              fromEmail,
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              subject: personalizedSubject,
              sentAt: receipt.sentAt * 1_000,
            });
          } catch (error) {
            historySaveErrors.push(error instanceof Error ? error.message : String(error));
          }
        } catch (error) {
          failed += 1;
          setQueue((items) =>
            items.map((item, itemIndex) =>
              itemIndex === index
                ? { ...item, status: "failed", error: String(error) }
                : item,
            ),
          );
        }

        if (index < batch.length - 1 && !stopRequested.current) {
          await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
        }
      }

      stopped ||= stopRequested.current;
      return { sent, failed, historySaveErrors, stopped };
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const stop = () => {
    stopRequested.current = true;
  };

  return { queue, sending, send, stop };
}
