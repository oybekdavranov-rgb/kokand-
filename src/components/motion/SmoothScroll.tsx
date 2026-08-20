"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import { gsap, ScrollTrigger, registerGsap } from "@/lib/motion/gsap";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * SmoothScroll — Lenis silliq scroll + GSAP ScrollTrigger sinxronizatsiyasi
 * (CLAUDE.md §4.1). Lenis RAF'i gsap.ticker orqali yuritiladi va har
 * scroll'da ScrollTrigger.update chaqiriladi.
 * `prefers-reduced-motion` bo'lsa silliq scroll o'chadi (native scroll).
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    registerGsap();
    if (reduced) return;

    const update = (time: number) => {
      lenisRef.current?.lenis?.raf(time * 1000);
    };
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    const lenis = lenisRef.current?.lenis;
    const onScroll = () => ScrollTrigger.update();
    lenis?.on("scroll", onScroll);

    return () => {
      gsap.ticker.remove(update);
      lenis?.off("scroll", onScroll);
    };
  }, [reduced]);

  if (reduced) return <>{children}</>;

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{ autoRaf: false, duration: 1.1, smoothWheel: true, touchMultiplier: 1.4 }}
    >
      {children}
    </ReactLenis>
  );
}
