"""Dublikat aniqlash — content_hash + bazadagi mavjudlik tekshiruvi."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.news_item import NewsItem
from app.utils.hashing import content_hash


class Deduplicator:
    """Yangilik takrorlanmasligini ta'minlaydi (content_hash bo'yicha)."""

    @staticmethod
    def hash(title: str | None, url: str | None) -> str:
        return content_hash(title, url)

    @staticmethod
    async def exists(session: AsyncSession, content_hash_value: str) -> bool:
        """Shu hash bazada bormi (ya'ni yangilik allaqachon yig'ilganmi)."""
        found = await session.scalar(
            select(NewsItem.id).where(NewsItem.content_hash == content_hash_value)
        )
        return found is not None
