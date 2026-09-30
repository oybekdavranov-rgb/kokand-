"""initial schema — barcha jadvallarni ORM metadata dan yaratadi.

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01
"""
from __future__ import annotations

from alembic import op

# Barcha modellarni yuklab, Base.metadata ni to'ldiramiz
import app.models as models

# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Birinchi (baseline) migratsiya: barcha jadvallarni metadata dan yaratamiz.
    models.Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    models.Base.metadata.drop_all(bind=op.get_bind())
