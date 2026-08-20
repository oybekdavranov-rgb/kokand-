"use client";

import { useEffect, useState } from "react";

/**
 * useReducedMotion — `prefers-reduced-motion: reduce` holatini kuzatadi.
 * true bo'lsa motion komponentlari scrub/parallax/split'ni o'chiradi
 * (CLAUDE.md §4.1, §8). SSR'da har doim false qaytadi (mount'da aniqlanadi).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
