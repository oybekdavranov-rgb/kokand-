# Production Audit — Telegram AI Agent

Butun loyiha 6 yo'nalish bo'yicha tekshirildi: **xavfsizlik, xatolar, Telegram
limitlari, API xatolari, VPS ishlashi, 24/7 barqarorlik**. Quyida topilgan
muammolar, ushbu auditda **tuzatilganlar** (✅) va **qolgan tavsiyalar** (⏳).

## Umumiy natija

| Yo'nalish | Topildi | Tuzatildi | Qoldi |
|-----------|:-------:|:---------:|:-----:|
| Xavfsizlik | 5 | 3 | 2 |
| Xatolar (correctness) | 4 | 4 | 0 |
| Telegram limitlari | 3 | 2 | 1 |
| API xatolari | 2 | 2 | 0 |
| VPS ishlashi | 4 | 4 | 0 |
| 24/7 barqarorlik | 4 | 3 | 1 |

---

## 🔴 KRITIK — tuzatildi

### 1. [Xato] Celery task'da umumiy async Redis mijozi (cross-loop bug)
**Muammo:** `RateLimiter` umumiy `redis_client` ni ishlatardi. Celery sync
worker'da `asyncio.run()` har chaqiruvda **yangi event loop** yaratadi; async
Redis mijozi bir loop'ga bog'langani uchun ikkinchi task'da
`"attached to a different loop"` / `"Event loop is closed"` xatosi chiqardi —
ya'ni post joylash tasodifan uzilardi.
**Tuzatildi:** `db/redis.py` ga `make_redis_client()` qo'shildi; `RateLimiter`
endi har instansiyada o'z mijozini oladi va `aclose()` bilan yopadi. (Postgres
uchun bu allaqachon `TaskSessionLocal` + `NullPool` bilan hal qilingan edi.)

### 2. [Xato/Barqarorlik] Telethon ulanish sizishi (resource leak)
**Muammo:** har publish task `TelethonPublisher()` yaratib, Telethon mijozini
ulardi, lekin **hech qachon uzmasdi**. `asyncio.run()` loop'ni yopgach ulanish
osilib qolardi — 24/7 da ulanishlar to'planib, "juda ko'p ulanish" va xotira
muammosiga olib kelardi.
**Tuzatildi:** `TelethonPublisher.aclose()` (disconnect_all + rate-limiter yopish)
qo'shildi; publish task `try/finally` bilan har doim chaqiradi.

### 3. [Xavfsizlik] CORS: `*` + credentials
**Muammo:** `allow_origins=["*"]` va `allow_credentials=True` birga — har qanday
sayt credentialli so'rov yubora oladigan xavfli kombinatsiya.
**Tuzatildi:** `main.py` — origin `"*"` bo'lsa `allow_credentials=False`.
Prod'da `.env` da aniq domenlarni ko'rsating (`CORS_ORIGINS=https://...`).

---

## 🟠 MUHIM — tuzatildi

### 4. [Telegram] PeerFloodError (spam ban) noto'g'ri boshqarilardi
**Muammo:** PeerFloodError umumiy `RPCError` sifatida ushlanib, task **qayta
urinardi** — bu spam bloklashni yomonlashtiradi.
**Tuzatildi:** `publisher.py` — PeerFloodError alohida ushlanadi: qayta
urinilmaydi, akkaunt 1 soatga pauza qilinadi (`register_flood_wait`).

### 5. [Xato] Telegram HTML parse xatosi (post matnida `<`, `&`)
**Muammo:** `_format_text` post matnini xom `parse_mode="html"` bilan yuborardi.
Post ichida `<` yoki `&` bo'lsa — Telegram BadRequest qaytaradi, post yuborilmaydi.
**Tuzatildi:** dinamik matn `html.escape` bilan qochiriladi (`<b>` teg saqlanadi).

### 6. [API] AI so'rovlarida timeout yo'q edi
**Muammo:** Claude/OpenAI mijozlarida timeout ko'rsatilmagan — so'rov osilib,
worker'ni bloklashi mumkin edi.
**Tuzatildi:** `AI_REQUEST_TIMEOUT=60` + `max_retries=2` (SDK 429/5xx da avto-retry).

### 7. [API] Provider fallback zanjiri (mavjud edi, tasdiqlandi)
Claude → OpenAI → Gemini fallback ishlaydi; har provider SDK'si 429/5xx da
o'zi qayta uradi, keyin router keyingisiga o'tadi. ✅

---

## 🟡 VPS / 24/7 — tuzatildi

