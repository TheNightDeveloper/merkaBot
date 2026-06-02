import type { TelegramThemeSource } from "./telegram";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "merkabot-theme-preference";

type ThemeTokens = Record<string, string>;

const lightTheme: ThemeTokens = {
  "--app-bg": "#f6f3ee",
  "--app-surface": "#ffffff",
  "--app-surface-muted": "#efe7da",
  "--app-border": "#d8d0c4",
  "--app-text": "#111827",
  "--app-text-muted": "#6b7280",
  "--app-accent": "#111827",
  "--app-accent-contrast": "#ffffff",
  "--app-link": "#2563eb",
  "--app-danger": "#b91c1c",
  "--app-danger-soft": "#fee2e2",
  "--app-success": "#166534",
  "--app-success-soft": "#dcfce7",
  "--app-warning": "#92400e",
  "--app-warning-soft": "#fef3c7",
  "--app-info": "#334155",
  "--app-info-soft": "#e2e8f0",
  "--app-card-shadow": "0 24px 80px -48px rgba(15,23,42,0.35)"
};

const darkTheme: ThemeTokens = {
  "--app-bg": "#0b1220",
  "--app-surface": "#111a2d",
  "--app-surface-muted": "#182338",
  "--app-border": "rgba(148,163,184,0.2)",
  "--app-text": "#e5edf8",
  "--app-text-muted": "#94a3b8",
  "--app-accent": "#f3f4f6",
  "--app-accent-contrast": "#111827",
  "--app-link": "#7dd3fc",
  "--app-danger": "#f87171",
  "--app-danger-soft": "rgba(248,113,113,0.18)",
  "--app-success": "#86efac",
  "--app-success-soft": "rgba(34,197,94,0.18)",
  "--app-warning": "#fcd34d",
  "--app-warning-soft": "rgba(245,158,11,0.2)",
  "--app-info": "#cbd5e1",
  "--app-info-soft": "rgba(148,163,184,0.2)",
  "--app-card-shadow": "0 26px 90px -54px rgba(2,6,23,0.82)"
};

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

export function setStoredThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, preference);
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  telegramTheme: TelegramThemeSource | undefined,
  mediaQuery?: MediaQueryList
): ResolvedTheme {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  if (telegramTheme?.colorScheme) {
    return telegramTheme.colorScheme;
  }

  return mediaQuery?.matches ? "dark" : "light";
}

export function applyResolvedTheme(options: {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  telegramTheme?: TelegramThemeSource;
}) {
  const { preference, resolvedTheme, telegramTheme } = options;
  const root = document.documentElement;
  const baseTokens = resolvedTheme === "dark" ? darkTheme : lightTheme;
  const themeParams = preference === "system" ? telegramTheme?.themeParams ?? {} : {};

  const tokens: ThemeTokens = {
    ...baseTokens,
    "--app-bg": themeParams.bg_color ?? baseTokens["--app-bg"],
    "--app-surface": themeParams.secondary_bg_color ?? baseTokens["--app-surface"],
    "--app-surface-muted": themeParams.section_bg_color ?? baseTokens["--app-surface-muted"],
    "--app-text": themeParams.text_color ?? baseTokens["--app-text"],
    "--app-text-muted": themeParams.hint_color ?? baseTokens["--app-text-muted"],
    "--app-accent": themeParams.button_color ?? baseTokens["--app-accent"],
    "--app-accent-contrast": themeParams.button_text_color ?? baseTokens["--app-accent-contrast"],
    "--app-link": themeParams.link_color ?? baseTokens["--app-link"],
    "--app-danger": themeParams.destructive_text_color ?? baseTokens["--app-danger"]
  };

  for (const [token, value] of Object.entries(tokens)) {
    root.style.setProperty(token, value);
  }

  root.dataset.scheme = resolvedTheme;
}
