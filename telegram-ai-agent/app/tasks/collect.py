"""Celery task: yangilik yig'ish bosqichi (pipeline 1/4)."""
from __future__ import annotations

import asyncio

import structlog

from app.core.celery_app import celery_app

log = structlog.get_logger()


@celery_app.task(
    bind=True,
    name="pipeline.collect",
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def collect_news(self, task_id: int) -> dict:
    """Yangilik yig'adi; natija bo'lsa generatsiya bosqichiga o'tadi."""
    from app.services.orchestrator import Orchestrator

    orchestrator = Orchestrator()
    news_ids = asyncio.run(orchestrator.collect_stage(task_id))

    if news_ids:
        from app.tasks.generate import generate_content

        generate_content.delay(task_id)
    else:
        asyncio.run(orchestrator.fail(task_id, "yangilik topilmadi"))

    log.info("pipeline.collect.done", task_id=task_id, collected=len(news_ids))
    return {"task_id": task_id, "collected": len(news_ids)}
