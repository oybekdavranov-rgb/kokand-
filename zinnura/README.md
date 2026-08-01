# ZINNURA — زِنُّورَة

Zinnura uchun tayyorlangan **to'liq frontend** sayt. Backend, ma'lumotlar bazasi,
build (npm/webpack) — hech biri kerak emas. Faqat HTML + CSS + JavaScript.

---

## 1) Ochish

Eng oson yo'l — `index.html` faylini brauzerda ikki marta bosish. Tamom.

Mahalliy server orqali ochmoqchi bo'lsangiz:

```bash
cd zinnura
python3 -m http.server 8080
# brauzerda: http://localhost:8080
```

Internet bo'lmasa ham hammasi ishlaydi — shriftlar, rasmlar, videolar
va musiqa loyihaning ichida.

---

## 2) Sayt qanday ochiladi

1. Ekranda **muhrlangan konvert** turadi (binafsha konvert + oltin muhr, «Z» monogrammasi).
2. Foydalanuvchi **muhrni bosadi** → muhr ikkiga yoriladi, konvert qopqog'i ochiladi,
   ichidan xat ko'tariladi.
3. Butun ekranni **kuchli oltin nur** qoplaydi (nur nurlari bilan) — o'sha nur ichida sayt ochiladi.
4. Ayni damda **skripka va pianino** kuyi boshlanadi va hero'dagi video ishga tushadi.

Muhrni bosish o'rniga `Enter` yoki `Space` tugmasini ham bosish mumkin.

---

## 3) Bo'limlar

| Bo'lim | Tavsifi |
|---|---|
| **Hero** | Arabcha `زِنُّورَة`, katta `ZINNURA`, orqada video avtomatik ishlaydi |
| **Ism** | Ismning arabcha yozuvi va ma'nosi: `اَلنُّور`, `ذَاتُ النُّور`, `دُمْتِ نُورًا` |
| **Tilaklar** | 8 ta ezgu tilak kartochkasi |
| **Kadrlar** | 14 ta kadr — biri o'ngda, biri chapda ketma-ket. Har kadr yonida maqsadlar to'xtamasligi haqida qo'llab-quvvatlovchi matn va tilak |
| **Lahzalar** | 3 ta vertikal video + 2 ta dumaloq video-xabar — hammasi jonli ishlaydi |
| **Yakun** | `دُمْتِ نُورًا`, «Baxtli bo'l, Zinnura», yulduz yuborish tugmasi |

Qo'shimcha: skroll indikatori, kursor nuri, uchuvchi zarralar, aurora fon,
marquee, klaviatura boshqaruvi (`←` `→` `Esc`), telefonda svayp,
`prefers-reduced-motion` qo'llab-quvvatlanadi.

### Nur — matnlar ortidan taralayotgan yorug'lik

Ism, sarlavhalar va arabcha yozuvlar ortida yumshoq nur turadi va sekin
"nafas oladi". CSS'da `.nur` klassi bilan beriladi, o'lchamlari sozlanadi:

```html
<h2 class="sec-title nur">…</h2>              <!-- oddiy -->
<h1 class="hero__title nur nur--xl nur--rays">…</h1>  <!-- kuchli + aylanuvchi nurlar -->
<h3 class="frame__t nur nur--sm nur--left">…</h3>     <!-- chapga tekislangan matn uchun -->
```

| Klass | Vazifasi |
|---|---|
| `nur` | asosiy yumshoq nur |
| `nur--xl` / `nur--lg` / `nur--sm` / `nur--xs` | kuchi va o'lchami |
| `nur--rays` | qo'shimcha aylanuvchi nur nurlari |
| `nur--left` | nur markazi matn boshiga suriladi |

> Nur qatlamlari atayin element chegarasidan chiqadi, shuning uchun
> `html`/`body` da `overflow-x: clip` turibdi — aks holda gorizontal skroll paydo bo'ladi.

### Musiqa — skripka + pianino

Musiqa **fayl emas**. U brauzerning Web Audio API'si orqali jonli generatsiya qilinadi:

- **Pianino** — additiv sintez (5 ta oberton + tez tushuvchi konvert), bas va arpedjio.
- **Skripka** — arra to'lqin + past chastota filtri + sekin kirib keladigan vibrato,
  kamon kabi yumshoq boshlanish.
- **Xona akustikasi** — protsessual reverb (impulse response kod ichida yaratiladi).
- **Progressiya** — Re-major: `D — A — Bm — G`, har takt 4 sekund, aylanma takrorlanadi.

