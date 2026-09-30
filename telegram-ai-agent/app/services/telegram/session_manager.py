"""Telethon sessiya boshqaruvi — shifrlash, credential ochish va interaktiv 2FA login."""
from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

from app.core.security import decrypt, encrypt
from app.services.telegram import TelegramAuthError

if TYPE_CHECKING:
    from app.models.telegram_account import TelegramAccount


@dataclass(slots=True)
class AccountCredentials:
    """Ochilgan (dekript qilingan) akkaunt ma'lumotlari."""

    api_id: int
    api_hash: str
    session_string: str | None


# Kod/parolni foydalanuvchidan oladigan callback (sync yoki async bo'lishi mumkin)
Prompt = Callable[[], "str | Awaitable[str]"]


async def _resolve(prompt: Prompt) -> str:
    """Callback natijasini oladi; agar coroutine bo'lsa, await qiladi."""
    result = prompt()
    if inspect.isawaitable(result):
        return await result
    return str(result)


class SessionManager:
    """Sessiya va maxfiy maydonlarni shifrlash + interaktiv login."""

    # ------------------------- Shifrlash yordamchilari -------------------------
    @staticmethod
    def encrypt_secret(value: str) -> str:
        return encrypt(value)

    @staticmethod
    def decrypt_secret(value: str) -> str:
        return decrypt(value)

    # ---------------------- Akkauntdan credential ochish -----------------------
    @staticmethod
    def credentials_from_account(account: "TelegramAccount") -> AccountCredentials:
        """DB modelidan shifrlangan maydonlarni ochib, credential qaytaradi."""
        if not account.api_id or not account.api_hash_encrypted:
            raise TelegramAuthError(
                f"Akkaunt #{account.id}: api_id yoki api_hash to'ldirilmagan"
            )
        session_string = (
            decrypt(account.session_string_encrypted)
            if account.session_string_encrypted
            else None
        )
        return AccountCredentials(
            api_id=account.api_id,
            api_hash=decrypt(account.api_hash_encrypted),
            session_string=session_string,
        )

    # ------------------------------ Interaktiv login ---------------------------
    @staticmethod
    async def interactive_login(
        api_id: int,
        api_hash: str,
        phone: str,
        *,
        code_prompt: Prompt,
        password_prompt: Prompt,
    ) -> str:
        """Telefon raqami orqali login qilib, RAW StringSession qaytaradi.

        `code_prompt` — SMS/Telegram kodini, `password_prompt` — 2FA parolini
        (agar yoqilgan bo'lsa) oladi. Natijani chaqiruvchi shifrlab saqlaydi.
        """
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        try:
            if not await client.is_user_authorized():
                await client.send_code_request(phone)
                code = await _resolve(code_prompt)
                try:
                    await client.sign_in(phone=phone, code=code)
                except SessionPasswordNeededError:
                    # Ikki bosqichli tekshiruv (2FA) yoqilgan
                    password = await _resolve(password_prompt)
                    await client.sign_in(password=password)
            return client.session.save()
        finally:
            await client.disconnect()
