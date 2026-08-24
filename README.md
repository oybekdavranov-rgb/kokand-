# Qo'qon Universiteti — Tashkiliy tuzilma

Node.js + Express backend **va** frontend (SPA). Ma'lumotlar **serverda** saqlanadi
(standart: `data.json`, yoki `DATABASE_URL` berilsa **PostgreSQL**), shuning uchun barcha
tashrifchilar bir xil kontentni ko'radi va admin istalgan qurilmadan tahrirlashi mumkin.

> **v2.0** — dizayn yangilandi, **jonli (real-time) ko'rish hisoblagichlari** va to'liq
> **statistika paneli** qo'shildi, hamda ishlab chiqarish (production) uchun xavfsizlik
> mustahkamlandi. Barcha eski API'lar avvalgidek ishlaydi (o'zgarishlar qo'shimcha).

---

## Tarkib
```
server.js            # Express server + API (hardened)
db.js                # PostgreSQL qatlami (faqat DATABASE_URL berilganda)
migrate.js           # data.json -> PostgreSQL ko'chirish
lib/
  env.js             # .env yuklovchi (0 dependency)
  auth.js            # token + parol hashlash (scrypt)
  security.js        # xavfsizlik sarlavhalari + rate limit (0 dependency)
  validate.js        # kiruvchi ma'lumot validatsiyasi/sanitatsiyasi
  store.js           # ombor (fayl/PostgreSQL) + analitika
tools/
  hash-password.js   # ADMIN_PASSWORD_HASH yaratish
public/
  index.html         # sayt (frontend) — glass dizayn, jonli hisoblagichlar
  app.js             # frontend logikasi
  assets/            # logo/bg/fonts (ixtiyoriy — README ichida)
default-data.json    # standart tuzilma (seed)
.env.example         # sozlamalar namunasi
Dockerfile           # konteyner
railway.json         # Railway sozlamasi
data.json            # (avtomatik) fayl rejimida real ma'lumot
analytics.json       # (avtomatik) fayl rejimida analitika (data.json'ga tegilmaydi)
```

---

## 1) Lokal ishga tushirish
```bash
npm install
npm start
```
Brauzerda: **http://localhost:3000**

