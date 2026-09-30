"""media_assets jadvali — postga yaratilgan rasmlar/media."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import MediaType
from app.db.base import Base, IntIdPK, TimestampMixin, enum_column

if TYPE_CHECKING:
    from app.models.post import Post


class MediaAsset(Base, IntIdPK, TimestampMixin):
    __tablename__ = "media_assets"

    post_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("posts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    type: Mapped[MediaType] = enum_column(
        MediaType, default=MediaType.IMAGE, nullable=False
    )
    provider: Mapped[str | None] = mapped_column(String(64))
    prompt: Mapped[str | None] = mapped_column(Text)
    storage_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)

    # Bog'lanishlar
    post: Mapped["Post"] = relationship(back_populates="media_assets")
