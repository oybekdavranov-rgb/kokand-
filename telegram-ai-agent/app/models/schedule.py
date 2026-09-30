"""schedules jadvali — rejalashtirilgan joylashlar (Celery Beat shu jadval bo'yicha ishlaydi)."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import ScheduleStatus
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.post_target import PostTarget


class Schedule(Base, IntIdPK, TimestampMixin):
    __tablename__ = "schedules"

    post_target_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("post_targets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    status: Mapped[ScheduleStatus] = enum_column(
        ScheduleStatus, default=ScheduleStatus.PENDING, nullable=False, index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Bog'lanishlar
    post_target: Mapped["PostTarget"] = relationship(back_populates="schedules")
