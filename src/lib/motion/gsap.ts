/**
 * IMORA AI — GSAP markazlashtirilgan ro'yxatga olish (CLAUDE.md §4).
 * Plaginlar faqat brauzerda, bir marta ro'yxatga olinadi. Barcha motion
 * komponentlari shu yerdan import qiladi.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

let registered = false;

export function registerGsap(): void {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  registered = true;
}

export { gsap, ScrollTrigger, SplitText };
