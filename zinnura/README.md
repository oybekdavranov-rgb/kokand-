# ZINNURA — tabrik sayti

Zinnura uchun tayyorlangan **to'liq frontend** sayt. Backend, ma'lumotlar bazasi,
build (npm/webpack) — hech biri kerak emas. Faqat HTML + CSS + JavaScript.

---

## 1) Ochish

Eng oson yo'l — `index.html` faylini brauzerda ikki marta bosish. Tamom.

Agar mahalliy server orqali ochmoqchi bo'lsangiz:

```bash
cd zinnura
python3 -m http.server 8080
# so'ng brauzerda: http://localhost:8080
```

Internet bo'lmasa ham hammasi ishlaydi — shriftlar, rasmlar, videolar
va musiqa loyihaning ichida.

---

## 2) Nimalar bor

| Bo'lim | Tavsifi |
|---|---|
| **Kirish darvozasi** | «Konvertni ochish» tugmasi — bosilgach musiqa yoqiladi |
| **Hero** | Ism, fon suratlari sekin almashadi, gulbarglar uchadi |
| **Tabrik** | Asosiy tabrik xati (muhr va imzo bilan) |
| **Xotiralar** | 14 ta surat, bosilganda kattalashadi (lightbox) |
| **Jonli lahzalar** | 3 ta vertikal video + 2 ta dumaloq video-xabar |
| **Tilaklar** | 8 ta alohida tilak kartochkasi |
| **Ism** | «Zinnura» ismining ma'nosi va Z-I-N-N-U-R-A akrostixi |
| **Kichik hikoya** | To'rt qatorlik vaqt chizig'i |
| **Yakun** | «Baxtli bo'l» + yurak yuborish tugmasi |

Qo'shimcha: silliq skroll, skroll indikatori, kursor nuri, klaviatura
boshqaruvi (`←` `→` `Esc`), telefonda svayp, `prefers-reduced-motion` qo'llab-quvvatlanadi.

### Musiqa

Musiqa **fayl emas** — u brauzerning Web Audio API'si orqali jonli
generatsiya qilinadi (yumshoq pad + tasodifiy pentatonik notalar).
Shu sababli hech qanday mp3 yuklab olish shart emas va mualliflik huquqi
muammosi yo'q. O'ng yuqoridagi tugma bilan yoqish/o'chirish mumkin;
video ochilganda musiqa avtomatik pasayadi.

---

## 3) Tarkib

```
zinnura/
├── index.html                 # butun sayt tuzilmasi
├── assets/
│   ├── css/style.css          # dizayn + lokal shriftlar
│   ├── js/app.js              # barcha mantiq va matnlar
│   ├── fonts/                 # Cormorant Garamond, Great Vibes, Manrope (woff2)
│   └── media/
│       ├── photos/            # p01…p14.jpg
│       ├── videos/            # clip-01…03.mp4, note-01…02.mp4
│       └── posters/           # videolarning birinchi kadri
└── README.md
```

---

## 4) Matnlarni o'zgartirish

Deyarli barcha matnlar **`assets/js/app.js`** faylining boshidagi
massivlarda turadi — HTML'ga tegmasdan tahrirlash mumkin:

```js
const PHOTOS   = [...]   // surat sarlavhalari
const CLIPS    = [...]   // video nomlari
const WISHES   = [...]   // 8 ta tilak
const ACROSTIC = [...]   // Z-I-N-N-U-R-A
const STORY    = [...]   // kichik hikoya
```

Tabrik xatining o'zi `index.html` ichida, `<article class="paper">` blokida.

### Rang palitrasini almashtirish

`assets/css/style.css` boshidagi `:root` blokida:

```css
--rose:  #f0b9c4;   /* pushti */
--gold:  #edc98a;   /* oltin */
--violet:#9a6bb8;   /* siyoh binafsha */
--ink:   #07050c;   /* fon */
```

### Yangi surat qo'shish

1. Faylni `assets/media/photos/` ichiga tashlang (masalan `p15.jpg`).
2. `app.js` dagi `PHOTOS` massiviga bitta qator qo'shing:
   `{ f: 'p15.jpg', t: 'Sarlavha', s: 'teg' },`

---

## 5) Internetga joylash

Sayt statik bo'lgani uchun istalgan bepul hostingga tushadi:

- **GitHub Pages** — Settings → Pages → Source: `main` branch, papka `/zinnura`
- **Netlify / Vercel** — papkani sudrab tashlang, build buyrug'i kerak emas
- **Oddiy hosting** — `zinnura/` papkasini FTP orqali yuklang

> Sahifada `<meta name="robots" content="noindex, nofollow">` turibdi — bu
> shaxsiy sahifa Google'da chiqmasligi uchun. Ochiq bo'lishini xohlasangiz,
> `index.html` dagi o'sha qatorni o'chiring.

---

## 6) Hajmi

Umumiy ~19 MB, shundan ~18 MB — videolar. Sekin internetda tezroq ochilishi
uchun videolarni siqish mumkin:

```bash
ffmpeg -i kirish.mp4 -vcodec libx264 -crf 30 -preset slow -acodec aac -b:a 96k chiqish.mp4
```

Videolar faqat bosilganda yuklanadi (`preload="metadata"`), shuning uchun
saytning birinchi ochilishi baribir tez bo'ladi.
