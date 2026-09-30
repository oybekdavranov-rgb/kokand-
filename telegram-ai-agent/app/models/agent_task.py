"""agent_tasks jadvali — yuqori darajali buyruqlar va ularning pipeline holati."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import TaskStatus
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.news_item import NewsItem
    from app.models.post import Post
    from app.models.user import User


class AgentTask(Base, IntIdPK, TimestampMixin):
    __tablename__ = "agent_tasks"

    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    command: Mapped[str] = mapped_column(Text, nullable=False)
    # Parametrlar: {"topic": "IT", "channels": [...], "count": 5, ...}
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[TaskStatus] = enum_column(
        TaskStatus, default=TaskStatus.NEW, nullable=False, index=True
    )
    auto_publish: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)

    # Bog'lanishlar
    user: Mapped["User"] = relationship(back_populates="agent_tasks")
    news_items: Mapped[list["NewsItem"]] = relationship(back_populates="task")
    posts: Mapped[list["Post"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
