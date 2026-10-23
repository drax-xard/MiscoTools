from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import AppConfig
from app.core.database import Database
from app.core.events import EventBus
from app.notifications.base import NotificationError
from app.notifications.dispatcher import NotificationDispatcher
from tests.conftest import HEADERS, TOKEN


class FailingChannel:
    kind = "web"

    async def send(self, notification_id: str, message: str, target: str):
        raise RuntimeError("simulated provider outage")


def make_dispatcher(tmp_path: Path, **overrides) -> tuple[Database, NotificationDispatcher]:
    config = AppConfig(
        auth_token=TOKEN,
        database_path=tmp_path / "test.db",
        **overrides,
    )
    database = Database(config.database_path)
    database.initialize()
    events = EventBus(database)
    return database, NotificationDispatcher(database, config, events)


@pytest.mark.asyncio
async def test_dispatcher_isolates_channel_failures(tmp_path):
    database, dispatcher = make_dispatcher(tmp_path)
    dispatcher.channels["web"] = FailingChannel()

    result = await dispatcher.send("Test message", channels=["web", "voice"])

    statuses = {item["channel"]: item["status"] for item in result["deliveries"]}
    assert statuses == {"web": "failed", "voice": "queued"}
    web_delivery = next(item for item in result["deliveries"] if item["channel"] == "web")
    assert web_delivery["attempts"] == 3
    assert web_delivery["error"] == "RuntimeError"
    assert database.list_events("voice.notify")
    assert database.list_events("notification.dispatched")


@pytest.mark.asyncio
async def test_dispatcher_rate_limit(tmp_path):
    _, dispatcher = make_dispatcher(tmp_path, max_notifications_per_minute=1)
    await dispatcher.send("First")
    with pytest.raises(NotificationError):
        await dispatcher.send("Second")


@pytest.mark.asyncio
async def test_dispatcher_rejects_bad_targets(tmp_path):
    _, dispatcher = make_dispatcher(tmp_path)
    with pytest.raises(NotificationError):
        await dispatcher.send("Test", target="https://evil.example")
    with pytest.raises(NotificationError):
        await dispatcher.send("   ")


def test_notification_api_send_list_and_read(client):
    sent = client.post(
        "/api/notifications/test",
        json={"message": "Dinner is ready", "channels": ["web", "voice"]},
        headers=HEADERS,
    )
    assert sent.status_code == 200
    body = sent.json()
    statuses = {item["channel"]: item["status"] for item in body["deliveries"]}
    assert statuses == {"web": "sent", "voice": "queued"}
    notification_id = body["notification"]["id"]

    inbox = client.get("/api/notifications", headers=HEADERS).json()
    assert [item["id"] for item in inbox] == [notification_id]
    assert inbox[0]["read_at"] is None

    read = client.post(f"/api/notifications/{notification_id}/read", headers=HEADERS)
    assert read.status_code == 200
    assert read.json()["read_at"] is not None
    assert client.get(
        "/api/notifications?unread_only=true", headers=HEADERS
    ).json() == []

    log = client.get("/api/notifications/log", headers=HEADERS)
    assert log.status_code == 200
    assert len(log.json()) == 2


def test_notification_channels_can_be_disabled(client):
    channels = client.get("/api/notifications/channels", headers=HEADERS).json()
    voice = next(item for item in channels if item["kind"] == "voice")
    disabled = client.patch(
        f"/api/notifications/channels/{voice['id']}",
        json={"enabled": False},
        headers=HEADERS,
    )
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False

    sent = client.post(
        "/api/notifications/test",
        json={"message": "Voice off", "channels": ["web", "voice"]},
        headers=HEADERS,
    )
    statuses = {item["channel"]: item["status"] for item in sent.json()["deliveries"]}
    assert statuses == {"web": "sent", "voice": "skipped"}


def test_notification_routes_require_auth(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.get("/api/notifications/channels").status_code == 401
