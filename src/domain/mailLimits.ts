import { mailProviderOptions } from "./preferences";
import type { MailSendQuota } from "./mailer";

export function mailQuotaBlockReason(
  quota: MailSendQuota | null | undefined,
  quotaError: unknown,
  recipientCount: number,
) {
  if (!quota) {
    return quotaError
      ? `Could not verify the daily mail limit: ${String(quotaError)}`
      : "The daily mail limit is still loading. Try again shortly.";
  }
  if (quota.nextSendInSeconds > 0) {
    return `Wait ${quota.nextSendInSeconds} seconds before the next Gmail send.`;
  }
  if (recipientCount > quota.remaining) {
    const provider =
      mailProviderOptions.find((option) => option.id === quota.providerFamily)?.label ?? "Mail";
    return `This sequence requires ${recipientCount} recipient deliveries, but only ${quota.remaining} ${provider} limit slots remain.`;
  }
  return null;
}
