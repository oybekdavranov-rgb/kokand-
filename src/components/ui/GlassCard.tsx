"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * GlassCard — Apple-uslubidagi shisha karta (CLAUDE.md §3.1).
 *
 * Ikki variant, bitta komponent:
 *  - `clear`   → 100% shaffof (background: transparent), faqat chegara + nur.
 *  - `frosted` → yarim shaffof + backdrop-blur.
 *
 * Har ikkalasida glow-line (::before) + orqa nur (::after) — glass.css'da.
 * `spotlight` yoniq bo'lsa, kursor pozitsiyasi `--mx/--my` orqali uzatiladi.
 *
 * Foydalanadigan token'lar: --glass-bg, --glass-alpha-soft, --glass-border,
 * --glow, --radius-card, --dur-base, --ease-out-expo.
 */
export interface GlassCardProps {
  variant?: "clear" | "frosted";
  className?: string;
  children?: ReactNode;
  /** Kursor spotlight qatlami (default: yoniq) */
  spotlight?: boolean;
}

export function GlassCard({
  variant = "frosted",
  className,
  children,
  spotlight = true,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!spotlight) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cn(
        "glass",
        variant === "clear" ? "glass--clear" : "glass--frosted",
        className,
      )}
    >
      {spotlight ? <span className="glass__spot" aria-hidden="true" /> : null}
      <div className="glass__content">{children}</div>
    </div>
  );
}
