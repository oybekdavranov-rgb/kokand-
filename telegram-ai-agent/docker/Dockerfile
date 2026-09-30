# ===== Telegram AI Agent — ilova image (Python 3.12) =====
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Runtime kutubxonalar (curl — healthcheck uchun)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Bog'liqliklar (kesh qatlami — kod o'zgarsa ham qayta o'rnatilmaydi)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Ilova kodi
COPY . .

# Non-root foydalanuvchi + yozish papkalari
RUN chmod +x scripts/entrypoint.sh \
    && useradd -m -u 1000 appuser \
    && mkdir -p /app/media /app/beat \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

ENTRYPOINT ["scripts/entrypoint.sh"]
# Standart buyruq — API (docker-compose har servis uchun override qiladi)
CMD ["gunicorn", "app.main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-b", "0.0.0.0:8000", "-w", "4", "--access-logfile", "-"]
