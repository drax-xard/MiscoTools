from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import AppConfig, LLMConfig
from app.main import create_app

TOKEN = "test-token"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def config(tmp_path: Path) -> AppConfig:
    return AppConfig(
        auth_token=TOKEN,
        database_path=tmp_path / "test.db",
        projects_path=tmp_path / "projects",
        backups_path=tmp_path / "backups",
        llm=LLMConfig(base_url="http://localhost:1/v1", model="test-model"),
    )


@pytest.fixture
def app(config: AppConfig):
    return create_app(config)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
