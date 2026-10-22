from __future__ import annotations

from tests.conftest import HEADERS


def test_health_is_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"


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


def test_settings_require_token(client):
    assert client.get("/api/settings").status_code == 401
    assert client.get("/api/settings", headers=HEADERS).status_code == 200


def test_settings_redacts_secrets(client):
    body = client.get("/api/settings", headers=HEADERS).json()["settings"]
    assert body["auth_token"] == "***"
