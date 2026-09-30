"""Rate limiter — kunlik post limiti, FloodWait kuzatuvi va 'inson kabi' pauza.

Akkaunt bloklanmasligi uchun eng muhim himoya qatlami. Holat Redis'da saqlanadi,
shuning uchun bir nechta worker o'rtasida ham izchil ishlaydi.
"""
from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone

import redis.asyncio as aioredis
import structlog

from app.config import get_settings
from app.db.redis import make_redis_client
from app.services.telegram import RateLimitExceeded

settings = get_settings()
log = structlog.get_logger()

# Kunlik hisoblagich kaliti ~25 soatdan keyin avtomatik o'chadi
_DAILY_TTL_SECONDS = 90_000


class RateLimiter:
    """Har akkaunt uchun kunlik limit va joylashlararo pauzani boshqaradi."""

    def __init__(
        self,
        redis: aioredis.Redis | None = None,
        *,
        daily_limit: int | None = None,
        min_delay: int | None = None,
        max_delay: int | None = None,
    ) -> None:
        if redis is not None:
            self._redis = redis
            self._owns_redis = False
        else:
            # Har instansiya o'z mijozini oladi (Celery loop xavfsizligi uchun)
            self._redis = make_redis_client()
            self._owns_redis = True
        self.daily_limit = daily_limit if daily_limit is not None else settings.DAILY_POST_LIMIT
        self.min_delay = min_delay if min_delay is not None else settings.MIN_DELAY_BETWEEN_POSTS
        self.max_delay = max_delay if max_delay is not None else settings.MAX_DELAY_BETWEEN_POSTS

    async def aclose(self) -> None:
        """O'zi yaratgan Redis mijozini yopadi (task oxirida)."""
        if self._owns_redis:
            await self._redis.aclose()

    # --------------------------------- Kalitlar --------------------------------
    @staticmethod
    def _daily_key(account_id: int) -> str:
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"tg:daily:{account_id}:{day}"

    @staticmethod
    def _floodwait_key(account_id: int) -> str:
        return f"tg:floodwait:{account_id}"

    # ------------------------------- Kunlik limit ------------------------------
    async def current_count(self, account_id: int) -> int:
        value = await self._redis.get(self._daily_key(account_id))
        return int(value) if value else 0

    async def remaining(self, account_id: int) -> int:
        return max(0, self.daily_limit - await self.current_count(account_id))

    async def check(self, account_id: int) -> None:
        """Limit oshsa RateLimitExceeded ko'taradi, aks holda o'tkazadi."""
        # Faol FloodWait bor bo'lsa ham to'xtatamiz
        flood = await self._redis.get(self._floodwait_key(account_id))
        if flood:
            raise RateLimitExceeded(
                f"Akkaunt #{account_id}: faol FloodWait ({flood}s) — hozircha kutish kerak"
            )
        count = await self.current_count(account_id)
        if count >= self.daily_limit:
            raise RateLimitExceeded(
                f"Akkaunt #{account_id}: kunlik limit ({self.daily_limit}) oshib ketdi"
            )

    async def register_post(self, account_id: int) -> int:
        """Muvaffaqiyatli joylashdan keyin kunlik hisoblagichni oshiradi."""
        key = self._daily_key(account_id)
        count = await self._redis.incr(key)
        if count == 1:
            await self._redis.expire(key, _DAILY_TTL_SECONDS)
        return count

    async def register_flood_wait(self, account_id: int, seconds: int) -> None:
        """FloodWait'ni Redis'ga yozadi (shu muddat davomida yangi post to'xtaydi)."""
        await self._redis.set(
            self._floodwait_key(account_id), seconds, ex=max(1, seconds)
        )
        log.warning("telethon.floodwait.registered", account_id=account_id, seconds=seconds)

    # ------------------------------- Inson kabi pauza --------------------------
    async def human_delay(self) -> float:
        """Joylashlar orasida tasodifiy pauza (spam ko'rinmaslik uchun)."""
        delay = random.uniform(self.min_delay, self.max_delay)
        await asyncio.sleep(delay)
        return delay
