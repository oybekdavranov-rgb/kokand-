"""channels jadvali — nishon Telegram kanallari (har biri o'z uslubi bilan)."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import ChannelTone, Language
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.post_target import PostTarget
    from app.models.telegram_account import TelegramAccount


class Channel(Base, IntIdPK, TimestampMixin):
    __tablename__ = "channels"

    account_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("telegram_accounts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    tg_username: Mapped[str | None] = mapped_column(String(64))
    tg_channel_id: Mapped[int | None] = mapped_column(BigInteger)
    tone: Mapped[ChannelTone] = enum_column(
        ChannelTone, default=ChannelTone.PROFESSIONAL, nullable=False
    )
    language: Mapped[Language] = enum_column(
        Language, default=Language.UZ, nullable=False
    )
    post_template: Mapped[str | None] = mapped_column(Text)
    # Har kanal uchun kunlik joylash vaqtlari (UTC), masalan: ["09:00", "15:00"].
    # Bo'sh bo'lsa DEFAULT_POST_TIMES ishlatiladi.
    post_times: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Bog'lanishlar
    account: Mapped["TelegramAccount"] = relationship(back_populates="channels")
    post_targets: Mapped[list["PostTarget"]] = relationship(back_populates="channel")
