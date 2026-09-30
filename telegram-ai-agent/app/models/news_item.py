"""news_items jadvali — yig'ilgan xom yangiliklar (dedup content_hash bo'yicha)."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import NewsItemStatus
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.agent_task import AgentTask
    from app.models.news_source import NewsSource
    from app.models.post import Post


class NewsItem(Base, IntIdPK, TimestampMixin):
    __tablename__ = "news_items"

    source_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("news_sources.id", ondelete="SET NULL"), index=True
    )
    task_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("agent_tasks.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(1024))
    # Takrorlanishni oldini olish uchun unikal hash (title+url dan).
    content_hash: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[NewsItemStatus] = enum_column(
        NewsItemStatus, default=NewsItemStatus.FETCHED, nullable=False, index=True
    )

    # Bog'lanishlar
    source: Mapped["NewsSource"] = relationship(back_populates="news_items")
    task: Mapped["AgentTask"] = relationship(back_populates="news_items")
    posts: Mapped[list["Post"]] = relationship(back_populates="news_item")
