import { Check, Palette } from "lucide-react";
import { useColorTheme } from "@/hooks/useColorTheme";
import { cn } from "@/lib/utils";

export function ColorThemeToggle({
  collapsed = false,
  variant = "sidebar",
}: {
  collapsed?: boolean;
  variant?: "sidebar" | "floating";
}) {
  const { themeId, theme, toggleTheme } = useColorTheme();
  const isGoogleGray = themeId === "googleGray";
  const title = `Tema de cor: ${theme.label}. Clique para alternar.`;

  if (variant === "floating") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={title}
        aria-label={title}
        className="theme-floating-toggle"
      >
        <span className="theme-floating-toggle-icon">
          <Palette className="h-4 w-4" />
        </span>
        <span className="hidden text-xs font-semibold sm:inline">{theme.shortLabel}</span>
      </button>
    );
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={title}
        aria-label={title}
        className="theme-toggle-compact"
      >
        <Palette className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={title}
      aria-label={title}
      className="theme-toggle-card"
    >
      <div className="flex items-center gap-3">
        <span className="theme-toggle-icon">
          <Palette className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold text-foreground">Tema de cor</span>
          <span className="block truncate text-xs text-muted-foreground">{theme.label}</span>
        </span>
      </div>

      <span className="flex items-center gap-1.5">
        <span className={cn("theme-dot theme-dot-cyan", !isGoogleGray && "theme-dot-active")} />
        <span className={cn("theme-dot theme-dot-google", isGoogleGray && "theme-dot-active")}>
          {isGoogleGray ? <Check className="h-3 w-3" /> : null}
        </span>
      </span>
    </button>
  );
}
