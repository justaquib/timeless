import { z } from "zod";
import type { MailProviderFamily } from "./preferences";

export type Encryption = "starttls" | "ssl";
export type GmailAccountType = "personal" | "workspace";
export type DeliveryStatus = "queued" | "sending" | "sent" | "failed";
export type SentPeriod = "today" | "week" | "month" | "year";
export const MAX_TEMPLATE_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface Recipient {
  id: string;
  name: string;
  email: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
  updatedAt: number;
}

export interface MailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface PublicSmtpSettings {
  host: string;
  port: number;
  security: Encryption;
  username: string;
  fromName: string;
  fromEmail: string;
  gmailAccountType: GmailAccountType;
  providerFamily: MailProviderFamily;
}

export interface MailSendQuota {
  providerFamily: MailProviderFamily;
  recipientsLast24Hours: number;
  dailyLimit: number;
  remaining: number;
  minimumIntervalSeconds: number;
  nextSendInSeconds: number;
  resetInSeconds: number;
}

export interface SentMailRecord {
  messageId: string;
  fromEmail: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  sentAt: number;
}

export function countSuccessfulSends(
  sentMail: SentMailRecord[],
  period: SentPeriod,
  now = new Date(),
) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === "month") {
    start.setDate(1);
  } else if (period === "year") {
    start.setMonth(0, 1);
  }
  return sentMail.filter((message) => message.sentAt >= start.getTime() && message.sentAt <= now.getTime()).length;
}

export interface MailSendReceipt {
  messageId: string;
  sentAt: number;
  historySaveError?: string | null;
}

export interface EmailCopyRecipients {
  ccEmails: string[];
  bccEmails: string[];
}

export interface GmailAuthAccount {
  email: string;
}

export interface GmailOAuthCallback {
  code?: string;
  state: string;
  error?: string;
}

export interface QueueItem {
  recipient: Recipient;
  status: DeliveryStatus;
  error?: string;
}

export const smtpSchema = z.object({
  host: z.string().trim().min(1, "Enter your SMTP host."),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["starttls", "ssl"]),
  gmailAccountType: z.enum(["personal", "workspace"]),
  username: z.string().trim().min(1, "Enter your SMTP username."),
  password: z.string().min(1, "Enter your SMTP password."),
  fromName: z.string().trim().min(1, "Enter the sender name."),
  fromEmail: z.email("Enter a valid sender email."),
});

export type SmtpFormValues = z.infer<typeof smtpSchema>;

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Give this template a name."),
  subject: z.string().trim().min(1, "Add an email subject."),
  body: z.string().trim().min(1, "Write a message."),
});

export type TemplateFormValues = z.infer<typeof templateSchema>;

export const emptyTemplate: TemplateFormValues = {
  name: "",
  subject: "",
  body: "",
};

export function renderTokens(value: string, recipient?: Recipient) {
  return value
    .replace(/\{\{\s*name\s*\}\}/gi, recipient?.name || "there")
    .replace(/\{\{\s*email\s*\}\}/gi, recipient?.email || "client@example.com");
}

export function parseEmailAddressList(value: string, field: "CC" | "BCC") {
  const addresses = value.split(/[;,]/).map((address) => address.trim()).filter(Boolean);
  if (!z.array(z.email()).safeParse(addresses).success) {
    throw new Error(`Enter valid ${field} email addresses separated by commas or semicolons.`);
  }
  return addresses;
}

export function parseRecipientFile(contents: string): Recipient[] {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  return contents
    .split(/\r?\n/)
    .flatMap((line) => {
      const email = line.match(emailPattern)?.[0];
      if (!email) return [];
      const name = line
        .replace(email, "")
        .replace(/[,"\t;|]/g, " ")
        .trim()
        .replace(/\s+/g, " ");
      return [{ id: crypto.randomUUID(), name, email }];
    });
}
