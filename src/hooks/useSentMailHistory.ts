import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { PublicSmtpSettings, SentMailRecord } from "../domain/mailer";
import { googleClientId, googleClientSecret } from "../config";
import { getSentMailHistory, recoverGmailSentMail } from "../services/mailerApi";
import { useMailerStore } from "../store/mailerStore";

export const sentMailHistoryQueryKey = ["sent-mail-history"] as const;

export function useSentMailHistory(
  gmailAccount: string | undefined,
  smtpSettings: PublicSmtpSettings | null | undefined,
) {
  const queryClient = useQueryClient();
  const localSentMail = useMailerStore((state) => state.sentMail);
  const [recovering, setRecovering] = useState(false);
  const historyQuery = useQuery({
    queryKey: sentMailHistoryQueryKey,
    queryFn: () => getSentMailHistory(localSentMail),
    enabled: isTauri(),
    retry: false,
  });
  const sentMail: SentMailRecord[] = isTauri()
    ? historyQuery.data ?? localSentMail
    : localSentMail;
  const canRecover = Boolean(
    gmailAccount
      && smtpSettings?.host.trim().toLowerCase() === "smtp.gmail.com"
      && smtpSettings.username,
  );

  useEffect(() => {
    if (historyQuery.error) {
      toast.error(`Could not load local sent-mail history: ${String(historyQuery.error)}`);
    }
  }, [historyQuery.error]);

  const recover = async () => {
    if (!canRecover || !smtpSettings) {
      toast.info("Connect the matching Gmail account and SMTP settings before recovering mail.");
      return;
    }

    setRecovering(true);
    try {
      const count = await recoverGmailSentMail({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        fromEmail: smtpSettings.fromEmail,
      });
      await queryClient.invalidateQueries({ queryKey: sentMailHistoryQueryKey });
      toast.success(
        count
          ? `Recovered ${count} Timeless sent message${count === 1 ? "" : "s"} from the last 30 days.`
          : "No new Timeless messages found in Gmail Sent from the last 30 days.",
      );
    } catch (error) {
      toast.error(`Could not recover Gmail sent mail: ${String(error)}`);
    } finally {
      setRecovering(false);
    }
  };

  return { sentMail, canRecover, recovering, recover };
}
