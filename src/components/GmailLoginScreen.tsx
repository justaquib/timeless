import { AlertCircle, ArrowRight, Clock3, LoaderCircle, Mail, ShieldCheck } from "lucide-react";

export function GmailLoginScreen({
  loading,
  signingIn,
  error,
  loadError,
  onSignIn,
  onContinueWithoutGmail,
}: {
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  loadError?: Error | null;
  onSignIn: () => void;
  onContinueWithoutGmail: () => void;
}) {
  const visibleError = error ?? (loadError ? String(loadError) : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/70 sm:p-9">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
          <Clock3 size={26} />
        </div>
        <div className="mt-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Welcome to</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Timeless</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Connect Gmail to see replies to messages sent from Timeless.
          </p>
        </div>

        <div className="mt-7 space-y-3 rounded-2xl bg-slate-50 p-4">
          <p className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={16} />
            Read-only inbox access. Timeless checks message headers for replies; it does not read or store message bodies.
          </p>
          <p className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
            <Mail className="mt-0.5 shrink-0 text-indigo-600" size={16} />
            Gmail sign-in is optional for sending through Zoho, Outlook, or another SMTP account.
          </p>
        </div>

        <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <AlertCircle className="mt-0.5 shrink-0" size={15} />
          <p>
            If Google reports a client ID error, check the Desktop app client ID in{" "}
            <code>.env.local</code>. If it says <code>client_secret</code> is missing, add{" "}
            <code>VITE_GOOGLE_CLIENT_SECRET</code> from your Desktop app client. Restart Timeless
            after changes.
          </p>
        </div>
        {loading && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Checking for a saved Gmail connection…
          </p>
        )}
        {visibleError && (
          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
            {visibleError}
          </div>
        )}

        <button
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
          disabled={signingIn || loading}
          onClick={onSignIn}
          type="button"
        >
          {signingIn ? <LoaderCircle className="animate-spin" size={17} /> : <Mail size={17} />}
          {loading ? "Checking Gmail connection…" : signingIn ? "Waiting for Google sign-in…" : "Continue with Gmail"}
        </button>
        <button
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          onClick={onContinueWithoutGmail}
          type="button"
        >
          Continue without Gmail <ArrowRight size={15} />
        </button>
        <p className="mt-5 text-center text-[10px] leading-5 text-slate-400">
          Google’s refresh token stays in your system keychain.{" "}
          <a
            className="underline underline-offset-2 hover:text-slate-600"
            href="https://myaccount.google.com/permissions"
            rel="noreferrer"
            target="_blank"
          >
            Revoke app access
          </a>{" "}
          in your Google account at any time.
        </p>
      </section>
    </main>
  );
}
