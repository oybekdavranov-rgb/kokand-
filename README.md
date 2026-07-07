# Qo'qon Universiteti — Tashkiliy tuzilma (Backend)

Node.js + Express backend. Ma'lumotlar **serverda** saqlanadi (`data.json`), shuning uchun
barcha tashrifchilar bir xil kontentni ko'radi va admin istalgan qurilmadan tahrirlashi mumkin.

## Tarkib
```
server.js            # Express server + API
package.json         # bog'liqlik: express
default-data.json    # birinchi ishga tushishdagi standart tuzilma (seed)
.env.example         # sozlamalar namunasi
public/
  index.html         # sayt (frontend)
  assets/
    bg.mp4           # fon videosi
    logo.png         # oq KU logotipi
    mark.png         # favicon
data.json            # (avtomatik yaratiladi) — real ma'lumotlar shu yerda
```

## 1) Lokal ishga tushirish
```bash
npm install
npm start
```
Brauzerda oching: **http://localhost:3000**

Standart admin paroli: `kokand2026`
Adminga kirish (saytda ochiq tugma yo'q — yashirin):
- Logotipni **5 marta** ketma-ket bosing, yoki
- URL oxiriga `#admin` qo'shing (`http://localhost:3000/#admin`), yoki
- **Ctrl + Shift + A** (Mac'da ⌘ + Shift + A)

## 2) Parol va maxfiy kalitni o'zgartirish
`.env.example` faylidan nusxa oling:
```bash
cp .env.example .env
```
So'ng `.env` ichida `ADMIN_PASSWORD` va `JWT_SECRET` ni o'zgartiring.
(Hosting panellarida ham shu "Environment Variables" bo'limiga yoziladi.)

| O'zgaruvchi     | Vazifasi                                  |
|-----------------|-------------------------------------------|
| `ADMIN_PASSWORD`| Admin paroli                              |
| `JWT_SECRET`    | Token imzo kaliti (uzun tasodifiy satr)   |
| `PORT`          | Port (ko'p hostinglar avtomatik beradi)   |
| `DATA_FILE`     | Ma'lumot fayli joyi (ixtiyoriy)           |

## 3) Ishlash tartibi (API)
| Metod  | Yo'l           | Kim         | Vazifasi                          |
|--------|----------------|-------------|-----------------------------------|
| GET    | `/api/data`    | hamma       | Butun tuzilmani o'qish            |
| POST   | `/api/login`   | hamma       | Parol -> token (30 kun)           |
| PUT    | `/api/data`    | admin token | Butun tuzilmani saqlash           |
| POST   | `/api/reset`   | admin token | Standart tuzilmaga qaytarish      |
| GET    | `/api/verify`  | admin token | Tokenni tekshirish                |

Rasmlar hozircha tuzilma ichida (base64) saqlanadi — alohida sozlash shart emas.

## 4) Deploy variantlari

### Replit (eng oson)
1. Loyihani yuklang (yoki GitHub'dan import qiling).
2. "Secrets" bo'limiga `ADMIN_PASSWORD` va `JWT_SECRET` ni qo'shing.
3. Run tugmasini bosing. Replit avtomatik URL beradi.

### Render / Railway
1. GitHub repoga yuklang.
2. Yangi **Web Service** yarating.
   - Build: `npm install`
   - Start: `npm start`
3. Environment'ga `ADMIN_PASSWORD`, `JWT_SECRET` qo'shing.
4. **Muhim:** `data.json` saqlanib qolishi uchun **doimiy disk (Persistent Disk)** ulang
   va `DATA_FILE=/data/ku.json` deб ko'rsating (aks holda qayta deploy'da ma'lumot o'chadi).

### O'z serveringiz (VPS)
```bash
npm install
npm install -g pm2
ADMIN_PASSWORD=... JWT_SECRET=... pm2 start server.js --name ku-tuzilma
pm2 save
```
Old tomonda Nginx bilan domen/HTTPS ulash tavsiya etiladi.

## 5) Zaxira nusxa
Admin panel → **Sozlama → Eksport** orqali butun tuzilmani JSON qilib saqlaysiz.
Kerak bo'lsa **Import** orqali qaytarasiz. Server tomonda esa `data.json` faylini ko'chirib qo'yish yetarli.

---
Muhim eslatma: sayt to'liq JavaScript-app bo'lgan kokanduni.uz'dan a'zolar rasmini avtomatik
olishning imkoni yo'q. A'zolar rasm/ma'lumotini admin paneldan qo'shasiz — endi ular serverda saqlanadi.
