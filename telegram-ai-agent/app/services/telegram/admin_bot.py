"""Telegram admin boshqaruv paneli (bot).

Kanallarga post qiladigan userbot'dan ALOHIDA — bu bot admindan buyruq oladi.
Faqat `ADMIN_TELEGRAM_ID` egasi ishlata oladi. Telethon bot rejimida ishlaydi.

Buyruqlar: /start /status /add_channel /remove_channel /post_now /schedule /logs
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import func, select

from app.config import get_settings
from app.constants import PostTargetStatus, ScheduleStatus, TaskStatus
from app.db.session import AsyncSessionLocal
from app.models.agent_task import AgentTask
from app.models.channel import Channel
from app.models.post_target import PostTarget
from app.models.publish_log import PublishLog
from app.models.schedule import Schedule
from app.models.telegram_account import TelegramAccount

settings = get_settings()
log = structlog.get_logger()
UTC = timezone.utc

HELP_TEXT = (
    "👋 <b>Telegram AI Agent — Admin panel</b>\n\n"
    "Mavjud buyruqlar:\n"
    "/status — tizim holati\n"
    "/add_channel <code>@kanal Sarlavha</code> — kanal qo'shish\n"
    "/remove_channel <code>@kanal</code> — kanalni o'chirish\n"
    "/post_now — hoziroq post pipeline'ini boshlash\n"
    "/schedule — yaqin rejalashtirilgan postlar\n"
    "/logs [n] — oxirgi loglar\n"
)


# --------------------------- Yordamchi (pure) funksiyalar ---------------------
def is_admin(sender_id: int | None, admin_id: int | None) -> bool:
    """Faqat sozlangan admin ID true qaytaradi."""
    return bool(admin_id) and sender_id == admin_id


def parse_channel_arg(text: str) -> tuple[str | None, str | None]:
    """'@kanal Sarlavha' -> ('@kanal', 'Sarlavha'). Bo'sh bo'lsa (None, None)."""
    text = (text or "").strip()
    if not text:
        return None, None
    parts = text.split(maxsplit=1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def channel_fields(identifier: str) -> tuple[str | None, int | None]:
    """Identifikatordan (username, tg_channel_id) ajratadi."""
    identifier = identifier.strip()
    if identifier.lstrip("-").isdigit():
        return None, int(identifier)
    return identifier.lstrip("@"), None


# ------------------------------ Buyruq mantiqi --------------------------------
async def cmd_status(session) -> str:
    """Tizim holatini matn qilib qaytaradi."""
    active_channels = await session.scalar(
        select(func.count()).select_from(Channel).where(Channel.is_active.is_(True))
    )
    pending = await session.scalar(
        select(func.count())
        .select_from(Schedule)
        .where(Schedule.status == ScheduleStatus.PENDING)
    )
    published_today = await session.scalar(
        select(func.count())
        .select_from(PostTarget)
        .where(PostTarget.status == PostTargetStatus.PUBLISHED)
    )
    last_task = await session.scalar(
        select(AgentTask).order_by(AgentTask.created_at.desc()).limit(1)
    )
    last_line = (
        f"#{last_task.id} — {last_task.status.value}" if last_task else "yo'q"
    )
    return (
        "📊 <b>Tizim holati</b>\n\n"
        f"• Faol kanallar: <b>{active_channels or 0}</b>\n"
        f"• Kutayotgan rejalar: <b>{pending or 0}</b>\n"
        f"• Jami joylangan postlar: <b>{published_today or 0}</b>\n"
        f"• Oxirgi vazifa: {last_line}"
    )


async def cmd_add_channel(session, arg: str) -> str:
    """Kanal qo'shadi (birinchi faol akkauntga bog'laydi)."""
    identifier, title = parse_channel_arg(arg)
    if not identifier:
        return "Foydalanish: <code>/add_channel @kanal Sarlavha</code>"

    account_id = await session.scalar(
        select(TelegramAccount.id)
        .where(TelegramAccount.is_active.is_(True))
        .limit(1)
    )
    if account_id is None:
        return "⚠️ Avval Telegram akkaunt qo'shing (login qiling)."

    username, channel_id = channel_fields(identifier)
    channel = Channel(
        account_id=account_id,
        title=title or identifier,
        tg_username=username,
        tg_channel_id=channel_id,
    )
    session.add(channel)
    await session.commit()
    return f"✅ Kanal qo'shildi: <b>{channel.title}</b> ({identifier})"


async def cmd_remove_channel(session, arg: str) -> str:
    """Kanalni faolsizlantiradi (soft-delete)."""
    identifier, _ = parse_channel_arg(arg)
    if not identifier:
        return "Foydalanish: <code>/remove_channel @kanal</code>"
    username, channel_id = channel_fields(identifier)

    stmt = select(Channel)
    if username is not None:
        stmt = stmt.where(Channel.tg_username == username)
    else:
        stmt = stmt.where(Channel.tg_channel_id == channel_id)

    channel = await session.scalar(stmt.limit(1))
    if channel is None:
        return f"❌ Kanal topilmadi: {identifier}"
    channel.is_active = False
    await session.commit()
    return f"🗑 Kanal faolsizlantirildi: <b>{channel.title}</b>"


async def cmd_post_now(session) -> tuple[str, int | None]:
    """Yangi AgentTask yaratadi va (matn, task_id) qaytaradi — chaqiruvchi pipeline'ni yoqadi."""
    task = AgentTask(
        command="/post_now — admin buyrug'i",
        params={"topic": "IT", "source": "admin_bot", "publish_now": True},
        status=TaskStatus.NEW,
        auto_publish=True,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return f"🚀 Pipeline boshlandi (vazifa #{task.id})", task.id


async def cmd_schedule(session, limit: int = 10) -> str:
    """Yaqin rejalashtirilgan postlarni ko'rsatadi."""
    now = datetime.now(UTC)
    stmt = (
        select(Schedule.run_at, Channel.title)
        .join(PostTarget, Schedule.post_target_id == PostTarget.id)
        .join(Channel, PostTarget.channel_id == Channel.id)
        .where(Schedule.status == ScheduleStatus.PENDING, Schedule.run_at >= now)
        .order_by(Schedule.run_at)
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    if not rows:
        return "📭 Yaqin rejalashtirilgan post yo'q."
    lines = [
        f"• {run_at.strftime('%m-%d %H:%M')} UTC — {title}" for run_at, title in rows
    ]
    return "🗓 <b>Yaqin rejalar</b>\n\n" + "\n".join(lines)


async def cmd_logs(session, limit: int = 10) -> str:
    """Oxirgi joylash loglarini ko'rsatadi."""
    stmt = (
        select(PublishLog.created_at, PublishLog.level, PublishLog.message)
        .order_by(PublishLog.created_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    if not rows:
        return "📄 Loglar hozircha yo'q."
    icons = {"info": "ℹ️", "warning": "⚠️", "error": "❌"}
    lines = [
        f"{icons.get(level.value if hasattr(level, 'value') else level, '•')} "
        f"{created.strftime('%m-%d %H:%M')} — {message}"
        for created, level, message in rows
    ]
    return "📄 <b>Oxirgi loglar</b>\n\n" + "\n".join(lines)


# -------------------------------- Bot klassi ----------------------------------
class AdminBot:
    """Telethon bot rejimida ishlaydigan admin panel."""

    def __init__(self) -> None:
        self._api_id = settings.TELEGRAM_API_ID
        self._api_hash = (
            settings.TELEGRAM_API_HASH.get_secret_value()
            if settings.TELEGRAM_API_HASH
            else None
        )
        self._token = (
            settings.TELEGRAM_BOT_TOKEN.get_secret_value()
            if settings.TELEGRAM_BOT_TOKEN
            else None
        )
        self._admin_id = settings.ADMIN_TELEGRAM_ID
        self._client = None

    def _build(self) -> None:
        """Telethon mijozini yaratadi va handlerlarni ro'yxatga oladi (ulanmasdan)."""
        from telethon import TelegramClient
        from telethon.sessions import StringSession

        self._client = TelegramClient(
            StringSession(), self._api_id, self._api_hash
        )
        self._register_handlers()

    async def _guard(self, event) -> bool:
        """Faqat admin o'tadi; boshqalarga rad javobi."""
        if is_admin(event.sender_id, self._admin_id):
            return True
        await event.reply("⛔ Bu bot faqat admin uchun.")
        log.warning("admin_bot.denied", sender_id=event.sender_id)
        return False

    @staticmethod
    def _args(event) -> str:
        """Buyruqdan keyingi argument matnini qaytaradi."""
        text = event.raw_text or ""
        parts = text.split(maxsplit=1)
        return parts[1] if len(parts) > 1 else ""

    def _register_handlers(self) -> None:
        from telethon import events

        client = self._client

        @client.on(events.NewMessage(pattern=r"^/start"))
        async def _start(event):
            if not await self._guard(event):
                return
            await event.reply(HELP_TEXT, parse_mode="html")

        @client.on(events.NewMessage(pattern=r"^/status"))
        async def _status(event):
            if not await self._guard(event):
                return
            async with AsyncSessionLocal() as session:
                await event.reply(await cmd_status(session), parse_mode="html")

        @client.on(events.NewMessage(pattern=r"^/add_channel"))
        async def _add_channel(event):
            if not await self._guard(event):
                return
            async with AsyncSessionLocal() as session:
                await event.reply(
                    await cmd_add_channel(session, self._args(event)), parse_mode="html"
                )

        @client.on(events.NewMessage(pattern=r"^/remove_channel"))
        async def _remove_channel(event):
            if not await self._guard(event):
                return
            async with AsyncSessionLocal() as session:
                await event.reply(
                    await cmd_remove_channel(session, self._args(event)),
                    parse_mode="html",
                )

        @client.on(events.NewMessage(pattern=r"^/post_now"))
        async def _post_now(event):
            if not await self._guard(event):
                return
            async with AsyncSessionLocal() as session:
                text, task_id = await cmd_post_now(session)
            if task_id is not None:
                from app.tasks.collect import collect_news

                collect_news.delay(task_id)
            await event.reply(text, parse_mode="html")

        @client.on(events.NewMessage(pattern=r"^/schedule"))
        async def _schedule(event):
            if not await self._guard(event):
                return
            async with AsyncSessionLocal() as session:
                await event.reply(await cmd_schedule(session), parse_mode="html")

        @client.on(events.NewMessage(pattern=r"^/logs"))
        async def _logs(event):
            if not await self._guard(event):
                return
            arg = self._args(event).strip()
            limit = int(arg) if arg.isdigit() else 10
            async with AsyncSessionLocal() as session:
                await event.reply(await cmd_logs(session, limit), parse_mode="html")

    async def run(self) -> None:
        """Botni ishga tushiradi va uzilguncha ishlaydi (24/7 servis)."""
        if not self._token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN sozlanmagan")
        if not self._admin_id:
            log.warning("admin_bot.no_admin_id — hech kim ishlata olmaydi!")
        self._build()
        await self._client.start(bot_token=self._token)
        log.info("admin_bot.started", admin_id=self._admin_id)
        await self._client.run_until_disconnected()
