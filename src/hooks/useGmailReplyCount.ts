import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { googleClientId, googleClientSecret } from "../config";
import type { SentMailRecord } from "../domain/mailer";
import { getGmailReplyCount } from "../services/mailerApi";

function localDayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1_000);
}

function millisecondsToTomorrow() {
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(1_000, tomorrow.getTime() - Date.now() + 250);
}

export function useGmailReplyCount(
  gmailAccountEmail: string | undefined,
  sentMail: SentMailRecord[],
  enabled: boolean,
) {
  const [dayStart, setDayStart] = useState(localDayStart);
  const sentMessageIds = useMemo(
    () =>
      sentMail
        .filter((message) => message.fromEmail.toLowerCase() === gmailAccountEmail?.toLowerCase())
        .map((message) => message.messageId),
    [gmailAccountEmail, sentMail],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDayStart(localDayStart()),
      millisecondsToTomorrow(),
    );
    return () => window.clearTimeout(timer);
  }, [dayStart]);

  return useQuery({
    queryKey: ["gmail-reply-count", gmailAccountEmail, dayStart],
    queryFn: () =>
      sentMessageIds.length
        ? getGmailReplyCount({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            sentMessageIds,
            dayStart,
          })
        : Promise.resolve(0),
    enabled: Boolean(gmailAccountEmail) && enabled && isTauri(),
    retry: false,
    staleTime: 120_000,
  });
}
