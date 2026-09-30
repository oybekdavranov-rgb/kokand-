"""Image provider abstrakt interfeysi va umumiy tiplar."""
from __future__ import annotations

import abc
from dataclasses import dataclass


class ImageError(Exception):
    """Rasm yaratish moduli umumiy xatosi."""


@dataclass(slots=True)
class ImageResult:
    """Provider qaytaradigan xom rasm natijasi."""

    data: bytes
    width: int
    height: int
    content_type: str = "image/png"


def parse_size(size: str, default: tuple[int, int] = (1024, 1024)) -> tuple[int, int]:
    """'1024x1024' -> (1024, 1024). Xato formatda default qaytaradi."""
    try:
        w, h = size.lower().split("x")
        return int(w), int(h)
    except (ValueError, AttributeError):
        return default


class ImageProvider(abc.ABC):
    """Rasm generatsiya provideri uchun umumiy shartnoma."""

    name: str

    @property
    @abc.abstractmethod
    def is_available(self) -> bool:
        """Provider sozlanganmi (API kaliti / endpoint bor)."""

    @abc.abstractmethod
    async def generate(self, *, prompt: str, width: int, height: int) -> ImageResult:
        """Prompt asosida rasm baytlarini qaytaradi."""
