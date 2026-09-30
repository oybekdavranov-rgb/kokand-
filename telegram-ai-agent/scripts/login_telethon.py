"""Interaktiv Telethon login — StringSession yaratadi va (ixtiyoriy) shifrlaydi.

Ishlatish:
    python -m scripts.login_telethon
    python -m scripts.login_telethon --api-id 123456 --api-hash abc --phone +99890...

Natija: RAW StringSession va (ENCRYPTION_KEY bo'lsa) shifrlangan variant.
Shifrlangan qiymat `telegram_accounts.session_string_encrypted` ga saqlanadi.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import os

from app.services.telegram.session_manager import SessionManager


async def main() -> None:
    parser = argparse.ArgumentParser(description="Telethon session generator")
    parser.add_argument("--api-id", type=int, default=os.getenv("TELEGRAM_API_ID"))
    parser.add_argument("--api-hash", default=os.getenv("TELEGRAM_API_HASH"))
    parser.add_argument("--phone", default=os.getenv("TELEGRAM_PHONE"))
    args = parser.parse_args()

    api_id = args.api_id or int(input("api_id: ").strip())
    api_hash = args.api_hash or input("api_hash: ").strip()
    phone = args.phone or input("Telefon (+99890...): ").strip()

    session_string = await SessionManager.interactive_login(
        int(api_id),
        api_hash,
        phone,
        code_prompt=lambda: input("Telegram kodi: ").strip(),
        password_prompt=lambda: getpass.getpass("2FA parol: "),
    )

    print("\n=== SESSION STRING (MAXFIY — hech kimga bermang!) ===")
    print(session_string)

    # ENCRYPTION_KEY sozlangan bo'lsa, DB uchun shifrlangan variantni chiqaramiz
    try:
        encrypted = SessionManager.encrypt_secret(session_string)
        print("\n=== SHIFRLANGAN (session_string_encrypted) ===")
        print(encrypted)
        print("\n=== SHIFRLANGAN api_hash (api_hash_encrypted) ===")
        print(SessionManager.encrypt_secret(api_hash))
    except Exception as exc:  # noqa: BLE001
        print(f"\n(Shifrlash o'tkazib yuborildi — ENCRYPTION_KEY sozlanmagan: {exc})")


if __name__ == "__main__":
    asyncio.run(main())
