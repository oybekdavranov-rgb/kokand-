"""Alembic muhiti — sync (psycopg2) engine, metadata app.models dan."""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings

# Barcha modellarni import qilib, Base.metadata ni to'ldiramiz
import app.models as models  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
# DB URL — sync (Alembic async ishlatmaydi)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)

target_metadata = models.Base.metadata


def run_migrations_offline() -> None:
    """URL orqali (ulanishsiz) migratsiya — SQL chiqaradi."""
    context.configure(
        url=settings.DATABASE_URL_SYNC,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Haqiqiy ulanish orqali migratsiya."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
