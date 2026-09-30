"""DALL·E (OpenAI) rasm provideri."""
from __future__ import annotations

import base64

import structlog

from app.config import get_settings
from app.services.image.providers.base import ImageError, ImageProvider, ImageResult

settings = get_settings()
log = structlog.get_logger()

# DALL·E 3 qo'llab-quvvatlaydigan o'lchamlar
_DALLE3_SIZES = {"1024x1024", "1792x1024", "1024x1792"}


class OpenAIImageProvider(ImageProvider):
    """OpenAI DALL·E orqali rasm yaratadi."""

    name = "openai"

    def __init__(self) -> None:
        self.model = settings.DALLE_MODEL
        self._api_key = (
            settings.OPENAI_API_KEY.get_secret_value()
            if settings.OPENAI_API_KEY
            else None
        )
        self._client = None

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI  # lazy import

            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    async def generate(self, *, prompt: str, width: int, height: int) -> ImageResult:
        client = self._get_client()
        size = f"{width}x{height}"
        if size not in _DALLE3_SIZES:
            size = "1024x1024"
            width = height = 1024
        response = await client.images.generate(
            model=self.model,
            prompt=prompt,
            size=size,
            n=1,
            response_format="b64_json",
        )
        b64 = response.data[0].b64_json
        if not b64:
            raise ImageError("DALL·E bo'sh natija qaytardi")
        return ImageResult(
            data=base64.b64decode(b64), width=width, height=height, content_type="image/png"
        )
