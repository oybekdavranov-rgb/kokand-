# Telegram AI Agent — Professional Arxitektura

> **Maqsad:** Bitta buyruq bilan (`"Bugungi IT yangiliklarini 5 ta Telegram kanaliga joyla"`)
> avtonom ishlaydigan AI agent: yangilik topadi → professional post yozadi → rasm yaratadi →
> foydalanuvchi Telegram akkaunti orqali kanallarga joylaydi → vaqt bo'yicha rejalashtiradi →
> 24/7 VPS'da ishlaydi.

**Texnologiyalar:** Python · FastAPI · Telethon · Claude API · Image AI · PostgreSQL · Redis · Celery · Docker · Ubuntu VPS

---

## 1. To'liq Arxitektura (Umumiy ko'rinish)

Tizim **microservice ruhidagi modular monolit** sifatida quriladi: bitta kod bazasi, lekin
aniq ajratilgan qatlamlar va mustaqil ishga tushuvchi jarayonlar (API, worker, scheduler).

```
                          ┌──────────────────────────────────────────────┐
                          │              FOYDALANUVCHI                     │
                          │  (Siz — buyruq beruvchi / admin)               │
                          │  "Bugungi IT yangiliklarini 5 kanalga joyla"   │
                          └───────────────────────┬────────────────────────┘
                                                  │  REST / Telegram Bot / Web UI
                                                  ▼
            ┌─────────────────────────────────────────────────────────────────┐
            │                    CONTROL PLANE  (FastAPI)                       │
            │  • REST API (buyruq qabul qilish, holat, tasdiqlash)              │
            │  • Auth (JWT / API key)                                           │
            │  • Webhook (Telegram bot bilan buyruq berish — ixtiyoriy)         │
            │  • Vazifani parchalaydi va navbatga (queue) qo'yadi               │
            └───────────────────────────────┬─────────────────────────────────┘
                                            │  enqueue (Redis broker)
                                            ▼
            ┌─────────────────────────────────────────────────────────────────┐
            │                 ORCHESTRATOR / AGENT CORE                         │
            │  "Miya" — buyruqni bosqichlarga bo'ladi va pipeline'ni boshqaradi │
            │  State machine: NEW → COLLECTING → GENERATING → REVIEW →          │
            │                 SCHEDULED → PUBLISHING → DONE / FAILED            │
            └───┬───────────┬───────────┬───────────┬────────────┬─────────────┘
                │           │           │           │            │
                ▼           ▼           ▼           ▼            ▼
        ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐
        │  NEWS     │ │ CONTENT  │ │  IMAGE   │ │SCHEDULER│ │  PUBLISHER   │
        │ COLLECTOR │ │GENERATOR │ │GENERATOR │ │ (Beat)  │ │ (Telethon)   │
        │           │ │ (Claude) │ │(Image AI)│ │         │ │ user akkaunt │
        │ RSS/API/  │ │ post     │ │ banner/  │ │ vaqt    │ │ → kanallarga │
        │ scraping  │ │ matni    │ │ rasm     │ │ bo'yicha│ │   joylaydi   │
        └─────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ └──────┬───────┘
              │            │            │            │             │
              └────────────┴────────────┴─────┬──────┴─────────────┘
                                              │  (barcha holat + natija)
                          ┌───────────────────┴───────────────────┐
                          ▼                                        ▼
                 ┌─────────────────┐                     ┌──────────────────┐
                 │   PostgreSQL    │                     │      Redis       │
                 │ (doimiy saqlash)│                     │ broker + cache + │
                 │ posts, channels,│                     │ dedup + rate-lim │
                 │ news, logs...   │                     │ + FloodWait tracker
                 └─────────────────┘                     └──────────────────┘
```

