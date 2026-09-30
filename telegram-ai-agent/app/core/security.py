"""Xavfsizlik yordamchilari — maxfiy ma'lumotni Fernet bilan shifrlash/ochish.

Bu yerda `api_hash` va `session_string` kabi maxfiy maydonlar simmetrik
shifrlanadi. Kalit — `ENCRYPTION_KEY` (Fernet formatida, base64 32-bayt).

Eslatma: JWT yaratish/tekshirish va parol hashing (bcrypt) auth fazasida shu
faylga qo'shiladi.
"""
from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    """Fernet nusxasini bir marta yaratib kesh qiladi."""
    key = get_settings().ENCRYPTION_KEY.get_secret_value()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    """Ochiq matnni shifrlab, saqlash uchun satr qaytaradi."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Shifrlangan satrni ochadi. Kalit noto'g'ri bo'lsa ValueError."""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:  # noqa: TRY003
        raise ValueError(
            "Shifrni ochib bo'lmadi (ENCRYPTION_KEY noto'g'ri yoki ma'lumot buzilgan)"
        ) from exc
