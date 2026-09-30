"""Ma'lumotlar bazasi ulanishi — async engine va sessiya boshqaruvi."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

# Async engine — butun ilova (API va Celery worker'lar) uchun bitta pool.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_pre_ping=True,  # o'lik ulanishlarni avtomatik almashtiradi
    future=True,
)

# Sessiya fabrikasi. expire_on_commit=False — commit'dan keyin obyektlar
# xususiyatlariga qayta so'rovsiz murojaat qilish mumkin.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# --- Celery (sync worker'lar) uchun alohida engine ---
# Celery task'larida asyncio.run() har chaqiruvda yangi event loop yaratadi;
# asyncpg ulanishlari loop'ga bog'langani uchun bu yerda NullPool ishlatamiz
# (ulanish loop'lar orasida qayta ishlatilmaydi -> "attached to a different loop" xatosi bo'lmaydi).
task_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    poolclass=NullPool,
    future=True,
)

TaskSessionLocal = async_sessionmaker(
    bind=task_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: har bir so'rov uchun DB sessiya beradi.

    Xatolik yuz bersa avtomatik rollback qiladi; sessiya `async with`
    yakunida yopiladi. Commit'ni chaqiruvchi kod bajaradi.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    """Ilova to'xtaganda ulanish poolini toza yopadi."""
    await engine.dispose()
