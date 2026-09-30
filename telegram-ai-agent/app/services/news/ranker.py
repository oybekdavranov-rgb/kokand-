"""Yangiliklarni saralash — manba vazni + yangilik (recency) bo'yicha ball."""
from __future__ import annotations

from datetime import datetime, timezone

from app.services.news.sources.base import RawNews

UTC = timezone.utc
_RECENCY_WINDOW_HOURS = 48.0


def _score(item: RawNews, now: datetime) -> float:
    recency = 0.0
    published = item.published_at
    if published is not None:
        if published.tzinfo is None:
            published = published.replace(tzinfo=UTC)
        age_hours = (now - published).total_seconds() / 3600
        recency = max(0.0, 1.0 - age_hours / _RECENCY_WINDOW_HOURS)
    return item.source_weight * (1.0 + recency)


def rank(items: list[RawNews], now: datetime | None = None) -> list[RawNews]:
    """Eng muhim/yangi yangiliklarni oldinga qo'yadi."""
    now = now or datetime.now(UTC)
    return sorted(items, key=lambda item: _score(item, now), reverse=True)
