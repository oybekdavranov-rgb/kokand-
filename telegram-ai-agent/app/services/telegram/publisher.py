"""Telethon publisher — kanalga matn/rasm post qiladi (rate-limit + FloodWait himoya)."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

import structlog
from telethon.errors import (
    ChannelPrivateError,
    ChatWriteForbiddenError,
    FloodWaitError,
    PeerFloodError,
    RPCError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
)

# PeerFlood dan keyin akkauntni shu muddatga pauza qilamiz (spam himoyasi)
_PEER_FLOOD_PAUSE_SECONDS = 3600

from app.services.telegram import (
    PublishResult,
    RateLimitExceeded,
    TelegramPublishError,
)
from app.services.telegram.client import TelegramClientManager
from app.services.telegram.rate_limiter import RateLimiter

if TYPE_CHECKING:
    from app.models.channel import Channel
    from app.models.telegram_account import TelegramAccount

log = structlog.get_logger()

# Bardosh chegarasi: FloodWait shundan katta bo'lsa kutmaymiz, xato qaytaramiz.
MAX_FLOOD_WAIT_SECONDS = 300
# Bir postni joylashga urinishlar soni (FloodWait bo'yicha)
MAX_ATTEMPTS = 2


class TelethonPublisher:
    """Shaxsiy akkaunt (userbot) orqali kanalga post joylaydi."""

    def __init__(
        self,
        client_manager: TelegramClientManager | None = None,
        rate_limiter: RateLimiter | None = None,
    ) -> None:
        self._clients = client_manager or TelegramClientManager()
        self._rate = rate_limiter or RateLimiter()

    async def aclose(self) -> None:
        """Telethon ulanishlarini uzadi va rate-limiter Redis'ini yopadi.

        MUHIM: har publish task oxirida chaqiriladi — aks holda Telethon
        ulanishi va Redis mijozi ochiq qolib, resurs sizib ketadi.
        """
        await self._clients.disconnect_all()
        await self._rate.aclose()

    @staticmethod
    def _resolve_target(channel: "Channel") -> str | int:
        """Kanal modelidan Telethon uchun manzil (username yoki channel_id) ajratadi."""
        if channel.tg_username:
            return channel.tg_username.lstrip("@")
        if channel.tg_channel_id:
            return channel.tg_channel_id
        raise TelegramPublishError(
            f"Kanal #{channel.id}: na tg_username, na tg_channel_id bor"
        )

    async def publish(
        self,
        account: "TelegramAccount",
        channel: "Channel",
        text: str,
        *,
        image_path: str | None = None,
        apply_delay: bool = True,
    ) -> PublishResult:
        """Bitta kanalga post joylaydi va natijani (PublishResult) qaytaradi.

        Hech qachon istisno (exception) ko'tarmaydi — barcha xatolar
        `PublishResult(success=False, error=...)` ko'rinishida qaytadi.
        """
        # 1) Kunlik limit / faol FloodWait tekshiruvi
        try:
            await self._rate.check(account.id)
        except RateLimitExceeded as exc:
            return PublishResult(success=False, error=str(exc))

        # 2) Mijoz va manzil
        try:
            client = await self._clients.get_client(account)
            target = self._resolve_target(channel)
        except TelegramPublishError as exc:
            return PublishResult(success=False, error=str(exc))
        except Exception as exc:  # TelegramAuthError va boshqalar
            return PublishResult(success=False, error=f"Ulanish xatosi: {exc}")

        # 3) Rasm mavjudligini oldindan tekshiramiz
        media: str | None = None
        if image_path:
            path = Path(image_path)
            if not path.exists():
                return PublishResult(success=False, error=f"Rasm topilmadi: {image_path}")
            media = str(path)

        # 4) Joylash (FloodWait bo'yicha cheklangan qayta urinish bilan)
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                entity = await client.get_entity(target)
                if media:
                    message = await client.send_file(
                        entity, file=media, caption=text, parse_mode="html"
                    )
                else:
                    message = await client.send_message(
                        entity, text, parse_mode="html", link_preview=False
                    )
            except FloodWaitError as exc:
                await self._rate.register_flood_wait(account.id, exc.seconds)
                if exc.seconds <= MAX_FLOOD_WAIT_SECONDS and attempt < MAX_ATTEMPTS:
                    log.warning(
                        "telethon.floodwait.retry",
                        account_id=account.id,
                        seconds=exc.seconds,
                        attempt=attempt,
                    )
                    await asyncio.sleep(exc.seconds + 1)
                    continue
                return PublishResult(
                    success=False,
                    error=f"FloodWait {exc.seconds}s (chegaradan katta yoki urinishlar tugadi)",
                    flood_wait_seconds=exc.seconds,
                )
            except (ChannelPrivateError, ChatWriteForbiddenError) as exc:
                return PublishResult(
                    success=False,
                    error=f"Kanalga yozish taqiqlangan: {exc.__class__.__name__}",
                )
            except (UsernameInvalidError, UsernameNotOccupiedError) as exc:
                return PublishResult(
                    success=False, error=f"Kanal topilmadi: {exc.__class__.__name__}"
                )
            except PeerFloodError:
                # Spam sifatida belgilandi — QAYTA URINMAYMIZ, akkauntni pauza qilamiz.
                await self._rate.register_flood_wait(
                    account.id, _PEER_FLOOD_PAUSE_SECONDS
                )
                log.error("telethon.peer_flood", account_id=account.id)
                return PublishResult(
                    success=False,
                    error="PeerFloodError — akkaunt spam sifatida belgilandi (1 soat pauza)",
                )
            except RPCError as exc:
                log.error("telethon.rpc_error", account_id=account.id, error=str(exc))
                return PublishResult(
                    success=False, error=f"Telegram RPC xato: {exc.__class__.__name__}"
                )

            # 5) Muvaffaqiyat — hisoblagich + inson kabi pauza
            await self._rate.register_post(account.id)
            log.info(
                "telethon.published",
                account_id=account.id,
                channel=str(target),
                message_id=message.id,
                with_image=bool(media),
            )
            if apply_delay:
                await self._rate.human_delay()
            return PublishResult(success=True, message_id=message.id)

        # Nazariy jihatdan yetib kelmaydi
        return PublishResult(success=False, error="Noma'lum holat")
