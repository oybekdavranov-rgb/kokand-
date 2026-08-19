/**
 * IMORA AI — Shriftlar (CLAUDE.md §3.2, §7)
 *
 * next/font/google orqali self-hosted, `display: swap`, faqat kerakli subset.
 * O'zbek tili lotin yozuvida — shuning uchun `latin` + `latin-ext` yetarli
 * (cyrillic subset ixtiyoriy, keyin qo'shsa bo'ladi).
 *
 * Har oila `.variable` klassi orqali CSS o'zgaruvchisini beradi; bu
 * o'zgaruvchilar tokens.css'da `--font-display` va h.k. ga ulanadi.
 *  - Oswald        → --font-oswald   (display, UPPERCASE sarlavha)
 *  - Archivo       → --font-archivo  (expanded/italic urg'u, wdth o'qi bilan)
 *  - Inter Tight   → --font-inter    (body)
 *  - JetBrains Mono→ --font-jetbrains(label, raqam, counter)
 */
import { Oswald, Archivo, Inter_Tight, JetBrains_Mono } from "next/font/google";

export const oswald = Oswald({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  // Variable font: `wght` (standart) + `wdth` (62–125) — font-stretch uchun.
  axes: ["wdth"],
  style: ["normal", "italic"],
  variable: "--font-archivo",
  display: "swap",
});

export const interTight = Inter_Tight({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

/** Barcha shrift o'zgaruvchilarini <html>ga qo'yish uchun birlashtirilgan klass. */
export const fontVariables = [
  oswald.variable,
  archivo.variable,
  interTight.variable,
  jetbrainsMono.variable,
].join(" ");
