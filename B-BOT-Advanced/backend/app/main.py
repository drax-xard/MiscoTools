"""B-BOT Advanced FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.settings import router as settings_router
from app.core.config import AppConfig, load_config
from app.core.database import Database
from app.core.llm import LLMProvider

VERSION = "0.1.0"


def create_app(config: Optional[AppConfig] = None) -> FastAPI:
    active_config = config or load_config()

    app = FastAPI(title="B-BOT Advanced", version=VERSION)

    if active_config.allow_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        active_config_resolved = getattr(app.state, "config", None) or config or load_config()
        active_config_resolved.projects_path.mkdir(parents=True, exist_ok=True)
        active_config_resolved.backups_path.mkdir(parents=True, exist_ok=True)

        database = Database(active_config_resolved.database_path)
        database.initialize()

        app.state.config = active_config_resolved
        app.state.db = database
        app.state.llm = LLMProvider(active_config_resolved.llm)
        yield

    app.router.lifespan_context = lifespan

    app.include_router(chat_router)
    app.include_router(settings_router)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        state = getattr(app, "state", None)
        database = getattr(state, "db", None) if state else None
        return {
            "status": "ok",
        }

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
    )


if __name__ == "__main__":
    run()
