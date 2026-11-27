export type ScrapeTimeframe = "24h" | "7d" | "30d" | "90d" | "since";

export interface ScrapedPage {
  url: string;
  title: string;
  snippet: string;
  publishedAt: number | null;
}

export interface ScrapeSearchResults {
  pages: ScrapedPage[];
  scannedCount: number;
  failedCount: number;
  firstFailure: string | null;
}

export interface SavedScrapeSearch {
  id: string;
  website: string;
  keyword: string;
  timeframe: ScrapeTimeframe;
  sinceDate: string;
  savedAt: number;
  results: ScrapeSearchResults;
}

export const MAX_CRAWL_PAGES = 20;

export function normalizeWebsiteUrl(value: string) {
  const input = value.trim();
  const candidate = input.includes("://") ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Use a public HTTP or HTTPS website URL without embedded credentials.");
  }
  url.hash = "";
  return url.href;
}

export function pageLinks(html: string, pageUrl: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const origin = new URL(pageUrl).origin;
  const links = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    try {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const link = new URL(href, pageUrl);
      if (["http:", "https:"].includes(link.protocol) && link.origin === origin) {
        link.hash = "";
        links.add(link.href);
      }
    } catch {
      continue;
    }
  }
  return [...links];
}

export function matchingPage(html: string, pageUrl: string, keyword: string): ScrapedPage | null {
  const document = new DOMParser().parseFromString(html, "text/html");
  const text = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
  const terms = keyword.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const normalizedText = text.toLocaleLowerCase();
  if (!terms.every((term) => normalizedText.includes(term))) return null;

  const firstMatch = Math.min(...terms.map((term) => normalizedText.indexOf(term)));
  const start = Math.max(0, firstMatch - 70);
  const snippet = `${start > 0 ? "…" : ""}${text.slice(start, start + 220).trim()}${start + 220 < text.length ? "…" : ""}`;
  const title = document.title.trim() || new URL(pageUrl).hostname;
  return {
    url: pageUrl,
    title: title.slice(0, 180),
    snippet: snippet || "This page contains the requested keyword.",
    publishedAt: extractPublishedAt(document),
  };
}

function extractPublishedAt(document: Document) {
  const dateSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    'time[datetime]',
    '[itemprop="datePublished"][datetime]',
    '[itemprop="datePublished"][content]',
  ];
  for (const selector of dateSelectors) {
    for (const element of document.querySelectorAll(selector)) {
      const dateText =
        element.getAttribute("content") ??
        element.getAttribute("datetime") ??
        element.getAttribute("value");
      if (!dateText) continue;
      const timestamp = Date.parse(dateText);
      if (Number.isFinite(timestamp)) return timestamp;
    }
  }
  return null;
}

export function timeframeStart(timeframe: ScrapeTimeframe, sinceDate: string, now = Date.now()) {
  const durations: Record<Exclude<ScrapeTimeframe, "since">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  if (timeframe !== "since") return now - durations[timeframe];
  if (!sinceDate) throw new Error("Choose a date to search from.");
  const start = new Date(`${sinceDate}T00:00:00`).getTime();
  if (!Number.isFinite(start)) throw new Error("Choose a valid date.");
  return start;
}
