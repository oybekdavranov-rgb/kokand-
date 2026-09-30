"""posts jadvali — AI (Claude) yaratgan post matni."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import PostStatus
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.agent_task import AgentTask
    from app.models.media_asset import MediaAsset
    from app.models.news_item import NewsItem
    from app.models.post_target import PostTarget


class Post(Base, IntIdPK, TimestampMixin):
    __tablename__ = "posts"

    task_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("agent_tasks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    news_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("news_items.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(512))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    hashtags: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )
    source_url: Mapped[str | None] = mapped_column(String(1024))
    model: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[PostStatus] = enum_column(
        PostStatus, default=PostStatus.DRAFT, nullable=False, index=True
    )

    # Bog'lanishlar
    task: Mapped["AgentTask"] = relationship(back_populates="posts")
    news_item: Mapped["NewsItem"] = relationship(back_populates="posts")
    media_assets: Mapped[list["MediaAsset"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    post_targets: Mapped[list["PostTarget"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
