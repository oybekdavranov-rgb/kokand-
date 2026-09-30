"""Ilova konfiguratsiyasi — barcha sozlamalar muhit o'zgaruvchilaridan (.env) o'qiladi."""
from __future__ import annotations

from enum import Enum
from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Environment(str, Enum):
    """Ishga tushirish muhitlari."""

    LOCAL = "local"
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Markaziy sozlamalar konteyneri (pydantic-settings)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ------------------------------- Ilova --------------------------------
    APP_NAME: str = "Telegram AI Agent"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Environment = Environment.LOCAL
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    # NoDecode: pydantic-settings satrni JSON deb o'qimasin — quyidagi
    # validator vergul bilan ajratilgan qiymatni ro'yxatga aylantiradi.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["*"]
    )

    # ---------------------------- Xavfsizlik ------------------------------
    SECRET_KEY: SecretStr
    ENCRYPTION_KEY: SecretStr
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    JWT_ALGORITHM: str = "HS256"

    # ----------------------------- PostgreSQL -----------------------------
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "tgagent"
    POSTGRES_PASSWORD: SecretStr
    POSTGRES_DB: str = "tgagent"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_ECHO: bool = False

    # ------------------------------- Redis --------------------------------
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: SecretStr | None = None
    REDIS_DB: int = 0
    CELERY_BROKER_DB: int = 1
    CELERY_RESULT_DB: int = 2

    # --------------------------- Claude (asosiy AI) -----------------------
    ANTHROPIC_API_KEY: SecretStr | None = None
    CLAUDE_MODEL: str = "claude-opus-4-8"
    CLAUDE_MAX_TOKENS: int = 2048
    # Diqqat: Claude (opus-4-8/sonnet-5) temperature'ni qabul qilmaydi.
    # Bu qiymat faqat fallback (OpenAI/Gemini) providerlar uchun ishlatiladi.
    AI_TEMPERATURE: float = 0.7
    AI_REQUEST_TIMEOUT: float = 60.0  # AI so'rovi osilib qolmasin

    # -------------------------- AI fallback providerlar -------------------
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: SecretStr | None = None
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # ------------------------------ Image AI ------------------------------
    IMAGE_PROVIDER: str = "openai"  # openai | stable_diffusion | replicate
    OPENAI_API_KEY: SecretStr | None = None
    REPLICATE_API_TOKEN: SecretStr | None = None
    MEDIA_STORAGE_DIR: str = "/app/media"
    MEDIA_RETENTION_DAYS: int = 7  # eski rasmlarni avtomatik o'chirish (disk to'lmasin)
    IMAGE_SIZE: str = "1024x1024"
    IMAGE_TIMEOUT: int = 120
    DALLE_MODEL: str = "dall-e-3"
    # Lokal Stable Diffusion (Automatic1111 txt2img API), masalan: http://stable-diffusion:7860
    SD_API_URL: str | None = None
    SD_STEPS: int = 30
    SD_NEGATIVE_PROMPT: str = "low quality, blurry, watermark, text, deformed"
    REPLICATE_MODEL: str | None = None  # model versiyasi (hash)

    # ------------------------------ Telegram ------------------------------
    TELEGRAM_PUBLISH_MODE: str = "telethon"
    TELEGRAM_API_ID: int | None = None
    TELEGRAM_API_HASH: SecretStr | None = None
    TELEGRAM_BOT_TOKEN: SecretStr | None = None
    # Admin boshqaruv paneli faqat shu Telegram user ID orqali ishlaydi
    ADMIN_TELEGRAM_ID: int | None = None
    MIN_DELAY_BETWEEN_POSTS: int = 30
    MAX_DELAY_BETWEEN_POSTS: int = 90
    DAILY_POST_LIMIT: int = 50

    # ----------------------------- Yangiliklar ----------------------------
    NEWS_LOOKBACK_HOURS: int = 24
    NEWS_MAX_ITEMS: int = 5
    NEWS_REQUEST_TIMEOUT: int = 15

    # ------------------------------ Scheduler -----------------------------
    DAILY_PLAN_HOUR: int = 6  # UTC — har kuni shu vaqtda kunlik reja tuziladi
    DAILY_PLAN_MINUTE: int = 0
    DISPATCH_INTERVAL_SECONDS: int = 60  # dispatcher har necha soniyada tekshiradi
    # Kanalda o'z post_times bo'lmasa ishlatiladigan standart vaqtlar (UTC)
    DEFAULT_POST_TIMES: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["09:00", "13:00", "18:00"]
    )
    PUBLISH_MAX_RETRIES: int = 5

    # ----------------------------- Validatorlar ---------------------------
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, value: object) -> object:
        """Vergul bilan ajratilgan satrni ro'yxatga aylantiradi."""
        if isinstance(value, str):
            value = value.strip()
            if value in ("", "*"):
                return ["*"]
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("DEFAULT_POST_TIMES", mode="before")
    @classmethod
    def _split_times(cls, value: object) -> object:
        """'09:00,13:00' satrini ro'yxatga aylantiradi."""
        if isinstance(value, str):
            return [t.strip() for t in value.split(",") if t.strip()]
        return value

    # -------------------------- Hosil qilingan URL ------------------------
    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL(self) -> str:
        """Async (asyncpg) ulanish satri — ilova uchun."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:"
            f"{self.POSTGRES_PASSWORD.get_secret_value()}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL_SYNC(self) -> str:
        """Sync (psycopg2) ulanish satri — Alembic migratsiyalari uchun."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:"
            f"{self.POSTGRES_PASSWORD.get_secret_value()}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    def _redis_url(self, db: int) -> str:
        password = (
            f":{self.REDIS_PASSWORD.get_secret_value()}@"
            if self.REDIS_PASSWORD
            else ""
        )
        return f"redis://{password}{self.REDIS_HOST}:{self.REDIS_PORT}/{db}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def REDIS_URL(self) -> str:
        return self._redis_url(self.REDIS_DB)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def CELERY_BROKER_URL(self) -> str:
        return self._redis_url(self.CELERY_BROKER_DB)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        return self._redis_url(self.CELERY_RESULT_DB)

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    """Sozlamalarni bir marta o'qib, kesh qiladi (singleton)."""
    return Settings()  # type: ignore[call-arg]
