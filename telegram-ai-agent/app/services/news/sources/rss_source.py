"""RSS manba adapteri (httpx bilan yuklab, feedparser bilan o'qiydi)."""
from __future__ import annotations

import asyncio
import calendar
import re
from datetime import datetime, timezone

import httpx
import structlog

from app.config import get_settings
from app.services.news.sources.base import NewsSource, RawNews

settings = get_settings()
log = structlog.get_logger()

_TAG_RE = re.compile(r"<[^>]+>")
_USER_AGENT = "Mozilla/5.0 (TelegramAIAgent/1.0; +https://example.com)"


def _clean(text: str | None) -> str:
    """HTML teglarni olib tashlaydi va bo'sh joylarni tozalaydi."""
    return _TAG_RE.sub("", text or "").strip()


def _entry_date(entry) -> datetime | None:
    """feedparser yozuvidan sanani UTC datetime sifatida oladi."""
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            return datetime.fromtimestamp(calendar.timegm(parsed), tz=timezone.utc)
    return None


def map_entries(entries, *, name, source_id, weight) -> list[RawNews]:
    """feedparser yozuvlarini RawNews ro'yxatiga aylantiradi (test uchun ham)."""
    out: list[RawNews] = []
    for entry in entries:
        title = _clean(entry.get("title"))
        if not title:
            continue
        out.append(
            RawNews(
                title=title,
                url=entry.get("link"),
                summary=_clean(entry.get("summary", ""))[:600],
                published_at=_entry_date(entry),
                source_name=name,
                source_id=source_id,
                source_weight=weight,
            )
        )
    return out


class RssSource(NewsSource):
    """RSS/Atom feed adapteri."""

    def __init__(
        self,
        url: str,
        *,
        name: str = "",
        source_id: int | None = None,
        weight: float = 1.0,
    ) -> None:
        self.url = url
        self.name = name or url
        self.source_id = source_id
        self.weight = weight

    async def fetch(self) -> list[RawNews]:
        import feedparser  # lazy import

        try:
            async with httpx.AsyncClient(
                timeout=settings.NEWS_REQUEST_TIMEOUT,
                follow_redirects=True,
                headers={"User-Agent": _USER_AGENT},
            ) as client:
                response = await client.get(self.url)
                response.raise_for_status()
                raw = response.content
        except httpx.HTTPError as exc:
            log.warning("news.rss.fetch_failed", url=self.url, error=str(exc))
            return []

        parsed = await asyncio.to_thread(feedparser.parse, raw)
        return map_entries(
            parsed.entries, name=self.name, source_id=self.source_id, weight=self.weight
        )
