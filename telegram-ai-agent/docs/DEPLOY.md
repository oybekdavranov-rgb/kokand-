# Ubuntu VPS ga chiqarish (Deploy)

To'liq stack: **Docker + docker-compose + Nginx + Let's Encrypt SSL + systemd**.

## Servislar

| Servis | Vazifa | Port |
|--------|--------|------|
| `nginx` | Reverse proxy + TLS | 80, 443 |
| `api` | FastAPI (gunicorn/uvicorn) | ichki 8000 |
| `worker` | Celery — news/ai/image (default navbat) | — |
| `publisher` | Celery — joylash (Telethon, **1 ta** jarayon) | — |
| `beat` | Celery Beat — scheduler | — |
| `bot` | Admin boshqaruv boti | — |
| `flower` | Monitoring | ichki 5555 |
| `postgres` | Ma'lumotlar bazasi | ichki 5432 |
| `redis` | Broker + cache | ichki 6379 |
| `certbot` | SSL avtomatik yangilash | — |

---

## 1. VPS tayyorlash (Ubuntu 22.04/24.04)

```bash
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # keyin qayta login qiling

# Loyihani joylashtirish
sudo mkdir -p /opt/telegram-ai-agent
sudo chown $USER:$USER /opt/telegram-ai-agent
git clone <repo-url> /opt/telegram-ai-agent
cd /opt/telegram-ai-agent/telegram-ai-agent   # loyiha ildizi (docker/ shu yerda)
```

## 2. Environment sozlash

```bash
cp .env.example .env
nano .env
```

Majburiy to'ldiring:
```bash
# Xavfsizlik
SECRET_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
POSTGRES_PASSWORD=<kuchli-parol>

# Deploy
DOMAIN=agent.example.com
ACME_EMAIL=siz@example.com

# API kalitlar
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...          # DALL·E + fallback (ixtiyoriy)

# Telegram
TELEGRAM_API_ID=...         # my.telegram.org
TELEGRAM_API_HASH=...
TELEGRAM_BOT_TOKEN=...      # @BotFather
ADMIN_TELEGRAM_ID=...       # @userinfobot
```

> **DNS:** `DOMAIN` ning A-yozuvi VPS IP manziliga yo'naltirilgan bo'lsin (SSL uchun shart).

## 3. Ishga tushirish

```bash
cd docker

# Image'larni yig'ib, stack'ni ko'taramiz (hozircha nginx'siz)
docker compose up -d --build

# SSL sertifikatini birinchi marta olamiz (nginx + certbot)
bash init-letsencrypt.sh

# To'liq prod stack (nginx + ssl bilan)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 4. Migratsiya va boshlang'ich ma'lumot

```bash
docker compose exec api alembic upgrade head        # jadvallarni yaratish (11 ta)
docker compose exec api python -m scripts.seed_db   # standart IT RSS manbalar
```
Yoki har startda avtomatik migratsiya uchun `.env` da `RUN_MIGRATIONS=1`.

## 5. Telethon session (userbot)

```bash
docker compose run --rm publisher python -m scripts.login_telethon
# Chiqqan shifrlangan session_string'ni telegram_accounts jadvaliga saqlaysiz.
```

## 6. systemd — avtomatik qayta ishga tushirish

```bash
sudo cp deploy/telegram-ai-agent.service /etc/systemd/system/
# WorkingDirectory ni loyihangiz docker/ papkasiga moslang:
sudo nano /etc/systemd/system/telegram-ai-agent.service

sudo systemctl daemon-reload
sudo systemctl enable --now telegram-ai-agent

systemctl status telegram-ai-agent
journalctl -u telegram-ai-agent -f
```

VPS qayta yuklansa — stack avtomatik ko'tariladi. Konteyner darajasida ham
`restart: unless-stopped` o'rnatilgan (yiqilsa qayta ishga tushadi).

---

## Boshqaruv buyruqlari

```bash
docker compose ps                       # holat
docker compose logs -f api worker publisher bot   # loglar
docker compose restart publisher        # bitta servisni qayta ishga tushirish
docker compose pull && docker compose up -d --build   # yangilash

# Zaxira (backup)
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql
```

## Xavfsizlik eslatmalari
- `.env` git'ga tushmaydi (`.gitignore`/`.dockerignore`).
- Firewall: faqat 22, 80, 443 ochiq; postgres/redis/flower faqat ichki tarmoqda.
- `api` va `flower` host'da `127.0.0.1` ga bog'langan — tashqaridan ochiq emas.
- SSL sertifikat `certbot` orqali avtomatik yangilanadi (har 12 soatda tekshiradi).