### Ishlash prinsipi qisqacha
1. **Siz buyruq berasiz** (REST API yoki maxsus Telegram bot orqali).
2. **FastAPI** buyruqni qabul qiladi, `agent_task` yaratadi va Redis navbatiga qo'yadi.
3. **Orchestrator (Celery worker)** vazifani bosqichlarga bo'ladi.
4. **News Collector** bugungi IT yangiliklarni yig'adi va takrorlarni tozalaydi (dedup).
5. **Content Generator (Claude API)** har bir kanal uslubiga mos professional post yozadi.
6. **Image Generator (Image AI)** postga mos banner/rasm yaratadi.
7. (Ixtiyoriy) **Review** — siz tasdiqlaguningizcha kutadi (auto-publish rejimini yoqsangiz kutmaydi).
8. **Scheduler** postlarni belgilangan vaqtga rejalashtiradi.
9. **Publisher (Telethon)** sizning akkauntingiz orqali kanallarga joylaydi (FloodWait/rate-limit himoyasi bilan).
10. Har bir bosqich **PostgreSQL**'ga log/holat yozadi.

---

## 2. Komponentlar Bog'lanishi (Batafsil)

| # | Komponent | Vazifa | Kirish (Input) | Chiqish (Output) | Bog'lanish |
|---|-----------|--------|----------------|------------------|-----------|
| 1 | **FastAPI (API Gateway)** | Buyruq qabul qilish, auth, holat kuzatuvi | HTTP so'rov / bot komandasi | `agent_task` (DB) + queue job | → Redis, → PostgreSQL |
| 2 | **Orchestrator (Agent Core)** | Pipeline'ni boshqarish, state machine | `agent_task` | bosqichma-bosqich sub-tasklar | Celery worker; barcha servislarni chaqiradi |
| 3 | **News Collector** | Yangilik yig'ish + dedup | manba ro'yxati (RSS/API) | `news_items` | RSS/NewsAPI/HTTP → PostgreSQL, dedup uchun Redis |
| 4 | **Content Generator** | Claude bilan post matni | `news_item` + kanal uslubi (prompt template) | `post` (matn, hashtag) | Claude API (Anthropic) → PostgreSQL |
| 5 | **Image Generator** | Rasm/banner yaratish | post sarlavhasi/kalit so'z | `media_asset` (fayl yo'li/URL) | Image AI API → object storage / disk |
| 6 | **Scheduler (Celery Beat)** | Vaqt bo'yicha ishga tushirish | `schedules` jadvali | `publish` jobini enqueue | Redis beat → worker |
| 7 | **Publisher (Telethon)** | Kanalga joylash (user akkaunt) | tayyor `post` + `media` + `channel` | Telegram xabar ID | Telethon (MTProto) → Telegram; natija → PostgreSQL |
| 8 | **PostgreSQL** | Doimiy ma'lumot | barcha servislar | — | Markaziy saqlash |
| 9 | **Redis** | Broker + cache + dedup + rate-limit | — | — | Celery broker, FloodWait tracker |
| 10 | **Monitoring** | Log, metrika, alert | barcha servis loglari | dashboard / alert | Flower + structlog (+ Sentry ixtiyoriy) |

### Komponentlararo aloqa qoidalari
- Servislar **bir-birini to'g'ridan-to'g'ri chaqirmaydi** — hammasi Orchestrator orqali va Redis navbat orqali.
- Har bir og'ir (I/O yoki AI) operatsiya **alohida Celery task** — retry, timeout, idempotentlik bilan.
- **Telethon klienti bitta joyda** (Publisher worker) — session konflikt bo'lmasligi uchun. Ideal holda **1 ta akkaunt = 1 ta ishlaydigan Telethon jarayoni**.

---

## 3. Pipeline (Ma'lumotlar Oqimi — bosqichma-bosqich)

