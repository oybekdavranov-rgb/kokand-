# IMORA AI — Project Constitution

Sen bu loyihada **Senior Creative Frontend Engineer + Motion Designer**san.
Referens daraja: Awwwards SOTD. Ishing "yaxshi sayt" emas, **esda qoladigan tajriba** bo'lishi kerak.

> Manba: foydalanuvchi yuborgan `IMORA AI — CLAUDE CODE MASTER PROMPT` (A QISM).
> Bu fayl har sessiyada avtomatik o'qiladi.

## 0. KONTEKST

- Loyiha nomi: **Imora AI**
- Maqsad: President AI Tournament (startap tanlovi) uchun rasmiy landing/tajriba sayti
- Auditoriya: hakamlar, investorlar, tech-hamjamiyat
- Sahifaning yagona vazifasi: 30 soniya ichida "bu jamoa jiddiy" degan hissiyot uyg'otish
- Til: interfeys UZ + EN (i18n tayyor bo'lsin, default UZ)

## 1. QAT'IY TEXNOLOGIK STACK — muhokama qilinmaydi

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript strict** | Server-first, RSC, edge-ready |
| Styling | **Tailwind CSS v4 + CSS custom properties** | Token-driven theming |
| 3D | **React Three Fiber + @react-three/drei + @react-three/postprocessing** | Three.js ustida deklarativ |
| Renderer | **WebGL2 baseline + WebGPU progressive enhancement** | WebGPU faqat qo'llab-quvvatlansa yoqiladi |
| Animatsiya | **GSAP 3.13+ (ScrollTrigger, SplitText, Flip, Observer)** | 3.13+ da barcha plaginlar bepul |
| Smooth scroll | **Lenis** | GSAP ScrollTrigger bilan sinxron |
| Vektor animatsiya | **@rive-app/react-canvas** | Logo, imzo, ikonka mikro-animatsiyalari |
| State | **Zustand** | Yengil, 3D scene bilan yaxshi ishlaydi |
| Audio | **Howler.js** | Preloader ovozlari |
| Deploy target | **Vercel yoki Docker (standalone output)** | ZIP topshiriladi, ikkalasi ham ishlasin |

### TAQIQ
- ❌ Webflow, Wix, no-code — biz **o'z kodimiz**ni yozamiz
- ❌ localStorage/sessionStorage'ga tayanadigan biznes-logika (faqat UI preference uchun ruxsat)
- ❌ CDN'dan `<script>` tag bilan kutubxona tortish — hammasi npm orqali
- ❌ Sahifa bo'ylab tarqoq, maqsadsiz animatsiya. Har bir animatsiya **ma'no tashisin**

## 2. ASSET MANIFEST — foydalanuvchi joylashtiradi

Fayl yo'q bo'lsa — **placeholder yarat, lekin kodni to'xtatma va soxta fayl yaratma**.
Placeholder ishlatilganda konsolga `[ASSET MISSING] <yo'l>` deb yoz.

```
/public/brand/logo-full.svg          # to'liq logo
/public/brand/logo-part-01.svg       # logo bo'laklari (yig'ilish animatsiyasi uchun)
/public/brand/logo-part-02.svg
/public/brand/logo-part-03.svg       # ... nechta bo'lsa shuncha
/public/brand/logo-mark.svg          # faqat belgi (favicon/nav uchun)

/public/media/bg-day.mp4 / .webm     # kunduzgi meduza videosi
/public/media/bg-night.mp4 / .webm   # tungi meduza videosi
/public/media/bg-day-poster.webp     # video yuklanmaguncha ko'rinadigan kadr
/public/media/bg-night-poster.webp

/public/audio/part-01.mp3            # har bir logo bo'lagi uchun ovoz
/public/audio/assemble.mp3           # yakuniy birlashish ovozi
/public/audio/ambient-loop.mp3       # fon (ixtiyoriy, default o'chiq)

/public/models/robot.glb             # 3D robot — Draco/Meshopt siqilgan
/public/models/robot-lod1.glb        # past poligonli mobil versiya

/public/rive/signature.riv           # ixtiyoriy
```

**MUHIM:** `.glb` yo'q bo'lsa — R3F ichida primitive'lardan (capsule + sphere + torus)
vaqtinchalik "proto-robot" yasab tur va konsolga `[ASSET MISSING] /models/robot.glb` yoz.

## 3. DIZAYN TIZIMI (Design Tokens)

Barcha rang **faqat** CSS o'zgaruvchisi orqali ishlatiladi. Kodda hech qachon
to'g'ridan-to'g'ri hex yozilmaydi. Manba: `src/styles/tokens.css`.

- Brand core: `--brand-violet: #36255C`, `--brand-lavender: #D2C3F6` (o'zgarmas)
- Type scale: 1.333 (Perfect Fourth), `clamp()` bilan fluid — `--step--1 … --step-5`
- Tema: `[data-theme="day"]` (sayoz suv / yorug') va `[data-theme="night"]` (chuqur suv)
- Motion: `--ease-out-expo`, `--ease-in-out-q`, `--dur-fast|base|slow`

### 3.1 Shisha karta — `<GlassCard variant="clear" | "frosted">`
- `clear` → 100% shaffof (`background: transparent`)
- `frosted` → `rgb(var(--glass-bg) / var(--glass-alpha-soft))` + `backdrop-filter: blur(24px)`
- Har ikkalasida glow-line (`::before`) + orqa nur (`::after`) majburiy
- Hover'da kursor pozitsiyasiga qarab spotlight (`--mx/--my` + `pointermove`)

### 3.2 Tipografika — "ikki shrift bitta jumlada"
- Oswald → UPPERCASE display, `letter-spacing: -0.02em`, `line-height: 0.86`
- Archivo Expanded → italik urg'u so'zlar, `font-stretch: 125%`
- Inter Tight → body, `line-height: 1.55`, max `68ch`
- JetBrains Mono → raqam/label/counter, UPPERCASE, `letter-spacing: .18em`

> **Shrift eslatmasi:** Tungsten/Druk pullik, ishlatilmaydi. OFL alternativalar:
> Oswald + Archivo + Inter Tight + JetBrains Mono (`next/font/google`).
> O'zbek tili lotin yozuvida — `latin` + `latin-ext` subset yetarli.

## 4. MOTION TIZIMI
- Scroll animatsiyasi — GSAP ScrollTrigger, Lenis bilan `scrollerProxy` orqali
- Faqat `transform` va `opacity` (GPU) — hech qachon `top/left/width`
- `gsap.matchMedia()` bilan breakpoint'ga qarab og'irlik kamayadi
- **`prefers-reduced-motion: reduce`** → parallax/scrub/split o'chadi, faqat 150ms fade
- Har GSAP context `useGSAP()` ichida, unmount'da `revert()`
- Preloader = signature moment (§4.2 master prompt): logo bo'laklarining yig'ilishi + ovoz +
  status ticker + Flip bilan nav'ga o'tish; `sessionStorage` bilan ikkinchi tashrifda qisqaradi.

## 5. SAHIFA ARXITEKTURASI
`/` (scrollytelling) · `/manifesto` · `/tech` · `/team` · `/contact` · `/admin`
Bosh sahifa bo'limlari: S0 Preloader · S1 Hero · S2 Problem · S3 3D Core · S4 HowItWorks
(horizontal pin) · S5 Features (bento) · S6 Metrics · S7 Team · S8 Community · S9 Social · S10 Footer.

## 6. 3D SPETSIFIKATSIYA
- Bitta global `<Canvas>` (`position: fixed`), DOM ustida, video eng pastda
- `dpr={[1,2]}`, `<AdaptiveDpr>` + `<AdaptiveEvents>` + `<PerformanceMonitor>`
- Postprocessing: faqat Bloom + Vignette (mobilda o'chadi)
- Byudjet: desktop ≤ 250k tri, mobil ≤ 80k tri (LOD1), draw call ≤ 80
- WebGPU mavjud bo'lsa WebGPURenderer, aks holda WebGL2

## 7. PERFORMANS BYUDJETI
LCP ≤ 1.8s · INP ≤ 200ms · CLS ≤ 0.05 · asosiy JS ≤ 200KB gzip · 3D chunk `dynamic(ssr:false)`
Video `preload="metadata"`, mobil/saveData'da poster · rasm `next/image` (AVIF/WebP)
Shrift `next/font`, `display: swap` · har bo'lim `content-visibility: auto`.

## 8. ACCESSIBILITY
`prefers-reduced-motion` to'liq hurmat · klaviatura + `:focus-visible` lavender ring
Kontrast ≥ 4.5:1 · video `aria-hidden` · skip-to-content · tema tumbleri `role="switch"`.

## 9. MA'LUMOT QATLAMI
`src/lib/api/` — adapter pattern (hozir mock, keyin http). Interfeys: `Comment`, `SiteStats`,
`SocialLink`, `ContentBlock`. Endpoint'lar backend bosqichida quriladi.

## 10. ADMIN PANEL
`/admin` — hozir mock auth + mock data. Bo'limlar: Dashboard, Kontent (UZ/EN), Media,
Izohlar (moderatsiya), Ijtimoiy linklar (CRUD), Sozlamalar. Admin UI zich, tez, 3D'siz.

## 11. FAYL STRUKTURASI
```
src/
  app/            (site)/ , admin/ , api/ , globals.css
  components/     preloader/ three/ ui/ sections/ media/
  hooks/          useLenis, useGsapContext, useTheme, useReducedMotion, useVisitorCount
  lib/            api/ audio/ motion/
  store/          zustand: theme, preloader, audio, quality
  content/        uz.json, en.json
  styles/         tokens.css, glass.css, typography.css, components.css
public/           ASSET MANIFEST bo'yicha
next.config.ts    output: 'standalone'
```

## 12. ISHLASH TARTIBI
1. Butun loyihani bir javobda yozma — bosqich-bosqich, tasdiqdan keyin
2. Har bosqich oxirida: nima qildim / qaysi fayllar / nimani tekshirish / keyingi qadam
3. Noaniqlikda — savol ber, taxmin qilma
4. Asset yo'q bo'lsa — placeholder + `[ASSET MISSING]`
5. Har commit'dan oldin `npm run build` va `tsc --noEmit` toza o'tsin
6. `any` tipi yo'q. ESLint xatosiz
7. Har komponent ustida qisqa JSDoc
8. "Shu bo'limda X ni o'zgartir" desam — faqat o'shani o'zgartir

## 13. QABUL MEZONLARI (Frontend DoD)
Preloader (ovoz + logo yig'ilishi) · kun/tun crossfade · clear/frosted kartalar ·
3D robot scroll · ikki shrift sarlavhalar · horizontal pin · social glow · izoh+like mock ·
tashrif hisoblagichi · `/admin` qobiq · reduced-motion · Lighthouse (Perf≥85, A11y≥95) ·
360px–2560px sinmaydi · toza build.

---

## HOLAT (progress)

- ✅ **Bosqich 1 — Poydevor:** Next.js 15 + TS strict + Tailwind v4 (App Router, src/),
  barcha paketlar, `tokens.css`, shriftlar (`next/font`), `useTheme` + `ThemeToggle`
  (FOUC'siz), `GlassCard` (clear/frosted + spotlight + glow-line), `/playground`.
  Brand mark placeholder: `public/brand/logo-mark.svg`, `logo-full.svg` (haqiqiy asset kutilmoqda).
- ⏳ Bosqich 2 — Motion poydevori (Lenis + GSAP ScrollTrigger)
- ⏳ Bosqich 3 — Preloader · 4 — Video/Hero · 5 — 3D · 6 — bo'limlar · 7 — Community/Social · 8 — Admin/i18n/polish

> ⚠️ **Brand rang ziddiyati (hal qilinishi kerak):** master prompt brand-core sifatida
> **violet + lavender** ni belgilaydi va tokens.css shunga amal qiladi. Ammo yuborilgan
> logotip **ko'k + teal**. Foydalanuvchi qaysi biri yakuniy ekanini tasdiqlashi kerak.
