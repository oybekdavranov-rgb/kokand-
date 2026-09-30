"""Rasmni saqlash — lokal diskka yozadi va (fayl yo'li + URL) qaytaradi.

Publisher shu fayl yo'lidan foydalanadi (Telethon send_file / Bot API sendPhoto).
Kelajakda S3 adapteri shu interfeys asosida qo'shiladi.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

import structlog

from app.config import get_settings

settings = get_settings()
log = structlog.get_logger()


@dataclass(slots=True)
class StoredFile:
    """Saqlangan fayl haqida ma'lumot."""

    path: str  # diskdagi absolyut yo'l (publisher shu bilan yuboradi)
    url: str  # ilova orqali ochiladigan nisbiy URL (/media/...)
    filename: str


class LocalStorage:
    """Rasmlarni lokal `MEDIA_STORAGE_DIR` papkasiga saqlaydi."""

    def __init__(self, base_dir: str | None = None) -> None:
        self.base_dir = Path(base_dir or settings.MEDIA_STORAGE_DIR)

    async def save(self, data: bytes, *, ext: str = "png") -> StoredFile:
        """Baytlarni unikal nom bilan saqlaydi va StoredFile qaytaradi."""
        self.base_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.{ext}"
        path = self.base_dir / filename
        path.write_bytes(data)
        log.info("image.saved", path=str(path), size=len(data))
        return StoredFile(path=str(path), url=f"/media/{filename}", filename=filename)
