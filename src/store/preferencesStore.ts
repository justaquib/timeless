import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  defaultDailyLimits,
  normalizeDailyRecipientLimit,
} from "../domain/preferences";
import type { Appearance, DailyLimits, MailProviderFamily } from "../domain/preferences";

const storage = createJSONStorage(() => ({
  getItem: async (name: string) => {
    if (!isTauri()) return localStorage.getItem(name);
    const legacy = localStorage.getItem(name);
    const saved = await invoke<string | null>("load_workspace_state", { key: name, legacy });
    if (saved && legacy) localStorage.removeItem(name);
    return saved;
  },
  setItem: (name: string, value: string) => {
    if (isTauri()) {
      void invoke("save_workspace_state", { key: name, value }).catch((error: unknown) => {
        console.error("Could not persist preferences to the local database:", error);
      });
      return;
    }
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (!isTauri()) localStorage.removeItem(name);
  },
}));

interface PreferencesState {
  appearance: Appearance;
  dailyLimits: DailyLimits;
  splashMusicEnabled: boolean;
  setAppearance: (appearance: Appearance) => void;
  setDailyLimit: (provider: MailProviderFamily, limit: number) => void;
  setSplashMusicEnabled: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      appearance: "dark",
      dailyLimits: { ...defaultDailyLimits },
      splashMusicEnabled: true,
      setAppearance: (appearance) => set({ appearance }),
      setDailyLimit: (provider, limit) =>
        set((state) => ({
          dailyLimits: {
            ...state.dailyLimits,
            [provider]: normalizeDailyRecipientLimit(limit, provider),
          },
        })),
      setSplashMusicEnabled: (splashMusicEnabled) => set({ splashMusicEnabled }),
    }),
    {
      name: "timeless-preferences",
      storage,
      partialize: ({ appearance, dailyLimits, splashMusicEnabled }) => ({
        appearance,
        dailyLimits,
        splashMusicEnabled,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<
          Pick<PreferencesState, "appearance" | "dailyLimits" | "splashMusicEnabled">
        >;
        const savedLimits =
          typeof persisted.dailyLimits === "object" && persisted.dailyLimits !== null
            ? (persisted.dailyLimits as Partial<DailyLimits>)
            : {};
        return {
          ...currentState,
          appearance: persisted.appearance === "light" ? "light" : "dark",
          dailyLimits: {
            gmail: normalizeDailyRecipientLimit(
              savedLimits.gmail ?? defaultDailyLimits.gmail,
              "gmail",
            ),
            zoho: normalizeDailyRecipientLimit(
              savedLimits.zoho ?? defaultDailyLimits.zoho,
              "zoho",
            ),
            outlook: normalizeDailyRecipientLimit(
              savedLimits.outlook ?? defaultDailyLimits.outlook,
              "outlook",
            ),
            microsoft365: normalizeDailyRecipientLimit(
              savedLimits.microsoft365 ?? defaultDailyLimits.microsoft365,
              "microsoft365",
            ),
            custom: normalizeDailyRecipientLimit(
              savedLimits.custom ?? defaultDailyLimits.custom,
              "custom",
            ),
          },
          splashMusicEnabled:
            typeof persisted.splashMusicEnabled === "boolean"
              ? persisted.splashMusicEnabled
              : true,
        };
      },
    },
  ),
);
