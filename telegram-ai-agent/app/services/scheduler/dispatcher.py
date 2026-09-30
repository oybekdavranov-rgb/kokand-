"""Scheduler dispatcher — vaqti kelgan schedule'larni topib "band qiladi" (claim)."""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ScheduleStatus
from app.db.session import TaskSessionLocal
from app.models.schedule import Schedule

log = structlog.get_logger()
UTC = timezone.utc


async def fetch_due(
    session: AsyncSession, now: datetime | None = None, limit: int = 100
) -> list[Schedule]:
    """run_at <= now bo'lgan pending schedule'larni qaytaradi (eng eski birinchi)."""
    now = now or datetime.now(UTC)
    stmt = (
        select(Schedule)
        .where(Schedule.status == ScheduleStatus.PENDING, Schedule.run_at <= now)
        .order_by(Schedule.run_at)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars())


async def dispatch_due(now: datetime | None = None) -> list[tuple[int, int]]:
    """Vaqti kelgan schedule'larni RUNNING ga o'tkazadi va (schedule_id, post_target_id) qaytaradi.

    "Claim" — statusni RUNNING qilib commit qiladi, shunda ikki worker bir
    schedule'ni ikki marta joylamaydi.
    """
    async with TaskSessionLocal() as session:
        due = await fetch_due(session, now)
        claimed: list[tuple[int, int]] = []
        for schedule in due:
            schedule.status = ScheduleStatus.RUNNING
            schedule.attempts += 1
            claimed.append((schedule.id, schedule.post_target_id))
        await session.commit()
        if claimed:
            log.info("scheduler.dispatched", count=len(claimed))
        return claimed
