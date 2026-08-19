import { create } from "zustand";

/**
 * IMORA AI — Tema holati (CLAUDE.md §1, §4, §8)
 * "day" (sayoz suv / yorug') va "night" (chuqur suv / qorong'i).
 * Tanlov localStorage'da faqat UI preference sifatida saqlanadi.
 */
export type Theme = "day" | "night";

export const THEME_STORAGE_KEY = "imora-theme";
export const DEFAULT_THEME: Theme = "night";

function isTheme(value: unknown): value is Theme {
  return value === "day" || value === "night";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / storage o'chirilgan — jim o'tamiz */
  }
}

interface ThemeState {
  theme: Theme;
  /** DOM'dan (inline skript qo'ygan) qiymat bilan sinxronlangan-yo'qmi */
  hydrated: boolean;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  hydrateFromDom: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  hydrated: false,
  setTheme: (theme) => {
    applyTheme(theme);
    persistTheme(theme);
    set({ theme, hydrated: true });
  },
  toggle: () => {
    get().setTheme(get().theme === "day" ? "night" : "day");
  },
  hydrateFromDom: () => {
    if (typeof document === "undefined") return;
    const attr = document.documentElement.getAttribute("data-theme");
    set({ theme: isTheme(attr) ? attr : DEFAULT_THEME, hydrated: true });
  },
}));
