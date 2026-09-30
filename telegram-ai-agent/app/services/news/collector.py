"""News Collector — manbalardan yangilik yig'ish, saralash, dedup va saqlash."""
from __future__ import annotations

import asyncio

import structlog
from sqlalchemy import select

from app.config import get_settings
from app.constants import NewsItemStatus, NewsSourceType
from app.db.session import TaskSessionLocal
from app.models.news_item import NewsItem
from app.models.news_source import NewsSource as NewsSourceModel
from app.services.news import ranker
from app.services.news.deduplicator import Deduplicator
from app.services.news.sources.base import NewsSource
from app.services.news.sources.newsapi_source import NewsApiSource
from app.services.news.sources.rss_source import RssSource
from app.services.news.sources.scraper_source import ScraperSource

settings = get_settings()
log = structlog.get_logger()

# Bazada manba bo'lmasa ishlatiladigan standart IT RSS feed'lari
DEFAULT_FEEDS: list[tuple[str, str]] = [
    ("The Verge", "https://www.theverge.com/rss/index.xml"),
    ("TechCrunch", "https://techcrunch.com/feed/"),
    ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/index"),
    ("Engadget", "https://www.engadget.com/rss.xml"),
]


class NewsCollector:
    """Faol manbalardan yangilik yig'ib, bazaga (news_items) yozadi."""

    async def collect(self, task_id: int, *, limit: int | None = None) -> list[int]:
        """Yangilik yig'adi, top-N ni tanlab saqlaydi va ularning id'larini qaytaradi."""
        limit = limit or settings.NEWS_MAX_ITEMS
        async with TaskSessionLocal() as session:
            adapters = await self._adapters(session)
            raw_items = await self._fetch_all(adapters)
            log.info("news.collected_raw", count=len(raw_items), sources=len(adapters))

            ranked = ranker.rank(raw_items)
            seen_hashes: set[str] = set()
            saved: list[NewsItem] = []
            for item in ranked:
                if len(saved) >= limit:
                    break
                if not item.title:
                    continue
                content_hash = Deduplicator.hash(item.title, item.url)
                if content_hash in seen_hashes:
                    continue
                if await Deduplicator.exists(session, content_hash):
                    continue
                seen_hashes.add(content_hash)
                saved.append(
                    NewsItem(
                        source_id=item.source_id,
                        task_id=task_id,
                        title=item.title[:512],
                        summary=item.summary or None,
                        url=item.url or None,
                        content_hash=content_hash,
                        published_at=item.published_at,
                        score=0.0,
                        status=NewsItemStatus.SELECTED,
                    )
                )
            session.add_all(saved)
            await session.commit()
            ids = [item.id for item in saved]
            log.info("news.saved", count=len(ids), task_id=task_id)
            return ids

    async def _adapters(self, session) -> list[NewsSource]:
        rows = (
            await session.execute(
                select(NewsSourceModel).where(NewsSourceModel.is_active.is_(True))
            )
        ).scalars().all()
        if rows:
            return [self._adapter(row) for row in rows]
        # Baza bo'sh bo'lsa — standart RSS feed'lari
        return [RssSource(url, name=name) for name, url in DEFAULT_FEEDS]

    @staticmethod
    def _adapter(row: NewsSourceModel) -> NewsSource:
        if row.type == NewsSourceType.RSS:
            return RssSource(row.url, name=row.name, source_id=row.id, weight=row.weight)
        if row.type == NewsSourceType.API:
            return NewsApiSource(row.url, name=row.name, source_id=row.id, weight=row.weight)
        return ScraperSource(row.url, name=row.name, source_id=row.id, weight=row.weight)

    @staticmethod
    async def _fetch_all(adapters: list[NewsSource]):
        results = await asyncio.gather(
            *(a.fetch() for a in adapters), return_exceptions=True
        )
        out = []
        for result in results:
            if isinstance(result, Exception):
                log.warning("news.source_error", error=str(result))
                continue
            out.extend(result)
        return out
