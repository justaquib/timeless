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
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-5 py-8 text-neutral-100">
      <section className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl sm:p-7">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-950">
          <Clock3 size={23} />
        </div>
        <div className="mt-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Welcome to</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-100">Timeless</h1>
          <p className="mt-2 text-xs leading-5 text-neutral-400">
            Connect Gmail to see replies to messages sent from Timeless.
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-xl bg-neutral-900 p-3.5">
          <p className="flex items-start gap-2.5 text-xs leading-5 text-neutral-300">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={16} />
            Read-only inbox access. Timeless checks message headers for replies; it does not read or store message bodies.
          </p>
          <p className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
            <Mail className="mt-0.5 shrink-0 text-neutral-300" size={16} />
            Gmail sign-in is optional for sending through Zoho, Outlook, or another SMTP account.
          </p>
        </div>

        <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-900/70 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200">
          <AlertCircle className="mt-0.5 shrink-0" size={15} />
          <p>
            If Google reports a client ID error, check the Desktop app client ID in{" "}
            <code>.env.local</code>. If it says <code>client_secret</code> is missing, add{" "}
            <code>VITE_GOOGLE_CLIENT_SECRET</code> from your Desktop app client. Restart Timeless
            after changes.
          </p>
        </div>
        {loading && (
          <p className="mt-4 text-center text-xs text-neutral-400">
            Checking for a saved Gmail connection…
          </p>
        )}
        {visibleError && (
          <div className="mt-4 rounded-lg border border-rose-900/70 bg-rose-950/30 p-3 text-xs leading-5 text-rose-200">
            {visibleError}
          </div>
        )}

        <button
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-100 px-4 py-2.5 text-xs font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-70"
          disabled={signingIn || loading}
          onClick={onSignIn}
          type="button"
        >
          {signingIn ? <LoaderCircle className="animate-spin" size={17} /> : <Mail size={17} />}
          {loading ? "Checking Gmail connection…" : signingIn ? "Waiting for Google sign-in…" : "Continue with Gmail"}
        </button>
        <button
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100"
          onClick={onContinueWithoutGmail}
          type="button"
        >
          Continue without Gmail <ArrowRight size={15} />
        </button>
        <p className="mt-4 text-center text-[10px] leading-5 text-neutral-500">
          Google’s refresh token stays in your system keychain.{" "}
          <a
            className="underline underline-offset-2 hover:text-neutral-300"
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
