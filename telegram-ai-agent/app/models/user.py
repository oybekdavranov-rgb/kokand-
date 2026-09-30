"""users jadvali — tizim operatorlari."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import UserRole
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.agent_task import AgentTask
    from app.models.telegram_account import TelegramAccount


class User(Base, IntIdPK, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = enum_column(
        UserRole, default=UserRole.ADMIN, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Bog'lanishlar
    telegram_accounts: Mapped[list["TelegramAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    agent_tasks: Mapped[list["AgentTask"]] = relationship(back_populates="user")
