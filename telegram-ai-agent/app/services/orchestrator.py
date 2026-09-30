"""Orchestrator — pipeline "miya"si: collect → generate → image → schedule.

Har bosqich alohida (Celery task'idan) chaqiriladi va o'z TaskSessionLocal
sessiyasini ochadi (Celery loop xavfsizligi uchun). AgentTask.status state
machine bo'yicha yangilanadi.
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.constants import (
    NewsItemStatus,
    PostStatus,
    PostTargetStatus,
    ScheduleStatus,
    TaskStatus,
)
from app.db.session import TaskSessionLocal
from app.models.agent_task import AgentTask
from app.models.channel import Channel
from app.models.media_asset import MediaAsset
from app.models.news_item import NewsItem
from app.models.post import Post
from app.models.post_target import PostTarget
from app.models.schedule import Schedule
from app.services.ai.client import AIRouter
from app.services.ai.content_generator import ContentGenerator
from app.services.image.providers.base import ImageError
from app.services.image.generator import ImageGenerator
from app.services.news.collector import NewsCollector
from app.services.scheduler import planner

log = structlog.get_logger()
UTC = timezone.utc


class Orchestrator:
    """Pipeline bosqichlarini boshqaradi."""

    def __init__(self, router: AIRouter | None = None) -> None:
        self._router = router or AIRouter()

    # ------------------------------ Bosqichlar --------------------------------
    async def collect_stage(self, task_id: int) -> list[int]:
        """1-bosqich: yangilik yig'ish."""
        await self._set_status(task_id, TaskStatus.COLLECTING)
        collector = NewsCollector()
        news_ids = await collector.collect(task_id)
        log.info("orchestrator.collect_done", task_id=task_id, count=len(news_ids))
        return news_ids

    async def generate_stage(self, task_id: int) -> list[int]:
        """2-bosqich: har yangilikdan post + har kanalga post_target."""
        await self._set_status(task_id, TaskStatus.GENERATING)
        generator = ContentGenerator(router=self._router)

        async with TaskSessionLocal() as session:
            task = await session.get(AgentTask, task_id)
            news = (
                await session.execute(
                    select(NewsItem).where(
                        NewsItem.task_id == task_id,
                        NewsItem.status == NewsItemStatus.SELECTED,
                    )
                )
            ).scalars().all()
            channels = (
                await session.execute(
                    select(Channel).where(Channel.is_active.is_(True))
                )
            ).scalars().all()

            if not channels:
                await self._fail(task_id, "faol kanal yo'q — avval /add_channel")
                return []
            if not news:
                await self._fail(task_id, "yangilik topilmadi")
                return []

            approved = PostStatus.APPROVED if (task and task.auto_publish) else PostStatus.DRAFT
            language = channels[0].language
            tone = channels[0].tone

            post_ids: list[int] = []
            for item in news:
                generated = await generator.generate_post(
                    title=item.title,
                    summary=item.summary or "",
                    url=item.url,
                    language=language,
                    tone=tone,
                )
                post = Post(
                    task_id=task_id,
                    news_item_id=item.id,
                    title=generated.title,
                    body=generated.body,
                    hashtags=generated.hashtags,
                    source_url=item.url,
                    model=generated.model,
                    status=approved,
                )
                session.add(post)
                await session.flush()  # post.id kerak
                for channel in channels:
                    session.add(
                        PostTarget(
                            post_id=post.id,
                            channel_id=channel.id,
                            status=PostTargetStatus.PENDING,
                        )
                    )
                post_ids.append(post.id)
            await session.commit()

        log.info("orchestrator.generate_done", task_id=task_id, posts=len(post_ids))
        return post_ids

    async def image_and_finalize(self, task_id: int) -> None:
        """3-4 bosqich: rasm yaratish (ixtiyoriy) + rejalashtirish/yakunlash."""
        await self._image_stage(task_id)
        await self._finalize(task_id)

    async def _image_stage(self, task_id: int) -> None:
        image_gen = ImageGenerator(router=self._router)
        if not image_gen.is_available:
            log.info("orchestrator.image_skipped", reason="provider sozlanmagan")
            return
        async with TaskSessionLocal() as session:
            posts = (
                await session.execute(select(Post).where(Post.task_id == task_id))
            ).scalars().all()
            for post in posts:
                try:
                    image = await image_gen.generate(
                        title=post.title or "", summary=(post.body or "")[:200]
                    )
                    session.add(
                        MediaAsset(
                            post_id=post.id,
                            provider=image.provider,
                            prompt=image.prompt,
                            storage_url=image.path,
                            width=image.width,
                            height=image.height,
                        )
                    )
                except ImageError as exc:  # rasm ixtiyoriy — post matnli chiqadi
                    log.warning("orchestrator.image_failed", post_id=post.id, error=str(exc))
            await session.commit()

    async def _finalize(self, task_id: int) -> None:
        """auto_publish bo'lsa rejalashtiradi, aks holda REVIEW da qoldiradi."""
        async with TaskSessionLocal() as session:
            task = await session.get(AgentTask, task_id)
            auto = task.auto_publish if task else True
            publish_now = bool(task.params.get("publish_now")) if task and task.params else False

        if not auto:
            await self._set_status(task_id, TaskStatus.REVIEW)
            log.info("orchestrator.review", task_id=task_id)
            return

        await self._schedule_stage(task_id, immediate=publish_now)
        await self._set_status(task_id, TaskStatus.DONE)
        log.info("orchestrator.done", task_id=task_id)

    async def _schedule_stage(self, task_id: int, *, immediate: bool) -> None:
        """Har post_target uchun kanal vaqti bo'yicha (yoki hoziroq) schedule yaratadi."""
        now = datetime.now(UTC)
        async with TaskSessionLocal() as session:
            rows = (
                await session.execute(
                    select(PostTarget, Channel)
                    .join(Channel, PostTarget.channel_id == Channel.id)
                    .join(Post, PostTarget.post_id == Post.id)
                    .where(
                        Post.task_id == task_id,
                        PostTarget.status == PostTargetStatus.PENDING,
                    )
                )
            ).all()
            for target, channel in rows:
                run_at = now if immediate else planner.next_run_time(channel.post_times)
                session.add(
                    Schedule(
                        post_target_id=target.id,
                        run_at=run_at,
                        status=ScheduleStatus.PENDING,
                    )
                )
                target.status = PostTargetStatus.SCHEDULED
            await session.commit()
            log.info("orchestrator.scheduled", task_id=task_id, count=len(rows), immediate=immediate)

    # ------------------------------ Yordamchilar ------------------------------
    async def fail(self, task_id: int, reason: str) -> None:
        await self._fail(task_id, reason)

    @staticmethod
    async def _set_status(task_id: int, status: TaskStatus) -> None:
        async with TaskSessionLocal() as session:
            task = await session.get(AgentTask, task_id)
            if task is not None:
                task.status = status
                await session.commit()

    @staticmethod
    async def _fail(task_id: int, reason: str) -> None:
        async with TaskSessionLocal() as session:
            task = await session.get(AgentTask, task_id)
            if task is not None:
                task.status = TaskStatus.FAILED
                task.error = reason
                await session.commit()
        log.warning("orchestrator.failed", task_id=task_id, reason=reason)
