"""Image Generator — post mavzusidan AI bilan rasm prompt yaratadi va rasm chizadi.

Oqim:
  1) build_prompt() — Claude (AIRouter) yordamida postdan sifatli inglizcha
     rasm-prompt yaratadi (rasm modellari inglizcha promptni yaxshi tushunadi).
  2) provider.generate() — DALL·E / Stable Diffusion / Replicate rasm chizadi.
  3) storage.save() — rasmni diskka saqlaydi; publisher shu fayl yo'lini ishlatadi.
"""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.config import get_settings
from app.services.ai.client import AIRouter
from app.services.image.providers.base import ImageError, ImageProvider, parse_size
from app.services.image.providers.openai_provider import OpenAIImageProvider
from app.services.image.providers.replicate_provider import ReplicateProvider
from app.services.image.providers.stable_diffusion_provider import StableDiffusionProvider
from app.services.image.storage import LocalStorage

settings = get_settings()
log = structlog.get_logger()

_PROVIDERS: dict[str, type[ImageProvider]] = {
    "openai": OpenAIImageProvider,
    "dalle": OpenAIImageProvider,
    "stable_diffusion": StableDiffusionProvider,
    "sd": StableDiffusionProvider,
    "replicate": ReplicateProvider,
}

_PROMPT_SYSTEM = (
    "You are an expert prompt engineer for AI image generation. Given a news "
    "topic, produce ONE concise English prompt for a clean, professional, "
    "editorial-style illustration or banner. No text or letters in the image. "
    "Describe subject, style, mood, lighting and colors. Return ONLY the prompt."
)


def build_provider(name: str | None = None) -> ImageProvider:
    """IMAGE_PROVIDER (yoki berilgan nom) bo'yicha provider yaratadi."""
    key = (name or settings.IMAGE_PROVIDER).lower()
    provider_cls = _PROVIDERS.get(key, OpenAIImageProvider)
    return provider_cls()


@dataclass(slots=True)
class GeneratedImage:
    """Yaratilgan rasm natijasi (media_assets jadvaliga mos)."""

    path: str  # diskdagi fayl yo'li — publisher shu bilan yuboradi
    url: str  # nisbiy URL (/media/...)
    prompt: str
    provider: str
    width: int
    height: int


class ImageGenerator:
    """Postga mos rasm yaratadi (prompt -> rasm -> saqlash)."""

    def __init__(
        self,
        provider: ImageProvider | None = None,
        router: AIRouter | None = None,
        storage: LocalStorage | None = None,
    ) -> None:
        self._provider = provider or build_provider()
        self._router = router or AIRouter()
        self._storage = storage or LocalStorage()

    @property
    def is_available(self) -> bool:
        """Rasm provideri sozlanganmi (API kalit/endpoint bor)."""
        return self._provider.is_available

    async def build_prompt(self, *, title: str, summary: str = "") -> str:
        """Post sarlavha/mazmunidan inglizcha rasm-prompt yaratadi (AI orqali)."""
        user_prompt = "\n".join(
            [
                "News topic:",
                f"Title: {title}",
                f"Summary: {summary or '(none)'}",
                "",
                "Write the image generation prompt now.",
            ]
        )
        completion = await self._router.complete(
            system=_PROMPT_SYSTEM, prompt=user_prompt, max_tokens=200
        )
        return completion.text.strip()

    async def generate(
        self,
        *,
        title: str,
        summary: str = "",
        prompt: str | None = None,
        size: str | None = None,
    ) -> GeneratedImage:
        """Postga rasm yaratadi va saqlaydi. `prompt` berilmasa AI yaratadi."""
        if not self._provider.is_available:
            raise ImageError(
                f"Image provider '{self._provider.name}' sozlanmagan (API kalit/endpoint yo'q)"
            )

        image_prompt = prompt or await self.build_prompt(title=title, summary=summary)
        width, height = parse_size(size or settings.IMAGE_SIZE)

        result = await self._provider.generate(
            prompt=image_prompt, width=width, height=height
        )
        stored = await self._storage.save(result.data, ext="png")

        log.info(
            "image.generated",
            provider=self._provider.name,
            path=stored.path,
            size=f"{result.width}x{result.height}",
        )
        return GeneratedImage(
            path=stored.path,
            url=stored.url,
            prompt=image_prompt,
            provider=self._provider.name,
            width=result.width,
            height=result.height,
        )
