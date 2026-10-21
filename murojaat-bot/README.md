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

> Replit'da ishga tushirmoqchimisiz? → **[REPLIT.md](REPLIT.md)** (qadamma-qadam, o'zbekcha)

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
juda tez yuborilsa foydalanuvchi ogohlantiriladi. Suiiste'mol qilgan foydalanuvchini
paneldan bloklash mumkin. Chegaralar `.env` orqali o'zgaradi.

**Albom (bir nechta rasm birga)** — Telegram ularni alohida-alohida yuboradi, shuning uchun
bot albomni bir necha soniya kutib, hammasini **bitta murojaatga** biriktiradi.

**Takrorlanishdan himoya** — Telegram xabarni qayta yuborsa (tarmoq uzilganda), bitta
xabardan ikkita murojaat yaratilmaydi.

---

## 3. Dekanat uchun: admin panel

`https://<manzilingiz>` → login va parol bilan kirish.

* **Murojaatlar** — qidiruv (matn, raqam, ism, telefon), holat bo'yicha filtr, sahifalash.
* **Tafsilot** — murojaat matni, muallif ma'lumoti, ilovalar, javoblar tarixi.
* **Javob berish** — matnni yozib «Javobni yuborish» (yoki `Ctrl+Enter`). Javob bot orqali
  murojaat egasiga boradi, holat avtomatik «Javob berilgan»ga o'tadi.
