"""ORM modellari — bir joyda import qilinadi (Alembic va mapper registratsiyasi uchun).

Alembic `target_metadata = Base.metadata` orqali barcha jadvallarni ko'rishi uchun
har bir model shu yerda import qilinishi shart.
"""
from app.db.base import Base
from app.models.agent_task import AgentTask
from app.models.channel import Channel
from app.models.media_asset import MediaAsset
from app.models.news_item import NewsItem
from app.models.news_source import NewsSource
from app.models.post import Post
from app.models.post_target import PostTarget
from app.models.publish_log import PublishLog
from app.models.schedule import Schedule
from app.models.telegram_account import TelegramAccount
from app.models.user import User

__all__ = [
    "Base",
    "User",
    "TelegramAccount",
    "Channel",
    "NewsSource",
    "NewsItem",
    "AgentTask",
    "Post",
    "MediaAsset",
    "PostTarget",
    "Schedule",
    "PublishLog",
]
