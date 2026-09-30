"""Telegram servis moduli — umumiy tiplar va xatoliklar.

Bu fayl ataylab yengil: Telethon'ni import qilmaydi, shuning uchun
`PublishResult` va xatolik klasslarini og'ir bog'liqliklarsiz ishlatish mumkin
(masalan, testlarda yoki scheduler'da).
"""
from __future__ import annotations

from dataclasses import dataclass


class TelegramError(Exception):
    """Telegram modulining umumiy asosiy xatosi."""


class TelegramAuthError(TelegramError):
    """Sessiya yo'q / eskirgan / avtorizatsiyadan o'tmagan."""


class TelegramPublishError(TelegramError):
    """Postni joylashda tuzatib bo'lmaydigan xato."""


class RateLimitExceeded(TelegramError):
    """Kunlik post limiti oshib ketdi."""


@dataclass(slots=True)
class PublishResult:
    """Bitta kanalga joylash natijasi (publisher qaytaradi)."""

    success: bool
    message_id: int | None = None
    error: str | None = None
    flood_wait_seconds: int | None = None


__all__ = [
    "TelegramError",
    "TelegramAuthError",
    "TelegramPublishError",
    "RateLimitExceeded",
    "PublishResult",
]
