"""Celery task: kanalga joylash — retry va exponential backoff bilan."""
from __future__ import annotations

import asyncio
import html
from datetime import datetime, timezone

import structlog

from app.config import get_settings
from app.core.celery_app import celery_app

settings = get_settings()
log = structlog.get_logger()
UTC = timezone.utc


def _backoff_seconds(retries: int) -> int:
    """Exponential backoff: 10, 20, 40, 80, 160 ... (maks 600s)."""
    return min(600, (2**retries) * 10)


@celery_app.task(
    bind=True,
    name="scheduler.publish_post_target",
    acks_late=True,
    max_retries=settings.PUBLISH_MAX_RETRIES,
)
def publish_post_target(self, post_target_id: int, schedule_id: int | None = None) -> dict:
    """Bitta post_target'ni kanalga joylaydi; xatoda backoff bilan qayta uriniladi."""
    try:
        result = asyncio.run(_publish_impl(post_target_id, schedule_id))
    except Exception as exc:  # infra xatosi (DB/ulanish) -> qayta urinamiz
        log.warning(
            "publish.infra_error",
            post_target_id=post_target_id,
            error=str(exc),
            retry=self.request.retries,
        )
        raise self.retry(exc=exc, countdown=_backoff_seconds(self.request.retries))

    if not result["success"]:
        if self.request.retries < self.max_retries:
            log.warning(
                "publish.retry",
                post_target_id=post_target_id,
                error=result["error"],
                retry=self.request.retries + 1,
            )
            raise self.retry(
                exc=RuntimeError(result["error"]),
                countdown=_backoff_seconds(self.request.retries),
            )
        # Urinishlar tugadi -> yakuniy FAILED
        asyncio.run(_mark_failed(post_target_id, schedule_id, result["error"]))
        log.error("publish.failed_final", post_target_id=post_target_id, error=result["error"])

    return result


async def _publish_impl(post_target_id: int, schedule_id: int | None) -> dict:
    """post_target'ni yuklaydi, kerakli publisher orqali joylaydi va holatni yangilaydi."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.constants import PostTargetStatus, PublishMode, ScheduleStatus
    from app.db.session import TaskSessionLocal
    from app.models.channel import Channel
    from app.models.post import Post
    from app.models.post_target import PostTarget

    async with TaskSessionLocal() as session:
        stmt = (
            select(PostTarget)
            .where(PostTarget.id == post_target_id)
            .options(
                selectinload(PostTarget.post).selectinload(Post.media_assets),
                selectinload(PostTarget.channel).selectinload(Channel.account),
            )
        )
        target = (await session.execute(stmt)).scalar_one_or_none()
        if target is None:
            return {"success": False, "error": f"post_target #{post_target_id} topilmadi"}

        post = target.post
        channel = target.channel
        text = _format_text(post)
        media_path = post.media_assets[0].storage_url if post.media_assets else None

        # Publisher tanlash (rejim bo'yicha)
        if settings.TELEGRAM_PUBLISH_MODE == PublishMode.BOT_API.value:
            from app.services.telegram.bot_api import BotApiPublisher

            publisher = BotApiPublisher()
            chat_id = channel.tg_username or channel.tg_channel_id
            result = await publisher.publish(chat_id, text, image_path=media_path)
            await publisher.aclose()
        else:
            from app.services.telegram.publisher import TelethonPublisher

            publisher = TelethonPublisher()
            try:
                result = await publisher.publish(
                    channel.account, channel, text, image_path=media_path
                )
            finally:
                await publisher.aclose()  # ulanish/redis sizib ketmasin

        if result.success:
            target.status = PostTargetStatus.PUBLISHED
            target.telegram_message_id = result.message_id
            target.published_at = datetime.now(UTC)
            await _set_schedule(session, schedule_id, ScheduleStatus.DONE)
            await session.commit()
            return {"success": True, "message_id": result.message_id}

        target.error = result.error
        await session.commit()
        return {
            "success": False,
            "error": result.error,
            "flood_wait": result.flood_wait_seconds,
        }


async def _mark_failed(post_target_id: int, schedule_id: int | None, error: str) -> None:
    """Yakuniy muvaffaqiyatsizlikda holatlarni FAILED qiladi."""
    from app.constants import PostTargetStatus, ScheduleStatus
    from app.db.session import TaskSessionLocal
    from app.models.post_target import PostTarget

    async with TaskSessionLocal() as session:
        target = await session.get(PostTarget, post_target_id)
        if target is not None:
            target.status = PostTargetStatus.FAILED
            target.error = error
        await _set_schedule(session, schedule_id, ScheduleStatus.FAILED)
        await session.commit()


async def _set_schedule(session, schedule_id: int | None, status) -> None:
    if schedule_id is None:
        return
    from app.models.schedule import Schedule

    schedule = await session.get(Schedule, schedule_id)
    if schedule is not None:
        schedule.status = status


def _format_text(post) -> str:
    """Postdan Telegram uchun HTML matn tuzadi (sarlavha + matn + hashtaglar).

    Dinamik matn html.escape bilan qochiriladi — aks holda postdagi `<`, `&`
    kabi belgilar Telegram HTML parse xatosini (BadRequest) keltirib chiqaradi.
    """
    parts: list[str] = []
    if post.title:
        parts.append(f"<b>{html.escape(post.title)}</b>")
    parts.append(html.escape(post.body))
    if post.hashtags:
        parts.append(" ".join(html.escape(tag) for tag in post.hashtags))
    return "\n\n".join(parts)
