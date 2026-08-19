"use client";

import { cn } from "@/lib/cn";
import { useTheme } from "@/hooks/useTheme";

/**
 * ThemeToggle — kun/tun rejimini almashtiradi (CLAUDE.md §2, §8).
 * A11y: `role="switch"` + `aria-checked`, klaviaturadan boshqariladi.
 * Vizual holat html[data-theme] orqali CSS'da (FOUC yo'q); matn/aria
 * store'dan keladi.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDay = theme === "day";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDay}
      aria-label="Kun/tun rejimini almashtirish"
      title={isDay ? "Kunduzgi rejim" : "Tungi rejim"}
      className={cn("theme-toggle", className)}
      onClick={toggle}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb" />
      </span>
      <span className="theme-toggle__label">{isDay ? "KUN" : "TUN"}</span>
    </button>
  );
}
