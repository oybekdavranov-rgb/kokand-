# Murojaat boti — Ta'lim fakulteti dekanati

Qo'qon universiteti **Ta'lim fakulteti** dekani **Xursanaliyev Boburmirzo Farhod o'g'li**
qabulxonasi uchun Telegram bot va yopiq admin panel.

> **Asosiy g'oya:** murojaatlar **kategoriyalarga bo'linmaydi.** Talaba, ota-ona yoki xodim
> botga shunchaki o'z gapini yozadi — tizim uni raqamlab, dekanat paneliga tushiradi.

```
  Foydalanuvchi                 Bot (Telegram)              Dekanat
  ─────────────                 ──────────────              ───────
  xabar yozadi      ──────▶   matn + fayllar qabul    ──▶   🔔 Telegram xabarnomasi
                              MR-2026-0007 raqami            🖥 admin panel: ro'yxat,
  javobni oladi     ◀──────   javob yuboriladi        ◀──   qidiruv, javob, holat
```

Barcha ma'lumot **o'z serveringizda** (SQLite) saqlanadi — tashqi xizmatlarga chiqmaydi.

---

## 1. Tez boshlash (5 daqiqa)

```bash
cd murojaat-bot
npm install
npm run setup        # kalitlarni yaratadi, parolni hash qiladi, .env yozadi
npm start
```

`npm run setup` quyidagilarni so'raydi:

