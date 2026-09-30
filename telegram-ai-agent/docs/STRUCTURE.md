# Loyiha Strukturasi — Har bir papka va fayl vazifasi

> Production darajadagi **Python 3.12 · FastAPI · Telethon · Celery · PostgreSQL · Redis · Docker** loyihasi skeleti.
> Fayllar hozircha **bo'sh placeholder** (faqat maqsadini bildiruvchi docstring/izoh) — kod keyingi bosqichda yoziladi.
> Arxitektura asosi uchun qarang: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Umumiy qatlamlar (nega shunday bo'lingan)

Loyiha **qatlamli (layered) arxitektura** asosida:

```
API (HTTP)  →  Services (biznes mantiq)  →  Repositories (DAO)  →  Models (DB)
     ▲                    ▲
   Schemas            Celery tasks (fon ish)
  (Pydantic)         Core (umumiy: auth, log, celery)
```

- **API** faqat so'rovni qabul qiladi/tekshiradi — biznes mantiq yo'q.
- **Services** — asosiy mantiq (agent, news, ai, image, telegram, scheduler).
- **Repositories** — bazaga kirishning yagona joyi (SQL shu yerda).
- **Models/Schemas** — ma'lumot shakli (DB tomoni / API tomoni).
- **Tasks** — og'ir/uzoq ishlar Celery orqali fon rejimda.

---

## To'liq daraxt + izohlar

```
telegram-ai-agent/
├── docs/                      # Loyiha hujjatlari
│   ├── ARCHITECTURE.md        #   tizim arxitekturasi, DB, deploy sxemasi
│   └── STRUCTURE.md           #   (shu fayl) papka/fayl vazifalari
│
├── app/                       # ⭐ Asosiy ilova kodi (Python paketi)
│   ├── __init__.py
│   ├── main.py                # FastAPI ilova kirish nuqtasi: app yaratish, router va lifespan ulash
│   ├── config.py              # Settings — .env dan barcha sozlamalar (pydantic-settings)
│   ├── constants.py           # Global Enum/konstantalar: TaskStatus, PublishMode, limitlar
│   │
│   ├── api/                   # 🌐 HTTP qatlam (Control Plane)
│   │   ├── deps.py            #   umumiy dependency: DB sessiya, joriy user (auth), pagination
│   │   ├── router.py          #   barcha v1 router'larni bitta joyga yig'uvchi agregator
│   │   └── v1/                #   API versiya 1 endpointlari
│   │       ├── auth.py        #     login → JWT token, token tekshirish
│   │       ├── tasks.py       #     POST /tasks (buyruq berish), GET /tasks/{id} (holat) ← asosiy kirish
│   │       ├── channels.py    #     kanallar CRUD (qo'shish/ro'yxat/tahrir/o'chirish)
│   │       ├── posts.py       #     post preview, tasdiqlash/rad etish, qayta yaratish
│   │       ├── accounts.py    #     Telegram akkaunt qo'shish, login holati
│   │       └── health.py      #     /health, /readiness (DB, Redis, Telethon tekshiruvi)
│   │
│   ├── core/                  # 🔧 Kesishuvchi (cross-cutting) qatlam
│   │   ├── security.py        #   JWT yaratish/tekshirish; Fernet bilan maxfiy ma'lumot shifrlash
│   │   ├── logging.py         #   structlog sozlamasi (JSON log, request_id korrelyatsiya)
│   │   ├── celery_app.py      #   Celery nusxasi: broker=Redis, task marshrutlari, timeout
│   │   ├── exceptions.py      #   maxsus xatolik klasslari + FastAPI exception handlerlar
│   │   └── lifespan.py        #   startup/shutdown: ulanishlarni ochish/yopish
│   │
│   ├── db/                    # 🗄️ Ma'lumotlar ulanishi
│   │   ├── base.py            #   SQLAlchemy Declarative Base + metadata
│   │   ├── session.py         #   async engine + sessiya fabrikasi (get_session)
│   │   ├── redis.py           #   Redis mijoz (cache, dedup-set, rate-limit)
│   │   └── migrations/        #   Alembic migratsiyalari
│   │       ├── env.py         #     modellardan avtomatik migratsiya muhiti
│   │       ├── script.py.mako #     migratsiya fayl shabloni
│   │       └── versions/      #     har bir migratsiya versiyasi shu yerda
│   │
│   ├── models/                # 🧱 SQLAlchemy ORM modellari (DB jadvallari = ARCHITECTURE.md §4)
│   │   ├── user.py            #   users — operatorlar
│   │   ├── telegram_account.py#   telegram_accounts — Telethon sessiya (session_string SHIFRLANGAN)
│   │   ├── channel.py         #   channels — nishon kanallar (uslub/til/shablon)
│   │   ├── news_source.py     #   news_sources — RSS/API/scrape manbalari
│   │   ├── news_item.py       #   news_items — xom yangilik (content_hash dedup)
│   │   ├── agent_task.py      #   agent_tasks — yuqori buyruq + holat (state machine)
│   │   ├── post.py            #   posts — yaratilgan post matni
│   │   ├── media_asset.py     #   media_assets — yaratilgan rasmlar
│   │   ├── post_target.py     #   post_targets — post↔kanal (M:N) + har kanal holati
│   │   ├── schedule.py        #   schedules — rejalashtirilgan joylashlar (run_at)
│   │   └── publish_log.py     #   publish_logs — audit/kuzatuv loglari
│   │
│   ├── schemas/               # 📦 Pydantic DTO (API kirish/chiqish shakli)
│   │   ├── common.py          #   pagination, ORMBase, xatolik javobi
│   │   ├── auth.py            #   LoginRequest, TokenResponse
│   │   ├── task.py            #   TaskCreate (buyruq), TaskRead (holat)
│   │   ├── channel.py         #   ChannelCreate/Read/Update
│   │   ├── post.py            #   PostRead, PostApprove, MediaRead
│   │   └── account.py         #   AccountCreate/Read (maxfiy maydonlarsiz — xavfsizlik)
│   │
│   ├── repositories/          # 🔌 DAO — bazaga kirishning yagona joyi
│   │   ├── base.py            #   generic CRUD (get/list/create/update/delete)
│   │   ├── task_repo.py       #   agent_tasks
│   │   ├── channel_repo.py    #   channels
│   │   ├── news_repo.py       #   news_items/news_sources
│   │   ├── post_repo.py       #   posts/post_targets/media_assets
│   │   └── schedule_repo.py   #   schedules
│   │
│   ├── services/             # 🧠 Biznes mantiq (asosiy modullar)
│   │   ├── orchestrator.py    #   ⭐ Agent "miya"si — pipeline state machine, bosqichlarni boshqarish
│   │   │
│   │   ├── news/              # 📰 News moduli
│   │   │   ├── collector.py   #     manbalardan yangilik yig'ish, filtr, saqlash
│   │   │   ├── deduplicator.py#     dublikatlarni aniqlash (content_hash + Redis-set)
│   │   │   ├── ranker.py      #     ahamiyat/yangilik/manba vazni bo'yicha saralash
│   │   │   └── sources/       #     manba adapterlari (interfeys + implementatsiyalar)
│   │   │       ├── base.py            # NewsSource abstrakt interfeys (fetch() shartnomasi)
│   │   │       ├── rss_source.py      # RSS o'qish adapteri
│   │   │       ├── newsapi_source.py  # NewsAPI kabi API adapteri
│   │   │       └── scraper_source.py  # HTML scrape adapteri
│   │   │
│   │   ├── ai/                # 🤖 AI moduli (Claude)
│   │   │   ├── client.py            # Claude API o'ramchi: so'rov, retry, token/limit
│   │   │   ├── content_generator.py # yangilikdan kanal uslubiga mos post matni
│   │   │   ├── selector.py          # AI bilan eng muhim N yangilikni tanlash (ixtiyoriy)
│   │   │   └── prompts/             # prompt shablonlari (til bo'yicha)
│   │   │       ├── post_uz.txt      #   o'zbekcha
│   │   │       ├── post_ru.txt      #   ruscha
│   │   │       └── post_en.txt      #   inglizcha
│   │   │
│   │   ├── image/             # 🖼️ Image generator moduli
│   │   │   ├── generator.py         # postga mos rasm yaratish (provider tanlash)
│   │   │   ├── storage.py           # rasmni saqlash (lokal/S3), URL qaytarish
│   │   │   └── providers/           # rasm provayder adapterlari
│   │   │       ├── base.py                      # ImageProvider abstrakt interfeys
│   │   │       ├── openai_provider.py           # DALL·E / gpt-image
│   │   │       ├── stable_diffusion_provider.py # lokal SD (o'z serverda)
│   │   │       └── replicate_provider.py        # Replicate/Flux
│   │   │
│   │   ├── telegram/          # ✈️ Telethon userbot moduli
│   │   │   ├── client.py           # Telethon mijoz yaratish/ulash (StringSession)
│   │   │   ├── publisher.py        # kanalga matn+rasm joylash mantiqi
│   │   │   ├── bot_api.py          # Bot API adapteri (muqobil rejim — siz admin)
│   │   │   ├── session_manager.py  # session yaratish/shifrlash/saqlash, 2FA oqimi
│   │   │   └── rate_limiter.py     # FloodWait boshqaruvi, "inson kabi" pauza, kunlik limit
│   │   │
│   │   └── scheduler/         # ⏰ Scheduler moduli
│   │       ├── planner.py          # joylash vaqtini rejalash (kanallararo pauza)
│   │       └── dispatcher.py       # vaqti kelgan schedule → publish task ishga tushirish
│   │
│   ├── tasks/                # ⚙️ Celery tasklar (fon ish — retry/timeout bilan)
│   │   ├── collect.py         #   yangilik yig'ish bosqichi
│   │   ├── generate.py        #   Claude bilan post yaratish bosqichi
│   │   ├── image.py           #   rasm yaratish bosqichi
│   │   ├── publish.py         #   kanalga joylash bosqichi (Telethon)
│   │   └── beat_schedule.py   #   Celery Beat davriy vazifalar (scheduler tick)
│   │
│   └── utils/               # 🧰 Yordamchi funksiyalar
│       ├── datetime.py       #   vaqt/TZ, run_at hisoblash
│       ├── hashing.py        #   content_hash (dedup) va boshqa hashing
│       └── text.py           #   matn tozalash/qisqartirish/hashtag
│
├── tests/                    # ✅ Testlar
│   ├── conftest.py           #   pytest fixture'lari (test DB, mijozlar, mock'lar)
│   ├── unit/                 #   birlik testlar (mantiq, sof funksiyalar)
│   └── integration/          #   integratsiya testlar (DB, API, Redis)
│
├── scripts/                  # 🛠️ Yordamchi skriptlar
│   ├── seed_db.py            #   boshlang'ich manba/kanal ma'lumotini bazaga yozish
│   ├── login_telethon.py     #   interaktiv login: telefon+kod → shifrlangan session_string
│   └── entrypoint.sh         #   konteyner kirish: migratsiya + servisni ishga tushirish
│
├── docker/                   # 🐳 Konteynerlashtirish
│   ├── Dockerfile            #   Python 3.12 image (ko'p bosqichli build)
│   ├── docker-compose.yml    #   dev: api, worker, publisher, beat, postgres, redis, flower
│   ├── docker-compose.prod.yml # prod override: nginx, restart:always, limitlar, replicas
│   └── nginx/
│       └── nginx.conf        #   reverse proxy + TLS (443 → api:8000)
│
├── alembic.ini               # Alembic konfiguratsiyasi (migratsiya joyi, DB URL)
├── pyproject.toml            # loyiha metadata + bog'liqliklar + tool sozlamalari (ruff/black/pytest)
├── requirements.txt          # bog'liqliklar (pyproject o'rniga ishlatilsa)
├── .env.example              # barcha muhit o'zgaruvchilari namunasi (kalitlarsiz)
├── .dockerignore             # Docker build'ga kirmaydigan fayllar
├── .gitignore                # git kuzatmaydigan fayllar (.env, __pycache__, sessiyalar)
└── Makefile                  # qulay buyruqlar: make up/down/migrate/test/lint
```

---

## Buyruq qanday oqadi (kod bo'yicha yo'l)

`"Bugungi IT yangiliklarini 5 kanalga joyla"` buyrug'i qaysi fayllardan o'tadi:

```
1. api/v1/tasks.py        →  buyruqni qabul qiladi, TaskCreate (schemas/task.py) tekshiradi
2. repositories/task_repo →  agent_task DB'ga yoziladi (models/agent_task.py)
3. core/celery_app        →  tasks/collect.py navbatga qo'yiladi
4. services/orchestrator  →  pipeline'ni boshqaradi ↓
   ├─ services/news/collector + sources/*   →  news_items
   ├─ services/news/deduplicator + ranker   →  eng yaxshi 5 ta
   ├─ services/ai/content_generator         →  posts (models/post.py)
   ├─ services/image/generator + providers  →  media_assets
   ├─ services/scheduler/planner            →  schedules (run_at)
   └─ tasks/publish → services/telegram/publisher + rate_limiter → kanalga joylash
5. models/post_target     →  har kanal holati (telegram_message_id)
6. models/publish_log     →  audit
```

---

## Modullar mustaqilligi (kengaytirish oson)

Har modul **abstrakt interfeys (`base.py`) + adapterlar** shaklida — yangi provayderni
qo'shish uchun faqat yangi adapter yoziladi, qolgan kod o'zgarmaydi:

| Modul | Interfeys | Adapterlar |
|-------|-----------|-----------|
| News manbalari | `news/sources/base.py` | rss, newsapi, scraper |
| Image provayder | `image/providers/base.py` | openai, stable_diffusion, replicate |
| Telegram joylash | `telegram/publisher.py` / `bot_api.py` | Telethon / Bot API |

---

## Xavfsizlik eslatmalari (strukturaga singdirilgan)

- `models/telegram_account.py` — `api_hash`, `session_string` **shifrlangan** (core/security.py Fernet).
- `.env` **hech qachon** git'ga tushmaydi (`.gitignore`); faqat `.env.example` (kalitsiz) repoda.
- `services/telegram/rate_limiter.py` — akkaunt bloklanmasligi uchun FloodWait/pauza mantiqiy.
- `api/deps.py` — barcha maxfiy endpointlar JWT bilan himoyalangan.

---

## Keyingi bosqich (kodlash tartibi)

`ARCHITECTURE.md` §8 dagi fazalarga mos:
1. **Faza 0** — `config.py`, `docker/`, `db/session.py`, `api/v1/health.py` (skelet ishga tushsin).
2. **Faza 1** — `models/*` + `db/migrations/` (Alembic).
3. **Faza 2** — `services/news/*`.
4. **Faza 3** — `services/ai/*`.
5. **Faza 5** — `services/telegram/*` (eng nozik).
6. **Faza 6** — `services/orchestrator.py` + `services/scheduler/*`.
