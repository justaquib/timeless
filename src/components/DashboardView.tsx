import { ArrowRight, Inbox, MailCheck, RefreshCw, Send, Sparkles } from "lucide-react";
import type { SentMailRecord, SentPeriod } from "../domain/mailer";

const sentPeriodOptions: { value: SentPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function DashboardView({
  sentCount,
  sentPeriod,
  onSentPeriodChange,
  replyCount,
  gmailAccount,
  repliesLoading,
  replyError,
  recentSent,
  onRefreshReplies,
  onCompose,
  onViewSent,
}: {
  sentCount: number;
  sentPeriod: SentPeriod;
  onSentPeriodChange: (period: SentPeriod) => void;
  replyCount: number | null;
  gmailAccount?: string;
  repliesLoading: boolean;
  replyError: string | null;
  recentSent: SentMailRecord[];
  onRefreshReplies: () => void;
  onCompose: () => void;
  onViewSent: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="dashboard-hero overflow-hidden rounded-2xl border border-slate-200 bg-[#111111] p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-slate-300">
              <Sparkles size={13} /> Your mail, with more meaning
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">A thoughtful day starts here.</h2>
            <p className="mt-1.5 text-xs leading-5 text-slate-400">See your recent outreach and replies, all in one calm workspace.</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            onClick={onCompose}
            type="button"
          >
            <Send size={15} /> Compose email
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Send size={18} />
            </div>
            <select
              aria-label="Emails sent time period"
              className="max-w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => {
                const selected = sentPeriodOptions.find(
                  (option) => option.value === event.currentTarget.value,
                );
                if (selected) onSentPeriodChange(selected.value);
              }}
              value={sentPeriod}
            >
              {sentPeriodOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{sentCount}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">Emails sent</p>
          <p className="mt-1 text-xs text-slate-400">Successful sends from this device</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <MailCheck size={18} />
            </div>
            {gmailAccount && (
              <button
                aria-label="Refresh Gmail reply count"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:animate-spin"
                disabled={repliesLoading}
                onClick={onRefreshReplies}
                type="button"
              >
                <RefreshCw size={15} />
              </button>
            )}
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            {repliesLoading ? "…" : replyCount ?? "—"}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">Replies received today</p>
          <p className="mt-1 text-xs text-slate-400">
            {gmailAccount
              ? `Gmail inbox · replies to Timeless mail from ${gmailAccount}`
              : "Sign in with Gmail to count replies"}
          </p>
          {replyError && <p className="mt-2 text-xs text-rose-600">{replyError}</p>}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Recently sent</h3>
            <p className="mt-1 text-xs text-slate-500">The latest messages from your Timeless workspace.</p>
          </div>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            onClick={onViewSent}
            type="button"
          >
            View all <ArrowRight size={14} />
          </button>
        </div>
        {recentSent.length ? (
          <div className="divide-y divide-slate-100">
            {recentSent.slice(0, 5).map((message) => (
              <div className="flex items-center gap-3 px-4 py-2.5" key={message.messageId}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                  <Inbox size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {message.recipientName || message.recipientEmail}
                  </p>
                  <p className="truncate text-xs text-slate-500">{message.subject}</p>
                </div>
                <time className="shrink-0 text-[11px] text-slate-400" dateTime={new Date(message.sentAt).toISOString()}>
                  {formatTime(message.sentAt)}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">No messages sent yet</p>
            <p className="mt-1 text-xs text-slate-400">Your successful sends will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
