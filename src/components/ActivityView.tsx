import { useState } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import type { QueueItem, SentMailRecord } from "../domain/mailer";
import { DeliveryIcon } from "./DeliveryIcon";

const PAGE_SIZE = 50;

function formatSentAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function ActivityView({
  sentMail,
  failedQueue,
  canRecoverGmailSent,
  onRecoverGmailSent,
  recoveringGmailSent,
}: {
  sentMail: SentMailRecord[];
  failedQueue: QueueItem[];
  canRecoverGmailSent: boolean;
  onRecoverGmailSent: () => void;
  recoveringGmailSent: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Sent mail</h2>
            <p className="mt-1 text-xs text-slate-500">
              {sentMail.length} successful message{sentMail.length === 1 ? "" : "s"} saved on this device.
            </p>
          </div>
          {canRecoverGmailSent && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={recoveringGmailSent}
              onClick={onRecoverGmailSent}
              type="button"
            >
              <RefreshCw className={recoveringGmailSent ? "animate-spin" : ""} size={14} />
              {recoveringGmailSent ? "Recovering…" : "Recover recent Gmail sends"}
            </button>
          )}
        </div>
        {sentMail.length ? (
          <>
            <div className="divide-y divide-slate-100">
              {sentMail.slice(0, visibleCount).map((message) => (
                <article className="flex items-center gap-3 px-5 py-4" key={message.messageId}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <MailCheck size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {message.recipientName || message.recipientEmail}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {message.recipientEmail} · {message.subject}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-slate-400">From {message.fromEmail}</p>
                  </div>
                  <time className="shrink-0 text-[11px] text-slate-400" dateTime={new Date(message.sentAt).toISOString()}>
                    {formatSentAt(message.sentAt)}
                  </time>
                </article>
              ))}
            </div>
            {visibleCount < sentMail.length && (
              <button
                className="w-full border-t border-slate-100 px-5 py-3 text-xs font-semibold text-indigo-600 hover:bg-slate-50"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                type="button"
              >
                Load older sent mail
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <MailCheck size={21} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">No emails sent yet</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
              Successful messages will stay in this list across app restarts.
            </p>
          </div>
        )}
      </section>

      {failedQueue.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
          <div className="border-b border-rose-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent delivery issues</h2>
            <p className="mt-1 text-xs text-slate-500">Failed attempts from the current app session.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {failedQueue.map((item, index) => (
              <div className="flex items-center gap-3 px-5 py-3.5" key={`${item.recipient.id}-${index}`}>
                <DeliveryIcon status={item.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{item.recipient.email}</p>
                  <p className="truncate text-xs text-rose-600">{item.error}</p>
                </div>
                <span className="text-xs font-medium text-rose-600">Failed</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
