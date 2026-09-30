"""Telethon mijoz hayotiy sikli — akkaunt bo'yicha ulangan mijozlarni keshlaydi.

MUHIM: bitta akkaunt = bitta ulangan Telethon mijozi. Session konflikt bo'lmasligi
uchun bu manager faqat bitta jarayonda (publisher worker) ishlashi kerak.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import structlog
from telethon import TelegramClient
from telethon.sessions import StringSession

from app.services.telegram import TelegramAuthError
from app.services.telegram.session_manager import SessionManager

if TYPE_CHECKING:
    from app.models.telegram_account import TelegramAccount

log = structlog.get_logger()


def build_client(
    api_id: int, api_hash: str, session_string: str | None = None
) -> TelegramClient:
    """StringSession asosida Telethon mijozini yaratadi (hali ulanmagan)."""
    return TelegramClient(
        StringSession(session_string),
        api_id,
        api_hash,
        connection_retries=5,
        retry_delay=2,
        timeout=30,
        auto_reconnect=True,
        device_model="TelegramAIAgent",
        system_version="1.0",
    )


class TelegramClientManager:
    """Akkaunt ID bo'yicha ulangan mijozlarni keshlaydigan menejer."""

    def __init__(self) -> None:
        self._clients: dict[int, TelegramClient] = {}
        self._lock = asyncio.Lock()

    async def get_client(self, account: "TelegramAccount") -> TelegramClient:
        """Akkaunt uchun ulangan va avtorizatsiyadan o'tgan mijozni qaytaradi."""
        async with self._lock:
            existing = self._clients.get(account.id)
            if existing is not None and existing.is_connected():
                return existing

            creds = SessionManager.credentials_from_account(account)
            if not creds.session_string:
                raise TelegramAuthError(
                    f"Akkaunt #{account.id} uchun session yo'q — avval login qiling "
                    "(scripts/login_telethon.py)"
                )

            client = build_client(creds.api_id, creds.api_hash, creds.session_string)
            await client.connect()
            if not await client.is_user_authorized():
                await client.disconnect()
                raise TelegramAuthError(
                    f"Akkaunt #{account.id} avtorizatsiyadan o'tmagan (session eskirgan)"
                )

            self._clients[account.id] = client
            log.info("telethon.client.connected", account_id=account.id)
            return client

    async def disconnect(self, account_id: int) -> None:
        """Bitta akkaunt mijozini uzadi."""
        client = self._clients.pop(account_id, None)
        if client is not None:
            await client.disconnect()
            log.info("telethon.client.disconnected", account_id=account_id)

    async def disconnect_all(self) -> None:
        """Barcha ulangan mijozlarni uzadi (shutdown paytida)."""
        for account_id in list(self._clients):
            await self.disconnect(account_id)