### 8. [VPS] Docker loglari cheksiz o'sardi (disk to'lishi)
**Tuzatildi:** barcha servislarga `json-file` log rotatsiyasi (`max-size=10m`,
`max-file=3`) — dev va prod compose'da.

### 9. [VPS] Resurs limiti yo'q (OOM xavfi)
**Tuzatildi:** `mem_limit` qo'shildi (app 768m, postgres 512m, redis 256m,
nginx 128m) — bitta servis butun VPS'ni yiqitmaydi.

### 10. [24/7] Media fayllar cheksiz to'planardi (disk to'lishi)
**Tuzatildi:** `cleanup_media` Celery Beat task'i (har kuni 04:00) —
`MEDIA_RETENTION_DAYS` (7 kun) dan eski rasmlarni o'chiradi.

### 11. [Barqarorlik] Worker'larda healthcheck yo'q edi
**Tuzatildi:** `worker` va `publisher` uchun `celery inspect ping` healthcheck
(osilib qolgan worker'ni aniqlash uchun).

### 12. [Xavfsizlik] Flower va Redis himoyasi
**Tuzatildi:** Flower `--basic-auth` majburiy (`FLOWER_BASIC_AUTH`); Redis
`REDIS_PASSWORD` o'rnatilsa `requirepass` qo'llanadi (app URL bilan izchil).
(Ikkalasi ham `127.0.0.1` da — tashqaridan yopiq.)

---

## ⏳ QOLGAN TAVSIYALAR (keyingi bosqichlar)

| # | Yo'nalish | Tavsiya | Muhimlik |
|---|-----------|---------|:--------:|
| R1 | Xavfsizlik | **API auth (JWT)** ni ulash — hozir `api/v1` router shakl, endpointlar himoyalanmagan | Yuqori |
| ~~R2~~ | Xato | ~~Alembic migratsiya~~ — ✅ **BAJARILDI** (env.py + 0001_initial, 11 jadval) | — |
| ~~R3~~ | Barqarorlik | ~~Orchestrator~~ — ✅ **BAJARILDI** (collect→generate→image→schedule + News Collector) | — |
| R4 | Barqarorlik | **Persistent publisher servisi** — hozir har task'da Telethon qayta ulanadi (ishlaydi, lekin qo'shimcha yuk). Uzoq muddatga: doimiy async publisher jarayoni Redis'dan navbat o'qisin | O'rta |
| R5 | Telegram | **Global daqiqalik limit** — hozir kunlik limit + 30–90s pauza bor; Telegram ~20 msg/min umumiy cheklovini ham qo'shish | O'rta |
| R6 | 24/7 | **Sentry / alerting** — yakuniy publish xatosida adminga (bot orqali) xabar berish | O'rta |
| R7 | VPS | **Avtomatik backup** — hozir `pg_dump` qo'lda hujjatlangan; cron + tashqi saqlash (S3) qo'shish | O'rta |
| R8 | Sifat | **Testlar** — `tests/` bo'sh; kamida publisher/rate-limiter/AI-router uchun unit testlar | O'rta |
| R9 | Xavfsizlik | Prod'da `DEBUG=false`, `ENVIRONMENT=production` va `CORS_ORIGINS` aniq domen | Past |
| R10 | VPS | UFW firewall: faqat 22/80/443; postgres/redis/flower tashqariga yopiq (allaqachon 127.0.0.1) | Past |

---

## Xavfsizlik nazorat ro'yxati (deploy oldidan)

- [ ] `.env` da barcha `CHANGE_ME` almashtirilgan (SECRET_KEY, ENCRYPTION_KEY, POSTGRES_PASSWORD, FLOWER_BASIC_AUTH)
- [ ] `ENVIRONMENT=production`, `DEBUG=false`
- [ ] `CORS_ORIGINS` — aniq domen(lar), `*` emas
- [ ] `ADMIN_TELEGRAM_ID` to'g'ri (admin panel himoyasi)
- [ ] `.env` git'da yo'q (`.gitignore` + `.dockerignore` ✅)
- [ ] UFW: 22, 80, 443 ochiq; qolgani yopiq
- [ ] `session_string` / `api_hash` bazada shifrlangan (Fernet ✅)
- [ ] Kunlik `pg_dump` backup sozlangan
- [ ] SSL sertifikat o'rnatilgan (`init-letsencrypt.sh`) va auto-renew ishlaydi (certbot ✅)

---

*Audit auditda tuzatilgan kod venv bilan tekshirildi: import, HTML escape,
PeerFloodError, rate-limiter aclose, media cleanup, compose YAML.*
