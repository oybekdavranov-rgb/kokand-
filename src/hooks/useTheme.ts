"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/theme";

/**
 * useTheme — komponentlar uchun tema kirish nuqtasi.
 * Mount'da DOM'dagi (inline skript qo'ygan, FOUC'siz) qiymat bilan
 * store'ni sinxronlaydi.  (CLAUDE.md §1, §4.1)
 */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const hydrated = useThemeStore((s) => s.hydrated);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggle = useThemeStore((s) => s.toggle);
  const hydrateFromDom = useThemeStore((s) => s.hydrateFromDom);

  useEffect(() => {
    hydrateFromDom();
  }, [hydrateFromDom]);

  return { theme, hydrated, setTheme, toggle };
}
