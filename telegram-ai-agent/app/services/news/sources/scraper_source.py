"""Oddiy HTML scrape adapteri (best-effort) — sarlavhali havolalarni oladi."""
from __future__ import annotations

import httpx
import structlog

from app.config import get_settings
from app.services.news.sources.base import NewsSource, RawNews

settings = get_settings()
log = structlog.get_logger()

_USER_AGENT = "Mozilla/5.0 (TelegramAIAgent/1.0)"
_MAX_ITEMS = 20


class ScraperSource(NewsSource):
    """Sahifadagi h1/h2/h3 ichidagi havolalarni yangilik sifatida oladi.

    Bu umumiy (site-agnostik) yechim — RSS bo'lmagan manbalar uchun zaxira.
    Aniqroq natija uchun har sayt uchun maxsus selektor kerak bo'lishi mumkin.
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
        from bs4 import BeautifulSoup  # lazy import

        try:
            async with httpx.AsyncClient(
                timeout=settings.NEWS_REQUEST_TIMEOUT,
                follow_redirects=True,
                headers={"User-Agent": _USER_AGENT},
            ) as client:
                response = await client.get(self.url)
                response.raise_for_status()
                html = response.text
        except httpx.HTTPError as exc:
            log.warning("news.scrape.fetch_failed", url=self.url, error=str(exc))
            return []

        soup = BeautifulSoup(html, "lxml")
        out: list[RawNews] = []
        seen: set[str] = set()
        for tag in soup.select("h1 a, h2 a, h3 a"):
            title = tag.get_text(strip=True)
            href = tag.get("href")
            if not title or title in seen:
                continue
            seen.add(title)
            out.append(
                RawNews(
                    title=title,
                    url=href,
                    source_name=self.name,
                    source_id=self.source_id,
                    source_weight=self.weight,
                )
            )
            if len(out) >= _MAX_ITEMS:
                break
        return out
