export type TelegramThemeParams = Partial<Record<
  | "bg_color"
  | "secondary_bg_color"
  | "section_bg_color"
  | "text_color"
  | "hint_color"
  | "link_color"
  | "button_color"
  | "button_text_color"
  | "destructive_text_color",
  string
>>;

export type TelegramWebApp = {
  initData: string;
  themeParams: TelegramThemeParams;
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  onEvent?: (eventType: "themeChanged", eventHandler: () => void) => void;
  offEvent?: (eventType: "themeChanged", eventHandler: () => void) => void;
};

export type TelegramThemeSource = {
  colorScheme?: "light" | "dark";
  themeParams: TelegramThemeParams;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function getTelegramThemeSource(webApp = getTelegramWebApp()): TelegramThemeSource | undefined {
  if (!webApp) {
    return undefined;
  }

  return {
    colorScheme: webApp.colorScheme,
    themeParams: webApp.themeParams ?? {}
  };
}
