from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from app.core.recurrence import now_utc, to_iso
from tests.conftest import HEADERS


def test_dashboard_today_aggregates(client, app):
    database = app.state.db
    timezone = ZoneInfo(app.state.config.timezone)
    moment = now_utc()
    start_local = moment.astimezone(timezone).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    member = database.create_member("Ana", points=0)
    overdue_chore = database.create_chore(
        "Overdue chore",
        "weekly",
        to_iso(start_local - timedelta(hours=1)),
        member_id=member["id"],
        points=2,
    )
    today_chore = database.create_chore(
        "Today chore",
        "daily",
        to_iso(start_local + timedelta(hours=1)),
        member_id=member["id"],
        points=3,
    )
    upcoming_chore = database.create_chore(
        "Upcoming chore",
        "weekly",
        to_iso(start_local + timedelta(days=1, hours=1)),
        member_id=member["id"],
        points=4,
    )
    done_chore = database.create_chore(
        "Done chore",
        "weekly",
        to_iso(start_local + timedelta(days=2)),
        member_id=member["id"],
        points=4,
    )
    database.create_task(
        "Overdue reminder",
        kind="reminder",
        due_at=to_iso(start_local - timedelta(hours=2)),
    )
    database.create_task(
        "Today reminder",
        kind="reminder",
        due_at=to_iso(start_local + timedelta(hours=2)),
    )
    database.create_task(
        "Upcoming reminder",
        kind="reminder",
        due_at=to_iso(start_local + timedelta(days=1, hours=2)),
    )
    database.create_task(
        "Completed reminder",
        kind="reminder",
        due_at=to_iso(start_local + timedelta(hours=3)),
        status="completed",
    )
    database.complete_chore(
        done_chore["id"],
        completed_at=to_iso(moment),
        next_due_at=to_iso(start_local + timedelta(days=5)),
        member_id=member["id"],
    )
    database.create_notification("note-1", "Dinner is ready", source="test")

    response = client.get("/api/dashboard/today", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()

    assert body["date"] == moment.astimezone(timezone).date().isoformat()
    assert body["timezone"] == app.state.config.timezone
    assert body["generated_at"]
    assert [item["id"] for item in body["members"]] == [member["id"]]
    assert body["members"][0]["points"] == 4
    assert [item["id"] for item in body["overdue_chores"]] == [overdue_chore["id"]]
    assert [item["id"] for item in body["due_today_chores"]] == [today_chore["id"]]
    assert [item["id"] for item in body["upcoming_chores"]] == [
        upcoming_chore["id"],
        done_chore["id"],
    ]
    assert [item["title"] for item in body["overdue_reminders"]] == [
        "Overdue reminder"
    ]
    assert [item["title"] for item in body["due_today_reminders"]] == [
        "Today reminder"
    ]
    assert [item["title"] for item in body["upcoming_reminders"]] == [
        "Upcoming reminder"
    ]
    assert body["unread_notification_count"] == 1
    assert [item["id"] for item in body["unread_notifications"]] == ["note-1"]
    assert body["chores_completed_today"] == 1
    assert body["points_earned_today"] == 4


def test_dashboard_today_requires_auth(client):
    assert client.get("/api/dashboard/today").status_code == 401