Hech qanday mp3 yuklab olish shart emas, mualliflik huquqi muammosi ham yo'q.
O'ng yuqoridagi tugma bilan yoqish/o'chirish mumkin; video ochilganda musiqa
avtomatik pasayadi.

### Videolar pauzada turmaydi

Barcha `.mp4` fayllar `autoplay muted loop playsinline` bilan ishga tushadi va
hech qachon to'xtamaydi: `pause` hodisasi ushlanadi va video darhol qayta yoqiladi,
har 4 sekundda esa qo'shimcha tekshiruv bo'ladi. Ovoz bilan ko'rish uchun
videoni bosing — modal ochiladi va musiqa o'zi pasayadi.

> Brauzer qoidasi: avtomatik ishga tushish faqat **ovozsiz** videoda ruxsat etiladi.
> Shuning uchun kartochkadagi videolar ovozsiz, ovoz esa bosilganda qo'shiladi.

---

## 4) Ranglar va shriftlar

**Uchta rang:** tillo, binafsha va uchinchisi — **zumrad**.

```css
--gold:   #f2cf7a;   /* tillo    */
--violet: #a865e0;   /* binafsha */
--jade:   #35e0b0;   /* zumrad   */
--ink:    #08040f;   /* fon      */
```

**Noodatiy shriftlar** (hammasi loyiha ichida, woff2):

| Vazifasi | Shrift |
|---|---|
| Katta ism, logotip | **Bodoni Moda** (yuqori kontrastli didone) |
| Sarlavhalar | **Gloock** |
| Qo'lyozma urg'ular | **Italianno** |
| Yorliq va menyu | **Syne** |
| Asosiy matn | **Sora** |
| Arabcha yozuv | **Aref Ruqaa** + **Amiri** |

---

## 5) Tarkib

```
zinnura/
├── index.html                 # butun sayt tuzilmasi
├── assets/
│   ├── css/style.css          # shriftlar + dizayn
│   ├── js/app.js              # matnlar, muhr sekvensiyasi, musiqa, animatsiyalar
│   ├── fonts/                 # 7 ta shrift oilasi (woff2)
│   └── media/
│       ├── photos/            # p01…p14.jpg
│       ├── videos/            # clip-01…03.mp4, note-01…02.mp4
│       └── posters/           # videolarning birinchi kadri
└── README.md
```

---

## 6) Matnlarni o'zgartirish

Deyarli barcha matnlar **`assets/js/app.js`** boshidagi massivlarda:

```js
const FRAMES = [...]   // 14 kadr: sarlavha, qo'llab-quvvatlash matni, tilak
const WISHES = [...]   // 8 ta tilak
const CLIPS  = [...]   // video nomlari
const NOTES  = [...]   // dumaloq video-xabarlar
```

Arabcha yozuvlar va ismning ma'nosi `index.html` ichida, `<section id="ism">` blokida.

### Yangi kadr qo'shish

1. Rasmni `assets/media/photos/` ichiga tashlang (masalan `p15.jpg`).
2. `FRAMES` massiviga qator qo'shing:

```js
{ f:'p15.jpg', k:'mavzu', t:'Sarlavha <span>urg‘u</span> bilan',
  d:'Qo‘llab-quvvatlovchi matn.', w:'Tilak' }
```

O'ng/chap ketma-ketligi avtomatik hisoblanadi (juft — chapda, toq — o'ngda).

### Musiqani sozlash

`app.js` dagi `Music` moduli ichida:

```js
const BEAT = 1.0;    // zarb uzunligi (sekund) — kattaroq qilsangiz sekinlashadi
const VOL  = 0.5;    // umumiy ovoz balandligi
const BARS = [...];  // akkord progressiyasi va skripka melodiyasi
```

---

## 7) Internetga joylash

Sayt statik — istalgan bepul hostingga tushadi:

- **GitHub Pages** — Settings → Pages → Source: `main` branch, papka `/zinnura`
- **Netlify / Vercel** — papkani sudrab tashlang, build buyrug'i kerak emas
- **Oddiy hosting** — `zinnura/` papkasini FTP orqali yuklang

> `index.html` da `<meta name="robots" content="noindex, nofollow">` turibdi —
> bu shaxsiy sahifa Google'da chiqmasligi uchun. Ochiq bo'lishini xohlasangiz,
> o'sha qatorni o'chiring.

---

## 8) Hajmi

Umumiy ~20 MB, shundan ~18 MB — videolar. Sekin internet uchun siqish mumkin:

```bash
ffmpeg -i kirish.mp4 -vcodec libx264 -crf 30 -preset slow -acodec aac -b:a 96k chiqish.mp4
```
