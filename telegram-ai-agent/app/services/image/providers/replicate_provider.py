"""Replicate (Flux va boshqa modellar) rasm provideri — ixtiyoriy adapter."""
from __future__ import annotations

import asyncio

import httpx
import structlog

from app.config import get_settings
from app.services.image.providers.base import ImageError, ImageProvider, ImageResult

settings = get_settings()
log = structlog.get_logger()

_API_BASE = "https://api.replicate.com/v1/predictions"
_POLL_INTERVAL = 2
_MAX_POLLS = 60


class ReplicateProvider(ImageProvider):
    """Replicate REST API orqali rasm yaratadi (create -> poll -> download)."""

    name = "replicate"

    def __init__(self) -> None:
        self._token = (
            settings.REPLICATE_API_TOKEN.get_secret_value()
            if settings.REPLICATE_API_TOKEN
            else None
        )
        self.model_version = settings.REPLICATE_MODEL

    @property
    def is_available(self) -> bool:
        return bool(self._token and self.model_version)

    async def generate(self, *, prompt: str, width: int, height: int) -> ImageResult:
        headers = {
            "Authorization": f"Token {self._token}",
            "Content-Type": "application/json",
        }
        payload = {
            "version": self.model_version,
            "input": {"prompt": prompt, "width": width, "height": height},
        }
        try:
            async with httpx.AsyncClient(timeout=settings.IMAGE_TIMEOUT) as http:
                created = await http.post(_API_BASE, headers=headers, json=payload)
                created.raise_for_status()
                get_url = created.json()["urls"]["get"]

                for _ in range(_MAX_POLLS):
                    poll = await http.get(get_url, headers=headers)
                    poll.raise_for_status()
                    data = poll.json()
                    status = data.get("status")
                    if status == "succeeded":
                        output = data.get("output")
                        image_url = output[0] if isinstance(output, list) else output
                        img = await http.get(image_url)
                        img.raise_for_status()
                        return ImageResult(data=img.content, width=width, height=height)
                    if status in ("failed", "canceled"):
                        raise ImageError(f"Replicate holati: {status}")
                    await asyncio.sleep(_POLL_INTERVAL)
        except httpx.HTTPError as exc:
            raise ImageError(f"Replicate API xatosi: {exc}") from exc

        raise ImageError("Replicate: vaqt tugadi (timeout)")
