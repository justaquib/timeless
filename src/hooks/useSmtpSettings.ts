import { useQuery } from "@tanstack/react-query";
import { getGmailSendQuota, getSmtpSettings } from "../services/mailerApi";
import { isTauri } from "@tauri-apps/api/core";
import { useGmailQuotaCountdown } from "./useGmailQuotaCountdown";

export const smtpSettingsQueryKey = ["smtp-settings"] as const;

export function useSmtpSettings() {
  return useQuery({
    queryKey: smtpSettingsQueryKey,
    queryFn: getSmtpSettings,
    retry: false,
  });
}

export function useGmailSendQuota(accountEmail?: string) {
  const quotaQuery = useQuery({
    queryKey: ["gmail-send-quota", accountEmail],
    queryFn: getGmailSendQuota,
    enabled: Boolean(accountEmail) && isTauri(),
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
