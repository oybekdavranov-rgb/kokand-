"""Celery task: Claude bilan post yaratish bosqichi (pipeline 2/4)."""
from __future__ import annotations

import asyncio

import structlog

from app.core.celery_app import celery_app

log = structlog.get_logger()


@celery_app.task(
    bind=True,
    name="pipeline.generate",
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def generate_content(self, task_id: int) -> dict:
    """Tanlangan yangiliklardan post yaratadi; keyin rasm bosqichiga o'tadi."""
    from app.services.orchestrator import Orchestrator

    orchestrator = Orchestrator()
    post_ids = asyncio.run(orchestrator.generate_stage(task_id))

    if post_ids:
        from app.tasks.image import generate_images

        generate_images.delay(task_id)

    log.info("pipeline.generate.done", task_id=task_id, posts=len(post_ids))
    return {"task_id": task_id, "posts": len(post_ids)}
