# Murojaat boti — Ta'lim fakulteti dekanati

Qo'qon universiteti **Ta'lim fakulteti** dekani **Xursanaliyev Boburmirzo Farhod o'g'li**
qabulxonasi uchun Telegram bot.

> **Asosiy g'oya:** fuqaro botga oddiy xabar yozadi — bot murojaatni
> **to'g'ridan-to'g'ri dekanatning Telegram chatiga** yuboradi. Dekan o'sha xabarga
> «reply» qilib javob yozadi — javob fuqaroga yetib boradi.
> **Web-panel, login va parol yo'q** — hamma ish Telegram ichida.
>
> Boshqaruv ham Telegram ichida: **`/panel`** — tugmalar bilan ishlaydigan
> dekanat paneli (murojaatlar ro'yxati, qidirish, holatlar, bloklash, zaxira).
> Adminlar **Telegram ID** orqali qo'shiladi — panelning o'zidan, fayl tahrirlamasdan.

```
  Fuqaro                      Bot                      Dekanat (Telegram)
  ──────                      ───                      ──────────────────
  xabar yozadi   ────────▶  raqam beradi   ────────▶  🆕 Murojaat MR-2026-0007
                            MR-2026-0007              👤 Ali · @ali · +998...
                                                      [⏳ Ko'rilmoqda] [🔒 Yopish]
  javobni oladi  ◀────────  javobni        ◀────────  xabarga «reply» qilib
                            yetkazadi                 javob yoziladi
```

Murojaatlarning o'zi dekanat chatida saqlanib qoladi — qidirish ham, arxiv ham
Telegram'ning o'zida. Bot esa raqamlash, chegaralar, nazorat va zaxira bilan shug'ullanadi.

---

## 1. Tez boshlash

```bash
npm install
cp .env.example .env     # BOT_TOKEN va ADMIN_CHAT_IDS ni to'ldiring
npm start
```

Kerak bo'ladigan ikki qiymat:

| Nima | Qayerdan olinadi |
|---|---|
| `BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` |
| `ADMIN_CHAT_IDS` | [@userinfobot](https://t.me/userinfobot) ga `/start` — u sizning ID'ingizni beradi |

Dekanat **guruhi** ishlatilsa: botni guruhga qo'shing, guruh ID'sini (`-100...` bilan
boshlanadi) yozing va `ADMIN_USER_IDS` ga javob bera oladigan xodimlar ID'sini qo'shing
(guruh ishlatilganda bu **majburiy** — aks holda bot ishga tushmaydi, chunki
`ADMIN_USER_IDS` bo'sh bo'lsa guruhdagi har kim dekanat nomidan javob bera olardi).

> **Guruhda bot qo'shimcha huquq so'ramaydi.** Telegram'ning «maxfiylik rejimi»
> (privacy mode, BotFather'da sukut bo'yicha **yoniq**) botga guruhdagi barcha
> xabarlarni ko'rsatmaydi, lekin **botning o'z xabariga qilingan «reply»** har doim
> yetib boradi — javob oqimi shuning ustida ishlaydi. Shuning uchun botni admin
> qilish yoki maxfiylik rejimini o'chirish **shart emas**: shunday qilsangiz bot
> guruhdagi barcha suhbatni ko'radi (bot unga aralashmaydi, lekin ortiqcha ma'lumot
> oladi).

> Replit'da ishga tushirish: **[REPLIT.md](REPLIT.md)**

---

## 2. Fuqaro uchun

| Nima qiladi | Natija |
|---|---|
| Istalgan matn yozadi (12+ belgi) | murojaat raqam oladi va dekanatga yuboriladi |
| Rasm / hujjat / ovozli xabar / GIF | murojaatga ilova bo'lib dekanatga boradi |
| Dekanat javobiga «reply» qilib yozadi | yangi murojaat oldingisiga bog'lanadi (kartada `↩️ Javobga qo'shimcha`) |
| `/murojaatlarim` | o'z murojaatlari va holati |
| `/holat MR-2026-0007` | aniq murojaat holati va javobi |
| `/yordam` | qoidalar va maxfiylik haqida |
| «📞 Raqamni ulashish» | telefon raqami (ixtiyoriy) murojaat kartasida ko'rinadi |

Mavzu yoki bo'lim tanlash **yo'q** — odam nimani xohlasa, shuni yozadi.

**Spamga qarshi:** soatiga 4 ta, kuniga 12 ta murojaat; xabarlar orasida 20 soniya.
Albom (bir nechta rasm) bitta murojaatga yig'iladi. Takroriy yuborilgan xabardan
ikkinchi murojaat yaratilmaydi.

---

## 3. Dekanat uchun

Har bir murojaat shu ko'rinishda keladi:

```
🆕 Murojaat MR-2026-0007
👤 Ali Valiyev · @ali · +998901234567
🆔 123456789
🕒 21.10.2026, 14:30
📎 2 ta fayl

Dars jadvalida xatolik bor, 3-kurs uchun...

Javob berish: shu xabarga «reply» qilib yozing
[⏳ Ko'rib chiqilmoqda]  [🔒 Yopish]
[⛔️ Bloklash]
```

| Nima qilasiz | Qanday |
|---|---|
| Boshqaruv paneli | `/panel` — tugmalar bilan (4-bo'lim) |
| Javob berish | xabarga **«reply»** qilib yozasiz |
| Javob berish (reply'siz) | `/javob MR-2026-0007 javob matni` |
| Javobga hujjat/rasm ilova qilish | kartaga «reply» qilib faylni yuborasiz (izoh bilan yoki izohsiz) — fayl fuqaroga ham boradi |
| Holatni o'zgartirish | xabar tagidagi tugmalar |
| Suiiste'molchini bloklash | `⛔️ Bloklash` tugmasi yoki `/bloklash MR-2026-0007 sabab` |
| Kartani qaytadan chiqarish | `/murojaat MR-2026-0007` (xabar o'chib ketsa) |
| Yetib bormagan murojaatlarni yuborish | `/navbat` (bot chatga yoza olmagan bo'lsa) |
| Qisqa hisobot | `/statistika` |
| Javobsiz qolganlar | `/kechikkanlar` |
| Bazaning nusxasi | `/zaxira` |
| Qo'llanma | `/yordam` |

**Avtomatik yordamchilar**
- Murojaat «Ko'rib chiqilmoqda»ga o'tsa, fuqaroga xabar boradi.
- Har kuni soat 9:00 da kunlik xulosa keladi: nechta yangi murojaat bor,
  qaysilari **48 soatdan beri javobsiz** va qaysilari shu chatga yetib bormagan.
- Har kuni bazaning nusxasi `.db.gz` fayl bo'lib **shaxsiy** chatga yuboriladi.
- Javob uzun bo'lsa, Telegram chegarasiga qarab bo'laklab yuboriladi;
  javobga ilova qilingan rasm/hujjat ham fuqaroga boradi.
- Dekanat chatiga yetib bormagan murojaat navbatda qoladi va har 5 daqiqada
  qayta yuborilishga urinadi (`/navbat` bilan qo'lda ham).
- Fuqaro botni bloklagan bo'lsa, "yetkazilmadi" deb aniq aytiladi.

---

## 4. Panel (`/panel`) — Telegram ichidagi boshqaruv

Dekanat xodimi botga `/panel` yozadi va hamma narsa tugmalarda bo'ladi:

```
🏛 Dekanat paneli
Qo'qon universiteti Ta'lim fakulteti

🆕 Yangi: 3   ⏳ Ko'rilmoqda: 1
✅ Javob berilgan: 12   🔒 Yopilgan: 4
⚠️ Kechikkan (48 soat+): 1   📨 24 soatda: 5

Siz: 👑 egasi · 123456789

[🆕 Yangi (3)]        [⏳ Ko'rilmoqda (1)]
[📋 Hammasi]          [⚠️ Kechikkanlar (1)]
[🔍 Qidirish]         [⛔️ Bloklanganlar]
[🔔 Xabarnoma: yoniq]
[👥 Adminlar]         [💾 Zaxira]
[📜 Jurnal]
```

| Tugma | Nima qiladi |
|---|---|
| 🆕 / ⏳ / 📋 | murojaatlarni holat bo'yicha sahifalab ko'rsatadi |
| Murojaat kartasi | to'liq matn, muallif, fayllar soni, oxirgi javob |
| ✍️ Javob yozish | bot so'raydi, siz javobni yozasiz — fuqaroga boradi (fayl ham mumkin) |
| ⏳ / 🔒 | holatni o'zgartirish (fuqaroga xabar beriladi) |
| 📎 Fayllar | murojaat ilovalarini qaytadan yuborish |
| ⛔️ Bloklash | suiiste'molchini to'xtatish (va qaytarish) |
| 🔍 Qidirish | raqam, Telegram ID, username yoki matn bo'yicha |
| 🔔 Xabarnoma | yangi murojaat shaxsiy chatingizga ham kelsinmi |
| 💾 Zaxira | bazani shaxsiy chatga yuborish *(faqat egasi)* |
| 📜 Jurnal | kim nima qilgani *(faqat egasi)* |

### Adminlarni ID orqali qo'shish

`👥 Adminlar` → `➕ ID bilan admin qo'shish` → yangi xodimning **Telegram ID**'sini
yuborasiz (ID'ni [@userinfobot](https://t.me/userinfobot) beradi). Shundan keyin u
botga `/panel` yozib ishlay oladi — `.env` ni tahrirlash, serverni qayta ishga
tushirish **shart emas**.

Ikki daraja bor:

| Daraja | Imkoniyati |
|---|---|
| 👑 **egasi** (owner) | hammasi: adminlarni qo'shish/olib tashlash, zaxira, jurnal |
| 👤 **admin** | murojaatlar: javob, holat, qidirish, bloklash |

- `.env` dagi `ADMIN_USER_IDS` — **doimiy egalar**. Ularni paneldan o'chirib
  bo'lmaydi; `.env` dan olib tashlansa — panel ro'yxatidan ham avtomatik chiqadi.
- Har bir tugma bosilganda huquq **qaytadan** tekshiriladi: huquqi olingan odam
  eski xabardagi tugmani bosib ham hech narsa qila olmaydi.
- Kim kimni admin qilgani, kim holatni o'zgartirgani — `📜 Jurnal`da qoladi.

---

## 5. Joylashtirish

### A. VPS (tavsiya etiladi — polling rejimi, nginx kerak emas)

```bash
sudo useradd -r -d /opt/murojaat-bot -s /usr/sbin/nologin murojaat
sudo mkdir -p /opt/murojaat-bot && sudo chown murojaat:murojaat /opt/murojaat-bot
sudo -u murojaat git clone <repo> /opt/murojaat-bot
cd /opt/murojaat-bot/murojaat-bot
sudo -u murojaat npm ci --omit=dev
sudo -u murojaat cp .env.example .env && sudo -u murojaat nano .env
sudo chmod 600 .env

sudo cp deploy/murojaat-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now murojaat-bot
sudo journalctl -u murojaat-bot -f
```

polling rejimida bot Telegram'ga **o'zi ulanadi** — tashqaridan hech qanday port
ochish shart emas, domen va sertifikat ham kerak emas.

### B. Docker

```bash
cp .env.example secrets.env   # to'ldiring
docker compose up -d --build
```

### C. Replit

Brauzerdan, server sozlamasdan: **[REPLIT.md](REPLIT.md)**.

### D. Webhook rejimi (ixtiyoriy)

Agar `BOT_MODE=webhook` tanlasangiz: HTTPS domen, `WEBHOOK_SECRET`, `PUBLIC_URL`
va oldida nginx kerak (`deploy/nginx.conf`), so'ng `npm run webhook set`.
Oddiy hollarda **polling yetarli va soddaroq**.

---

## 6. Sozlamalar

Barchasi `.env.example` da izohlari bilan. Eng muhimlari:

| O'zgaruvchi | Vazifasi |
|---|---|
| `BOT_TOKEN` | Telegram bot tokeni (maxfiy!) |
| `ADMIN_CHAT_IDS` | murojaatlar shu chat(lar)ga boradi (adminlar xabarnomani yoqsa — ixtiyoriy) |
| `ADMIN_USER_IDS` | kim javob bera oladi (guruh ishlatilsa — **majburiy**) |
| `BOT_MODE` | `polling` yoki `webhook` |
| `APPEALS_PER_HOUR` / `APPEALS_PER_DAY` | spam chegaralari |
| `SLA_HOURS` | javobsiz murojaat «kechikkan» deb belgilanadigan muddat |
| `DIGEST_HOUR` | kunlik xulosa soati |
| `BACKUP_TO_TELEGRAM` | bazani Telegram'ga fayl qilib yuborish (faqat shaxsiy chatga) |
| `BACKUP_CHAT_ID` | zaxira keladigan shaxsiy chat ID'si |
| `STORAGE_MODE` | `replit` / `local` / `off` — fayl tizimi saqlanmaydigan muhitlar uchun |
| `DATA_DIR` | baza joyi |

---

## 7. Xavfsizlik

- Bot tokeni va boshqa maxfiy qiymatlar faqat environment'da; logga tushmaydi.
- Murojaat matni boshqaruv belgilaridan tozalanadi va HTML qochiriladi —
  Telegram razmetkasini buzish yoki in'ektsiya qilish mumkin emas.
- Barcha SQL so'rovlar prepared statement (SQL injection imkonsiz).
- Admin amallari ikki qavat tekshiriladi: **chat** (`ADMIN_CHAT_IDS`) va
  **odam** (`ADMIN_USER_IDS` yoki panel orqali qo'shilgan admin). Begona chat
  yoki begona odam — rad etiladi.
- Panel huquqi har bir tugma bosilganda qayta tekshiriladi; «egasi» amallari
  (adminlar, zaxira, jurnal) oddiy adminga berilmaydi.
- `.env` dagi egalar ro'yxati hokim: undan chiqarilgan odam panel ro'yxatidan ham
  avtomatik o'chadi.
- Adminlar bilan bog'liq har bir amal jurnalga yoziladi (kim, kimga, qachon).
- Fuqaro boshqa odamning murojaatini raqam bilan ham ko'ra olmaydi.
- Faqat **o'z** telefon raqamini ulashish mumkin.
- Webhook ikki qavat himoyada: maxfiy yo'l + Telegram maxfiy sarlavhasi
  (vaqt-xavfsiz solishtiriladi).
- Baza fayli `600` huquqi bilan; emoji/uzun matn kesilganda xabar buzilmaydi.
- Web-panel, parol va sessiya **umuman yo'q** — hujum maydoni shunchalik kichik.
- `npm audit`: **0 ta zaiflik** (bog'liqliklar: `grammy`, `better-sqlite3`).

---

## 8. Zaxira va tiklash

Bot har kuni (va `/zaxira` buyrug'i bilan) bazani **shaxsiy** chatga yuboradi.
Bu fayllarni o'chirmang — ular sizning zaxirangiz.

> Zaxira guruhga **yuborilmaydi**: bazada fuqarolarning telefon raqami va murojaat
> matnlari bor, guruhdagi fayl esa keyin qo'shilgan hamma uchun ochiq bo'lib qoladi.
> `/zaxira` guruhda yozilsa, bot uni so'ragan xodimning shaxsiy chatiga (yoki
> `BACKUP_CHAT_ID` ga) yuboradi.

```bash
npm run backup                      # qo'lda zaxira (data/backups/)
npm run restore -- murojaat-....db.gz   # tiklash (xizmat to'xtatilgan holda)
```

Murojaatlarning **matni** dekanat chatida ham qoladi — baza yo'qolsa ham
yozishmalar Telegram'da saqlanib turadi.

---

## 9. Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | botni ishga tushirish |
| `npm test` | uchdan-uchiga tekshiruv (153 test, Telegram'siz) |
| `npm run backup` | bazaning zaxira nusxasi |
| `npm run restore -- <fayl>` | zaxiradan tiklash |
| `npm run webhook set\|info\|delete` | webhook boshqaruvi |

---

## 10. Muammolar

| Belgi | Yechim |
|---|---|
| `⛔️ Sozlamalarda xato` | logda qaysi qiymat yetishmayotgani yozilgan |
| Murojaat kelmayapti | `ADMIN_CHAT_IDS` to'g'rimi; guruh bo'lsa bot guruhga qo'shilganmi |
| Guruhda javob ishlamayapti | javobni **murojaat kartasiga «reply»** qilib yozing (shunchaki xabar yozilsa bot ko'rmaydi); kerak bo'lsa `/javob MR-… matn` |
| Bot guruhdagi gaplarga javob bermaydi | shunday bo'lishi kerak: bot faqat «reply», buyruq yoki o'z nomi tilga olinganda gapiradi |
| Guruh supergruppaga aylandi | bot yangi guruhga yangi ID'ni yozib beradi: `ADMIN_CHAT_IDS` ni yangilab, qayta ishga tushiring va `/navbat` yozing |
| Murojaat kelmay qoldi, keyin tiklandi | yetib bormagan murojaatlar navbatda qoladi: `/navbat` (yoki 5 daqiqada o'zi) yetkazadi, `/kechikkanlar` ko'rsatadi |
| «Sizda huquq yo'q» | `ADMIN_USER_IDS` ga o'z ID'ingizni qo'shing |
| Javob yetmadi | fuqaro botni bloklagan — xabar aniq ko'rsatiladi |
| `better-sqlite3` xatosi | `npm rebuild better-sqlite3 --build-from-source` |

---

## 11. Maxfiylik

Murojaat matni, ism, Telegram username/ID va (ulashsa) telefon raqami dekanat
chatiga yuboriladi va serveringizdagi bazada saqlanadi. Boshqa hech kimga
berilmaydi. Foydalanuvchi bu haqda `/yordam` bo'limida xabardor qilinadi.
