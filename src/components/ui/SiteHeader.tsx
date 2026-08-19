import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * SiteHeader — sticky brand bar (frosted glass) + navigatsiya + tema tumbleri.
 * Brand nomi ikki shrift aralashmasi bilan (Oswald + Archivo expanded italic)
 * — CLAUDE.md §3.2 qoidasi.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Imora AI — bosh sahifa">
        <Image
          src="/brand/logo-mark.svg"
          alt=""
          width={32}
          height={32}
          className="brand__mark"
          priority
        />
        <span className="brand__name">
          Imora <em>AI</em>
        </span>
      </Link>

      <nav className="site-header__nav" aria-label="Asosiy">
        <Link href="/" className="nav-link">
          Bosh
        </Link>
        <Link href="/playground" className="nav-link">
          Playground
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