```
BUYRUQ
  │
  ▼
[agent_task: NEW] ──► Orchestrator qabul qildi
  │
  ▼
① COLLECTING ─ News Collector
  • Manbalardan (RSS/NewsAPI/scrape) bugungi IT yangiliklar
  • Til/mavzu filtri (IT, dublikatlarni Redis-set orqali tashlash)
  • Saqlash: news_items (status=fetched)
  │
  ▼
② RANKING ─ Eng yaxshi N ta yangilikni tanlash
  • Ahamiyat, yangilik, manba ishonchi bo'yicha ball
  • Claude'dan "eng muhim 5 tasi" ni tanlashni ham so'rasa bo'ladi
  │
  ▼
③ GENERATING (matn) ─ Content Generator (Claude)
  • Har kanal uchun uslub (tone/til/uzunlik) — prompt template
  • Post: sarlavha + matn + hashtag + manba havolasi
  • Saqlash: posts (status=draft)
  │
  ▼
④ GENERATING (rasm) ─ Image Generator
  • Post mavzusiga mos banner (o'lcham, brend rangi)
  • Saqlash: media_assets, postga bog'lash
  │
  ▼
⑤ REVIEW (ixtiyoriy) ─ Inson tasdig'i
  • auto_publish=false bo'lsa: Telegram botga preview yuboriladi
  • Tasdiq / rad / tahrir → posts (status=approved|rejected)
  │
  ▼
⑥ SCHEDULING ─ Scheduler
  • Har kanal uchun vaqt (masalan, 09:00, 12:00, 15:00...)
  • Kanallararo 30–90s tasodifiy pauza (spam ko'rinmaslik uchun)
  • Saqlash: schedules (run_at, status=pending)
  │
  ▼
⑦ PUBLISHING ─ Publisher (Telethon)
  • Belgilangan vaqtda: kanalga matn + rasm joylash
  • FloodWait/rate-limit boshqaruvi, retry
  • Saqlash: post_targets (status=published, telegram_message_id)
  │
  ▼
[agent_task: DONE] ──► Yakuniy hisobot (nechta post, nechta kanal, xatolar)
```

**Xatolik bo'lsa:** har bosqich `FAILED` holatiga o'tadi, xato `publish_logs`'ga yoziladi,
exponential backoff bilan retry qilinadi; muhim xatoda sizga alert boradi.

---

## 4. Database Tuzilishi (PostgreSQL)

Asosiy jadvallar va bog'lanishlar:

```
users ─┐
       ├─< telegram_accounts ─┐
       │                      └─< channels >─┐
       │                                     │
agent_tasks ─< news_items                    │
       │                                     │
       └─< posts ─┬─< post_targets >─────────┘   (post ↔ channel M:N)
                  ├─< media_assets
                  └─< schedules ─< publish_logs
news_sources ─────────────────────────────► (news_items manbasi)
```

### 4.1. `users` — tizim operatorlari
```sql
id            BIGSERIAL PK
email         TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
role          TEXT DEFAULT 'admin'      -- admin | operator
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ DEFAULT now()
```

### 4.2. `telegram_accounts` — Telethon sessiyalari (user akkaunt)
```sql
id             BIGSERIAL PK
user_id        BIGINT FK → users(id)
label          TEXT                     -- "asosiy akkaunt"
phone          TEXT
api_id         INTEGER                  -- my.telegram.org dan
api_hash       TEXT                     -- SHIFRLANGAN saqlanadi
session_string TEXT                     -- SHIFRLANGAN (StringSession)
is_active      BOOLEAN DEFAULT true
last_used_at   TIMESTAMPTZ
created_at     TIMESTAMPTZ DEFAULT now()
```
> ⚠️ `api_hash` va `session_string` — **shifrlangan** (Fernet/KMS) holda. Hech qachon ochiq/repoda emas.

