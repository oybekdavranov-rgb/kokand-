import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — shartli klasslarni birlashtiradi (clsx) va Tailwind ziddiyatlarini
 * hal qiladi (tailwind-merge). Loyiha bo'ylab yagona klass-yordamchi.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