| So'rov | Izoh |
|---|---|
| `BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` → bergan token |
| Admin login | panelga kirish uchun (masalan `dekanat`) |
| Admin parol | kamida 12 belgi; ochiq saqlanmaydi — darhol hash qilinadi |
| Chat ID | yangi murojaat xabarnomasi keladigan Telegram chat (ixtiyoriy) |
| Panel manzili | masalan `https://murojaat.kokanduni.uz` (bo'lmasa — polling rejimi) |

So'ng panel: **http://localhost:8080**

### Chat ID'ni qanday bilish mumkin?
[@userinfobot](https://t.me/userinfobot) ga `/start` yozing — u sizning `id` raqamingizni beradi.
Guruh uchun: botni guruhga qo'shing, guruhga biror xabar yozing va server logidan chat ID ni ko'ring
(guruh ID'si manfiy bo'ladi, masalan `-1001234567890`).

---

## 2. Bot nimalarni qiladi

| Foydalanuvchi | Natija |
|---|---|
| Istalgan matn yozsa (12+ belgi) | murojaat saqlanadi, `MR-2026-0007` raqami beriladi |
| Rasm/hujjat/ovozli xabar yuborsa | murojaatga ilova qilib biriktiriladi |
| `/murojaatlarim` | o'z murojaatlari va ularning holati |
| `/holat MR-2026-0007` | aniq bir murojaat holati va javobi (faqat o'ziniki) |
| `/yordam` | qoidalar, cheklovlar, maxfiylik haqida |
| «📞 Raqamni ulashish» | telefon raqami profilga qo'shiladi (ixtiyoriy) |

**Spamga qarshi:** soatiga 4 ta, kuniga 12 ta murojaat; xabarlar orasida 20 soniya;
10 soniyada 8 tadan ko'p xabar yuborgan foydalanuvchi vaqtincha e'tiborsiz qoldiriladi.
Suiiste'mol qilgan foydalanuvchini paneldan bloklash mumkin. Chegaralar `.env` orqali o'zgaradi.

---

## 3. Dekanat uchun: admin panel

`https://<manzilingiz>` → login va parol bilan kirish.

* **Murojaatlar** — qidiruv (matn, raqam, ism, telefon), holat bo'yicha filtr, sahifalash.
* **Tafsilot** — murojaat matni, muallif ma'lumoti, ilovalar, javoblar tarixi.
* **Javob berish** — matnni yozib «Javobni yuborish» (yoki `Ctrl+Enter`). Javob bot orqali
  murojaat egasiga boradi, holat avtomatik «Javob berilgan»ga o'tadi.
* **Holatlar** — Yangi → Ko'rilmoqda → Javob berilgan → Yopilgan.
* **CSV** — hisobot yoki zaxira uchun (Excel'da ochiladi).
* **Foydalanuvchilar** — bloklash/blokdan chiqarish.
* **Adminlar** (faqat `owner`) — xodimlar uchun alohida login yaratish.
* **Jurnal** (faqat `owner`) — kim, qachon, nima qilgani.

### Telegram'ning o'zidan javob berish
`NOTIFY_CHAT_IDS` da ko'rsatilgan chatga har bir yangi murojaat xabarnoma bo'lib tushadi.
Dekan shu xabarga oddiygina **«reply»** qilib javob yozsa, javob to'g'ridan-to'g'ri
murojaat egasiga yetadi. Xabarnoma tagidagi tugmalar bilan holatni ham o'zgartirish mumkin.

### Huquqlar
| Rol | Nima qila oladi |
|---|---|
| `owner` | hammasi: o'chirish, adminlar, audit jurnali |
| `operator` | murojaatlarni ko'rish, javob berish, holat, bloklash |

---

## 4. Ishlab chiqarishga joylash

### A. VPS + nginx + systemd (tavsiya etiladi)

```bash
# 1) Kod va bog'liqliklar
sudo useradd -r -m -d /opt/murojaat-bot murojaat
sudo -u murojaat git clone <repo> /opt/murojaat-bot
cd /opt/murojaat-bot/murojaat-bot && sudo -u murojaat npm ci --omit=dev

# 2) Sozlash
sudo -u murojaat npm run setup
sudo chmod 600 .env

# 3) Xizmat
sudo cp deploy/murojaat-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now murojaat-bot
sudo journalctl -u murojaat-bot -f

# 4) HTTPS va nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/murojaat
sudo ln -s /etc/nginx/sites-available/murojaat /etc/nginx/sites-enabled/
sudo certbot --nginx -d murojaat.example.uz
sudo nginx -t && sudo systemctl reload nginx

# 5) Webhook (BOT_MODE=webhook bo'lsa)
sudo -u murojaat npm run webhook set
```

### B. Docker

```bash
cp .env.example .env     # to'ldiring (npm run setup ham ishlaydi)
docker compose up -d --build
docker compose logs -f
```

### C. Polling yoki webhook?

| | polling | webhook |
|---|---|---|
| Domen/HTTPS kerakmi | ❌ yo'q | ✅ ha |
| Tezlik / resurs | yaxshi | eng yaxshi |
| Qachon | sinov, ichki tarmoq | doimiy ishlash |

Polling'da ham admin panel ishlaydi — faqat uni tashqaridan ochish uchun HTTPS kerak bo'ladi.

> **Muhim:** `DATA_DIR` doimiy diskda bo'lsin. Render/Railway kabi platformalarda
> «Persistent Disk» ulab, `DATA_DIR=/data` deб ko'rsating, aks holda har deploy'da
> murojaatlar o'chib ketadi.

---

## 5. Sozlamalar (.env)

Barcha kalitlar va izohlar — `.env.example` faylida. Eng muhimlari:

| O'zgaruvchi | Vazifasi |
|---|---|
| `BOT_TOKEN` | Telegram bot tokeni (maxfiy!) |
| `BOT_MODE` | `polling` yoki `webhook` |
| `PUBLIC_URL` | panelning tashqi manzili (webhook uchun majburiy) |
| `WEBHOOK_SECRET` | Telegram so'rovlarini tasdiqlovchi maxfiy kalit (24+ belgi) |
| `SESSION_SECRET` | sessiya imzosi uchun kalit (32+ belgi) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | panelga kirish (`npm run hash`) |
| `NOTIFY_CHAT_IDS` | xabarnoma keladigan chatlar |
| `DATA_DIR` | baza va zaxiralar papkasi |
| `APPEALS_PER_HOUR` / `APPEALS_PER_DAY` | spam chegaralari |
| `REQUIRE_HTTPS` | HTTPS majburiyligi (production: `true`) |

`NODE_ENV=production` bo'lsa, zaif yoki standart kalitlar bilan server **ishga tushmaydi**.

---

## 6. Xavfsizlik

Tizimda amalga oshirilgan himoya choralari:

**Admin panel**
- Parol `scrypt` bilan hash qilinadi (N=32768) — ochiq matnda hech qayerda saqlanmaydi.
- Sessiyalar bazada: istalgan vaqtda bekor qilish mumkin; cookie `HttpOnly`, `Secure`,
  `SameSite=Strict`, HTTPS'da `__Host-` prefiksi bilan.
- Sessiya brauzerga bog'lanadi (User-Agent o'zgarsa — bekor), harakatsizlik va umumiy muddat chegarasi.
- **CSRF**: har bir o'zgartiruvchi so'rovda token + `Origin` tekshiruvi.
- **Brute-force**: IP va login bo'yicha urinishlarni sanash va qulflash; "foydalanuvchi topilmadi"
  bilan "parol xato" bir xil javob va bir xil vaqt (user enumeration yo'q).
- Ikki qadamli kirish (TOTP) qo'llab-quvvatlanadi (`admins.totp_secret`).
- Qat'iy HTTP sarlavhalar: `CSP (default-src 'none')`, `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, HSTS, `noindex`.
- Panel kodi foydalanuvchi matnini faqat `textContent` orqali chiqaradi — **XSS imkonsiz**.
- Rollar: `owner` / `operator`; har bir amal audit jurnalida.

**Bot va ma'lumotlar**
- Webhook ikki qavat himoyalangan: **maxfiy yo'l** (tokendan hosil qilinadi) va Telegram'ning
  `X-Telegram-Bot-Api-Secret-Token` sarlavhasi (vaqt-xavfsiz solishtiriladi).
- Barcha SQL so'rovlar — prepared statement (**SQL injection imkonsiz**).
- Fayllar serverda saqlanmaydi: faqat Telegram `file_id`. Yuklab olishda bot tokeni
  brauzerga chiqmaydi, fayl `application/octet-stream` + `attachment` bilan beriladi.
- CSV eksportda formula injection (`=`, `+`, `-`, `@`) neytrallanadi.
- Baza fayllari `600` huquqi bilan; loglarda token/kalitlar avtomatik yashiriladi;
  IP va User-Agent ochiq emas, kalitlangan hash ko'rinishida saqlanadi.
- Murojaat matni boshqaruv belgilaridan tozalanadi va uzunligi cheklanadi.

**Sizning zimmangizdagi ishlar**
1. `.env` faylini `chmod 600` qiling va hech kimga bermang (ayniqsa `BOT_TOKEN`).
2. Panelni faqat HTTPS orqali oching (`REQUIRE_HTTPS=true`), sertifikatni yangilab turing.
3. Har bir xodimga **alohida login** yarating — umumiy parol ishlatmang.
4. Xodim ishdan ketsa — uning loginini «O'chirish» tugmasi bilan bloklang.
5. `npm run backup` ni kunlik `cron`ga qo'ying va nusxani boshqa joyda saqlang.
6. Imkon bo'lsa, nginx'da panelni universitet tarmog'i IP'lari bilan cheklang
   (namuna `deploy/nginx.conf` ichida).
7. `npm audit` va `npm update` ni vaqti-vaqti bilan bajaring.

---

## 7. Zaxira va tiklash

```bash
npm run backup                  # data/backups/murojaat-2026-10-19-18-30.db
# cron: har kuni 02:00 da
0 2 * * * cd /opt/murojaat-bot/murojaat-bot && /usr/bin/npm run backup >> /var/log/murojaat-backup.log 2>&1
```

Tiklash: xizmatni to'xtating, zaxira faylini `data/murojaat.db` o'rniga qo'ying, qayta ishga tushiring.

```bash
sudo systemctl stop murojaat-bot
sudo -u murojaat cp data/backups/murojaat-....db data/murojaat.db
sudo systemctl start murojaat-bot
```

---

## 8. Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | botni va panelni ishga tushirish |
| `npm run setup` | birinchi sozlash (.env yaratish) |
| `npm run hash -- "parol"` | parol hashini olish |
| `npm run webhook set\|info\|delete` | webhook boshqaruvi |
| `npm run backup` | bazaning zaxira nusxasi |
| `npm test` | uchdan-uchiga tekshiruv (66 ta test, Telegram'siz) |

---

## 9. Muammolar

| Belgi | Sabab va yechim |
|---|---|
| `⛔️ Sozlamalarda xato` | ro'yxatdagi kalitlarni `.env` ga qo'shing; `npm run setup` yordam beradi |
| Bot javob bermayapti | `npm run webhook info` — xatoni ko'ring; polling'da token to'g'riligini tekshiring |
| Panelga kira olmayapman | 15 daqiqa kutib qayta urinib ko'ring (qulflash), yoki `npm run hash` bilan yangi parol qo'ying |
| «Sessiya tugadi» tez-tez | `SESSION_IDLE_MINUTES` ni oshiring; VPN/brauzer o'zgarishi sessiyani bekor qiladi |
| Javob yetmadi | foydalanuvchi botni bloklagan bo'lishi mumkin — panelda «yetkazilmadi» belgisi chiqadi |
| Fayl ochilmadi | Telegram fayllari muddati o'tgan bo'lishi mumkin; murojaat egasidan qayta so'rang |

---

## 10. Maxfiylik

Murojaat matni, muallifning ismi, Telegram username/ID va (ulashsa) telefon raqami
serveringizdagi bazada saqlanadi. Bu ma'lumotlar faqat dekanat xodimlari ko'radigan
panelga chiqadi va uchinchi shaxslarga berilmaydi. Foydalanuvchi bu haqda `/yordam`
bo'limida xabardor qilinadi. Kerak bo'lmagan murojaatlarni `owner` o'chirishi mumkin.
