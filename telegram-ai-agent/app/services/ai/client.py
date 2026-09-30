"""AI providerlar: umumiy interfeys, Claude (asosiy), OpenAI/Gemini (fallback) va router.

Adapter pattern: har provider bir xil `complete()` shartnomasini bajaradi.
Router ularni tartib bilan sinaydi (Claude → OpenAI → Gemini) va birinchi
muvaffaqiyatli javobni qaytaradi. Provider SDK'lari faqat ishlatilganda
(lazy) import qilinadi — shuning uchun o'rnatilmagan fallback modul importini
buzmaydi.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass

import structlog

from app.config import get_settings

settings = get_settings()
log = structlog.get_logger()


class AIError(Exception):
    """AI moduli umumiy xatosi."""


class AllProvidersFailed(AIError):
    """Barcha providerlar ishlamadi."""


@dataclass(slots=True)
class AICompletion:
    """AI javobi (qaysi provider/model bergani bilan)."""

    text: str
    provider: str
    model: str


class AIProvider(abc.ABC):
    """AI provider abstrakt interfeysi."""

    name: str
    model: str

    @property
    @abc.abstractmethod
    def is_available(self) -> bool:
        """API kaliti mavjudmi (ya'ni ishlatsa bo'ladimi)."""

    @abc.abstractmethod
    async def complete(self, *, system: str, prompt: str, max_tokens: int) -> str:
        """System + prompt asosida matn qaytaradi."""


# ------------------------------- Claude (asosiy) ------------------------------
class ClaudeProvider(AIProvider):
    """Anthropic Claude — asosiy provider."""

    name = "claude"

    def __init__(self) -> None:
        self.model = settings.CLAUDE_MODEL
        self._api_key = (
            settings.ANTHROPIC_API_KEY.get_secret_value()
            if settings.ANTHROPIC_API_KEY
            else None
        )
        self._client = None

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        if self._client is None:
            from anthropic import AsyncAnthropic  # lazy import

            self._client = AsyncAnthropic(
                api_key=self._api_key,
                timeout=settings.AI_REQUEST_TIMEOUT,
                max_retries=2,  # SDK 429/5xx da avtomatik qayta uradi
            )
        return self._client

    async def complete(self, *, system: str, prompt: str, max_tokens: int) -> str:
        client = self._get_client()
        # DIQQAT: temperature/top_p yubormaymiz — opus-4-8/sonnet-5 ularni 400 bilan rad etadi.
        response = await client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            block.text for block in response.content if block.type == "text"
        )


# ------------------------------ OpenAI (fallback) -----------------------------
class OpenAIProvider(AIProvider):
    """OpenAI (GPT) — fallback provider."""

    name = "openai"

    def __init__(self) -> None:
        self.model = settings.OPENAI_MODEL
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

            self._client = AsyncOpenAI(
                api_key=self._api_key,
                timeout=settings.AI_REQUEST_TIMEOUT,
                max_retries=2,
            )
        return self._client

    async def complete(self, *, system: str, prompt: str, max_tokens: int) -> str:
        client = self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=settings.AI_TEMPERATURE,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content or ""


# ------------------------------ Gemini (fallback) -----------------------------
class GeminiProvider(AIProvider):
    """Google Gemini — fallback provider."""

    name = "gemini"

    def __init__(self) -> None:
        self.model = settings.GEMINI_MODEL
        self._api_key = (
            settings.GEMINI_API_KEY.get_secret_value()
            if settings.GEMINI_API_KEY
            else None
        )
        self._configured = False

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    async def complete(self, *, system: str, prompt: str, max_tokens: int) -> str:
        import google.generativeai as genai  # lazy import

        if not self._configured:
            genai.configure(api_key=self._api_key)
            self._configured = True
        model = genai.GenerativeModel(self.model, system_instruction=system)
        response = await model.generate_content_async(
            prompt,
            generation_config={
                "max_output_tokens": max_tokens,
                "temperature": settings.AI_TEMPERATURE,
            },
        )
        return response.text or ""


def default_providers() -> list[AIProvider]:
    """Standart tartib: Claude asosiy, keyin OpenAI, keyin Gemini."""
    return [ClaudeProvider(), OpenAIProvider(), GeminiProvider()]


class AIRouter:
    """Providerlarni tartib bilan sinaydigan router (fallback bilan)."""

    def __init__(self, providers: list[AIProvider] | None = None) -> None:
        self._providers = providers if providers is not None else default_providers()

    async def complete(
        self, *, system: str, prompt: str, max_tokens: int | None = None
    ) -> AICompletion:
        """Birinchi ishlagan providerdan javob oladi; hech biri ishlamasa xato."""
        max_tokens = max_tokens or settings.CLAUDE_MAX_TOKENS
        available = [p for p in self._providers if p.is_available]
        if not available:
            raise AllProvidersFailed(
                "Hech qanday AI provider sozlanmagan (API kalitlar yo'q)"
            )

        errors: list[str] = []
        for provider in available:
            try:
                text = await provider.complete(
                    system=system, prompt=prompt, max_tokens=max_tokens
                )
                if not text or not text.strip():
                    raise AIError("bo'sh javob")
                if provider.name != "claude":
                    log.info("ai.fallback.used", provider=provider.name)
                return AICompletion(
                    text=text.strip(), provider=provider.name, model=provider.model
                )
            except Exception as exc:  # noqa: BLE001 — keyingi providerga o'tamiz
                log.warning("ai.provider.failed", provider=provider.name, error=str(exc))
                errors.append(f"{provider.name}: {exc}")
                continue

        raise AllProvidersFailed("Barcha providerlar ishlamadi -> " + "; ".join(errors))
