export type Appearance = "dark" | "light";
export type MailProviderFamily = "gmail" | "zoho" | "outlook" | "microsoft365" | "custom";
export type DailyLimits = Record<MailProviderFamily, number>;

export const MIN_DAILY_RECIPIENT_LIMIT = 1;
export const MAX_DAILY_RECIPIENT_LIMIT = 10_000;

export const mailProviderOptions: {
  id: MailProviderFamily;
  label: string;
  description: string;
}[] = [
  {
    id: "gmail",
    label: "Gmail",
    description: "Gmail's 400 / 1,600 recipient safety cap still applies.",
  },
  { id: "zoho", label: "Zoho Mail", description: "Applies to SMTP hosts containing zoho." },
  { id: "outlook", label: "Outlook.com", description: "Applies to Outlook.com SMTP hosts." },
  {
    id: "microsoft365",
    label: "Microsoft 365",
    description: "Applies to Microsoft 365 SMTP hosts.",
  },
  { id: "custom", label: "Custom SMTP", description: "Applies to other SMTP hosts." },
];

export const defaultDailyLimits: DailyLimits = {
  gmail: 1_600,
  zoho: 1_000,
  outlook: 1_000,
  microsoft365: 1_000,
  custom: 1_000,
};

export function normalizeDailyRecipientLimit(value: number, provider: MailProviderFamily) {
  if (!Number.isFinite(value)) return defaultDailyLimits[provider];
  return Math.min(
    MAX_DAILY_RECIPIENT_LIMIT,
    Math.max(MIN_DAILY_RECIPIENT_LIMIT, Math.floor(value)),
  );
}
