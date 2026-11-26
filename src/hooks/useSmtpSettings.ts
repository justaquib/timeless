import { useQuery } from "@tanstack/react-query";
import { getMailSendQuota, getSmtpSettings } from "../services/mailerApi";
import { isTauri } from "@tauri-apps/api/core";
import { useGmailQuotaCountdown } from "./useGmailQuotaCountdown";
import type { MailProviderFamily } from "../domain/preferences";

export const smtpSettingsQueryKey = ["smtp-settings"] as const;

export function useSmtpSettings() {
  return useQuery({
    queryKey: smtpSettingsQueryKey,
    queryFn: getSmtpSettings,
    retry: false,
  });
}

export function useMailSendQuota(
  providerFamily?: MailProviderFamily,
  username?: string,
  dailyLimit = 1_000,
) {
  const quotaQuery = useQuery({
    queryKey: ["mail-send-quota", providerFamily, username, dailyLimit],
    queryFn: () => getMailSendQuota(dailyLimit),
    enabled: Boolean(providerFamily && username) && isTauri(),
    refetchInterval: (query) => {
      const { nextSendInSeconds = 0, resetInSeconds = 0 } = query.state.data ?? {};
      if (nextSendInSeconds > 0) return 1_000;
      return resetInSeconds > 0 ? Math.min(resetInSeconds, 60) * 1_000 : false;
    },
    retry: false,
  });
  const resetInSeconds = useGmailQuotaCountdown(quotaQuery.data?.resetInSeconds);
  return { ...quotaQuery, resetInSeconds };
}
