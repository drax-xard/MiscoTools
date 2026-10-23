from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Tuple

import pytest

from app.core.config import AppConfig
from app.core.database import Database
from app.core.events import EventBus
from app.core.recurrence import now_utc, parse_iso, to_iso
from app.core.scheduler import SchedulerService
from app.notifications.dispatcher import NotificationDispatcher
from tests.conftest import HEADERS, TOKEN


def make_services(
    tmp_path: Path,
    *,
    scheduler_enabled: bool = False,
    grace_seconds: int = 3600,
) -> Tuple[AppConfig, Database, EventBus, NotificationDispatcher, SchedulerService]:
    config = AppConfig(
        auth_token=TOKEN,
        database_path=tmp_path / "test.db",
        timezone="America/Argentina/Buenos_Aires",
        scheduler_enabled=scheduler_enabled,
        reminder_grace_seconds=grace_seconds,
        max_notification_retries=0,
    )
    database = Database(config.database_path)
    database.initialize()
    events = EventBus(database)
    notifications = NotificationDispatcher(database, config, events)
    scheduler = SchedulerService(config, database, events, notifications)
    return config, database, events, notifications, scheduler


def create_reminder(client, **overrides) -> dict:
    payload = {
        "title": "Take out trash",
        "due_at": to_iso(now_utc() + timedelta(hours=2)),
        "recurrence": "",
    }
    payload.update(overrides)
    response = client.post("/api/reminders", json=payload, headers=HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


def test_reminder_crud_and_postpone(client):
    reminder = create_reminder(client, recurrence="weekly")
    assert reminder["kind"] == "reminder"
    assert reminder["recurrence"] == "weekly"

    listed = client.get("/api/reminders", headers=HEADERS).json()
    assert [item["id"] for item in listed] == [reminder["id"]]

    updated = client.patch(
        f"/api/reminders/{reminder['id']}",
        json={"title": "Take out recycling"},
        headers=HEADERS,
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Take out recycling"

    original_due = parse_iso(updated.json()["due_at"])
    postponed = client.post(
        f"/api/reminders/{reminder['id']}/postpone",
        json={"minutes": 30},
        headers=HEADERS,
    )
    assert postponed.status_code == 200
    assert parse_iso(postponed.json()["due_at"]) == original_due + timedelta(minutes=30)

    completed = client.post(
        f"/api/reminders/{reminder['id']}/complete", headers=HEADERS
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"


def test_reminder_rejects_invalid_recurrence_and_due(client):
    invalid_recurrence = client.post(
        "/api/reminders",
        json={
            "title": "Bad",
            "due_at": to_iso(now_utc() + timedelta(hours=1)),
            "recurrence": "hourly",
        },
        headers=HEADERS,
    )
    assert invalid_recurrence.status_code == 422

    invalid_due = client.post(
        "/api/reminders",
        json={"title": "Bad", "due_at": "not-a-date"},
        headers=HEADERS,
    )
    assert invalid_due.status_code == 422


def test_reminder_rejects_null_required_update_fields(client):
    reminder = create_reminder(client)
    response = client.patch(
        f"/api/reminders/{reminder['id']}",
        json={"due_at": None},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_reminder_routes_require_auth(client):
    assert client.get("/api/reminders").status_code == 401


@pytest.mark.asyncio
async def test_scheduler_delivers_one_off_reminder(tmp_path):
    _, database, _, _, scheduler = make_services(tmp_path)
    task = database.create_task(
        title="Water plants",
        kind="reminder",
        due_at=to_iso(now_utc() - timedelta(minutes=5)),
    )

    await scheduler.run_due()

    stored = database.get_task(task["id"])
    assert stored["status"] == "completed"
    notifications = database.list_notifications()
    assert len(notifications) == 1
    assert "Water plants" in notifications[0]["message"]
    deliveries = database.notification_deliveries(notifications[0]["id"])
    assert {item["channel"]: item["status"] for item in deliveries} == {
        "web": "sent",
        "voice": "queued",
    }
    assert database.list_events("voice.notify")


@pytest.mark.asyncio
async def test_scheduler_rolls_recurring_reminder_forward(tmp_path):
    _, database, _, _, scheduler = make_services(tmp_path)
    task = database.create_task(
        title="Daily standup",
        kind="reminder",
        due_at=to_iso(now_utc() - timedelta(minutes=5)),
        recurrence="daily",
    )

    await scheduler.run_due()

    stored = database.get_task(task["id"])
    assert stored["status"] == "open"
    assert parse_iso(stored["due_at"]) > now_utc()
    assert stored["last_notified_at"] is not None


@pytest.mark.asyncio
async def test_scheduler_marks_old_reminder_missed(tmp_path):
    _, database, _, _, scheduler = make_services(tmp_path, grace_seconds=60)
    task = database.create_task(
        title="Old reminder",
        kind="reminder",
        due_at=to_iso(now_utc() - timedelta(hours=2)),
    )

    await scheduler.run_due()

    assert database.get_task(task["id"])["status"] == "missed"
    assert database.list_notifications() == []


@pytest.mark.asyncio
async def test_scheduler_rebuilds_pending_jobs(tmp_path):
    _, database, _, _, scheduler = make_services(tmp_path, scheduler_enabled=True)
    task = database.create_task(
        title="Future reminder",
        kind="reminder",
        due_at=to_iso(now_utc() + timedelta(hours=1)),
    )
    scheduler.start()
    try:
        jobs = scheduler.scheduler.get_jobs() if scheduler.scheduler else []
        assert any(job.id == f"reminder:{task['id']}" for job in jobs)
    finally:
        scheduler.shutdown()
