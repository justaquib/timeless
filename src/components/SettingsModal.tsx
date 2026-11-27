import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CircleHelp, ExternalLink, LoaderCircle, Mail, Settings, ShieldCheck, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { smtpSchema } from "../domain/mailer";
import type { PublicSmtpSettings, SmtpFormValues } from "../domain/mailer";
import { saveSmtpSettings, testSmtpConnection } from "../services/mailerApi";
import { smtpSettingsQueryKey } from "../hooks/useSmtpSettings";
import { FieldError } from "./FieldError";

export function SettingsModal({
  open,
  onClose,
  currentSettings,
}: {
  open: boolean;
  onClose: () => void;
  currentSettings?: PublicSmtpSettings | null;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<SmtpFormValues>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      host: "",
      port: 587,
      security: "starttls",
      gmailAccountType: "personal",
      username: "",
      password: "",
      fromName: "",
      fromEmail: "",
    },
  });

  useEffect(() => {
    reset({
      host: currentSettings?.host ?? "",
      port: currentSettings?.port ?? 587,
      security: currentSettings?.security ?? "starttls",
      gmailAccountType: currentSettings?.gmailAccountType ?? "personal",
      username: currentSettings?.username ?? "",
      password: "",
      fromName: currentSettings?.fromName ?? "",
      fromEmail: currentSettings?.fromEmail ?? "",
    });
  }, [currentSettings, reset, open]);

  const saveMutation = useMutation({
    mutationFn: saveSmtpSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(smtpSettingsQueryKey, settings);
      toast.success("Mail account saved securely.");
      onClose();
    },
    onError: (error) => toast.error(String(error)),
  });
  const testMutation = useMutation({
    mutationFn: testSmtpConnection,
    onSuccess: () => toast.success("Connection looks good."),
    onError: (error) => toast.error(String(error)),
  });

  if (!open) return null;

  const formClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
  const smtpHost = watch("host").trim().toLowerCase();
  const gmailConfigured = smtpHost === "smtp.gmail.com";
  const configureProvider = (host: string) => {
    setValue("host", host, { shouldDirty: true });
    setValue("port", 587, { shouldDirty: true });
    setValue("security", "starttls", { shouldDirty: true });
  };
  const prepareSettings = (values: SmtpFormValues) => ({
    ...values,
    username: values.username.trim(),
    password: gmailConfigured ? values.password.replace(/\s+/g, "") : values.password,
  });
  const onTest = handleSubmit((values) => testMutation.mutate(prepareSettings(values)));
  const onSave = handleSubmit((values) => saveMutation.mutate(prepareSettings(values)));
  const securityField = register("security");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Settings size={20} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900" id="settings-title">
              Mail account
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Connect an SMTP account to deliver messages directly from Timeless.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: "Gmail", host: "smtp.gmail.com" },
                { label: "Zoho Mail", host: "smtp.zoho.com" },
                { label: "Outlook.com", host: "smtp-mail.outlook.com" },
                { label: "Microsoft 365", host: "smtp.office365.com" },
              ].map(({ label, host }) => (
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  key={host}
                  onClick={() => configureProvider(host)}
                  type="button"
                >
                  <Mail size={15} /> {label}
                </button>
              ))}
            </div>
          </div>
          <button
            aria-label="Close settings"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {!isTauri() && (
          <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 shrink-0" size={17} />
            <p>SMTP credentials are stored in the desktop app's local database. Open this screen in the Tauri app to connect an account.</p>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <label className="text-sm font-medium text-slate-700">
              SMTP host
              <input autoComplete="url" className={formClass} placeholder="smtp.example.com" {...register("host")} />
              <FieldError>{errors.host?.message}</FieldError>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Port
              <input className={formClass} inputMode="numeric" type="number" {...register("port", { valueAsNumber: true })} />
              <FieldError>{errors.port?.message}</FieldError>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Encryption
              <select
                className={formClass}
                {...securityField}
                onChange={(event) => {
                  securityField.onChange(event);
                  setValue("port", event.target.value === "ssl" ? 465 : 587);
                }}
              >
                <option value="starttls">STARTTLS</option>
                <option value="ssl">SSL / TLS</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              SMTP username
              <input autoComplete="username" className={formClass} placeholder="you@example.com" {...register("username")} />
              <FieldError>{errors.username?.message}</FieldError>
            </label>
          </div>
          {gmailConfigured && (
            <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <label className="block text-sm font-medium text-slate-700">
                Google account type
                <select className={formClass} {...register("gmailAccountType")}>
                  <option value="personal">Personal Gmail · app limit 400 per rolling 24 hours</option>
                  <option value="workspace">Google Workspace · app limit 1,600 per rolling 24 hours</option>
                </select>
              </label>
              <p className="text-xs leading-5 text-slate-600">
                Google’s commonly published limits are about 500 messages/day for personal Gmail and 2,000 for Workspace. They can vary and include mail sent outside Timeless, so this app keeps a lower safety margin.
              </p>
              <p className="text-xs leading-5 text-slate-600">
                Enable 2-Step Verification, create an App Password, and use it here instead of your regular Google password. Use your full Gmail address as the SMTP username; pasted App Password spaces are removed. App Passwords may be unavailable for some managed accounts.
              </p>
              <a
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                href="https://myaccount.google.com/apppasswords"
                rel="noreferrer"
                target="_blank"
              >
                Open Google App Passwords <ExternalLink size={13} />
              </a>
            </div>
          )}
          {smtpHost.includes("zoho") && (
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Zoho’s SMTP host varies by data center. If your account is not on Zoho’s US service, replace `smtp.zoho.com` with the host for your region. Accounts with multi-factor authentication may require an app-specific password.
            </p>
          )}
          {smtpHost === "smtp.office365.com" && (
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Microsoft 365 may require SMTP AUTH to be enabled by your organization. Timeless uses SMTP username/password authentication; it cannot connect if your tenant requires OAuth. Ask your administrator about SMTP AUTH.
            </p>
          )}
          {smtpHost === "smtp-mail.outlook.com" && (
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Use your full Outlook.com address. If your account requires an app password, enter that instead of your regular password. Some accounts require OAuth, which this SMTP preset does not provide.
            </p>
          )}
          <label className="block text-sm font-medium text-slate-700">
            SMTP password
            <input autoComplete="new-password" className={formClass} placeholder={currentSettings ? "Enter again to update saved credentials" : "Use an app password if required"} type="password" {...register("password")} />
            <FieldError>{errors.password?.message}</FieldError>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Sender name
              <input className={formClass} placeholder="Your name or team" {...register("fromName")} />
              <FieldError>{errors.fromName?.message}</FieldError>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Sender email
              <input autoComplete="email" className={formClass} placeholder="you@example.com" type="email" {...register("fromEmail")} />
              <FieldError>{errors.fromEmail?.message}</FieldError>
            </label>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={16} />
            Your password is encrypted and stored in the desktop app's local database on this device, not in browser storage.
          </p>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isTauri() || testMutation.isPending || saveMutation.isPending}
              onClick={onTest}
              type="button"
            >
              {testMutation.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <CircleHelp size={16} />}
              Test connection
            </button>
            <div className="flex gap-2">
              <button className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!isTauri() || saveMutation.isPending}
                onClick={onSave}
                type="button"
              >
                {saveMutation.isPending && <LoaderCircle className="animate-spin" size={16} />}
                Save account
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

