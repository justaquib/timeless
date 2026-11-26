import { AlertCircle, Send } from "lucide-react";
import type { GmailSendQuota } from "../domain/mailer";

export function ConfirmSendModal({
  open,
  count,
  ccCount,
  bccCount,
  gmailQuota,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  ccCount: number;
  bccCount: number;
  gmailQuota?: GmailSendQuota | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <section aria-labelledby="confirm-title" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" role="dialog">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Send size={20} /></div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900" id="confirm-title">Ready to send?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This will send {count} separate email{count === 1 ? "" : "s"}, one at a time.
          {ccCount > 0 && ` Each message will include ${ccCount} Cc recipient${ccCount === 1 ? "" : "s"}; Cc can see each client's To address.`}
          {bccCount > 0 && ` Each message will also include ${bccCount} Bcc recipient${bccCount === 1 ? "" : "s"}; Bcc addresses stay hidden from other recipients.`}
        </p>
        {gmailQuota && (
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Gmail safety limit: {gmailQuota.remaining} recipient slot{gmailQuota.remaining === 1 ? "" : "s"} remain in the rolling 24-hour window. Messages are paced at least {gmailQuota.minimumIntervalSeconds} seconds apart. Sends outside Timeless also count toward Google’s limits.
          </p>
        )}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <AlertCircle className="mt-0.5 shrink-0" size={15} />
          <p>Only send to people who expect to hear from you. Following the limits cannot guarantee inbox placement. You can stop the sequence after the current email.</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">Review</button>
          <button className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700" onClick={onConfirm} type="button"><Send size={15} /> Send {count} email{count === 1 ? "" : "s"}</button>
        </div>
      </section>
    </div>
  );
}

