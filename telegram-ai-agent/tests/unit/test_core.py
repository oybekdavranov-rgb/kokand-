"""Unit testlar — sof mantiq (DB/tarmoqsiz), Redis uchun fakeredis."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

UTC = timezone.utc


# ------------------------------- Hashing / dedup ------------------------------
def test_content_hash_normalizes():
    from app.utils.hashing import content_hash

    a = content_hash("Salom AI", "http://x.com/a")
    b = content_hash("  salom ai ", "HTTP://X.COM/A")  # trim + lower
    assert a == b and len(a) == 64


# --------------------------------- Ranker -------------------------------------
def test_ranker_orders_by_weight_and_recency():
    from app.services.news import ranker
    from app.services.news.sources.base import RawNews

    now = datetime(2026, 7, 24, tzinfo=UTC)
    old = RawNews(title="eski", source_weight=1.0, published_at=now - timedelta(hours=40))
    fresh = RawNews(title="yangi", source_weight=1.0, published_at=now - timedelta(hours=1))
    heavy = RawNews(title="vaznli", source_weight=3.0, published_at=now - timedelta(hours=40))

    order = [i.title for i in ranker.rank([old, fresh, heavy], now=now)]
    assert order[0] == "vaznli"
    assert order.index("yangi") < order.index("eski")


# --------------------------------- RSS parse ----------------------------------
def test_rss_map_entries_cleans_html():
    import feedparser

    from app.services.news.sources.rss_source import map_entries

    xml = """<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Yangi AI chip</title><link>http://x.com/1</link>
    <description>&lt;p&gt;Tez chip&lt;/p&gt;</description>
    <pubDate>Wed, 22 Jul 2026 10:00:00 GMT</pubDate></item>
    <item><title>Python 3.13</title><link>http://x.com/2</link><description>Reliz</description></item>
    </channel></rss>"""
    items = map_entries(feedparser.parse(xml).entries, name="Test", source_id=1, weight=1.5)
    assert len(items) == 2
    assert items[0].title == "Yangi AI chip"
    assert "Tez chip" in items[0].summary and "<p>" not in items[0].summary
    assert items[0].published_at is not None


# --------------------------------- Planner ------------------------------------
def test_planner_next_run_time():
    from app.services.scheduler import planner

    times = ["09:00", "15:00"]
    at_10 = datetime(2026, 7, 24, 10, 0, tzinfo=UTC)
    assert planner.next_run_time(times, now=at_10).hour == 15  # keyingi bugun

    at_20 = datetime(2026, 7, 24, 20, 0, tzinfo=UTC)
    nxt = planner.next_run_time(times, now=at_20)
    assert nxt.day == 25 and nxt.hour == 9  # ertaga birinchi


# ----------------------------- Publish HTML escape ----------------------------
def test_format_text_escapes_html():
    from app.tasks.publish import _format_text

    class P:
        title = "AI & <b>"
        body = "5 < 10 & ok"
        hashtags = ["#IT"]

    text = _format_text(P())
    assert "<b>AI &amp; &lt;b&gt;</b>" in text  # sarlavha <b> saqlanadi, ichi escape
    assert "5 &lt; 10 &amp; ok" in text


# ------------------------------- Admin bot helpers ----------------------------
def test_admin_helpers():
    from app.services.telegram.admin_bot import (
        channel_fields,
        is_admin,
        parse_channel_arg,
    )

    assert is_admin(555, 555) is True
    assert is_admin(999, 555) is False
    assert is_admin(555, None) is False
    assert parse_channel_arg("@kanal Nomi") == ("@kanal", "Nomi")
    assert channel_fields("@mychan") == ("mychan", None)
    assert channel_fields("-1001234567890") == (None, -1001234567890)


# --------------------------------- Image size ---------------------------------
def test_image_parse_size():
    from app.services.image.providers.base import parse_size

    assert parse_size("1792x1024") == (1792, 1024)
    assert parse_size("buzuq") == (1024, 1024)


# --------------------------------- Config URLs --------------------------------
def test_config_builds_urls():
    from app.config import get_settings

    s = get_settings()
    assert s.DATABASE_URL.startswith("postgresql+asyncpg://")
    assert s.DATABASE_URL_SYNC.startswith("postgresql+psycopg2://")
    assert s.CELERY_BROKER_URL.endswith("/1")


# ------------------------------ AI router fallback ----------------------------
async def test_ai_router_fallback():
    from app.services.ai.client import AICompletion, AIProvider, AIRouter, AllProvidersFailed

    class Fail(AIProvider):
        name = "fail"
        model = "x"

        @property
        def is_available(self):
            return True

        async def complete(self, *, system, prompt, max_tokens):
            raise RuntimeError("xato")

    class Ok(AIProvider):
        name = "ok"
        model = "ok-model"

        @property
        def is_available(self):
            return True

        async def complete(self, *, system, prompt, max_tokens):
            return "javob"

    result = await AIRouter(providers=[Fail(), Ok()]).complete(system="s", prompt="p")
    assert result.provider == "ok" and result.text == "javob"

    with pytest.raises(AllProvidersFailed):
        await AIRouter(providers=[Fail(), Fail()]).complete(system="s", prompt="p")


# -------------------------------- Rate limiter --------------------------------
async def test_rate_limiter_daily_limit(monkeypatch):
    import fakeredis.aioredis as fr

    from app.services.telegram import RateLimitExceeded
    from app.services.telegram.rate_limiter import RateLimiter

    redis = fr.FakeRedis(decode_responses=True)
    limiter = RateLimiter(redis=redis, daily_limit=2, min_delay=1, max_delay=1)

    await limiter.check(account_id=7)  # boshda ok
    await limiter.register_post(7)
    await limiter.register_post(7)
    assert await limiter.remaining(7) == 0
    with pytest.raises(RateLimitExceeded):
        await limiter.check(account_id=7)  # limit tugadi

    # human_delay uxlamasin
    import asyncio

    async def _no_sleep(_):
        return None

    monkeypatch.setattr(asyncio, "sleep", _no_sleep)
    delay = await limiter.human_delay()
    assert delay == 1.0  # min=max=1 -> aniq 1.0
    await redis.aclose()
