"""Redis ulanishi — cache, dedup-set va rate-limit uchun umumiy async mijoz."""
from __future__ import annotations

import redis.asyncio as aioredis

from app.config import get_settings

settings = get_settings()

# Umumiy Redis mijozi (connection pool ichida). decode_responses=True —
# qiymatlar avtomatik str sifatida qaytadi.
redis_client: aioredis.Redis = aioredis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
    health_check_interval=30,
)


def make_redis_client() -> aioredis.Redis:
    """Yangi (mustaqil) Redis mijozi — Celery task'lari uchun.

    Celery sync worker'da har `asyncio.run()` yangi event loop yaratadi;
    umumiy `redis_client` bir loop'ga bog'langani uchun uni qayta ishlatib
    bo'lmaydi ("attached to a different loop"). Har task o'z mijozini oladi.
    """
    return aioredis.from_url(
        settings.REDIS_URL, encoding="utf-8", decode_responses=True
    )


async def get_redis() -> aioredis.Redis:
    """FastAPI dependency: umumiy Redis mijozini qaytaradi."""
    return redis_client


async def close_redis() -> None:
    """Ilova to'xtaganda Redis ulanishini yopadi."""
    await redis_client.aclose()
