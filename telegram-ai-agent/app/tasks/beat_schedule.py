"""Celery Beat davriy vazifalari: kunlik reja va har daqiqa dispatch."""
from __future__ import annotations

import asyncio

import structlog

from app.core.celery_app import celery_app
from app.services.scheduler import dispatcher

log = structlog.get_logger()


@celery_app.task(name="scheduler.dispatch_due")
def dispatch_due_schedules() -> int:
    """Har daqiqa: vaqti kelgan schedule'larni topib publish navbatiga tashlaydi."""
    from app.tasks.publish import publish_post_target

    claimed = asyncio.run(dispatcher.dispatch_due())
    for schedule_id, post_target_id in claimed:
        publish_post_target.apply_async(
            args=[post_target_id, schedule_id], queue="publish"
        )
    return len(claimed)


@celery_app.task(name="scheduler.cleanup_media")
def cleanup_media() -> int:
    """Eski media fayllarni o'chiradi (disk to'lib qolmasligi uchun)."""
    import time
    from pathlib import Path

    from app.config import get_settings

    settings = get_settings()
    cutoff = time.time() - settings.MEDIA_RETENTION_DAYS * 86_400
    media_dir = Path(settings.MEDIA_STORAGE_DIR)
    removed = 0
    if media_dir.exists():
        for file in media_dir.iterdir():
            if file.is_file() and file.stat().st_mtime < cutoff:
                file.unlink(missing_ok=True)
                removed += 1
    if removed:
        log.info("scheduler.media_cleaned", removed=removed)
    return removed


@celery_app.task(name="scheduler.plan_daily")
def plan_daily_posts() -> int | None:
    """Har kuni: kunlik post rejasini boshlaydi (AgentTask yaratadi + pipeline'ni qo'zg'aydi)."""
    task_id = asyncio.run(_create_daily_task())
    if task_id is not None:
        from app.tasks.collect import collect_news

        collect_news.delay(task_id)
        log.info("scheduler.plan_daily.started", task_id=task_id)
    return task_id


async def _create_daily_task() -> int:
    """Kunlik avtomatik buyruq uchun AgentTask yozuvini yaratadi."""
    from app.constants import TaskStatus
    from app.db.session import TaskSessionLocal
    from app.models.agent_task import AgentTask

    async with TaskSessionLocal() as session:
        task = AgentTask(
            command="Bugungi IT yangiliklarini kanallarga joyla",
            params={"topic": "IT", "auto": True},
            status=TaskStatus.NEW,
            auto_publish=True,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)
        return task.id
