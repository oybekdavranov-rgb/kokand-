"""Celery ilovasi — Redis broker/backend, task marshrutlari, retry va Beat jadvali."""
from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "telegram_ai_agent",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    # Task modullari worker/beat ishga tushganda ro'yxatga olinadi (lazy):
    include=[
        "app.tasks.beat_schedule",
        "app.tasks.collect",
        "app.tasks.generate",
        "app.tasks.image",
        "app.tasks.publish",
    ],
)

celery_app.conf.update(
    # Serializatsiya / vaqt
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Ishonchlilik: vazifa bajarilgach ack qilinadi; worker o'lsa qayta bajariladi
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    result_expires=3600,
    # Publisher bittalab ishlashi uchun (spam bo'lmasin)
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=200,
    # Standart retry siyosati (task'lar o'zi ham aniqroq belgilaydi)
    task_default_retry_delay=10,
    # Marshrutlar: publish alohida "publish" navbatida (1 ta publisher worker),
    # qolgan bosqichlar "default" navbatda (N ta worker).
    task_routes={
        "scheduler.publish_post_target": {"queue": "publish"},
        "scheduler.*": {"queue": "default"},
        "pipeline.*": {"queue": "default"},
    },
)

# --- Beat (davriy) jadval ---
celery_app.conf.beat_schedule = {
    # Har daqiqa: vaqti kelgan schedule'larni topib publish navbatiga tashlaydi
    "dispatch-due-schedules": {
        "task": "scheduler.dispatch_due",
        "schedule": float(settings.DISPATCH_INTERVAL_SECONDS),
    },
    # Har kuni belgilangan vaqtda: kunlik post rejasini boshlaydi
    "plan-daily-posts": {
        "task": "scheduler.plan_daily",
        "schedule": crontab(
            hour=settings.DAILY_PLAN_HOUR, minute=settings.DAILY_PLAN_MINUTE
        ),
    },
    # Har kuni 04:00 UTC: eski media fayllarni tozalash (disk to'lmasin)
    "cleanup-old-media": {
        "task": "scheduler.cleanup_media",
        "schedule": crontab(hour=4, minute=0),
    },
}
