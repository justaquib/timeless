import { useRef } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import type { MailAttachment } from "../domain/mailer";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TemplateAttachments({
  attachments,
  pendingFiles,
  onSelectFiles,
  onRemoveAttachment,
  onRemovePending,
}: {
  attachments: MailAttachment[];
  pendingFiles: File[];
  onSelectFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onRemovePending: (index: number) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-700">Template attachments</p>
          <p className="mt-1 text-[11px] text-slate-400">Up to 10 files and 10 MB total per message</p>
        </div>
        <input
          accept="*/*"
          className="hidden"
          multiple
          onChange={(event) => {
            onSelectFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          ref={fileInput}
          type="file"
        />
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
          onClick={() => fileInput.current?.click()}
          type="button"
        >
          <Plus size={14} /> Add files
        </button>
      </div>

      {attachments.length + pendingFiles.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-200/70">
          {attachments.map((attachment) => (
            <li className="flex items-center gap-2.5 py-2" key={attachment.id}>
              <Paperclip className="shrink-0 text-indigo-500" size={14} />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{attachment.name}</span>
              <span className="text-[10px] text-slate-400">{formatSize(attachment.size)}</span>
              <button
                aria-label={`Remove ${attachment.name}`}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => onRemoveAttachment(attachment.id)}
                type="button"
              >
                <X size={14} />
              </button>
            </li>
          ))}
          {pendingFiles.map((file, index) => (
            <li className="flex items-center gap-2.5 py-2" key={`${file.name}-${file.lastModified}-${index}`}>
              <Paperclip className="shrink-0 text-amber-500" size={14} />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{file.name}</span>
              <span className="text-[10px] text-amber-600">Pending · {formatSize(file.size)}</span>
              <button
                aria-label={`Remove ${file.name}`}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => onRemovePending(index)}
                type="button"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-400">
          <Paperclip size={14} /> No files attached to this template
        </p>
      )}
    </section>
  );
}
