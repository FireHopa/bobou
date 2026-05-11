import * as React from "react";
import {
  COLOR_THEME_STORAGE_KEY,
  COLOR_THEMES,
  type ColorThemeId,
  getNextColorTheme,
  getStoredColorTheme,
  isColorThemeId,
  setStoredColorTheme,
} from "@/lib/colorTheme";

export function useColorTheme() {
  const [themeId, setThemeIdState] = React.useState<ColorThemeId>(() => getStoredColorTheme());

  React.useEffect(() => {
    const syncFromDomOrStorage = () => {
      const domTheme = document.documentElement.dataset.colorTheme;
      setThemeIdState(isColorThemeId(domTheme) ? domTheme : getStoredColorTheme());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === COLOR_THEME_STORAGE_KEY) {
        syncFromDomOrStorage();
      }
    };

    window.addEventListener("bobou:color-theme-change", syncFromDomOrStorage);
    window.addEventListener("storage", handleStorage);
    syncFromDomOrStorage();

    return () => {
      window.removeEventListener("bobou:color-theme-change", syncFromDomOrStorage);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setThemeId = React.useCallback((nextThemeId: ColorThemeId) => {
    setThemeIdState(nextThemeId);
    setStoredColorTheme(nextThemeId);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setThemeId(getNextColorTheme(themeId));
  }, [setThemeId, themeId]);

  return {
    themeId,
    theme: COLOR_THEMES[themeId],
    themes: COLOR_THEMES,
    setThemeId,
    toggleTheme,
  };
}
