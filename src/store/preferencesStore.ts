import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  defaultDailyLimits,
  normalizeDailyRecipientLimit,
} from "../domain/preferences";
import type { Appearance, DailyLimits, MailProviderFamily } from "../domain/preferences";

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
