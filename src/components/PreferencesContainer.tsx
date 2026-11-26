import { usePreferencesStore } from "../store/preferencesStore";
import { PreferencesView } from "./PreferencesView";

export function PreferencesContainer() {
  const appearance = usePreferencesStore((state) => state.appearance);
  const dailyLimits = usePreferencesStore((state) => state.dailyLimits);
  const splashMusicEnabled = usePreferencesStore((state) => state.splashMusicEnabled);
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  const setDailyLimit = usePreferencesStore((state) => state.setDailyLimit);
  const setSplashMusicEnabled = usePreferencesStore((state) => state.setSplashMusicEnabled);

  return (
    <PreferencesView
      appearance={appearance}
      dailyLimits={dailyLimits}
      onAppearanceChange={setAppearance}
      onDailyLimitChange={setDailyLimit}
      onSplashMusicChange={setSplashMusicEnabled}
      splashMusicEnabled={splashMusicEnabled}
    />
  );
}
