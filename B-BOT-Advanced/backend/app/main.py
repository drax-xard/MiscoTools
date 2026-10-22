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
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        active_config = config or load_config()
        active_config.projects_path.mkdir(parents=True, exist_ok=True)
        active_config.backups_path.mkdir(parents=True, exist_ok=True)

        database = Database(active_config.database_path)
        database.initialize()

        app.state.config = active_config
        app.state.db = database
        app.state.llm = LLMProvider(active_config.llm)

        if active_config.allow_cors:
            app.add_middleware(
                CORSMiddleware,
                allow_origins=["*"],
                allow_credentials=False,
                allow_methods=["*"],
                allow_headers=["*"],
            )
        yield

    app = FastAPI(title="B-BOT Advanced", version=VERSION, lifespan=lifespan)

    app.include_router(chat_router)
    app.include_router(settings_router)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        state = getattr(app, "state", None)
        database = getattr(state, "db", None) if state else None
        active_config = getattr(state, "config", None) if state else None
        return {
            "status": "ok",
            "version": VERSION,
            "model_configured": bool(active_config and active_config.llm.model),
            "database": str(database.path) if database else None,
            "fts_enabled": bool(database and database.fts_enabled),
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
