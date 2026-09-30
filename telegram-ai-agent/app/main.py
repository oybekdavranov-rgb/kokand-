"""FastAPI ilova kirish nuqtasi — app fabrikasi, middleware, lifespan."""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import Environment, get_settings
from app.db.redis import close_redis, redis_client
from app.db.session import AsyncSessionLocal, dispose_engine

settings = get_settings()


def _configure_logging() -> None:
    """structlog'ni dev'da rangli, prod'da JSON rejimda sozlaydi."""
    level = logging.DEBUG if settings.DEBUG else logging.INFO
    logging.basicConfig(format="%(message)s", level=level)

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]
    if settings.ENVIRONMENT == Environment.LOCAL:
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


log = structlog.get_logger()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown: resurslarni sozlash va toza yopish."""
    _configure_logging()
    log.info("app.startup", app=settings.APP_NAME, env=settings.ENVIRONMENT.value)
    yield
    await dispose_engine()
    await close_redis()
    log.info("app.shutdown")


def create_app() -> FastAPI:
    """FastAPI ilovasini yaratadi va sozlaydi (app fabrikasi)."""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    # Wildcard origin ("*") bilan credentials xavfsiz emas (har qanday sayt
    # credentialli so'rov yubora oladi). Shu sabab "*" bo'lsa credentials o'chadi.
    allow_all_origins = settings.CORS_ORIGINS == ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=not allow_all_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        """Har so'rovga request_id biriktiradi va bajarilish vaqtini loglaydi."""
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

        response.headers["X-Request-ID"] = request_id
        log.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            elapsed_ms=elapsed_ms,
        )
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Kutilmagan xatolarni 500 bilan xavfsiz (ichki tafsilotsiz) qaytaradi."""
        log.error("unhandled_exception", error=str(exc), path=request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Ichki server xatosi"})

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT.value,
            "docs": "/docs",
        }

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        """Liveness — jarayon tirikligini bildiradi (Docker healthcheck)."""
        return {"status": "ok"}

    @app.get("/health/ready", tags=["meta"])
    async def readiness() -> JSONResponse:
        """Readiness — PostgreSQL va Redis ulanishini tekshiradi."""
        checks: dict[str, str] = {}

        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            checks["postgres"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["postgres"] = f"error: {exc}"

        try:
            await redis_client.ping()
            checks["redis"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["redis"] = f"error: {exc}"

        healthy = all(value == "ok" for value in checks.values())
        return JSONResponse(
            status_code=200 if healthy else 503,
            content={"status": "ready" if healthy else "degraded", "checks": checks},
        )

    # NOTE: to'liq API router keyingi bosqichda ulanadi:
    #   from app.api.router import api_router
    #   app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
