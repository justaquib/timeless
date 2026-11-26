import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  GmailAuthAccount,
  GmailSendQuota,
  MailSendReceipt,
  MailAttachment,
  EmailCopyRecipients,
  PublicSmtpSettings,
  SentMailRecord,
  SmtpFormValues,
} from "../domain/mailer";

export function getSentMailHistory(localRecords: SentMailRecord[]) {
  return invoke<SentMailRecord[]>("get_sent_mail_history", { localRecords });
}

export function recoverGmailSentMail({
  clientId,
  clientSecret,
  fromEmail,
}: {
  clientId: string;
  clientSecret: string;
  fromEmail: string;
}) {
  return invoke<number>("recover_gmail_sent_mail", { clientId, clientSecret, fromEmail });
}

export async function getSmtpSettings() {
  return isTauri()
    ? invoke<PublicSmtpSettings | null>("get_smtp_settings")
    : null;
}

export function getGmailSendQuota() {
  return invoke<GmailSendQuota | null>("get_gmail_send_quota");
}

export function getGmailAuthAccount() {
  return invoke<GmailAuthAccount | null>("get_gmail_auth_account");
}

export function startGmailOAuth(state: string) {
  return invoke<number>("start_gmail_oauth", { state });
}

export function exchangeGmailOAuthCode({
  clientId,
  clientSecret,
  code,
  verifier,
  redirectUri,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  return invoke<GmailAuthAccount>("exchange_gmail_oauth_code", {
    clientId,
    clientSecret,
    code,
    verifier,
    redirectUri,
  });
}

export function disconnectGmail() {
  return invoke<void>("disconnect_gmail");
}

export function getGmailReplyCount({
  clientId,
  clientSecret,
  sentMessageIds,
  dayStart,
}: {
  clientId: string;
  clientSecret: string;
  sentMessageIds: string[];
  dayStart: number;
}) {
  return invoke<number>("get_gmail_reply_count", {
    clientId,
    clientSecret,
    sentMessageIds,
    dayStart,
  });
}

export function saveSmtpSettings(settings: SmtpFormValues) {
  return invoke<PublicSmtpSettings>("save_smtp_settings", { settings });
}

export function testSmtpConnection(settings: SmtpFormValues) {
  return invoke("test_smtp_connection", { settings });
}

export function sendEmail({
  toEmail,
  toName,
  ccEmails,
  bccEmails,
  subject,
  body,
  attachments,
}: EmailCopyRecipients & {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
}) {
  return invoke<MailSendReceipt>("send_email", {
    toEmail,
    toName,
    ccEmails,
    bccEmails,
    subject,
    body,
    attachments,
  });
}

export async function saveTemplateAttachment(file: File) {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return invoke<MailAttachment>("save_template_attachment", {
    name: file.name,
    contentType: file.type || "application/octet-stream",
    bytes,
  });
}

export function deleteTemplateAttachment(id: string) {
  return invoke<void>("delete_template_attachment", { id });
}
