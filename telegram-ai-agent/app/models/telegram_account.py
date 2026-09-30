"""telegram_accounts jadvali — Telethon sessiyalari (maxfiy maydonlar shifrlangan)."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IntIdPK, TimestampMixin

if TYPE_CHECKING:
    from app.models.channel import Channel
    from app.models.user import User


class TelegramAccount(Base, IntIdPK, TimestampMixin):
    __tablename__ = "telegram_accounts"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    label: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(32))
    api_id: Mapped[int | None] = mapped_column(Integer)

    # MAXFIY: Fernet bilan shifrlab saqlanadi (core/security.py orqali).
    api_hash_encrypted: Mapped[str | None] = mapped_column(Text)
    session_string_encrypted: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Bog'lanishlar
    user: Mapped["User"] = relationship(back_populates="telegram_accounts")
    channels: Mapped[list["Channel"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