Standart **DEV** admin paroli: `kokand2026` (faqat lokal; productionda majburiy o'zgartiriladi).

**Adminga kirish (saytda ochiq tugma yo'q — yashirin):**
- Logotipni **5 marta** ketma-ket bosing, yoki
- URL oxiriga `#admin` qo'shing (`http://localhost:3000/#admin`), yoki
- **Ctrl + Shift + A** (Mac'da ⌘ + Shift + A)

---

## 2) Dizayn (yangi)
- **Kartalar 90% shaffof** (glassmorphism, `backdrop-filter` blur bilan).
- **Yumaloq burchaklar** (`border-radius`).
- **Shriftlar:**
  | Shrift | Rol | Manba |
  |---|---|---|
  | **Syne** | Sarlavhalar / karta nomlari | Google Fonts (avtomatik) |
  | **Comfortaa** | Asosiy matn / UI | Google Fonts (avtomatik) |
  | **TAN - MERMAID** | Katta bezakli sarlavhalar | premium — `public/assets/fonts/` |
  | **Northwell** | Skript urg'u (masalan lavozimlar) | premium — `public/assets/fonts/` |
  | **Brittany Signature** | Imzo urg'usi | premium — `public/assets/fonts/` |

  Syne va Comfortaa avtomatik yuklanadi. Qolgan 3 tasi **premium** (litsenziya) shriftlar —
  fayllarini `public/assets/fonts/` ichiga tashlang (nom qoidalari `assets/fonts/README.txt`da).
  Fayl bo'lmasa sayt chiroyli **fallback** shriftlar bilan ishlayveradi.

---

## 3) Jonli ko'rishlar va statistika (yangi)
Saytning o'zida **har bir karta / bo'lim** ustida jonli **ko'rishlar soni** ko'rsatiladi
(👁 belgisi). Sonlar **real vaqtda** yangilanadi — Server-Sent Events (SSE) orqali;
boshqa foydalanuvchi ko'rsa, son o'sha zahoti oshadi.

**Admin → 📊 Statistika** panelida:
- Sayt ishga tushgandan beri **jami tashrifchilar** soni va **necha kun** oldin boshlangani.
- **Soatlar bo'yicha** tashriflar diagrammasi (0–23) va so'nggi faoliyat **vaqti bilan**.
- Foydalanuvchilar **eng ko'p nimani ko'rgan / bosgan / qidirgan** — top ro'yxatlar.

Analitika alohida saqlanadi (`analytics.json` yoki PostgreSQL jadvallari) — asosiy
tuzilma (`data.json`) **o'zgartirilmaydi**. IP manzillar xom holda saqlanmaydi (maxfiylik
uchun HMAC bilan hashlanadi).

---

## 4) Parol va maxfiy kalitni sozlash (MUHIM)
```bash
cp .env.example .env
npm run gen-secret               # JWT_SECRET uchun tasodifiy kalit
npm run hash-password -- "kuchli-parolingiz"   # ADMIN_PASSWORD_HASH
```
So'ng `.env` (yoki hosting "Environment Variables") ga yozing:

| O'zgaruvchi | Vazifasi |
|---|---|
| `ADMIN_PASSWORD_HASH` | Admin paroli **hash**i (tavsiya etiladi) |
| `ADMIN_PASSWORD` | Yoki oddiy parol (faqat sinov uchun) |
| `JWT_SECRET` | Token imzo kaliti (uzun tasodifiy satr) — **majburiy** |
| `NODE_ENV` | `production` (deploy'da) |
| `PORT` | Port (ko'p hostinglar avtomatik beradi) |
| `DATABASE_URL` | PostgreSQL (berilsa avtomatik ishlatiladi) |
| `DATA_FILE` / `ANALYTICS_FILE` | Fayl rejimida ombor joyi |
| `TOKEN_TTL_HOURS` | Token muddati (standart 720 = 30 kun) |

> **Production'da** `JWT_SECRET` va admin paroli berilmasa server **ishga tushmaydi**
> (xavfsiz default'lar olib tashlangan). Bu ataylab — audit tavsiyasi.

---

## 5) API
| Metod | Yo'l | Kim | Vazifasi |
|---|---|---|---|
| GET | `/api/data` | hamma | Butun tuzilmani o'qish |
| POST | `/api/login` | hamma | Parol → token (rate-limited) |
| GET | `/api/verify` | admin | Tokenni tekshirish |
| PUT | `/api/data` | admin | Tuzilmani saqlash (validatsiya + versiya bloklash) |
| POST | `/api/reset` | admin | Standart tuzilmaga qaytarish |
| POST | `/api/track` | hamma | Tashrif/ko'rish/bosish/qidiruvni yozish |
| GET | `/api/stats/public` | hamma | Jonli ko'rishlar soni |
| GET | `/api/stats/stream` | hamma | Real-time SSE oqimi |
| GET | `/api/stats/admin` | admin | To'liq statistika |
| GET | `/health` | hamma | Health check |

Rasmlar tuzilma ichida (base64) saqlanadi. SVG rasm xavfsizlik uchun qabul qilinmaydi.

---

## 6) Deploy

### Railway (PostgreSQL bilan — tavsiya etiladi)
1. GitHub repoga yuklang → Railway'da **New Project → Deploy from GitHub**.
2. **+ New → Database → PostgreSQL** qo'shing. Railway `DATABASE_URL` ni avtomatik beradi.
3. Web service **Variables**: `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `NODE_ENV=production`.
4. `pg` paketi kerak: `npm install pg` (repo'da `optionalDependencies`da bor).
5. Eski `data.json` bo'lsa ko'chiring: `DATABASE_URL=... node migrate.js`.
6. Deploy. Health check: `/health`.

PostgreSQL rejimida **doimiy disk shart emas** — ma'lumot bazada saqlanadi, versiyalar
tarixi (`revisions`) va bir vaqtda tahrirlashdan himoya (optimistic locking) ham bor.

### Render / VPS (fayl rejimi)
```bash
npm install
npm install -g pm2
NODE_ENV=production JWT_SECRET=... ADMIN_PASSWORD_HASH=... pm2 start server.js --name ku
pm2 save
```
**Muhim:** fayl rejimida `data.json` saqlanib qolishi uchun **doimiy disk** ulang va
`DATA_FILE=/data/ku.json`, `ANALYTICS_FILE=/data/ku-analytics.json` deb ko'rsating
(aks holda qayta deploy'da ma'lumot o'chadi). Old tomonda Nginx + HTTPS tavsiya etiladi.

### Docker
```bash
docker build -t ku-tuzilma .
docker run -p 3000:3000 -e JWT_SECRET=... -e ADMIN_PASSWORD_HASH=... -e NODE_ENV=production ku-tuzilma
```

### Replit
"Secrets" bo'limiga `JWT_SECRET` va `ADMIN_PASSWORD_HASH` qo'shing → Run. Doimiy saqlash
uchun Railway PostgreSQL yoki Replit DB tavsiya etiladi.

---

## 7) Zaxira nusxa
Admin panel → **⇩ Eksport** orqali butun tuzilmani JSON qilib saqlaysiz, **⇧ Import** orqali
qaytarasiz. PostgreSQL'da qo'shimcha `pg_dump` bilan muntazam zaxira oling.

---

## 8) Xavfsizlik (qisqacha)
Ushbu versiyada qo'shilgan himoyalar: xavfsiz default'lar olib tashlandi (production'da
fail-fast), parol **scrypt** bilan hashlanadi, **rate limiting** (login + API), **CSP va
xavfsizlik sarlavhalari**, kiruvchi ma'lumot **validatsiyasi/sanitatsiyasi**, JSON body
limitlari, rol tekshiruvi (RBAC), markazlashgan xatolik ishlovi, `/health`, va analitikada
IP hashlash. To'liq audit va yo'l xaritasi alohida hisobotda berilgan.
