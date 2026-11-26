import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, FileText, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { isTauri } from "@tauri-apps/api/core";
import {
  emptyTemplate,
  MAX_ATTACHMENT_BYTES,
  MAX_TEMPLATE_ATTACHMENTS,
  templateSchema,
} from "../domain/mailer";
import type { MailAttachment, TemplateFormValues } from "../domain/mailer";
import type { MailTemplate } from "../domain/mailer";
import { useMailerStore } from "../store/mailerStore";
import { deleteTemplateAttachment, saveTemplateAttachment } from "../services/mailerApi";
import { FieldError } from "./FieldError";
import { TemplateAttachments } from "./TemplateAttachments";

export function TemplatesView({
  templates,
  selectedTemplateId,
  setSelectedTemplateId,
}: {
  templates: MailTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
}) {
  const addTemplate = useMailerStore((state) => state.addTemplate);
  const updateTemplate = useMailerStore((state) => state.updateTemplate);
  const removeTemplate = useMailerStore((state) => state.removeTemplate);
  const activeTemplate = templates.find((template) => template.id === selectedTemplateId);
  const [attachments, setAttachments] = useState<MailAttachment[]>(activeTemplate?.attachments ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: emptyTemplate,
  });

  useEffect(() => {
    reset(activeTemplate ? {
      name: activeTemplate.name,
      subject: activeTemplate.subject,
      body: activeTemplate.body,
    } : emptyTemplate);
    setAttachments(activeTemplate?.attachments ?? []);
    setPendingFiles([]);
  }, [activeTemplate?.id, activeTemplate?.updatedAt, reset]);

  const handleSelectFiles = (files: File[]) => {
    let totalBytes = attachments.reduce((total, attachment) => total + attachment.size, 0)
      + pendingFiles.reduce((total, file) => total + file.size, 0);
    let count = attachments.length + pendingFiles.length;
    const accepted: File[] = [];

    for (const file of files) {
      if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is empty or exceeds the 10 MB limit.`);
        continue;
      }
      if (count >= MAX_TEMPLATE_ATTACHMENTS || totalBytes + file.size > MAX_ATTACHMENT_BYTES) {
        toast.error("This template is limited to 10 files and 10 MB total.");
        break;
      }
      accepted.push(file);
      totalBytes += file.size;
      count += 1;
    }

    setPendingFiles((current) => [...current, ...accepted]);
  };

  const onSubmit = handleSubmit(async (values) => {
    if (pendingFiles.length && !isTauri()) {
      toast.error("Open Timeless in the desktop app to save attachments.");
      return;
    }

    const uploaded: MailAttachment[] = [];
    try {
      for (const file of pendingFiles) {
        uploaded.push(await saveTemplateAttachment(file));
      }
    } catch (error) {
      const cleanupErrors: string[] = [];
      for (const attachment of uploaded) {
        try {
          await deleteTemplateAttachment(attachment.id);
        } catch (cleanupError) {
          cleanupErrors.push(String(cleanupError));
        }
      }
      const cleanupNotice = cleanupErrors.length
        ? ` Cleanup also failed: ${cleanupErrors.join("; ")}`
        : "";
      toast.error(`Could not save attachments: ${String(error)}${cleanupNotice}`);
      return;
    }

    const nextAttachments = [...attachments, ...uploaded];
    if (activeTemplate) {
      updateTemplate({ ...activeTemplate, ...values, attachments: nextAttachments });
    } else {
      const id = addTemplate({ ...values, attachments: nextAttachments });
      setSelectedTemplateId(id);
    }
    setAttachments(nextAttachments);
    setPendingFiles([]);
    toast.success(activeTemplate ? "Template updated." : "Template created.");

    const removed = (activeTemplate?.attachments ?? []).filter(
      (attachment) => !nextAttachments.some((next) => next.id === attachment.id),
    );
    for (const attachment of removed) {
      try {
        await deleteTemplateAttachment(attachment.id);
      } catch (error) {
        toast.warning(`Template saved, but could not remove ${attachment.name}: ${String(error)}`);
      }
    }
  });

  const deleteActiveTemplate = async () => {
    if (!activeTemplate) return;
    removeTemplate(activeTemplate.id);
    setSelectedTemplateId(templates.find((template) => template.id !== activeTemplate.id)?.id ?? "");
    toast.info("Template removed.");

    for (const attachment of activeTemplate.attachments ?? []) {
      try {
        await deleteTemplateAttachment(attachment.id);
      } catch (error) {
        toast.warning(`Template removed, but could not delete ${attachment.name}: ${String(error)}`);
      }
    }
  };
  const startNew = () => setSelectedTemplateId("");

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(250px,0.75fr)_minmax(0,1.4fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Your templates</p>
            <p className="mt-1 text-xs text-slate-500">{templates.length} reusable messages</p>
          </div>
          <button aria-label="Create template" className="rounded-lg bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100" onClick={startNew} type="button"><Plus size={17} /></button>
        </div>
        <div className="mt-4 space-y-2">
          {templates.map((template) => (
            <button
              className={`w-full rounded-xl border p-3.5 text-left transition ${selectedTemplateId === template.id ? "border-indigo-200 bg-indigo-50/70" : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white"}`}
              key={template.id}
              onClick={() => setSelectedTemplateId(template.id)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <FileText size={15} className={selectedTemplateId === template.id ? "text-indigo-600" : "text-slate-400"} />
                <span className="truncate text-xs font-semibold text-slate-800">{template.name}</span>
              </div>
              <p className="mt-2 truncate text-[11px] text-slate-500">{template.subject}</p>
            </button>
          ))}
          {!templates.length && <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Create your first template to reuse a message across your client list.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{activeTemplate ? "Edit template" : "New template"}</p>
            <p className="mt-1 text-xs text-slate-500">Use {"{{name}}"} and {"{{email}}"} to personalize each email.</p>
          </div>
          {activeTemplate && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
              onClick={() => void deleteActiveTemplate()}
              type="button"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs font-semibold text-slate-600">
            Template name
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="e.g. Welcome note" {...register("name")} />
            <FieldError>{errors.name?.message}</FieldError>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Email subject
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="A quick hello, {{name}}" {...register("subject")} />
            <FieldError>{errors.subject?.message}</FieldError>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Message
            <textarea className="mt-2 min-h-64 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-normal leading-6 text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder={"Hi {{name}},\n\nWrite your message here..."} {...register("body")} />
            <FieldError>{errors.body?.message}</FieldError>
          </label>
          <TemplateAttachments
            attachments={attachments}
            onRemoveAttachment={(id) => setAttachments((current) => current.filter((file) => file.id !== id))}
            onRemovePending={(index) => setPendingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
            onSelectFiles={handleSelectFiles}
            pendingFiles={pendingFiles}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-[11px] text-slate-400">{watch("body")?.length ?? 0} characters</p>
            <button className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700" type="submit">
              <Check size={16} /> {activeTemplate ? "Save changes" : "Create template"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

