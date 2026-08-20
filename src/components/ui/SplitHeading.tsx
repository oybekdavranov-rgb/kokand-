"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, SplitText, registerGsap } from "@/lib/motion/gsap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/cn";

/**
 * SplitHeading — sarlavhani qator/so'zlarga bo'lib, scroll'da so'z-so'z
 * mask ichidan ko'tarib chiqaradi (landonorris.com uslubi, CLAUDE.md §4.3).
 * Ichida ikki shrift aralashgan span'lar bo'lishi mumkin.
 * `prefers-reduced-motion` bo'lsa oddiy fade (split yo'q).
 */
export interface SplitHeadingProps {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p";
  start?: string;
  /** so'zlar orasidagi stagger (s) */
  stagger?: number;
}

export function SplitHeading({
  children,
  className,
  as: Tag = "h2",
  start = "top 85%",
  stagger = 0.035,
}: SplitHeadingProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      registerGsap();
      const el = ref.current;
      if (!el) return;

      if (reduced) {
        gsap.set(el, { autoAlpha: 1 });
        return;
      }

      const split = new SplitText(el, { type: "lines,words", linesClass: "split-line" });
      gsap.set(el, { autoAlpha: 1 });
      gsap.from(split.words, {
        yPercent: 115,
        opacity: 0,
        duration: 0.9,
        ease: "expo.out",
        stagger,
        scrollTrigger: { trigger: el, start, once: true },
      });

      return () => split.revert();
    },
    { scope: ref, dependencies: [reduced] },
  );

  return (
    <Tag
      ref={ref as React.Ref<HTMLHeadingElement>}
      className={cn(className)}
      style={{ visibility: "hidden" }}
    >
      {children}
    </Tag>
  );
}
