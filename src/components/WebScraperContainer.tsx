import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "react-toastify";
import {
  MAX_CRAWL_PAGES,
  matchingPage,
  normalizeWebsiteUrl,
  pageLinks,
  timeframeStart,
} from "../domain/webScraper";
import type { SavedScrapeSearch, ScrapeSearchResults, ScrapeTimeframe, ScrapedPage } from "../domain/webScraper";
import { deleteScrapeSearch, fetchScrapePage, getSavedScrapeSearches, saveScrapeSearch } from "../services/webScraperApi";
import { WebScraperView } from "./WebScraperView";

const MAX_CONCURRENT_REQUESTS = 4;

export function WebScraperContainer() {
  const [website, setWebsite] = useState("");
  const [keyword, setKeyword] = useState("");
  const [timeframe, setTimeframe] = useState<ScrapeTimeframe>("30d");
  const [sinceDate, setSinceDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScrapeSearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedScrapeSearch[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    void getSavedScrapeSearches()
      .then(setSavedSearches)
      .catch((caught: unknown) => toast.error(`Could not load saved searches: ${String(caught)}`));
  }, []);

  const persistSearch = async (search: SavedScrapeSearch) => {
    if (!isTauri()) {
      toast.info("Saved searches require the Timeless desktop app.");
      return;
    }
    try {
      await saveScrapeSearch(search);
      setSavedSearches((current) => [search, ...current.filter((item) => item.id !== search.id)]);
      toast.success("Search saved.");
    } catch (caught) {
      toast.error(`Could not save search: ${String(caught)}`);
    }
  };

  const saveCurrentResults = () => {
    if (!results) return;
    void persistSearch({
      id: crypto.randomUUID(),
      website,
      keyword,
      timeframe,
      sinceDate,
      savedAt: Date.now(),
      results,
    });
  };

  const loadSavedSearch = (search: SavedScrapeSearch) => {
    setWebsite(search.website);
    setKeyword(search.keyword);
    setTimeframe(search.timeframe);
    setSinceDate(search.sinceDate);
    setResults(search.results);
    setError(null);
  };

  const removeSavedSearch = (id: string) => {
    if (!isTauri()) return;
    void deleteScrapeSearch(id)
      .then(() => setSavedSearches((current) => current.filter((item) => item.id !== id)))
      .catch((caught: unknown) => toast.error(`Could not delete saved search: ${String(caught)}`));
  };

  const searchWebsite = async () => {
    setError(null);
    setResults(null);
    if (!isTauri()) {
      setError("Website scraping is available in the Timeless desktop app.");
      return;
    }
    const searchTerm = keyword.trim();
    if (!searchTerm) {
      setError("Enter a keyword to search for.");
      return;
    }

    let startUrl: string;
    let startTime: number;
    try {
      startUrl = normalizeWebsiteUrl(website);
      startTime = timeframeStart(timeframe, sinceDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }

    setLoading(true);
    setProgress(0);
    const pending = [startUrl];
    const visited = new Set<string>();
    const matchingPages: ScrapedPage[] = [];
    let failedCount = 0;
    let firstFailure: string | null = null;
    try {
      while (pending.length && visited.size < MAX_CRAWL_PAGES) {
        const batch: string[] = [];
        while (
          pending.length &&
          batch.length < MAX_CONCURRENT_REQUESTS &&
          visited.size < MAX_CRAWL_PAGES
        ) {
          const pageUrl = pending.shift();
          if (!pageUrl || visited.has(pageUrl)) continue;
          visited.add(pageUrl);
          batch.push(pageUrl);
        }
        setProgress(visited.size);
        const fetchedPages = await Promise.all(batch.map(async (pageUrl) => {
          try {
            return { pageUrl, fetched: await fetchScrapePage(pageUrl), error: null };
          } catch (caught) {
            return { pageUrl, fetched: null, error: caught };
          }
        }));
        for (const { pageUrl, fetched, error: fetchError } of fetchedPages) {
          if (fetchError) {
            if (pageUrl === startUrl) throw fetchError;
            failedCount += 1;
            firstFailure ??= fetchError instanceof Error ? fetchError.message : String(fetchError);
            continue;
          }
          if (!fetched) continue;

          const page = matchingPage(fetched.html, fetched.url, searchTerm);
          if (
            page &&
            (page.publishedAt === null ||
              (page.publishedAt >= startTime && page.publishedAt <= Date.now()))
          ) {
            matchingPages.push(page);
          }
          for (const link of pageLinks(fetched.html, fetched.url)) {
            if (!visited.has(link) && !pending.includes(link) && pending.length < MAX_CRAWL_PAGES) {
              pending.push(link);
            }
          }
        }
      }
      matchingPages.sort((first, second) =>
        (second.publishedAt ?? 0) - (first.publishedAt ?? 0),
      );
      setResults({
        pages: matchingPages,
        scannedCount: visited.size,
        failedCount,
        firstFailure,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const openExternal = async (url: string) => {
    try {
      if (isTauri()) {
        await openUrl(url);
      } else {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) throw new Error("The browser blocked the new tab.");
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const shareResult = (page: ScrapedPage, platform: "whatsapp" | "telegram") => {
    const message = `${page.title}\n${page.url}`;
    const shareUrl =
      platform === "whatsapp"
        ? `https://wa.me/?text=${encodeURIComponent(message)}`
        : `https://t.me/share/url?url=${encodeURIComponent(page.url)}&text=${encodeURIComponent(page.title)}`;
    void openExternal(shareUrl);
  };

  return (
    <WebScraperView
      error={error}
      keyword={keyword}
      loading={loading}
      onKeywordChange={setKeyword}
      onOpenPage={(url) => void openExternal(url)}
      onSearch={() => void searchWebsite()}
      onShare={shareResult}
      onSinceDateChange={setSinceDate}
      onTimeframeChange={setTimeframe}
      onWebsiteChange={setWebsite}
      progress={progress}
      results={results}
      savedSearches={savedSearches}
      sinceDate={sinceDate}
      timeframe={timeframe}
      website={website}
      onDeleteSavedSearch={removeSavedSearch}
      onLoadSavedSearch={loadSavedSearch}
      onSaveResults={saveCurrentResults}
    />
  );
}
