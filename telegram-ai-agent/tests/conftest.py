"""Pytest sozlamasi va fixture'lari.

Muhit o'zgaruvchilari app import qilinishidan OLDIN o'rnatiladi (get_settings
lru_cache bo'lgani uchun). Integratsiya testlari lokal Postgres klasteriga
ulanadi (conftest da ko'rsatilgan host/port).
"""
from __future__ import annotations

import os

from cryptography.fernet import Fernet

# --- App importidan oldin muhitni sozlaymiz ---
os.environ.setdefault("SECRET_KEY", "test-secret-key-0123456789abcdef")
os.environ.setdefault("ENCRYPTION_KEY", Fernet.generate_key().decode())
os.environ.setdefault("POSTGRES_HOST", "127.0.0.1")
os.environ.setdefault("POSTGRES_PORT", "55432")
os.environ.setdefault("POSTGRES_USER", "postgres")
os.environ.setdefault("POSTGRES_PASSWORD", "secret")
os.environ.setdefault("POSTGRES_DB", "tgagent")
os.environ.setdefault("REDIS_HOST", "127.0.0.1")
os.environ.setdefault("REDIS_PORT", "6379")
os.environ.setdefault("IMAGE_PROVIDER", "openai")  # kalitsiz -> is_available=False

import pytest_asyncio  # noqa: E402


@pytest_asyncio.fixture
async def db():
    """Har integratsiya testi uchun toza sxema (drop + create)."""
    from app.db.session import task_engine
    from app.models import Base

    async with task_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with task_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
