# Replit'da ishga tushirish va nashr qilish

Bu qo'llanma dekanat xodimi uchun — **kodni bilish shart emas**, hamma narsa
brauzerdan bajariladi. Har bir qadamda nima va nega qilinayotgani yozilgan.

> Bot Replit muhitini **o'zi taniydi**: manzil, port, HTTPS va proxy sozlamalari
> avtomatik to'g'rilanadi. Sizdan faqat maxfiy kalitlar va bitta "App Storage"
> bo'limi talab qilinadi.

---

## ⚠️ Avval bilish kerak bo'lgan bitta muhim narsa

Replit'da **nashr qilingan ilovaning fayl tizimi saqlanmaydi** — har "Publish"da
u toza holatga qaytadi ([Replit hujjati](https://docs.replit.com/cloud-services/deployments/troubleshooting):
*"the file system in published apps is not persistent and resets every time you publish"*).

Ya'ni **hech narsa qilinmasa, har yangilanishda barcha murojaatlar yo'qoladi.**

Shuning uchun bot ikki qavat himoya bilan keladi:

| Himoya | Nima qiladi | Qachon |
|---|---|---|
| **App Storage** | bazaning nusxasini Replit'ning tashqi xotirasida saqlaydi va **ishga tushishda avtomatik tiklaydi** | har 2 daqiqada (o'zgarish bo'lsa) va to'xtashdan oldin |
| **Telegram zaxirasi** | baza faylini dekanat chatiga yuboradi — tashqi, mustaqil nusxa | kuniga bir marta, to'xtashdan oldin va `/zaxira` buyrug'i bilan |

**3-qadamni (App Storage) o'tkazib yubormang** — aks holda ma'lumot himoyalanmaydi.

---

## 1. Loyihani Replit'ga olish

1. [replit.com](https://replit.com) ga kiring.
2. **Create App** → **Import from GitHub** → repozitoriya havolasini qo'ying.
   Tezroq yo'l: `https://replit.com/github/<foydalanuvchi>/<repo>` havolasini oching.
3. Agar repo ichida bot alohida papkada bo'lsa (`murojaat-bot/`), App ildizi
   shu papka bo'lishi kerak — aks holda `.replit` fayli topilmaydi.
   (Arxivdan yuklasangiz: **Upload folder** → `murojaat-bot` papkasini tanlang.)

Loyihada `.replit` fayli bor — Replit Node 22 ni va ishga tushirish buyrug'ini
undan o'qiydi, qo'lda sozlash shart emas.

---

## 2. Maxfiy kalitlarni yaratish

Pastdagi **Shell** oynasiga yozing:

```bash
npm install
npm i --no-save @replit/object-storage
npm run replit-secrets -- "OzingizTanlaganParol2026"
```

> Ikkinchi qator — ma'lumotni saqlash moduli. U faqat Replit'da kerak, shuning
> uchun loyihaning asosiy bog'liqliklariga kiritilmagan (boshqa serverlarda
> keraksiz va ortiqcha zaiflik olib keladi). Nashr qilganda Replit uni
> `.replit` faylidagi ko'rsatma bo'yicha o'zi o'rnatadi.

Ekranda tayyor ro'yxat chiqadi. Chap paneldagi **🔒 Secrets** (Maxfiy ma'lumotlar)
bo'limini oching va quyidagilarni birma-bir qo'shing:

