"""B-BOT Advanced FastAPI application."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.chat import router as chat_router
from app.api.chores import router as chores_router
from app.api.dashboard import router as dashboard_router
from app.api.members import router as members_router
from app.api.notifications import router as notifications_router
from app.api.plugins import router as plugins_router
from app.api.reminders import router as reminders_router
from app.api.settings import router as settings_router
from app.core.config import BACKEND_DIR, AppConfig, load_config
from app.core.database import Database
from app.core.events import EventBus
from app.core.llm import LLMProvider
from app.core.scheduler import SchedulerService
from app.core.security import (
    SECURITY_HEADERS,
    BodySizeLimitMiddleware,
    RateLimiter,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.notifications.dispatcher import NotificationDispatcher
from app.plugins.registry import PluginRegistry

logger = logging.getLogger(__name__)

VERSION = "0.1.0"


def _secure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        path.chmod(0o700)
    except OSError:
        pass


def create_app(config: Optional[AppConfig] = None) -> FastAPI:
    active_config = config or load_config()

    docs_enabled = active_config.docs_enabled
    app = FastAPI(
        title="B-BOT Advanced",
        version=VERSION,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.state.config = active_config
    app.state.limiter = RateLimiter(
        requests_per_minute=active_config.rate_limit_per_minute,
        global_per_minute=active_config.global_rate_limit_per_minute,
        max_auth_failures=active_config.auth_max_failures,
        lockout_seconds=active_config.auth_lockout_seconds,
    )

    # Last added middleware is outermost, so security headers cover every response.
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=active_config.max_request_body_bytes,
    )
    app.add_middleware(
        RateLimitMiddleware,
        limiter=app.state.limiter,
        trust_proxy=active_config.trust_proxy_headers,
    )
    if active_config.allow_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    if active_config.security_headers:
        app.add_middleware(SecurityHeadersMiddleware, headers=SECURITY_HEADERS)

    if docs_enabled:
        logger.warning("Interactive API docs are enabled; expose them only on loopback.")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        active_config_resolved = getattr(app.state, "config", None) or config or load_config()
        _secure_directory(active_config_resolved.projects_path)
        _secure_directory(active_config_resolved.backups_path)
        _secure_directory(active_config_resolved.database_path.parent)

        database = Database(active_config_resolved.database_path)
        database.initialize()
        removed = database.purge_expired(active_config_resolved.retention_days)
        if removed["conversations"] or removed["audit_log"]:
            logger.info(
                "Retention cleanup removed %s conversations and %s audit rows",
                removed["conversations"],
                removed["audit_log"],
            )

        events = EventBus(database)
        notifications = NotificationDispatcher(database, active_config_resolved, events)
        scheduler = SchedulerService(
            active_config_resolved, database, events, notifications
        )

        plugins = PluginRegistry(active_config_resolved, database, notifications)

        app.state.db = database
        app.state.llm = LLMProvider(active_config_resolved.llm)
        app.state.events = events
        app.state.notifications = notifications
        app.state.scheduler = scheduler
        app.state.plugins = plugins
        app.state.stream_semaphore = asyncio.Semaphore(
            active_config_resolved.max_concurrent_streams
        )
        scheduler.start()
        await plugins.start()
        try:
            yield
        finally:
            scheduler.shutdown()
            await plugins.shutdown()

    app.router.lifespan_context = lifespan

    app.include_router(chat_router)
    app.include_router(settings_router)
    app.include_router(members_router)
    app.include_router(chores_router)
    app.include_router(dashboard_router)
    app.include_router(reminders_router)
    app.include_router(notifications_router)
    app.include_router(plugins_router)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok"}

    frontend_dir = BACKEND_DIR.parent / "frontend"
    if active_config.serve_frontend and frontend_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

    return app


app = create_app()


def run() -> None:
    import uvicorn

    config = load_config()
    uvicorn.run(
        "app.main:app",
        host=config.host,
        port=config.port,
        reload=False,
        proxy_headers=config.trust_proxy_headers,
    )


if __name__ == "__main__":
    run()
