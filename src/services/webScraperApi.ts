import { invoke } from "@tauri-apps/api/core";

export interface FetchedScrapePage {
  url: string;
  html: string;
}

export function fetchScrapePage(url: string) {
  return invoke<FetchedScrapePage>("fetch_scrape_page", { url });
}
