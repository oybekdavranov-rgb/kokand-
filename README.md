# Imora AI — Landing Experience

President AI Tournament uchun rasmiy landing/tajriba sayti. **Next.js 15 (App Router)
+ TypeScript strict + Tailwind CSS v4** ustida qurilgan; keyingi bosqichlarda GSAP + Lenis
motion, preloader, video fon va React Three Fiber 3D sahna qo'shiladi.

Loyihaning to'liq "konstitutsiyasi" — [`CLAUDE.md`](./CLAUDE.md).

## Hozirgi holat — Bosqich 1 (Poydevor)

- ✅ Next.js 15 + TS strict + Tailwind v4, App Router, `src/` katalog
- ✅ Dizayn token'lari (`src/styles/tokens.css`) — kun/tun rejimi, type scale, motion
- ✅ Shriftlar `next/font/google` orqali: Oswald, Archivo, Inter Tight, JetBrains Mono
- ✅ Tema tizimi: `useTheme` + `ThemeToggle` (FOUC'siz, `role="switch"`)
- ✅ `GlassCard` — `clear` / `frosted`, kursor spotlight, glow-line
- ✅ `/playground` — barcha token, tipografika, shrift va shisha kartalar namunasi
- ⏳ Keyingi: motion poydevori → preloader → video/hero → 3D → bo'limlar → admin/i18n

## Ishga tushirish

```bash
npm install
npm run dev      # http://localhost:3000  (va /playground)
```

Ishlab chiqarish uchun:

```bash
npm run build
npm run start
```

## Skriptlar

| Skript | Vazifasi |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (`output: 'standalone'`) |
| `npm run start` | Build'ni ishga tushirish |
| `npm run lint` | ESLint (`next/core-web-vitals` + `next/typescript`) |
| `npm run typecheck` | `tsc --noEmit` |

## Fayl strukturasi

```
src/
  app/
    layout.tsx        # root layout + shriftlar + FOUC'siz tema skripti
    page.tsx          # bosh sahifa (poydevor holati)
    playground/       # dizayn tizimi namoyishi
    globals.css       # tailwind + token/glass/typography/components importlari
    icon.svg          # favicon (brand mark)
  components/ui/       # GlassCard, ThemeToggle, SiteHeader
  hooks/               # useTheme
  lib/                 # fonts.ts, cn.ts
  store/               # theme.ts (zustand)
  styles/              # tokens.css, typography.css, glass.css, components.css
public/brand/          # logo-mark.svg, logo-full.svg (placeholder)
```

## Asset'lar

Asset manifest — `CLAUDE.md §2`. Fayl bo'lmasa placeholder ishlatiladi.

- `public/brand/logo-mark.svg`, `public/brand/logo-full.svg` — **VAQTINCHALIK placeholder**.
  Yuborilgan yurak+qo'llar dizayni asosida qayta chizilgan. Haqiqiy vektor asset kelganda
  shu fayllarni almashtiring.
- `logo-part-01.svg … logo-part-NN.svg` (preloader yig'ilish bo'laklari), video, audio,
  `.glb` model — keyingi bosqichlarda kerak bo'ladi.

## Tema

`data-theme="day"` (sayoz suv / yorug') va `data-theme="night"` (chuqur suv / qorong'i).
Tanlov `localStorage['imora-theme']` da faqat UI preference sifatida saqlanadi; birinchi
paint'dan oldin inline skript to'g'ri temani qo'yadi (FOUC yo'q).

## ⚠️ Brand rang ziddiyati (tasdiq kerak)

Master prompt brand-core sifatida **violet (#36255C) + lavender (#D2C3F6)** ni belgilaydi
va `tokens.css` shunga amal qiladi. Ammo yuborilgan logotip **ko'k + teal**. Qaysi biri
yakuniy brand ekanini tasdiqlang — token'lar bitta faylda, oson almashtiriladi.

## Deploy

`next.config.ts` da `output: 'standalone'` — Vercel yoki Docker bilan ZIP sifatida
topshiriladi. Docker uchun `.next/standalone` chiqindisidan foydalaning.

## Uchinchi tomon litsenziyalari

- Shriftlar (Oswald, Archivo, Inter Tight, JetBrains Mono) — SIL Open Font License (OFL), bepul.
- Barcha kutubxonalar npm orqali (MIT va shunga o'xshash ochiq litsenziyalar).

## Eslatma

Avvalgi "Qo'qon Universiteti — Tuzilma" backend kodi `legacy-kokand/` papkasida saqlangan
(bu loyiha bilan bog'liq emas, tarixiy nusxa).
