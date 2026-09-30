"""Domen konstantalari va Enum'lar (modellar va servislar shulardan foydalanadi)."""
from __future__ import annotations

from enum import Enum


class UserRole(str, Enum):
    """Tizim foydalanuvchi rollari."""

    ADMIN = "admin"
    OPERATOR = "operator"


class TaskStatus(str, Enum):
    """Agent buyrug'ining pipeline holati (state machine)."""

    NEW = "new"
    COLLECTING = "collecting"
    GENERATING = "generating"
    REVIEW = "review"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    DONE = "done"
    FAILED = "failed"


class NewsSourceType(str, Enum):
    """Yangilik manbasi turi."""

    RSS = "rss"
    API = "api"
    SCRAPE = "scrape"


class NewsItemStatus(str, Enum):
    """Yig'ilgan yangilik holati."""

    FETCHED = "fetched"
    SELECTED = "selected"
    DISCARDED = "discarded"


class PostStatus(str, Enum):
    """Post holati."""

    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHED = "published"


class PostTargetStatus(str, Enum):
    """Postning aniq bir kanaldagi joylanish holati."""

    PENDING = "pending"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"


class ScheduleStatus(str, Enum):
    """Rejalashtirilgan joblar holati."""

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class MediaType(str, Enum):
    """Media turi."""

    IMAGE = "image"
    VIDEO = "video"


class ChannelTone(str, Enum):
    """Kanal post uslubi (Claude prompt'iga ta'sir qiladi)."""

    PROFESSIONAL = "professional"
    CASUAL = "casual"
    TECHNICAL = "technical"
    NEWS = "news"
    MARKETING = "marketing"


class Language(str, Enum):
    """Post tili."""

    UZ = "uz"
    RU = "ru"
    EN = "en"


class PublishMode(str, Enum):
    """Kanalga joylash rejimi."""

    TELETHON = "telethon"
    BOT_API = "bot_api"


class LogLevel(str, Enum):
    """publish_logs uchun log darajasi."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
