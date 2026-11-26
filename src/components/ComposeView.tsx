import { Clock3, FileText, LoaderCircle, Mail, Paperclip, Plus, Send, ShieldCheck, Users, X } from "lucide-react";
import { renderTokens } from "../domain/mailer";
import type { MailSendQuota, MailAttachment, MailTemplate, PublicSmtpSettings, QueueItem, Recipient } from "../domain/mailer";
import { mailProviderOptions } from "../domain/preferences";
import { DeliveryIcon } from "./DeliveryIcon";

function formatCountdown(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function ComposeView({
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
  subject,
  setSubject,
  body,
  setBody,
  cc,
  setCc,
  bcc,
  setBcc,
  recipients,
  audienceCount,
  onOpenRecipientPicker,
  onRemoveRecipient,
  onSaveDraft,
  onGoToTemplates,
  onGoToAudience,
  smtpSettings,
  mailQuota,
  attachments,
  queue,
  sending,
  onRequestSend,
  onStop,
}: {
  templates: MailTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  cc: string;
  setCc: (value: string) => void;
  bcc: string;
  setBcc: (value: string) => void;
  recipients: Recipient[];
  audienceCount: number;
  onOpenRecipientPicker: () => void;
  onRemoveRecipient: (id: string) => void;
  onSaveDraft: () => void;
  onGoToTemplates: () => void;
  onGoToAudience: () => void;
  smtpSettings?: PublicSmtpSettings | null;
  mailQuota?: MailSendQuota | null;
  attachments: MailAttachment[];
  queue: QueueItem[];
  sending: boolean;
  onRequestSend: () => void;
  onStop: () => void;
}) {
  const previewRecipient = recipients[0];
  const sentCount = queue.filter((item) => item.status === "sent").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const previewBody = renderTokens(body, previewRecipient);
  const previewSubject = renderTokens(subject, previewRecipient);
  const providerLabel =
    mailProviderOptions.find((option) => option.id === mailQuota?.providerFamily)?.label ?? "Mail";

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(310px,0.8fr)]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Recipients</p>
              <p className="mt-1 text-xs text-slate-500">Each person receives a separate, personalized email.</p>
            </div>
            <button
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              onClick={onGoToAudience}
              type="button"
            >
              <Users size={14} /> Manage contacts
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
                <Users size={15} />
              </div>
              <span className="text-sm font-medium text-slate-700">To recipients</span>
            </div>
            <span className="text-xs font-semibold text-slate-500">{recipients.length} selected</span>
          </div>
          <div className="mt-3 flex min-h-16 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <button
              aria-haspopup="dialog"
              className="rounded-md px-1.5 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-indigo-700 disabled:opacity-50"
              disabled={sending}
              onClick={onOpenRecipientPicker}
              type="button"
            >
              To
            </button>
            {recipients.map((recipient) => (
              <span
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 py-1 pl-3 pr-1 text-xs font-medium text-indigo-700"
                key={recipient.id}
                title={recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email}
              >
                <span className="max-w-48 truncate">{recipient.email}</span>
                <button
                  aria-label={`Remove ${recipient.email} from recipients`}
                  className="rounded-full p-1 text-indigo-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
                  disabled={sending}
                  onClick={() => onRemoveRecipient(recipient.id)}
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              disabled={sending}
              onClick={onOpenRecipientPicker}
              type="button"
            >
              <Plus size={14} />
              {recipients.length ? "Add recipients" : "Choose recipients"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {recipients.length} selected from {audienceCount} contacts. Only selected contacts will receive this email.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Email content</p>
              <p className="mt-1 text-xs text-slate-500">Personalize each message with contact fields.</p>
            </div>
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700" onClick={onGoToTemplates} type="button">
              <FileText size={14} /> Manage templates
            </button>
          </div>
          <label className="mt-5 block text-xs font-semibold text-slate-600">
            Start with a template
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              value={selectedTemplateId}
            >
              {templates.length === 0 && <option value="">No templates yet</option>}
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Subject
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => setSubject(event.target.value)}
              placeholder="A thoughtful subject line"
              value={subject}
            />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Cc
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                inputMode="email"
                onChange={(event) => setCc(event.target.value)}
                placeholder="name@example.com, ..."
                value={cc}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Bcc
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                inputMode="email"
                onChange={(event) => setBcc(event.target.value)}
                placeholder="name@example.com, ..."
                value={bcc}
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            Included on every email. Cc recipients can see each To address; Bcc recipients stay hidden from others. Separate addresses with commas or semicolons.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Message
            <textarea
              className="mt-2 min-h-52 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-normal leading-6 text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your email here..."
              value={body}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">
              Personalize with <code className="rounded bg-slate-100 px-1 py-0.5 text-indigo-600">{"{{name}}"}</code> and <code className="rounded bg-slate-100 px-1 py-0.5 text-indigo-600">{"{{email}}"}</code>
            </p>
            <button className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50" onClick={onSaveDraft} type="button">
              Save as template
            </button>
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Live preview</p>
              <p className="mt-0.5 text-xs text-slate-400">Personalized for your first contact</p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><Mail size={15} /></div>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex gap-3 text-xs">
              <span className="w-12 shrink-0 text-slate-400">From</span>
              <span className="min-w-0 truncate font-medium text-slate-700">
                {smtpSettings ? `${smtpSettings.fromName} <${smtpSettings.fromEmail}>` : "Configure your mail account"}
              </span>
            </div>
            {cc.trim() && (
              <div className="flex gap-3 text-xs">
                <span className="w-12 shrink-0 text-slate-400">Cc</span>
                <span className="min-w-0 break-all font-medium text-slate-700">{cc}</span>
              </div>
            )}
            {bcc.trim() && (
              <div className="flex gap-3 text-xs">
                <span className="w-12 shrink-0 text-slate-400">Bcc</span>
                <span className="min-w-0 break-all font-medium text-slate-700">{bcc}</span>
              </div>
            )}
            <div className="flex gap-3 text-xs">
              <span className="w-12 shrink-0 text-slate-400">To</span>
              <span className="min-w-0 truncate font-medium text-slate-700">
                {previewRecipient ? `${previewRecipient.name || previewRecipient.email} <${previewRecipient.email}>` : "Add a recipient"}
              </span>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[11px] text-slate-400">Subject</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{previewSubject || "Your subject line"}</p>
            </div>
            <div className="min-h-36 whitespace-pre-wrap border-t border-slate-100 pt-3 text-[13px] leading-6 text-slate-600">
              {previewBody || "Your message preview will appear here."}
            </div>
            {attachments.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 text-[11px] text-slate-400">Attachments ({attachments.length})</p>
                <ul className="space-y-1.5">
                  {attachments.map((attachment) => (
                    <li className="flex items-center gap-2 text-xs text-slate-600" key={attachment.id}>
                      <Paperclip className="shrink-0 text-indigo-500" size={13} />
                      <span className="truncate">{attachment.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              <ShieldCheck size={14} className="text-emerald-500" />
              {cc.trim() || bcc.trim()
                ? "Sent separately — CC sees each To address; BCC stays hidden"
                : "Sent individually — addresses stay private"}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Delivery queue</p>
              <p className="mt-1 text-xs text-slate-500">Sent one at a time to each client</p>
            </div>
            {sending ? <LoaderCircle className="animate-spin text-indigo-600" size={18} /> : <Clock3 size={17} className="text-slate-400" />}
          </div>
          {queue.length > 0 && (
            <>
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-[11px] text-slate-500">
                  <span>{sending ? "Sending…" : "Queue complete"}</span>
                  <span>{sentCount + failedCount} / {queue.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${((sentCount + failedCount) / queue.length) * 100}%` }} />
                </div>
              </div>
              <div className="mt-3 max-h-36 divide-y divide-slate-100 overflow-y-auto">
                {queue.slice(0, 6).map((item) => (
                  <div className="flex items-center gap-2.5 py-2" key={item.recipient.id}>
                    <DeliveryIcon status={item.status} />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{item.recipient.name || item.recipient.email}</span>
                    <span className={`text-[10px] font-medium ${item.status === "sent" ? "text-emerald-600" : item.status === "failed" ? "text-rose-600" : item.status === "sending" ? "text-indigo-600" : "text-slate-400"}`}>
                      {item.status === "sending" ? "Sending" : item.status === "sent" ? "Sent" : item.status === "failed" ? "Failed" : "Queued"}
                    </span>
                  </div>
                ))}
                {queue.length > 6 && <p className="py-2 text-center text-[11px] text-slate-400">and {queue.length - 6} more</p>}
              </div>
            </>
          )}
          {!sending ? (
            <button
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              disabled={!recipients.length || !subject.trim() || !body.trim() || !templates.length}
              onClick={onRequestSend}
              type="button"
            >
              <Send size={16} /> Send to {recipients.length} {recipients.length === 1 ? "client" : "clients"}
            </button>
          ) : (
            <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50" onClick={onStop} type="button">
              <X size={16} /> Stop after current email
            </button>
          )}
          {!smtpSettings && (
            <p className="mt-3 text-center text-[11px] leading-5 text-amber-700">Connect an SMTP account before sending.</p>
          )}
        </section>
        {mailQuota && (
          <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{providerLabel} daily limit</p>
                <p className="mt-1 text-xs text-slate-600">
                  {mailQuota.recipientsLast24Hours} of {mailQuota.dailyLimit} recipient deliveries counted in the rolling 24-hour window
                </p>
                {mailQuota.resetInSeconds > 0 && (
                  <p className="mt-1 text-[11px] font-medium text-blue-700">
                    Next recipient slot resets in <span className="tabular-nums">{formatCountdown(mailQuota.resetInSeconds)}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">
                {mailQuota.remaining} remaining
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${(mailQuota.recipientsLast24Hours / mailQuota.dailyLimit) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-600">
              Every To, Cc, and Bcc delivery counts. Failed attempts also use a slot. Provider limits may vary; Gmail additionally applies its 400 / 1,600 safety cap and counts recipients sent elsewhere.
            </p>
            {mailQuota.minimumIntervalSeconds > 0 && (
              <p className="mt-2 text-[11px] text-slate-600">
                Gmail messages are paced at least {mailQuota.minimumIntervalSeconds} seconds apart.
              </p>
            )}
            {mailQuota.nextSendInSeconds > 0 && (
              <p className="mt-2 text-[11px] font-medium text-amber-700">
                Wait {mailQuota.nextSendInSeconds} seconds before the next Gmail send.
              </p>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

