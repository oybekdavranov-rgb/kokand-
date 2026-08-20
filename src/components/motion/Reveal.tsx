"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, registerGsap } from "@/lib/motion/gsap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/cn";

/**
 * Reveal — scroll'da pastdan ko'tarilib chiqadigan blok (fade + y).
 * Faqat transform/opacity (GPU). `prefers-reduced-motion` bo'lsa darhol
 * ko'rinadi (CLAUDE.md §4.1).
 */
export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** boshlang'ich y siljish (px) */
  y?: number;
  /** kechikish (s) */
  delay?: number;
  start?: string;
}

export function Reveal({
  children,
  className,
  y = 28,
  delay = 0,
  start = "top 85%",
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      registerGsap();
      const el = ref.current;
      if (!el) return;
      if (reduced) {
        gsap.set(el, { autoAlpha: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        el,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: "expo.out",
          delay,
          scrollTrigger: { trigger: el, start, once: true },
        },
      );
    },
    { scope: ref, dependencies: [reduced] },
  );

  return (
    <div ref={ref} className={cn(className)} style={{ visibility: "hidden" }}>
      {children}
    </div>
  );
}
