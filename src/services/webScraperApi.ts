import { invoke } from "@tauri-apps/api/core";
import type { SavedScrapeSearch } from "../domain/webScraper";

export interface FetchedScrapePage {
  url: string;
  html: string;
}

export function fetchScrapePage(url: string) {
  return invoke<FetchedScrapePage>("fetch_scrape_page", { url });
}

export const getSavedScrapeSearches = () => invoke<SavedScrapeSearch[]>("get_scrape_searches");
export const saveScrapeSearch = (search: SavedScrapeSearch) => invoke("save_scrape_search", { search });
export const deleteScrapeSearch = (id: string) => invoke("delete_scrape_search", { id });
