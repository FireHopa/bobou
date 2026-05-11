export const COLOR_THEME_STORAGE_KEY = "bobou:color-theme:v1";

export const COLOR_THEMES = {
  default: {
    id: "default",
    label: "Tema atual",
    shortLabel: "Atual",
    description: "Visual escuro atual com acento ciano.",
  },
  googleGray: {
    id: "googleGray",
    label: "Cinza Google",
    shortLabel: "Google",
    description: "Painel cinza claro, sidebar grafite e botões com cores do Google.",
  },
} as const;

export type ColorThemeId = keyof typeof COLOR_THEMES;

const COLOR_THEME_IDS = Object.keys(COLOR_THEMES) as ColorThemeId[];

export function isColorThemeId(value: unknown): value is ColorThemeId {
  return typeof value === "string" && COLOR_THEME_IDS.includes(value as ColorThemeId);
}

export function getStoredColorTheme(): ColorThemeId {
  if (typeof window === "undefined") return "default";

  try {
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return isColorThemeId(stored) ? stored : "default";
  } catch {
    return "default";
  }
}

export function applyColorTheme(themeId: ColorThemeId) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.colorTheme = themeId;
  document.documentElement.style.colorScheme = themeId === "googleGray" ? "light" : "dark";
}

export function setStoredColorTheme(themeId: ColorThemeId) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, themeId);
    } catch {
      /* localStorage can fail in private mode. The visual theme still changes. */
    }
  }

  applyColorTheme(themeId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bobou:color-theme-change", { detail: { themeId } }));
  }
}

export function getNextColorTheme(themeId: ColorThemeId): ColorThemeId {
  const currentIndex = COLOR_THEME_IDS.indexOf(themeId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % COLOR_THEME_IDS.length : 0;
  return COLOR_THEME_IDS[nextIndex] ?? "default";
}

export function initColorThemeBeforeReact() {
  applyColorTheme(getStoredColorTheme());
}
