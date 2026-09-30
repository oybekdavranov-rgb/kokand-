"""Telegram Bot API adapteri — muqobil (xavfsizroq) joylash rejimi.

Foydalanuvchi kanalda ADMIN bo'lgan holatda ishlatiladi. Shaxsiy akkaunt
(Telethon) o'rniga bot orqali joylaydi — akkaunt bloklanish xavfi yo'q.
Publisher bilan bir xil `PublishResult` shartnomasini qaytaradi.
"""
from __future__ import annotations

from pathlib import Path

import httpx
import structlog

from app.config import get_settings
from app.services.telegram import PublishResult

settings = get_settings()
log = structlog.get_logger()

_API_BASE = "https://api.telegram.org"


class BotApiPublisher:
    """Telegram Bot API orqali kanalga post joylaydi (HTTP)."""

    def __init__(
        self,
        bot_token: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        token = bot_token or (
            settings.TELEGRAM_BOT_TOKEN.get_secret_value()
            if settings.TELEGRAM_BOT_TOKEN
            else None
        )
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN sozlanmagan (bot_api rejimi uchun kerak)")
        self._base = f"{_API_BASE}/bot{token}"
        self._http = http_client or httpx.AsyncClient(timeout=30)
        self._owns_http = http_client is None

    async def publish(
        self,
        chat_id: str | int,
        text: str,
        *,
        image_path: str | None = None,
    ) -> PublishResult:
        """Kanalga (chat_id: @username yoki -100... ID) post joylaydi."""
        try:
            if image_path:
                path = Path(image_path)
                if not path.exists():
                    return PublishResult(success=False, error=f"Rasm topilmadi: {image_path}")
                with path.open("rb") as file:
                    response = await self._http.post(
                        f"{self._base}/sendPhoto",
                        data={
                            "chat_id": str(chat_id),
                            "caption": text,
                            "parse_mode": "HTML",
                        },
                        files={"photo": file},
                    )
            else:
                response = await self._http.post(
                    f"{self._base}/sendMessage",
                    data={
                        "chat_id": str(chat_id),
                        "text": text,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": "true",
                    },
                )
        except httpx.HTTPError as exc:
            return PublishResult(success=False, error=f"HTTP xato: {exc}")

        data = response.json()
        if not data.get("ok"):
            params = data.get("parameters") or {}
            retry_after = params.get("retry_after")
            description = data.get("description", "Noma'lum xato")
            log.warning(
                "botapi.publish.failed",
                chat_id=str(chat_id),
                description=description,
                retry_after=retry_after,
            )
            return PublishResult(
                success=False, error=description, flood_wait_seconds=retry_after
            )

        message_id = data["result"]["message_id"]
        log.info("botapi.published", chat_id=str(chat_id), message_id=message_id)
        return PublishResult(success=True, message_id=message_id)

    async def aclose(self) -> None:
        """O'zi yaratgan HTTP mijozini yopadi."""
        if self._owns_http:
            await self._http.aclose()