| Kalit | Qiymat |
|---|---|
| `BOT_TOKEN` | [@BotFather](https://t.me/BotFather) bergan token |
| `SESSION_SECRET` | skript chiqargan qiymat |
| `ADMIN_USERNAME` | masalan `dekanat` |
| `ADMIN_PASSWORD_HASH` | skript chiqargan uzun qator (`scrypt.` bilan boshlanadi) |
| `NOTIFY_CHAT_IDS` | dekan yoki qabulxona Telegram chat ID'si |

**Parolning o'zini Secrets'ga yozmang** — faqat hashini. Parolni xavfsiz joyda saqlang.

Chat ID ni bilish: Telegram'da [@userinfobot](https://t.me/userinfobot) ga `/start` yozing.
Guruh ID'si manfiy bo'ladi (`-100...`).

> `WEBHOOK_SECRET` va `PUBLIC_URL` kerak emas — bot Replit'da **polling** rejimida
> ishlaydi (soddaroq va ishonchliroq).

---

## 3. App Storage (ma'lumotni saqlash) — MAJBURIY

1. Chap paneldagi **App Storage** (ba'zi versiyalarda **Object Storage**) bo'limini oching.
2. **Create bucket** (yoki **Get started**) tugmasini bosing — bitta bucket yetarli,
   nomini o'zgartirish shart emas.
3. 2-qadamdagi `npm i --no-save @replit/object-storage` buyrug'i bajarilganiga
   ishonch hosil qiling (busiz bot bucket'ni ko'rmaydi).

Tamom. Bot buni o'zi topadi: ishga tushganda logda shunday yoziladi:

```
doimiy saqlash: Replit App Storage (baza joyida)
```

Agar bucket yaratilmagan bo'lsa, logda qizil ogohlantirish chiqadi:
`App Storage ulanmadi — MA'LUMOT HIMOYALANMAGAN`.

---

## 4. Sinab ko'rish (Workspace)

**Run** tugmasini bosing. Logda shunga o'xshash satrlar bo'lishi kerak:

```
bot "polling" rejimida ishga tushdi: @sizning_botingiz
admin panel: https://<app>.<foydalanuvchi>.replit.dev
rejim: production · muhit: Replit (doimiy saqlash yoqilgan)
```

Tekshiring:
- Telegram'da botingizga `/start` yozing → salomlashish xabari kelishi kerak.
- Murojaat matnini yozing → raqam (`MR-2026-0001`) qaytishi kerak.
- Logdagi havolani oching → login va parolingiz bilan panelga kiring.

---

## 5. Nashr qilish (Publish)

1. Yuqoridagi **Publish** (yoki **Deploy**) tugmasini bosing.
2. **Deployment turi: Reserved VM** ni tanlang.
   - *Autoscale tanlamang:* u 15 daqiqa harakatsizlikdan keyin uxlaydi —
     polling uziladi, kunlik xulosa va "kechikkan murojaat" nazorati ishlamaydi.
3. **Machine: 0.5 vCPU / 2 GiB** (eng kichik tavsiya etilgani — `better-sqlite3`
   o'rnatilishi uchun yetarli xotira kerak).
4. **Mode: Web server** (Background worker EMAS — panel port tinglaydi).
5. Secrets: nashr uchun maxfiy qiymatlar alohida saqlanadi. Publish oynasidagi
   **Secrets** bo'limida ularning hammasi borligiga ishonch hosil qiling.
6. **Publish** tugmasini bosing va qurish (build) logini kuzating.

Nashrdan keyin ilova `https://<nom>.replit.app` manzilida ochiladi.

> **Eslatma:** Secrets'ni keyinchalik o'zgartirsangiz, yangi qiymat **qayta nashr
> qilingandan keyin** kuchga kiradi.

---

## 6. Nashrdan keyin tekshirish ro'yxati

| Tekshiruv | Qanday | Kutilgan natija |
|---|---|---|
| Ilova sog'ligi | `https://<nom>.replit.app/healthz` ni oching | `{"ok":true,...,"storage":true}` |
| Panel | `https://<nom>.replit.app` | kirish oynasi |
| Bot | Telegram'da `/start` | salomlashish xabari |
| Murojaat | botga matn yozing | raqam qaytadi, panelda ko'rinadi |
| Saqlash | logda `doimiy saqlash:` qatori | `Replit App Storage` |
| Zaxira | dekanat chatida `/zaxira` | `.db.gz` fayli keladi |

`"storage": false` bo'lsa — 3-qadamga qayting (bucket yaratilmagan).

---

## 7. Zaxira va tiklash

**Avtomatik:** bot har kuni dekanat chatiga `murojaat-....db.gz` faylini yuboradi.
Bu fayllarni **o'chirmang** — ular sizning mustaqil zaxirangiz.

**Qo'lda:** dekanat chatida `/zaxira` deb yozing — hoziroq yuboradi.

**Tiklash** (masalan baza buzilsa yoki eski holatga qaytish kerak bo'lsa):

1. Telegram'dan `.db.gz` faylini kompyuterga yuklab oling.
2. Replit fayl ro'yxatiga uni yuklang (drag-and-drop).
3. Shell'da:
   ```bash
   npm run restore -- murojaat-2026-10-21-09-00.db.gz
   ```
4. **Stop → Run** (yoki qayta nashr) qiling.

Eski baza o'chirilmaydi — `murojaat.db.eski-...` nomi bilan saqlanib qoladi.

---

## 8. Kundalik ishlatish

| Kerak bo'lsa | Shell'da |
|---|---|
| Parolni almashtirish | `npm run reset-password -- dekanat "YangiParol2026"` |
| Qo'lda zaxira | `npm run backup` |
| Zaxiradan tiklash | `npm run restore -- <fayl>` |
| Tizimni tekshirish | `npm test` |

Telegram'dagi dekanat chatida: `/statistika`, `/zaxira`,
`/javob MR-2026-0007 javob matni`.

---

## 9. Muammolar

| Belgi | Sabab va yechim |
|---|---|
| `⛔️ Sozlamalarda xato` | logda qaysi kalit yetishmayotgani yozilgan — Secrets'ga qo'shing va qayta ishga tushiring |
| Bot javob bermayapti | `BOT_TOKEN` noto'g'ri (log: `401 Unauthorized`) yoki Secrets o'zgartirilib qayta nashr qilinmagan |
| Panel ochilmayapti, `https_required` | Secrets'ga qo'lda `TRUST_PROXY` yoki `HOST` yozgan bo'lsangiz — ularni **o'chiring**, bot o'zi to'g'ri sozlaydi |
| `better-sqlite3` xatosi | Shell'da: `npm rebuild better-sqlite3 --build-from-source`. Yordam bermasa `rm -rf node_modules && npm install` |
| `storage: false` | App Storage bucket yaratilmagan (3-qadam), yoki modul o'rnatilmagan: `npm i --no-save @replit/object-storage` |
| Logda `App Storage ulanmadi` | yuqoridagi buyruqni bajaring va qayta ishga tushiring |
| Nashrdan keyin murojaatlar yo'q | App Storage'siz nashr qilingan. Telegram'dagi oxirgi `.db.gz` dan tiklang (7-qadam) |
| Ilova uxlab qoladi | Autoscale tanlangan — Reserved VM ga o'tkazing |

---

## 10. Narx va cheklovlar — halol gap

- **Reserved VM** pullik: taxminan **$15–20/oy** (Replit Core rejasi ichidagi kredit
  bilan ko'pincha qoplanadi). Aniq narxni Replit sahifasida tekshiring — o'zgarib turadi.
- **Bepul tarif bu bot uchun yaramaydi**: ilova uxlaydi, murojaatlar qabul qilinmaydi.
- **Replit hisobi yoki to'lov to'xtasa** — bot ham, ma'lumot ham to'xtaydi.
  Telegram'dagi zaxira fayllari esa qoladi — shuning uchun ularni saqlang.
- Ko'p murojaat kutilsa yoki ma'lumot juda muhim bo'lsa, universitetning
  **o'z serveri** (VPS + nginx) ishonchliroq va arzonroq — qo'llanmasi `README.md` da.
- Replit'ning interfeysi tez-tez o'zgaradi. Tugmalar nomi boshqacha bo'lsa,
  mazmuniga qarang: *Import*, *Secrets*, *App Storage*, *Publish/Deploy*,
  *Reserved VM*, *Web server*.
