"""Boshlang'ich ma'lumot — standart IT RSS manbalarini bazaga qo'shadi.

Ishlatish:  docker compose exec api python -m scripts.seed_db
"""
from __future__ import annotations

import asyncio

from sqlalchemy import func, select

from app.constants import NewsSourceType
from app.db.session import AsyncSessionLocal
from app.models.news_source import NewsSource
from app.services.news.collector import DEFAULT_FEEDS


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(func.count()).select_from(NewsSource))
        if existing:
            print(f"Manbalar allaqachon bor ({existing} ta) — o'tkazib yuborildi.")
            return
        for name, url in DEFAULT_FEEDS:
            session.add(
                NewsSource(
                    name=name,
                    type=NewsSourceType.RSS,
                    url=url,
                    category="it",
                    weight=1.0,
                )
            )
        await session.commit()
        print(f"✅ {len(DEFAULT_FEEDS)} ta RSS manba qo'shildi.")


if __name__ == "__main__":
    asyncio.run(main())