* **Holatlar** — Yangi → Ko'rilmoqda → Javob berilgan → Yopilgan.
* **CSV** — hisobot yoki zaxira uchun (Excel'da ochiladi).
* **Ichki izohlar** — xodimlar o'zaro yozishmasi (masalan «o'quv bo'limiga yuborildi»).
  Murojaat egasi bu izohlarni **ko'rmaydi**.
* **Kechikkanlar** — belgilangan muddatdan (standart 48 soat) oshgan javobsiz murojaatlar
  alohida filtr va qizil belgi bilan ajralib turadi.
* **Sana oralig'i** — oylik hisobot uchun: sanalarni tanlab CSV yuklab olasiz.
* **Muallif tarixi** — shu odamning oldingi murojaatlari darhol ko'rinadi (takroriy masala).
* **Rasm ko'rinishi** — ilova qilingan rasmlar panelda darhol ochiladi.
* **Foydalanuvchilar** — bloklash/blokdan chiqarish.
* **Adminlar** (faqat `owner`) — xodimlar uchun alohida login yaratish.
* **Jurnal** (faqat `owner`) — kim, qachon, nima qilgani.
* **Ikki qadamli kirish (2FA)** — profil menyusidan yoqiladi; Google Authenticator va
  shunga o'xshash ilovalar bilan ishlaydi.
* **Arxiv** — o'chirilgan murojaat yo'qolmaydi, `owner` uni «Tiklash» bilan qaytaradi.

### Telegram'ning o'zidan boshqarish
`NOTIFY_CHAT_IDS` da ko'rsatilgan chatga (dekanning **shaxsiy** chati ham, dekanat
**guruhi** ham bo'lishi mumkin) har bir yangi murojaat xabarnoma bo'lib tushadi. U yerda:

| Nima qilasiz | Qanday |
|---|---|
| Javob berish | xabarnomaga **«reply»** qilib yozasiz |
| Javob berish (reply'siz) | `/javob MR-2026-0007 javob matni` |
| Holatni o'zgartirish | xabarnoma tagidagi tugmalar |
| Qisqa hisobot | `/statistika` |

### Kunlik xulosa
Har kuni belgilangan soatda (`DIGEST_HOUR`, standart 09:00) dekanat chatiga qisqa
xulosa keladi: nechta yangi murojaat bor va **qaysi murojaatlar javobsiz qolgan**.
Shu bilan hech bir murojaat e'tibordan chetda qolmaydi. Paneldagi profil menyusidan
xulosani istalgan vaqtda qo'lda ham yuborish mumkin.

### Huquqlar
| Rol | Nima qila oladi |
|---|---|
| `owner` | hammasi: o'chirish, adminlar, audit jurnali |
| `operator` | murojaatlarni ko'rish, javob berish, holat, bloklash |

---

## 4. Ishlab chiqarishga joylash

### A. VPS + nginx + systemd (tavsiya etiladi)

```bash
# 1) Foydalanuvchi va kod (home papkasi bo'sh bo'lishi kerak — shuning uchun "-m" YO'Q)
sudo useradd -r -d /opt/murojaat-bot -s /usr/sbin/nologin murojaat
sudo mkdir -p /opt/murojaat-bot && sudo chown murojaat:murojaat /opt/murojaat-bot
sudo -u murojaat git clone <repo> /opt/murojaat-bot

# 2) Bog'liqliklar va sozlash (ilova /opt/murojaat-bot/murojaat-bot ichida)
cd /opt/murojaat-bot/murojaat-bot
sudo -u murojaat npm ci --omit=dev
sudo -u murojaat npm run setup
sudo chmod 600 .env

# 3) Xizmat (unit faylidagi yo'llar aynan shu joylashuvga mos)
sudo cp deploy/murojaat-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now murojaat-bot
sudo journalctl -u murojaat-bot -f

# 4) HTTPS va nginx (ikkita fayl: so'rov chegarasi "http" blokiga qo'yiladi)
sudo cp deploy/nginx-limits.conf /etc/nginx/conf.d/murojaat-limits.conf
sudo cp deploy/nginx.conf /etc/nginx/sites-available/murojaat
sudo ln -s /etc/nginx/sites-available/murojaat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d murojaat.example.uz

# 5) Xavfsizlik devori: tashqariga faqat 80/443 ochiq bo'lsin
sudo ufw allow 80,443/tcp
sudo ufw deny 8080/tcp          # panel porti faqat nginx orqali
sudo ufw enable

# 6) Webhook (BOT_MODE=webhook bo'lsa)
sudo -u murojaat npm run webhook set
```

> `deploy/murojaat-bot.service` ichidagi yo'llar `/opt/murojaat-bot/murojaat-bot`
> ga sozlangan. Boshqa joyga o'rnatsangiz, unit faylidagi `WorkingDirectory` va
> `EnvironmentFile` ni ham o'zgartiring.
>
> **Ma'lumotlar qayerda?** systemd rejimida baza `/var/lib/murojaat-bot/` da
> saqlanadi — papkani systemd o'zi yaratadi va huquqini (0700) beradi, shuning
> uchun qo'lda `mkdir` qilish shart emas. Zaxira buyruqlarini ham shu
> foydalanuvchi nomidan bajaring:
> `sudo -u murojaat DATA_DIR=/var/lib/murojaat-bot npm run backup`

### B. Docker

```bash
cp .env.example secrets.env   # to'ldiring (yoki: npm run setup && cp .env secrets.env)
docker compose up -d --build
docker compose logs -f
```

> **Muhim:** Docker uchun sozlamalar `.env` emas, **`secrets.env`** faylida
> saqlanadi. Compose o'zining `.env` faylidagi `$` belgilarini o'zgaruvchi deb
> talqin qiladi va parol hashini buzib qo'yadi — shu sababli alohida fayl
> ishlatiladi. (Hash endi `$` o'rniga `.` bilan yoziladi, bu ham qo'shimcha himoya.)

### C. Replit

Brauzerdan, server sozlamasdan ishga tushirish mumkin — bot Replit muhitini
o'zi taniydi va sozlanadi. To'liq qo'llanma: **[REPLIT.md](REPLIT.md)**.

```bash
npm install
npm i --no-save @replit/object-storage          # faqat Replit uchun
npm run replit-secrets -- "ParolingizBuYerda"   # kalitlarni yaratadi
```

> **Muhim:** Replit'da nashr qilingan ilovaning fayl tizimi saqlanmaydi.
> Shuning uchun **App Storage** bucket'ini yoqish shart (REPLIT.md, 3-qadam) —
> shunda baza tashqi xotirada saqlanib, qayta ishga tushganda avtomatik tiklanadi.
> Qo'shimcha himoya sifatida baza har kuni Telegram'ga fayl bo'lib yuboriladi.

### D. Polling yoki webhook?

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
| `HOST` | qaysi manzilda tinglaydi (nginx ortida: `127.0.0.1`) |
| `TRUST_PROXY` | kimga ishonish: `loopback`, proksi IP'si yoki bo'sh. **Raqam yozmang** |
| `SLA_HOURS` | javobsiz murojaat «kechikkan» deb belgilanadigan muddat |
| `DIGEST_HOUR` / `TZ_OFFSET_HOURS` | kunlik xulosa soati va mahalliy vaqt farqi |
| `NOTIFY_USER_ON_PROGRESS` | «Ko'rib chiqilmoqda»da muallifga xabar berilsinmi |
| `STORAGE_MODE` | `replit` / `local` / `off` — bazani tashqi xotirada saqlash |
| `BACKUP_TO_TELEGRAM` | bazani dekanat chatiga fayl qilib yuborish |

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

**Qo'shimcha himoyalar (audit natijasida kuchaytirilgan)**
- Panel standart holatda faqat `127.0.0.1` da tinglaydi — tashqi tarmoqqa nginx orqali chiqadi.
- `X-Forwarded-Proto` / `X-Forwarded-For` sarlavhalariga **faqat ishonchli proksidan**
  kelganda ishoniladi (`TRUST_PROXY`), shuning uchun HTTPS majburiyligini va so'rov
  chegaralarini soxta sarlavha bilan aylanib o'tib bo'lmaydi.
- Kirishni qulflash login registriga bog'liq emas (`admin`/`ADMIN` — bitta hisoblagich).
- Javob matni Telegram chegarasidan oshsa, avtomatik bo'laklanadi — javob yo'qolmaydi.
- Emoji/maxsus belgilar matn kesilganda buzilmaydi (UTF-16 xavfsiz kesish).
- O'chirilgan murojaatni faqat `owner` ko'radi; holati o'zgartirilmaydi, tiklash mumkin.
- Faqat **o'z** telefon raqamini ulashish mumkin (begona kontakt qabul qilinmaydi).
- Parol tekshiruvi **asinxron** (scrypt event-loop'ni bloklamaydi) — ko'p sonli
  login urinishi panelni ham, botni ham sekinlashtirmaydi.
- Hisob darajasidagi qulflash faqat **turli IP'lardan** hujum bo'lganda ishlaydi va
  qulflangan so'rovlar yangi urinish sifatida yozilmaydi — shu sababli hujumchi
  adminni panelдан uzib qo'ya olmaydi.
- Arxivlangan murojaatning **fayllari** ham faqat `owner` uchun ochiq.

> **Parol qayerda saqlanadi?** `.env` dagi `ADMIN_PASSWORD_HASH` faqat **eng birinchi**
> ishga tushishda o'qiladi — keyin parol bazada saqlanadi. Shuning uchun parolni
> keyinchalik `.env` orqali emas, panel («Parolni o'zgartirish») yoki
> `npm run reset-password` orqali almashtiring.

**Sizning zimmangizdagi ishlar**
1. `.env` faylini `chmod 600` qiling va hech kimga bermang (ayniqsa `BOT_TOKEN`).
2. Panelni faqat HTTPS orqali oching (`REQUIRE_HTTPS=true`), sertifikatni yangilab turing.
3. Har bir xodimga **alohida login** yarating — umumiy parol ishlatmang.
4. Xodim ishdan ketsa — uning loginini «O'chirish» tugmasi bilan bloklang.
5. `npm run backup` ni kunlik `cron`ga qo'ying va nusxani boshqa joyda saqlang.
6. Imkon bo'lsa, nginx'da panelni universitet tarmog'i IP'lari bilan cheklang
   (namuna `deploy/nginx-limits.conf` ichida) va `ufw` bilan 8080-portni yoping.
7. **Faqat bitta nusxa (instans)** ishlatilsin: baza SQLite, albom buferi esa
   xotirada — ikki jarayon bir vaqtda ishlasa, fayllar va chegaralar chalkashadi.
   (Yuklama oshsa, oldin bitta serverni kuchaytiring.)
8. `npm audit` va `npm update` ni vaqti-vaqti bilan bajaring.

---

## 7. Zaxira va tiklash

```bash
npm run backup                  # data/backups/murojaat-2026-10-20-02-00.db

# systemd bilan ishlaganda (baza /var/lib/murojaat-bot da):
sudo -u murojaat DATA_DIR=/var/lib/murojaat-bot npm run backup

# cron: har kuni 02:00 da
0 2 * * * cd /opt/murojaat-bot/murojaat-bot && DATA_DIR=/var/lib/murojaat-bot /usr/bin/npm run backup >> /var/log/murojaat-backup.log 2>&1
```

**Tiklash.** Baza WAL rejimida ishlaydi, shuning uchun `-wal` va `-shm` fayllarini
ham o'chirish **shart** — aks holda eski yozuvlar tiklangan baza ustiga qaytadan
yozilib, zaxirani bekor qiladi:

```bash
sudo systemctl stop murojaat-bot
D=/var/lib/murojaat-bot          # systemd'siz ishlatayotgan bo'lsangiz: D=./data
sudo -u murojaat rm -f $D/murojaat.db $D/murojaat.db-wal $D/murojaat.db-shm
sudo -u murojaat cp $D/backups/murojaat-2026-10-20-02-00.db $D/murojaat.db
sudo -u murojaat chmod 600 $D/murojaat.db
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
| `npm run reset-password -- <login> "<parol>"` | parolni unutganda yangilash (sessiyalar bekor qilinadi) |
| `npm run restore -- <fayl>` | zaxiradan tiklash (`.db` yoki `.db.gz`) |
| `npm run replit-secrets -- "<parol>"` | Replit Secrets uchun kalitlarni yaratish |
| `npm test` | uchdan-uchiga tekshiruv (177 ta test, Telegram'siz) |

---

## 9. Muammolar

| Belgi | Sabab va yechim |
|---|---|
| `⛔️ Sozlamalarda xato` | ro'yxatdagi kalitlarni `.env` ga qo'shing; `npm run setup` yordam beradi |
| Bot javob bermayapti | `npm run webhook info` — xatoni ko'ring; polling'da token to'g'riligini tekshiring |
| Panelga kira olmayapman | 15 daqiqa kutib qayta urinib ko'ring (qulflash). Parolni unutgan bo'lsangiz: `npm run reset-password -- <login> "<yangi parol>"` |
| «Sessiya tugadi» tez-tez | `SESSION_IDLE_MINUTES` ni oshiring; VPN/brauzer o'zgarishi sessiyani bekor qiladi |
| Javob yetmadi | foydalanuvchi botni bloklagan bo'lishi mumkin — panelda «yetkazilmadi» belgisi chiqadi |
| Fayl ochilmadi | Telegram fayllari muddati o'tgan bo'lishi mumkin; murojaat egasidan qayta so'rang |

---

## 10. Maxfiylik

Murojaat matni, muallifning ismi, Telegram username/ID va (ulashsa) telefon raqami
serveringizdagi bazada saqlanadi. Bu ma'lumotlar faqat dekanat xodimlari ko'radigan
panelga chiqadi va uchinchi shaxslarga berilmaydi. Foydalanuvchi bu haqda `/yordam`
bo'limida xabardor qilinadi. Kerak bo'lmagan murojaatlarni `owner` o'chirishi mumkin.
