"""Celery task: rasm yaratish + rejalashtirish bosqichi (pipeline 3-4/4)."""
from __future__ import annotations

import asyncio

import structlog

from app.core.celery_app import celery_app

log = structlog.get_logger()


@celery_app.task(
    bind=True,
    name="pipeline.image",
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def generate_images(self, task_id: int) -> dict:
    """Har postga rasm yaratadi (ixtiyoriy), so'ng joylashni rejalashtiradi.

    Rejalashtirilgan schedule'larni keyin scheduler.dispatch_due topib,
    vaqti kelганда publish navbatiga tashlaydi.
    """
    from app.services.orchestrator import Orchestrator

    asyncio.run(Orchestrator().image_and_finalize(task_id))

    log.info("pipeline.image.done", task_id=task_id)
    return {"task_id": task_id, "stage": "image+schedule"}
