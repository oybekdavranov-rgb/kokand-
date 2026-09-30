"""post_targets jadvali — post↔kanal (M:N) va har bir kanaldagi joylanish holati."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import PostTargetStatus
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.channel import Channel
    from app.models.post import Post
    from app.models.publish_log import PublishLog
    from app.models.schedule import Schedule


class PostTarget(Base, IntIdPK, TimestampMixin):
    __tablename__ = "post_targets"
    __table_args__ = (
        UniqueConstraint("post_id", "channel_id", name="uq_post_target_post_channel"),
    )

    post_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("posts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    channel_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("channels.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[PostTargetStatus] = enum_column(
        PostTargetStatus, default=PostTargetStatus.PENDING, nullable=False, index=True
    )
    telegram_message_id: Mapped[int | None] = mapped_column(BigInteger)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)

    # Bog'lanishlar
    post: Mapped["Post"] = relationship(back_populates="post_targets")
    channel: Mapped["Channel"] = relationship(back_populates="post_targets")
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="post_target", cascade="all, delete-orphan"
    )
    publish_logs: Mapped[list["PublishLog"]] = relationship(
        back_populates="post_target", cascade="all, delete-orphan"
    )
