import type { FormEvent } from "react";
import { CalendarDays, Clock3, ExternalLink, Globe2, MessageCircle, Search, Send } from "lucide-react";
import type { ScrapeSearchResults, ScrapeTimeframe, ScrapedPage } from "../domain/webScraper";

const timeframeOptions: { value: ScrapeTimeframe; label: string }[] = [
  { value: "24h", label: "Past 24 hours" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "90d", label: "Past 90 days" },
  { value: "since", label: "Since a date" },
];

function formatPublishedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp);
}

export function WebScraperView({
  website,
  keyword,
  timeframe,
  sinceDate,
  loading,
  progress,
  error,
  results,
  onWebsiteChange,
  onKeywordChange,
  onTimeframeChange,
  onSinceDateChange,
  onSearch,
  onOpenPage,
  onShare,
}: {
  website: string;
  keyword: string;
  timeframe: ScrapeTimeframe;
  sinceDate: string;
  loading: boolean;
  progress: number;
  error: string | null;
  results: ScrapeSearchResults | null;
  onWebsiteChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onTimeframeChange: (value: ScrapeTimeframe) => void;
  onSinceDateChange: (value: string) => void;
  onSearch: () => void;
  onOpenPage: (url: string) => void;
  onShare: (page: ScrapedPage, platform: "whatsapp" | "telegram") => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Globe2 size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Search pages on a website</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Enter a public website to scan its same-site links for matching pages. Results stay on this device.
            </p>
          </div>
        </div>

        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Website URL
              <input
                autoComplete="url"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                onChange={(event) => onWebsiteChange(event.currentTarget.value)}
                placeholder="https://example.com/jobs"
                required
                type="url"
                value={website}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Keyword or phrase
              <input
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                onChange={(event) => onKeywordChange(event.currentTarget.value)}
                placeholder="e.g. product designer"
                required
                value={keyword}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-48 text-xs font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> Time range</span>
              <select
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"
                onChange={(event) => {
                  const option = timeframeOptions.find(
                    (item) => item.value === event.currentTarget.value,
                  );
                  if (option) onTimeframeChange(option.value);
                }}
                value={timeframe}
              >
                {timeframeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {timeframe === "since" && (
              <label className="block min-w-48 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> Start date</span>
                <input
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"
                  onChange={(event) => onSinceDateChange(event.currentTarget.value)}
                  required
                  type="date"
                  value={sinceDate}
                />
              </label>
            )}
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              <Search size={14} /> {loading ? `Scanning ${progress}…` : "Search website"}
            </button>
          </div>
        </form>

        <p className="mt-3 text-[11px] leading-5 text-slate-400">
          Scans up to 20 pages from the same website. Pages must include searchable HTML; JavaScript-only and login-protected content may not be available.
        </p>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{error}</p>}
      </section>

      {loading && (
        <div aria-live="polite" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          Scanning page {progress} of up to 20. This may take a little while.
        </div>
      )}

      {results && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {results.pages.length} matching page{results.pages.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Scanned {results.scannedCount} page{results.scannedCount === 1 ? "" : "s"} · sorted by published date
            </p>
            {results.failedCount > 0 && (
              <p className="mt-2 text-xs text-amber-700" role="status">
                {results.failedCount} linked page{results.failedCount === 1 ? "" : "s"} could not be scanned. First error: {results.firstFailure}
              </p>
            )}
          </div>
          {results.pages.length ? (
            <div className="divide-y divide-slate-100">
              {results.pages.map((page) => (
                <article className="p-4" key={page.url}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">{page.title}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">{page.snippet}</p>
                      <p className="mt-2 truncate text-[11px] text-slate-400">{page.url}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {page.publishedAt === null
                          ? "Published date not found"
                          : formatPublishedAt(page.publishedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => onOpenPage(page.url)}
                        type="button"
                      >
                        <ExternalLink size={13} /> Open
                      </button>
                      <button
                        aria-label={`Share ${page.title} on WhatsApp`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => onShare(page, "whatsapp")}
                        type="button"
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </button>
                      <button
                        aria-label={`Share ${page.title} on Telegram`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => onShare(page, "telegram")}
                        type="button"
                      >
                        <Send size={13} /> Telegram
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No matching pages found</p>
              <p className="mt-1 text-xs text-slate-400">
                Try another keyword, a broader time range, or a different starting page.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