### 4.3. `channels` — nishon kanallar
```sql
id             BIGSERIAL PK
account_id     BIGINT FK → telegram_accounts(id)
title          TEXT NOT NULL
tg_username    TEXT                     -- @kanal (ixtiyoriy)
tg_channel_id  BIGINT                   -- -100... raqamli ID
tone           TEXT DEFAULT 'professional'  -- kanal uslubi
language        TEXT DEFAULT 'uz'
post_template  TEXT                     -- kanalga xos prompt shabloni
is_active      BOOLEAN DEFAULT true
created_at     TIMESTAMPTZ DEFAULT now()
```

### 4.4. `news_sources` — yangilik manbalari
```sql
id           BIGSERIAL PK
name         TEXT NOT NULL             -- "The Verge", "TechCrunch"
type         TEXT NOT NULL             -- rss | api | scrape
url          TEXT NOT NULL
category     TEXT DEFAULT 'it'
weight       REAL DEFAULT 1.0          -- ishonch/ahamiyat vazni
is_active    BOOLEAN DEFAULT true
last_fetched TIMESTAMPTZ
```

### 4.5. `news_items` — yig'ilgan xom yangiliklar
```sql
id            BIGSERIAL PK
source_id     BIGINT FK → news_sources(id)
task_id       BIGINT FK → agent_tasks(id)
title         TEXT NOT NULL
summary       TEXT
url           TEXT
content_hash  TEXT UNIQUE               -- dedup uchun (title+url hash)
published_at  TIMESTAMPTZ
score         REAL                      -- ranking bali
status        TEXT DEFAULT 'fetched'    -- fetched | selected | discarded
created_at    TIMESTAMPTZ DEFAULT now()
```

### 4.6. `agent_tasks` — yuqori darajali buyruqlar
```sql
id           BIGSERIAL PK
user_id      BIGINT FK → users(id)
command      TEXT NOT NULL             -- asl buyruq matni
params       JSONB                     -- {topic:"IT", channels:[...], count:5}
status       TEXT DEFAULT 'new'        -- new|collecting|generating|review|scheduled|publishing|done|failed
auto_publish BOOLEAN DEFAULT false
error        TEXT
created_at   TIMESTAMPTZ DEFAULT now()
updated_at   TIMESTAMPTZ DEFAULT now()
```

### 4.7. `posts` — yaratilgan postlar
```sql
id           BIGSERIAL PK
task_id      BIGINT FK → agent_tasks(id)
news_item_id BIGINT FK → news_items(id)
title        TEXT
body         TEXT NOT NULL             -- tayyor post matni
hashtags     TEXT[]
source_url   TEXT
model        TEXT                      -- ishlatilgan Claude modeli
status       TEXT DEFAULT 'draft'      -- draft|approved|rejected|published
created_at   TIMESTAMPTZ DEFAULT now()
```

### 4.8. `media_assets` — yaratilgan rasmlar
```sql
id          BIGSERIAL PK
post_id     BIGINT FK → posts(id)
type        TEXT DEFAULT 'image'      -- image | video
provider    TEXT                      -- qaysi Image AI
prompt      TEXT
storage_url TEXT                      -- disk yo'li yoki S3 URL
width       INTEGER
height      INTEGER
created_at  TIMESTAMPTZ DEFAULT now()
```

### 4.9. `post_targets` — post ↔ kanal (M:N) + har kanal holati
```sql
id                  BIGSERIAL PK
post_id             BIGINT FK → posts(id)
channel_id          BIGINT FK → channels(id)
status              TEXT DEFAULT 'pending'  -- pending|scheduled|published|failed
telegram_message_id BIGINT                  -- joylangandan keyin
published_at        TIMESTAMPTZ
error               TEXT
UNIQUE(post_id, channel_id)
```

### 4.10. `schedules` — rejalashtirilgan joylashlar
```sql
id             BIGSERIAL PK
post_target_id BIGINT FK → post_targets(id)
run_at         TIMESTAMPTZ NOT NULL     -- qachon joylanadi
status         TEXT DEFAULT 'pending'   -- pending|running|done|failed
attempts       INTEGER DEFAULT 0
created_at     TIMESTAMPTZ DEFAULT now()
```

