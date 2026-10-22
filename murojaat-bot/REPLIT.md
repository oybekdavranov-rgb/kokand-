# Replit'da ishga tushirish va nashr qilish

Dekanat xodimi uchun qadamma-qadam qo'llanma — **kod bilish shart emas**.

> Bot Replit muhitini **o'zi taniydi** (manzil, port, domen, rejim).
> Sizdan faqat ikkita qiymat talab qilinadi: bot tokeni va chat ID.

---

## ⚠️ Bitta muhim narsa

Replit'da **nashr qilingan ilovaning fayl tizimi saqlanmaydi** — har "Publish"da
u toza holatga qaytadi ([Replit hujjati](https://docs.replit.com/cloud-services/deployments/troubleshooting):
*"the file system in published apps is not persistent and resets every time you publish"*).

Bu botda bunga uch qavat javob bor:

| Himoya | Nima qiladi |
|---|---|
| **Telegram chati** | murojaatlar va javoblar dekanat chatida qoladi — bu asosiy arxiv |
| **App Storage** | baza nusxasi Replit'ning tashqi xotirasida; ishga tushishda **avtomatik tiklanadi** |
| **Kunlik zaxira** | baza `.db.gz` fayl bo'lib dekanat chatiga yuboriladi |

Ya'ni eng yomon holatda ham murojaatlar yo'qolmaydi — ular Telegram'da turadi.

---

## 1. Loyihani Replit'ga olish

1. [replit.com](https://replit.com) ga kiring.
2. **Create App** → **Import from GitHub** → repozitoriya havolasi.
   Bir bosishli yo'l: `https://replit.com/github/<foydalanuvchi>/<repo>`
3. Arxivdan yuklasangiz: **Upload folder** → `murojaat-bot` papkasi.

Repozitoriya ildizidagi `.replit` fayli Replit'ni kerakli papkaga yo'naltiradi
va Node 22 ni tanlaydi — qo'lda sozlash shart emas.

> Shell'dagi buyruqlardan oldin kerakli papkaga o'ting: `cd murojaat-bot`
> (faqat `murojaat-bot` papkasini yuklagan bo'lsangiz — shart emas).

---

## 2. Ikkita kerakli qiymatni tayyorlash

**Bot tokeni:** Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` →
bot nomini va foydalanuvchi nomini tanlaysiz → u token beradi.

**Chat ID** (murojaatlar qayerga kelishi):
- Shaxsiy chat: [@userinfobot](https://t.me/userinfobot) ga `/start` yozing — `Id: 123456789`.
- Dekanat guruhi: botni guruhga qo'shing, guruhga biror xabar yozing va ID'ni
  [@userinfobot](https://t.me/userinfobot) orqali aniqlang (guruh ID'si `-100...`
  bilan boshlanadi). Botni **admin qilish shart emas** — murojaat kartasiga
  qilingan «reply» botga maxfiylik rejimida ham yetib boradi.

---

## 3. Secrets (maxfiy qiymatlar)

Chap paneldagi **🔒 Secrets** bo'limini oching va qo'shing:

| Kalit | Qiymat |
|---|---|
| `BOT_TOKEN` | @BotFather bergan token |
| `ADMIN_CHAT_IDS` | yuqorida aniqlagan chat ID |
| `ADMIN_USER_IDS` | panel egalari (guruh ishlatsangiz — majburiy); qolgan adminlar `/panel` → 👥 Adminlar orqali qo'shiladi |

Boshqa hech narsa shart emas — qolgan sozlamalar standart qiymatda ishlaydi.

---

## 4. App Storage (ma'lumotni saqlash)

1. Shell'da: `npm install && npm i --no-save @replit/object-storage`
2. Chap paneldagi **App Storage** (yoki **Object Storage**) → **Create bucket**.

Logda `doimiy saqlash: Replit App Storage` degan satr chiqsa — tayyor.
Chiqmasa, `⚠️ doimiy saqlash YO'Q` deb yoziladi (bu holda ham murojaatlar
Telegram chatida saqlanib qoladi, faqat raqamlar tarixi yangilanishda yo'qoladi).

---

## 5. Sinab ko'rish

**Run** tugmasini bosing. Logda:

```
bot "polling" rejimida ishga tushdi: @sizning_botingiz
murojaatlar shu chatlarga boradi: 123456789
rejim: production · muhit: Replit (doimiy saqlash yoqilgan)
```

Tekshiring:
1. Botga `/start` yozing → salomlashish keladi.
2. Murojaat matnini yozing → raqam (`MR-2026-0001`) qaytadi.
3. Dekanat chatiga murojaat kartasi tushadi.
4. O'sha kartaga **«reply»** qilib javob yozing → javob fuqaroga boradi.

---

## 6. Nashr qilish (Publish)

1. **Publish** tugmasi.
2. **Reserved VM** ni tanlang.
   *Autoscale tanlamang:* u 15 daqiqa harakatsizlikdan keyin uxlaydi —
   polling uziladi, kunlik xulosa ham ishlamaydi.
3. **0.5 vCPU / 2 GiB**, rejim: **Web server** (holat tekshiruvi port tinglaydi).
4. Publish oynasidagi **Secrets** ro'yxatida qiymatlar borligini tekshiring —
   nashr uchun ular alohida saqlanadi.
5. **Publish**.

Nashrdan keyin: `https://<nom>.replit.app/healthz` → `{"ok":true,...}`.
Bu manzilda boshqa hech narsa yo'q — botda web-panel yo'q.

> Secrets'ni keyin o'zgartirsangiz, **qayta nashr qiling** — yangi qiymatlar
> shundan keyin kuchga kiradi.

---

## 7. Zaxira va tiklash

Bot har kuni dekanat chatiga `murojaat-....db.gz` yuboradi (`/zaxira` bilan
istalgan vaqtda ham). Tiklash kerak bo'lsa:

1. Faylni Telegram'dan yuklab oling va Replit fayl ro'yxatiga tashlang.
2. Shell: `npm run restore -- murojaat-2026-10-21-09-00.db.gz`
3. **Stop → Run** (yoki qayta nashr).

---

## 8. Muammolar

| Belgi | Yechim |
|---|---|
| `⛔️ Sozlamalarda xato` | logda qaysi Secret yetishmayotgani yozilgan |
| Bot javob bermayapti | `BOT_TOKEN` xato (log: `401 Unauthorized`), yoki Secrets o'zgartirilib qayta nashr qilinmagan |
| Murojaat dekanatga kelmayapti | `ADMIN_CHAT_IDS` noto'g'ri; guruh bo'lsa bot guruhga qo'shilganmi |
| Guruhda javob ishlamaydi | javobni murojaat kartasiga **«reply»** qilib yozing yoki `/javob MR-… matn` |
| «Sizda huquq yo'q» | `ADMIN_USER_IDS` ga o'z ID'ingizni qo'shing (yoki bu kalitni umuman olib tashlang) |
| `storage: false` | 4-qadam bajarilmagan |
| `better-sqlite3` xatosi | Shell: `npm rebuild better-sqlite3 --build-from-source` |
| Ilova uxlab qoladi | Autoscale tanlangan — Reserved VM ga o'ting |

---

## 9. Narx va cheklovlar — halol gap

- **Reserved VM** pullik: taxminan **$15–20/oy** (Replit Core rejasidagi kredit
  ko'pincha qoplaydi). Aniq narx Replit sahifasida — o'zgarib turadi.
- **Bepul tarif bu bot uchun yaramaydi**: ilova uxlaydi va murojaat qabul qilinmaydi.
- Replit hisobi yoki to'lov to'xtasa, bot ham to'xtaydi — lekin murojaatlar
  dekanat chatida qoladi.
- Uzoq muddatga universitetning o'z serveri (VPS) arzonroq va ishonchliroq:
  polling rejimida domen ham, nginx ham kerak emas — `README.md`, 4-A bo'limi.
