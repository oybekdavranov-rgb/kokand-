"""news_sources jadvali — yangilik manbalari (RSS / API / scrape)."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import NewsSourceType
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.news_item import NewsItem


class NewsSource(Base, IntIdPK, TimestampMixin):
    __tablename__ = "news_sources"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[NewsSourceType] = enum_column(NewsSourceType, nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="it", nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_fetched: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Bog'lanishlar
    news_items: Mapped[list["NewsItem"]] = relationship(back_populates="source")
