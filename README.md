# Imora AI — Frontend

**Imora AI** — sun'iy intellekt yordamida **ishora tilini o'rganish va muloqot** platformasi.
Bu repozitoriya loyihaning **frontend (dizayn)** qismini o'z ichiga oladi.

> Startap loyiha · *President Tech Award*

## ✨ Imkoniyatlar

- 🎬 **Logo yig'ilish animatsiyasi** — 12 qism ketma-ket, ovozli effekt bilan yig'iladi
- 🪼 **Three.js / WebGL jellyfish foni** — real 3D, sichqonchaga javob beradi (mp4 emas)
- 🤖 **AI robot mascot** — sichqonchaга qarab yuradi, ko'z pirpiratadi
- 🌗 **Kun / Tun rejimi** — Violet `#36255C` / Lavender `#D2C3F6`
- 🔤 **Anton + Oswald** shriftlari (Tungsten/Druk muqobili), kinetik matn animatsiyasi
- 🍎 **Glassmorphism** — Apple uslubidagi shaffof kartalar
- 🔊 **Web Audio ovoz dvigateli** — har bir matn, bosilish va paydo bo'lishда sintez qilingan ovoz (faylsiz)
- 📜 **Scrollytelling** — GSAP ScrollTrigger bilan bo'limlar ochilishi
- 💬 Izoh, ❤️ like, 👁 tashrif hisoblagichi, 🌐 nurli ijtimoiy ikonkalar

## 📁 Tuzilma

```
index.html          # sayt strukturasi
styles.css          # dizayn tizimi (ikkala rejim, glassmorphism, responsive)
app.js              # ovoz + Three.js + GSAP + logika
lib/                # three.min.js, gsap.min.js, ScrollTrigger.min.js (npm'dan)
build-inline.mjs    # hammani bitta faylga joylashtiradi
serve.mjs           # lokal statik server
dist/
  index.html        # to'liq standalone (hosting uchun)
  artifact.html     # claude.ai Artifact varianti
```

## 🚀 Ishga tushirish

```bash
npm install          # three + gsap (npm registry orqali)
npm run serve        # http://localhost:4173
```

Bitta faylga yig'ish:
```bash
npm run build        # -> dist/index.html (standalone) va dist/artifact.html
```

## 🎨 Ranglar

| Rejim | Nomi | HEX |
|-------|------|-----|
| Kun | Violet | `#36255C` |
| Tun | Lavender | `#D2C3F6` |
| Aksent (logo) | Blue / Teal | `#3E86FF` / `#25E7D8` |

## 🛣 Keyingi bosqichlar

1. Frontend dizaynni tasdiqlash va sozlash *(hozirgi bosqich)*
2. Backend: admin panel, izoh/like/tashrif serverга, AI Chat (Gemini), 3D avatar, video muloqot
3. To'liq test
4. Hosting (Railway / VPS) uchun tayyorlash + ZIP

---
© 2026 Imora AI — *Sun'iy intellekt yordamida hech kim muloqotdan chetda qolmasin.*
