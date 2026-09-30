"""NewsSource abstrakt interfeysi va RawNews DTO."""
from __future__ import annotations

import abc
from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class RawNews:
    """Manbadan olingan xom yangilik (bazaga yozilmasdan oldin)."""

    title: str
    url: str | None = None
    summary: str = ""
    published_at: datetime | None = None
    source_name: str = ""
    source_id: int | None = None
    source_weight: float = 1.0


class NewsSource(abc.ABC):
    """Yangilik manbasi adapteri uchun umumiy shartnoma."""

    name: str
    source_id: int | None
    weight: float

    @abc.abstractmethod
    async def fetch(self) -> list[RawNews]:
        """Manbadan yangiliklarni oladi (xato bo'lsa bo'sh ro'yxat)."""