### 4.11. `publish_logs` — audit / kuzatuv
```sql
id             BIGSERIAL PK
post_target_id BIGINT FK → post_targets(id)
level          TEXT                     -- info | warning | error
message        TEXT
meta           JSONB                    -- FloodWait sekund, retry raqami...
created_at     TIMESTAMPTZ DEFAULT now()
```

**Indekslar (muhim):** `news_items(content_hash)`, `agent_tasks(status)`,
`schedules(run_at, status)`, `post_targets(status)`, `posts(task_id)`.

---

## 5. Server Ishlash Sxemasi (Deployment — Ubuntu VPS + Docker)

Barcha servislar **Docker Compose** bilan konteynerda, 24/7 avtomatik qayta ishga tushish (`restart: always`) bilan.

```
                          Internet
                             │
                             ▼
              ┌──────────────────────────────┐
              │        Nginx (reverse proxy)  │   ← TLS (Let's Encrypt), domen
              │        443 → api:8000         │
              └──────────────┬───────────────┘
                             ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                     Docker Compose network                    │
   │                                                               │
   │  ┌────────────┐   ┌───────────────┐   ┌────────────────────┐ │
   │  │   api      │   │   worker      │   │   beat (scheduler) │ │
   │  │ FastAPI +  │   │ Celery worker │   │  Celery Beat       │ │
   │  │ uvicorn/   │   │ (news, gen,   │   │  (vaqt bo'yicha    │ │
   │  │ gunicorn   │   │  publish...)  │   │   joblarni tashlab │ │
   │  │            │   │  + Telethon   │   │   turadi)          │ │
   │  └─────┬──────┘   └──────┬────────┘   └─────────┬──────────┘ │
   │        │                 │                      │            │
   │        └────────┬────────┴──────────┬───────────┘            │
   │                 ▼                    ▼                        │
   │        ┌─────────────────┐   ┌─────────────────┐             │
   │        │   postgres:16   │   │    redis:7      │             │
   │        │  (volume: db)   │   │ (broker+cache)  │             │
   │        └─────────────────┘   └─────────────────┘             │
   │                                                               │
   │  ┌────────────┐   (ixtiyoriy monitoring)                     │
   │  │  flower    │   Celery task dashboard :5555                │
   │  └────────────┘                                              │
   └───────────────────────────────────────────────────────────────┘
              │
              ▼
   ┌────────────────────────┐
   │  Volumes (doimiy disk) │  postgres_data, media_files, telethon_sessions
   └────────────────────────┘
```

