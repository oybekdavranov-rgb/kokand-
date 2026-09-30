"""publish_logs jadvali — joylash jarayoni audit/kuzatuv loglari."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import LogLevel
from app.db.base import Base, IntIdPK, enum_column

if TYPE_CHECKING:
    from app.models.post_target import PostTarget


class PublishLog(Base, IntIdPK):
    """Faqat created_at bo'lgan append-only log (TimestampMixin ishlatilmaydi)."""

    __tablename__ = "publish_logs"

    post_target_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("post_targets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    level: Mapped[LogLevel] = enum_column(
        LogLevel, default=LogLevel.INFO, nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # Qo'shimcha kontekst: {"flood_wait": 42, "attempt": 2, ...}
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Bog'lanishlar
    post_target: Mapped["PostTarget"] = relationship(back_populates="publish_logs")
