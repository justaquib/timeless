import { Moon, Music2, Sun } from "lucide-react";
import {
  MAX_DAILY_RECIPIENT_LIMIT,
  MIN_DAILY_RECIPIENT_LIMIT,
  mailProviderOptions,
} from "../domain/preferences";
import type { Appearance, DailyLimits, MailProviderFamily } from "../domain/preferences";

export function PreferencesView({
  appearance,
  dailyLimits,
  splashMusicEnabled,
  onAppearanceChange,
  onDailyLimitChange,
  onSplashMusicChange,
}: {
  appearance: Appearance;
  dailyLimits: DailyLimits;
  splashMusicEnabled: boolean;
  onAppearanceChange: (appearance: Appearance) => void;
  onDailyLimitChange: (provider: MailProviderFamily, limit: number) => void;
  onSplashMusicChange: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Appearance</h2>
        <p className="mt-1 text-xs text-slate-500">Choose the look you prefer across your workspace.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {([
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              aria-pressed={appearance === value}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition ${
                appearance === value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              key={value}
              onClick={() => onAppearanceChange(value)}
              type="button"
            >
              <Icon size={16} />
              {label} theme
              {appearance === value && (
                <span className="ml-auto text-[10px] font-medium">Selected</span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Daily email limits</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
          Set a separate rolling 24-hour limit for each provider family. Every To, Cc, and Bcc recipient counts; Gmail's existing safety cap remains in force.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {mailProviderOptions.map(({ id, label, description }) => (
            <label
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2.5"
              key={id}
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800">{label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
              </span>
              <input
                aria-label={`${label} daily recipient limit`}
                className="w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400"
                defaultValue={dailyLimits[id]}
                max={MAX_DAILY_RECIPIENT_LIMIT}
                min={MIN_DAILY_RECIPIENT_LIMIT}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(value) &&
                    value >= MIN_DAILY_RECIPIENT_LIMIT &&
                    value <= MAX_DAILY_RECIPIENT_LIMIT
                  ) {
                    onDailyLimitChange(id, value);
                  } else {
                    event.currentTarget.value = String(dailyLimits[id]);
                  }
                }}
                step={1}
                type="number"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Limits are enforced on this device. Failed delivery attempts still use recipient slots to prevent accidental duplicate sends.
        </p>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Music2 size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Splash screen music</h2>
            <p className="mt-1 text-xs text-slate-500">Play the short intro tune when Timeless starts.</p>
          </div>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            checked={splashMusicEnabled}
            className="size-4 accent-indigo-600"
            onChange={(event) => onSplashMusicChange(event.currentTarget.checked)}
            type="checkbox"
          />
          {splashMusicEnabled ? "On" : "Off"}
        </label>
      </section>
    </div>
  );
}