### Konteynerlar (docker-compose xizmatlari)
| Servis | Rol | Restart | Scale |
|--------|-----|---------|-------|
| `nginx` | TLS termination, reverse proxy | always | 1 |
| `api` | FastAPI (gunicorn+uvicorn workers) | always | 1–2 |
| `worker` | Celery: news/content/image tasklar | always | N (yuklama bo'yicha) |
| `publisher` | Telethon publisher (alohida worker!) | always | **1** (session konflikt bo'lmasin) |
| `beat` | Celery Beat scheduler | always | **1** |
| `postgres` | Ma'lumotlar bazasi | always | 1 |
| `redis` | Broker + cache | always | 1 |
| `flower` | Monitoring (ixtiyoriy) | always | 1 |

### 24/7 ishlash kafolati
- Docker `restart: always` — konteyner yiqilsa avtomatik qayta ishga tushadi.
- VPS'da `docker compose` systemd bilan boot'da avtoyoqiladi.
- **Health-check**: har servis uchun `/health` endpoint + Docker healthcheck.
- **Backup**: har kuni `pg_dump` cron → tashqi joyga (S3/boshqa server).
- **Loglar**: `structlog` (JSON) → fayl/`docker logs` → (ixtiyoriy) Loki/Sentry.
- **Secrets**: `.env` (repoda emas) yoki Docker secrets; kalitlar shifrlangan.

---

## 6. ⚠️ Muhim Xavflar va Yechimlar (Telethon = user akkaunt)

Sizning **shaxsiy akkauntingiz** orqali avtomatik post qilish — Telegram ToS bo'yicha xavfli
(akkaunt bloklanishi mumkin). Buni jiddiy hisobga olamiz:

| Xavf | Yechim |
|------|--------|
| **FloodWait / spam blok** | Kanallararo tasodifiy 30–90s pauza; kunlik limit; `FloodWaitError` ni ushlab, kutib qayta urinish |
| **Akkaunt bani** | "Inson kabi" xatti-harakat; kunlik post soni cheklovi; kerak bo'lsa faqat **admin bo'lgan kanallarga** post |
| **2FA / sessiya yo'qolishi** | `StringSession` shifrlangan saqlanadi; qayta login oqimi; alert |
| **Session konflikt** | Bitta akkaunt = bitta ishlaydigan Telethon jarayoni (faqat `publisher` konteyner) |
| **API kalit sizishi** | `.env` repoda emas; `api_hash`, `session_string` DB'da shifrlangan (Fernet/KMS) |

> **Muqobil (tavsiya):** Agar kanallarda **o'zingiz admin** bo'lsangiz, joylashni **Telegram Bot API**
> orqali qilib, Telethon'ni faqat yangilik o'qish/monitoring uchun ishlatish — akkaunt xavfini
> keskin kamaytiradi. Ikkala rejimni ham qo'llab-quvvatlaydigan qilib loyihalaymiz (adapter pattern).

---

## 7. Papka Tuzilishi (kelajakdagi kod uchun)

```
telegram-ai-agent/
├── docs/
│   └── ARCHITECTURE.md            # (shu hujjat)
├── app/
│   ├── main.py                    # FastAPI ilova
│   ├── config.py                  # Settings (pydantic-settings)
│   ├── api/                       # REST endpointlar (routes)
│   │   ├── tasks.py               # buyruq berish / holat
│   │   ├── channels.py
│   │   └── health.py
│   ├── core/
│   │   ├── orchestrator.py        # agent "miya"si, state machine
│   │   ├── security.py            # shifrlash, JWT
│   │   └── celery_app.py          # Celery konfiguratsiya
│   ├── services/
│   │   ├── news_collector.py      # RSS/API/scrape + dedup
│   │   ├── content_generator.py   # Claude API
│   │   ├── image_generator.py     # Image AI
│   │   ├── publisher.py           # Telethon (+ Bot API adapter)
│   │   └── scheduler.py           # rejalash mantiqiy
│   ├── models/                    # SQLAlchemy modellari
│   ├── schemas/                   # Pydantic sxemalar
│   ├── db/
│   │   ├── session.py
│   │   └── migrations/            # Alembic
│   └── tasks/                     # Celery tasklar (async ish)
│       ├── collect.py
│       ├── generate.py
│       └── publish.py
├── tests/
├── .env.example
├── requirements.txt / pyproject.toml
├── Dockerfile
├── docker-compose.yml
└── alembic.ini
```

---

## 8. Professional Loyiha Rejasi (Fazalar)

### Faza 0 — Poydevor (1–2 kun)
- [ ] Repo tuzilishi, `pyproject.toml`/`requirements.txt`
- [ ] Docker + docker-compose (postgres, redis, api skeleti)
- [ ] `config.py`, `.env` sxemasi, secrets boshqaruvi
- [ ] Health endpoint + strukturaviy logging

### Faza 1 — Ma'lumotlar qatlami (2–3 kun)
- [ ] SQLAlchemy modellari (§4 dagi barcha jadvallar)
- [ ] Alembic migratsiyalar
- [ ] Repository/DAO qatlami, seed skriptlar (manbalar, kanallar)

### Faza 2 — News Collector (2–3 kun)
- [ ] RSS/NewsAPI/scrape adapterlari
- [ ] Dedup (Redis-set + `content_hash`)
- [ ] Ranking/tanlash mantiqiy
- [ ] Celery task + test

### Faza 3 — Content Generator (Claude) (2–3 kun)
- [ ] Claude API integratsiya (prompt template, kanal uslublari)
- [ ] Til (uz/ru/en), uzunlik, hashtag boshqaruvi
- [ ] Xato/limit boshqaruvi (retry, token limit)

### Faza 4 — Image Generator (2 kun)
- [ ] Image AI integratsiya, brend o'lcham/rang
- [ ] Media saqlash (disk/S3), postga bog'lash

### Faza 5 — Publisher (Telethon) (3–4 kun) ⭐ eng nozik
- [ ] Telethon login oqimi (StringSession, 2FA)
- [ ] Kanalga matn+rasm joylash
- [ ] FloodWait/rate-limit/retry, "inson kabi" pauzalar
- [ ] Bot API adapter (muqobil rejim)

### Faza 6 — Scheduler + Orchestrator (3 kun)
- [ ] Celery Beat, `schedules` bo'yicha ishga tushirish
- [ ] Orchestrator state machine (to'liq pipeline)
- [ ] Review rejimi (Telegram bot orqali tasdiqlash — ixtiyoriy)

### Faza 7 — API + boshqaruv (2 kun)
- [ ] `/tasks` (buyruq berish), `/tasks/{id}` (holat), `/channels` CRUD
- [ ] Auth (JWT), rate-limit

### Faza 8 — Deploy + Monitoring + Hardening (2–3 kun)
- [ ] Nginx + TLS, systemd autoload
- [ ] Flower/Sentry, backup cron, alerting
- [ ] Yuklama testi, xavfsizlik ko'rigi (secrets, shifrlash)

**Taxminiy jami: ~3–4 hafta** (bir kishi, to'liq bandlik).

### MVP (eng qisqa yo'l) — birinchi ishlaydigan versiya
> Faza 0 → 1 → 2 → 3 → 5 (faqat 1 kanal, auto_publish) → 6 (oddiy scheduler).
> Rasm (Faza 4) va Review keyin qo'shiladi. Bu bilan ~10 kunda "buyruq → 1 kanalga post" ishlaydi.

---

## 9. Texnologik Qarorlar (Nega shunday?)

| Tanlov | Sabab |
|--------|-------|
| **FastAPI** | Async, tez, avtomatik OpenAPI hujjat, Pydantic validatsiya |
| **Celery + Redis** | Og'ir/uzoq AI va I/O ishlarni fon rejimida, retry va scheduling bilan |
| **PostgreSQL** | JSONB + relational, ishonchli, indekslar, tranzaksiyalar |
| **Redis** | Broker + cache + dedup-set + FloodWait tracker (bir toshda uch qush) |
| **SQLAlchemy + Alembic** | Modellar + versiyalangan migratsiya |
| **Telethon** | User akkaunt (MTProto) — kanal boshqaruvi uchun to'liq imkoniyat |
| **Docker Compose** | Bir buyruq bilan barcha servis, VPS'da qayta ishlab chiqarish oson |
| **structlog + Flower/Sentry** | Kuzatuv, xatoni tez topish |

---

## 10. Keyingi Qadam

Ushbu arxitektura tasdiqlangach, kodlashni **Faza 0 → 1** dan boshlaymiz:
1. Repo skeleti + Docker Compose (postgres, redis, FastAPI health).
2. Database modellari + Alembic migratsiya.
3. So'ng News Collector → Claude → Telethon.

> **Savol siz uchun:** kanallar Bot API (siz admin) orqali ishlaydimi, yoki qat'iy user-akkaunt
> (Telethon) rejimi kerakmi? Bu Publisher dizaynini belgilaydi. Ikkalasini ham qo'llasak bo'ladi.
