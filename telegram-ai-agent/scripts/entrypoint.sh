#!/usr/bin/env bash
# Konteyner kirish skripti: DB'ni kutadi, (ixtiyoriy) migratsiya qiladi, buyruqni ishga tushiradi.
set -euo pipefail

# PostgreSQL tayyor bo'lguncha kutamiz (compose healthcheck ham buni ta'minlaydi)
python - <<'PY'
import os, socket, time
host = os.getenv("POSTGRES_HOST", "postgres")
port = int(os.getenv("POSTGRES_PORT", "5432"))
for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
PY

# Migratsiyalar — faqat RUN_MIGRATIONS=1 bo'lganda (Alembic sozlangandan keyin).
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] Alembic migratsiyalari ishga tushmoqda..."
  alembic upgrade head
fi

exec "$@"
