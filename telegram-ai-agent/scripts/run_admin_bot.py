"""Admin boshqaruv botini ishga tushiradi (24/7 alohida servis).

Ishlatish:
    python -m scripts.run_admin_bot

Docker'da alohida `bot` konteyner sifatida ishlaydi (restart: always).
"""
from __future__ import annotations

import asyncio

from app.services.telegram.admin_bot import AdminBot


def main() -> None:
    asyncio.run(AdminBot().run())


if __name__ == "__main__":
    main()
