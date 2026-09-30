"""Integratsiya testlari — haqiqiy Postgres bilan (uchidan-uchiga pipeline)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

UTC = timezone.utc


# ------------------------------ Alembic migratsiya ----------------------------
def test_alembic_upgrade_downgrade():
    """`alembic upgrade head` barcha jadvalni yaratadi, `downgrade base` o'chiradi."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect

    from app.config import get_settings

    settings = get_settings()
    engine = create_engine(settings.DATABASE_URL_SYNC)
    # toza holat
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")

    tables = set(inspect(engine).get_table_names())
    assert {"users", "channels", "posts", "schedules", "alembic_version"} <= tables, tables

    command.downgrade(cfg, "base")
    remaining = set(inspect(engine).get_table_names())
    assert "posts" not in remaining
    engine.dispose()


# ------------------------------- News Collector -------------------------------
async def test_collector_dedup(db, monkeypatch):
    """Collector yangilikni saqlaydi va dublikatlarni tashlaydi."""
    from app.constants import TaskStatus
    from app.db.session import TaskSessionLocal
    from app.models.agent_task import AgentTask
    from app.models.news_item import NewsItem
    from app.services.news.collector import NewsCollector
    from app.services.news.sources.base import RawNews

    canned = [
        RawNews(title="A yangilik", url="http://a"),
        RawNews(title="B yangilik", url="http://b"),
        RawNews(title="A yangilik", url="http://a"),  # dublikat
    ]

    async def _fake_fetch(_adapters):
        return canned

    monkeypatch.setattr(NewsCollector, "_fetch_all", staticmethod(_fake_fetch))

    async with TaskSessionLocal() as session:
        task = AgentTask(command="t", params={}, status=TaskStatus.NEW)
        session.add(task)
        await session.commit()
        task_id = task.id

    ids1 = await NewsCollector().collect(task_id, limit=5)
    assert len(ids1) == 2  # ichki dublikat tashlandi

    ids2 = await NewsCollector().collect(task_id, limit=5)
    assert len(ids2) == 0  # DB dedup — hammasi allaqachon bor

    async with TaskSessionLocal() as session:
        total = await session.scalar(select(func.count()).select_from(NewsItem))
    assert total == 2


# ---------------------------- Orchestrator pipeline ---------------------------
async def test_orchestrator_generate_and_schedule(db):
    """generate -> (rasm o'tkazib) -> schedule: post, 2 target, 2 schedule, DONE."""
    from app.constants import (
        NewsItemStatus,
        PostTargetStatus,
        TaskStatus,
    )
    from app.db.session import TaskSessionLocal
    from app.models.agent_task import AgentTask
    from app.models.channel import Channel
    from app.models.news_item import NewsItem
    from app.models.post import Post
    from app.models.post_target import PostTarget
    from app.models.schedule import Schedule
    from app.models.telegram_account import TelegramAccount
    from app.models.user import User
    from app.services.ai.client import AICompletion, AIRouter
    from app.services.orchestrator import Orchestrator

    class FakeRouter(AIRouter):
        def __init__(self):
            super().__init__(providers=[])

        async def complete(self, *, system, prompt, max_tokens=None):
            return AICompletion(
                text='{"title":"Sarlavha","body":"Post matni <b>ok</b> & test","hashtags":["#IT","#AI"]}',
                provider="fake",
                model="fake-model",
            )

    async with TaskSessionLocal() as session:
        user = User(email="a@b.c", password_hash="x")
        session.add(user)
        await session.flush()
        account = TelegramAccount(user_id=user.id, is_active=True)
        session.add(account)
        await session.flush()
        session.add_all(
            [
                Channel(account_id=account.id, title="K1", tg_username="k1", is_active=True, post_times=["09:00"]),
                Channel(account_id=account.id, title="K2", tg_username="k2", is_active=True, post_times=[]),
            ]
        )
        task = AgentTask(
            command="/post_now",
            params={"publish_now": True},
            status=TaskStatus.NEW,
            auto_publish=True,
        )
        session.add(task)
        await session.flush()
        session.add(
            NewsItem(
                task_id=task.id,
                title="Yangi AI model",
                summary="qisqacha",
                url="http://x.com/n",
                content_hash="hash-1",
                status=NewsItemStatus.SELECTED,
            )
        )
        await session.commit()
        task_id = task.id

    orchestrator = Orchestrator(router=FakeRouter())
    post_ids = await orchestrator.generate_stage(task_id)
    assert len(post_ids) == 1

    await orchestrator.image_and_finalize(task_id)

    async with TaskSessionLocal() as session:
        posts = (await session.execute(select(Post))).scalars().all()
        targets = (await session.execute(select(PostTarget))).scalars().all()
        schedules = (await session.execute(select(Schedule))).scalars().all()
        task = await session.get(AgentTask, task_id)

    assert len(posts) == 1
    assert len(targets) == 2  # 2 kanal
    assert len(schedules) == 2  # har kanalga schedule
    assert all(t.status == PostTargetStatus.SCHEDULED for t in targets)
    assert task.status == TaskStatus.DONE


# ------------------------------- Dispatcher -----------------------------------
async def test_dispatcher_claims_due(db):
    """Vaqti kelgan schedule 'claim' qilinadi (RUNNING), ikkinchi marta olinmaydi."""
    from app.constants import PostStatus, ScheduleStatus, TaskStatus
    from app.db.session import TaskSessionLocal
    from app.models.agent_task import AgentTask
    from app.models.channel import Channel
    from app.models.post import Post
    from app.models.post_target import PostTarget
    from app.models.schedule import Schedule
    from app.models.telegram_account import TelegramAccount
    from app.models.user import User
    from app.services.scheduler import dispatcher

    async with TaskSessionLocal() as session:
        user = User(email="d@e.f", password_hash="x")
        session.add(user)
        await session.flush()
        account = TelegramAccount(user_id=user.id)
        session.add(account)
        await session.flush()
        channel = Channel(account_id=account.id, title="C")
        session.add(channel)
        await session.flush()
        task = AgentTask(command="t", params={}, status=TaskStatus.NEW)
        session.add(task)
        await session.flush()
        post = Post(task_id=task.id, body="b", status=PostStatus.APPROVED)
        session.add(post)
        await session.flush()
        target = PostTarget(post_id=post.id, channel_id=channel.id)
        session.add(target)
        await session.flush()
        session.add(
            Schedule(
                post_target_id=target.id,
                run_at=datetime.now(UTC) - timedelta(minutes=1),  # o'tgan vaqt
                status=ScheduleStatus.PENDING,
            )
        )
        await session.commit()

    claimed = await dispatcher.dispatch_due()
    assert len(claimed) == 1

    claimed_again = await dispatcher.dispatch_due()
    assert len(claimed_again) == 0  # allaqachon RUNNING
