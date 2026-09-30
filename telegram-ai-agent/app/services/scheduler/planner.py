"""Scheduler planner — har kanal uchun joylash vaqtini hisoblaydi va schedule yozadi."""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone

import structlog

from app.config import get_settings
from app.constants import ScheduleStatus
from app.models.schedule import Schedule

settings = get_settings()
log = structlog.get_logger()
UTC = timezone.utc

# Kanallar bir postni ketma-ket olganda "inson kabi" ko'rinishi uchun jitter (soniya)
_JITTER_SECONDS = 45


def resolve_channel_times(
    post_times: list[str] | None, *, day: date | None = None
) -> list[datetime]:
    """Kanalning "HH:MM" vaqtlarini berilgan kunning datetime'lariga aylantiradi (UTC)."""
    day = day or datetime.now(UTC).date()
    times = post_times or settings.DEFAULT_POST_TIMES
    result: list[datetime] = []
    for item in times:
        try:
            hh, mm = item.split(":")
            result.append(
                datetime(day.year, day.month, day.day, int(hh), int(mm), tzinfo=UTC)
            )
        except (ValueError, TypeError, AttributeError):
            log.warning("scheduler.bad_post_time", value=item)
    return sorted(result)


def next_run_time(
    post_times: list[str] | None, *, now: datetime | None = None
) -> datetime:
    """Kanal uchun keyingi joylash vaqtini tanlaydi (bugun qolgan yoki ertangi birinchi)."""
    now = now or datetime.now(UTC)
    for candidate in resolve_channel_times(post_times, day=now.date()):
        if candidate > now:
            return candidate + timedelta(seconds=random.randint(0, _JITTER_SECONDS))
    tomorrow = resolve_channel_times(post_times, day=(now + timedelta(days=1)).date())
    if tomorrow:
        return tomorrow[0] + timedelta(seconds=random.randint(0, _JITTER_SECONDS))
    return now + timedelta(minutes=1)  # fallback


async def create_schedule(session, *, post_target_id: int, run_at: datetime) -> Schedule:
    """post_target uchun schedule yozuvi yaratadi (status=pending)."""
    schedule = Schedule(
        post_target_id=post_target_id,
        run_at=run_at,
        status=ScheduleStatus.PENDING,
    )
    session.add(schedule)
    log.info("scheduler.schedule_created", post_target_id=post_target_id, run_at=run_at.isoformat())
    return schedule
