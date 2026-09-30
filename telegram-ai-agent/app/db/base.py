"""SQLAlchemy Declarative Base, umumiy mixinlar va yordamchilar."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import BigInteger, DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy import MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Migratsiyalar barqaror (deterministik) nom olishi uchun nomlash konvensiyasi.
# Bu Alembic autogenerate natijalarini toza va bir xil qiladi.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Barcha ORM modellari uchun asosiy klass."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class IntIdPK:
    """BigInteger avto-inkrement birlamchi kalit mixini."""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)


class TimestampMixin:
    """created_at / updated_at ustunlari (server tomonda avtomatik)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def enum_column(enum_cls: type[Enum], **kwargs: Any) -> Mapped[Any]:
    """Enum'ni native PG enum o'rniga VARCHAR + CHECK sifatida saqlaydigan ustun.

    Migratsiyalarni soddalashtiradi (yangi enum qiymati qo'shish uchun
    PG enum'ni ALTER qilish shart bo'lmaydi).
    """
    return mapped_column(
        SAEnum(
            enum_cls,
            native_enum=False,
            length=32,
            values_callable=lambda e: [member.value for member in e],
        ),
        **kwargs,
    )
