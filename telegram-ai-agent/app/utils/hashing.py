"""Hashing yordamchilari — dedup uchun content_hash."""
from __future__ import annotations

import hashlib


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def content_hash(title: str | None, url: str | None) -> str:
    """Yangilikni takrorlanmas belgilash uchun sarlavha+URL dan hash."""
    key = f"{(title or '').strip().lower()}|{(url or '').strip().lower()}"
    return sha256_hex(key)
