from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import AppConfig, LLMConfig
from app.main import create_app
from tests.conftest import HEADERS, TOKEN


def test_health_is_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_chat_requires_token(client):
    assert client.get("/api/chat/conversations").status_code == 401
    assert (
        client.get(
            "/api/chat/conversations",
            headers={"Authorization": "Bearer wrong"},
        ).status_code
        == 401
    )
    assert client.get("/api/chat/conversations", headers=HEADERS).status_code == 200


def test_non_ascii_token_returns_401(client):
    response = client.get(
        "/api/chat/conversations",
        headers={b"Authorization": b"Bearer t\xf6k\xe9n"},
    )
    assert response.status_code == 401


def test_settings_require_token(client):
    assert client.get("/api/settings").status_code == 401
    assert client.get("/api/settings", headers=HEADERS).status_code == 200


def test_settings_redacts_secrets_and_topology(client):
    body = client.get("/api/settings", headers=HEADERS).json()["settings"]
    assert body["auth_token"] == "***"
    assert "host" not in body
    assert "port" not in body
    assert "llm" not in body
    assert "database_path" not in body


def test_docs_disabled_by_default(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_security_headers(client):
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_body_size_limit(config):
    app = create_app(config.model_copy(update={"max_request_body_bytes": 1024}))
    with TestClient(app) as client:
        response = client.post(
            "/api/chat/conversations",
            json={"title": "x" * 5000},
            headers=HEADERS,
        )
    assert response.status_code == 413


def test_rate_limit(config):
    app = create_app(config.model_copy(update={"rate_limit_per_minute": 3}))
    with TestClient(app) as client:
        statuses = [client.get("/health").status_code for _ in range(4)]
    assert statuses[:3] == [200, 200, 200]
    assert statuses[3] == 429


def test_auth_lockout_after_repeated_failures(config):
    app = create_app(
        config.model_copy(update={"auth_max_failures": 2, "auth_lockout_seconds": 60})
    )
    with TestClient(app) as client:
        first = client.get(
            "/api/chat/conversations", headers={"Authorization": "Bearer wrong-one"}
        )
        second = client.get(
            "/api/chat/conversations", headers={"Authorization": "Bearer wrong-two"}
        )
        blocked = client.get("/api/chat/conversations", headers=HEADERS)
    assert first.status_code == 401
    assert second.status_code == 429
    assert blocked.status_code == 429
    assert "retry-after" in blocked.headers


def test_previous_token_supported_for_rotation(config):
    app = create_app(
        config.model_copy(
            update={
                "auth_token_previous": "old-token-0123456789abcdef",
            }
        )
    )
    with TestClient(app) as client:
        response = client.get(
            "/api/chat/conversations",
            headers={"Authorization": "Bearer old-token-0123456789abcdef"},
        )
        current = client.get("/api/chat/conversations", headers=HEADERS)
    assert response.status_code == 200
    assert current.status_code == 200


def test_failed_auth_is_audited(client, app):
    client.get("/api/chat/conversations", headers={"Authorization": "Bearer wrong"})
    with app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT action FROM audit_log WHERE action = 'auth.failure'"
        ).fetchone()
    assert row is not None
    assert TOKEN not in str(dict(row))


def test_frontend_served_with_security_headers(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "B-BOT" in response.text
    assert "default-src 'self'" in response.headers["content-security-policy"]


def test_placeholder_token_rejected():
    with pytest.raises(ValueError):
        AppConfig(auth_token="test-token")


def test_plaintext_remote_inference_rejected():
    with pytest.raises(ValueError):
        AppConfig(
            auth_token="strong-token-0123456789",
            llm=LLMConfig(base_url="http://inference-machine/v1"),
        )


def test_plaintext_loopback_inference_allowed():
    config = AppConfig(
        auth_token="strong-token-0123456789",
        llm=LLMConfig(base_url="http://localhost:8080/v1"),
    )
    assert config.llm.base_url.startswith("http://localhost")
