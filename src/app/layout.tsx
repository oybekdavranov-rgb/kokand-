import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "@/lib/fonts";
import { DEFAULT_THEME } from "@/store/theme";

export const metadata: Metadata = {
  title: {
    default: "Imora AI",
    template: "%s · Imora AI",
  },
  description:
    "Imora AI — President AI Tournament uchun rasmiy tajriba sayti.",
  applicationName: "Imora AI",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2effa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0714" },
  ],
  colorScheme: "light dark",
};

/**
 * FOUC'siz tema: birinchi paint'dan OLDIN <html data-theme> to'g'ri
 * qo'yiladi. localStorage'da saqlangan afzallik yoki prefers-color-scheme
 * asosida. (CLAUDE.md §1, §4.1)
 */
const THEME_INIT_SCRIPT = `(function(){try{var k='imora-theme';var t=localStorage.getItem(k);if(t!=='day'&&t!=='night'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'day':'night';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="uz"
      data-theme={DEFAULT_THEME}
      className={fontVariables}
      suppressHydrationWarning
    >
      <body>
        {/* Paintdan oldin ishlaydi — FOUC'ni to'xtatadi */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <a href="#main" className="skip-link">
          Asosiy kontentga o&apos;tish
        </a>
        <div className="ambient" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
