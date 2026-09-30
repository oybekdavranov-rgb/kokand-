"""API manba adapteri (NewsAPI ko'rinishidagi JSON: {"articles": [...]})."""
from __future__ import annotations

from datetime import datetime

import httpx
import structlog

from app.config import get_settings
from app.services.news.sources.base import NewsSource, RawNews

settings = get_settings()
log = structlog.get_logger()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class NewsApiSource(NewsSource):
    """NewsAPI-uslubidagi JSON endpoint adapteri.

    `url` to'liq so'rov manzili bo'lsin (kerak bo'lsa apiKey bilan).
    """

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
        try:
            async with httpx.AsyncClient(
                timeout=settings.NEWS_REQUEST_TIMEOUT, follow_redirects=True
            ) as client:
                response = await client.get(self.url)
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("news.api.fetch_failed", url=self.url, error=str(exc))
            return []

        articles = data.get("articles") or data.get("results") or []
        out: list[RawNews] = []
        for art in articles:
            title = (art.get("title") or "").strip()
            if not title:
                continue
            out.append(
                RawNews(
                    title=title,
                    url=art.get("url"),
                    summary=(art.get("description") or art.get("summary") or "")[:600],
                    published_at=_parse_iso(art.get("publishedAt") or art.get("published_at")),
                    source_name=self.name,
                    source_id=self.source_id,
                    source_weight=self.weight,
                )
            )
        return out
