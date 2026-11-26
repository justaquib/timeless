import { useEffect, useState } from "react";

export function useGmailQuotaCountdown(resetInSeconds?: number) {
  const [remainingSeconds, setRemainingSeconds] = useState(resetInSeconds ?? 0);

  useEffect(() => {
    if (!resetInSeconds) {
      setRemainingSeconds(0);
      return;
    }

    const expiresAt = Date.now() + resetInSeconds * 1_000;
    const updateRemaining = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000)));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1_000);
    return () => window.clearInterval(timer);
  }, [resetInSeconds]);

  return remainingSeconds;
}
