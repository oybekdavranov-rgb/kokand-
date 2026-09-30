"""Stable Diffusion rasm provideri — lokal Automatic1111 (txt2img) API.

O'z serveringizda ishlaydigan Stable Diffusion WebUI (Automatic1111) API'siga
ulanadi: `POST {SD_API_URL}/sdapi/v1/txt2img` -> {"images": ["<base64>"]}.
Bepul (o'z GPU'ingizda), tashqi API kalitisiz.
"""
from __future__ import annotations

import base64

import httpx
import structlog

from app.config import get_settings
from app.services.image.providers.base import ImageError, ImageProvider, ImageResult

settings = get_settings()
log = structlog.get_logger()


class StableDiffusionProvider(ImageProvider):
    """Lokal Stable Diffusion (Automatic1111 txt2img) provideri."""

    name = "stable_diffusion"

    def __init__(self) -> None:
        self.api_url = (settings.SD_API_URL or "").rstrip("/")
        self.steps = settings.SD_STEPS
        self.negative_prompt = settings.SD_NEGATIVE_PROMPT

    @property
    def is_available(self) -> bool:
        return bool(self.api_url)

    async def generate(self, *, prompt: str, width: int, height: int) -> ImageResult:
        payload = {
            "prompt": prompt,
            "negative_prompt": self.negative_prompt,
            "width": width,
            "height": height,
            "steps": self.steps,
            "sampler_name": "DPM++ 2M Karras",
            "cfg_scale": 7,
            "batch_size": 1,
        }
        endpoint = f"{self.api_url}/sdapi/v1/txt2img"
        try:
            async with httpx.AsyncClient(timeout=settings.IMAGE_TIMEOUT) as http:
                response = await http.post(endpoint, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise ImageError(f"Stable Diffusion API xatosi: {exc}") from exc

        images = data.get("images") or []
        if not images:
            raise ImageError("Stable Diffusion bo'sh natija qaytardi")
        # A1111 ba'zan 'data:image/png;base64,...' prefiksi bilan qaytaradi
        raw = images[0].split(",", 1)[-1]
        return ImageResult(
            data=base64.b64decode(raw), width=width, height=height, content_type="image/png"
        )
