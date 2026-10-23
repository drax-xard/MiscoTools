from __future__ import annotations

from datetime import timedelta

from app.core.recurrence import now_utc, to_iso
from tests.conftest import HEADERS


def create_member(client, name: str = "Ana") -> dict:
    response = client.post("/api/members", json={"name": name}, headers=HEADERS)
    assert response.status_code == 201
    return response.json()


def create_chore(client, member_id: int, points: int = 5) -> dict:
    response = client.post(
        "/api/chores",
        json={
            "title": "Clean kitchen",
            "cadence": "weekly",
            "member_id": member_id,
            "points": points,
            "next_due_at": to_iso(now_utc() + timedelta(days=2)),
        },
        headers=HEADERS,
    )
    assert response.status_code == 201
    return response.json()


def test_members_crud_and_duplicate_names(client):
    member = create_member(client)
    assert member["points"] == 0
    assert client.get("/api/members", headers=HEADERS).json()[0]["name"] == "Ana"

    duplicate = client.post("/api/members", json={"name": "ana"}, headers=HEADERS)
    assert duplicate.status_code == 409

    updated = client.patch(
        f"/api/members/{member['id']}",
        json={"name": "Ana Maria", "points": 3},
        headers=HEADERS,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Ana Maria"
    assert updated.json()["points"] == 3

    deactivated = client.delete(f"/api/members/{member['id']}", headers=HEADERS)
    assert deactivated.status_code == 200
    assert deactivated.json()["active"] is False
    assert client.get("/api/members", headers=HEADERS).json() == []
    assert len(client.get("/api/members?active_only=false", headers=HEADERS).json()) == 1


def test_chore_completion_awards_points_and_history(client, app):
    member = create_member(client)
    chore = create_chore(client, member["id"], points=7)
    assert chore["cadence"] == "weekly"

    completed = client.post(
        f"/api/chores/{chore['id']}/complete",
        json={"member_id": member["id"]},
        headers=HEADERS,
    )
    assert completed.status_code == 200
    body = completed.json()
    assert body["points_awarded"] == 7
    assert body["completion"]["member_id"] == member["id"]
    assert body["chore"]["last_completed_at"] is not None
    assert body["chore"]["next_due_at"] > body["chore"]["last_completed_at"]

    member_after = client.get("/api/members", headers=HEADERS).json()[0]
    assert member_after["points"] == 7

    history = client.get(
        f"/api/chores/{chore['id']}/history", headers=HEADERS
    ).json()
    assert history[0]["points_awarded"] == 7
    assert history[0]["member_name"] == "Ana"

    with app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT action FROM audit_log WHERE action = 'chore.complete'"
        ).fetchone()
    assert row is not None


def test_chore_rejects_invalid_cadence(client):
    response = client.post(
        "/api/chores",
        json={"title": "Clean", "cadence": "*/5 * * * *"},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_chore_update_reschedules_and_delete(client):
    member = create_member(client)
    chore = create_chore(client, member["id"])
    new_due = to_iso(now_utc() + timedelta(days=5))
    updated = client.patch(
        f"/api/chores/{chore['id']}",
        json={"cadence": "daily", "next_due_at": new_due},
        headers=HEADERS,
    )
    assert updated.status_code == 200
    assert updated.json()["cadence"] == "daily"
    assert updated.json()["last_notified_at"] is None

    deleted = client.delete(f"/api/chores/{chore['id']}", headers=HEADERS)
    assert deleted.status_code == 204
    assert client.get(f"/api/chores/{chore['id']}", headers=HEADERS).status_code == 404


def test_rejects_null_required_update_fields(client):
    member = create_member(client)
    chore = create_chore(client, member["id"])
    assert client.patch(
        f"/api/chores/{chore['id']}",
        json={"cadence": None},
        headers=HEADERS,
    ).status_code == 422
    assert client.patch(
        f"/api/members/{member['id']}",
        json={"name": None},
        headers=HEADERS,
    ).status_code == 422


def test_chore_routes_require_auth(client):
    assert client.get("/api/chores").status_code == 401
    assert client.get("/api/members").status_code == 401
