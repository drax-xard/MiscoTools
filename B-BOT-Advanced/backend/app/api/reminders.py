"""One-off and recurring reminders backed by the task table."""

from __future__ import annotations

from datetime import timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import (
    ReminderCreate,
    ReminderOut,
    ReminderPostpone,
    ReminderUpdate,
)
from app.core.config import AppConfig
from app.core.database import Database
from app.core.recurrence import (
    RecurrenceError,
    ensure_utc,
    now_utc,
    parse_cadence,
    parse_iso,
    to_iso,
)
from app.core.scheduler import SchedulerService
from app.deps import get_config, get_db, require_auth

router = APIRouter(
    prefix="/api/reminders",
    tags=["reminders"],
    dependencies=[Depends(require_auth)],
)


def _timezone(config: AppConfig) -> ZoneInfo:
    return ZoneInfo(config.timezone)


def _scheduler(request: Request) -> SchedulerService:
    return request.app.state.scheduler


def _reminder_or_404(database: Database, reminder_id: int) -> dict:
    reminder = database.get_task(reminder_id)
    if reminder is None or reminder["kind"] != "reminder":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found.",
        )
    return reminder


def _validate_member(database: Database, member_id: Optional[int]) -> None:
    if member_id is None:
        return
    member = database.get_member(member_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found.",
        )


def _validate_due(value: str, config: AppConfig) -> str:
    try:
        return to_iso(ensure_utc(value, _timezone(config)))
    except RecurrenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


def _validate_recurrence(value: str, config: AppConfig) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    try:
        return parse_cadence(cleaned, config.min_recurrence_seconds).label()
    except RecurrenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get("", response_model=List[ReminderOut])
def list_reminders(
    status_filter: Optional[str] = None,
    limit: int = 100,
    database: Database = Depends(get_db),
) -> List[dict]:
    return database.list_tasks(kind="reminder", status=status_filter, limit=limit)


@router.post("", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
def create_reminder(
    payload: ReminderCreate,
    request: Request,
    config: AppConfig = Depends(get_config),
    database: Database = Depends(get_db),
) -> dict:
    _validate_member(database, payload.member_id)
    due_at = _validate_due(payload.due_at, config)
    recurrence = _validate_recurrence(payload.recurrence, config)
    reminder = database.create_task(
        title=payload.title.strip(),
        description=payload.description.strip(),
        kind="reminder",
        due_at=due_at,
        recurrence=recurrence,
        member_id=payload.member_id,
    )
    _scheduler(request).schedule_reminder(reminder)
    database.audit(
        "reminder.create",
        f"id={reminder['id']}",
        actor=getattr(request.state, "actor", "household"),
    )
    return reminder


@router.get("/{reminder_id}", response_model=ReminderOut)
def get_reminder(reminder_id: int, database: Database = Depends(get_db)) -> dict:
    return _reminder_or_404(database, reminder_id)


@router.patch("/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: int,
    payload: ReminderUpdate,
    request: Request,
    config: AppConfig = Depends(get_config),
    database: Database = Depends(get_db),
) -> dict:
    _reminder_or_404(database, reminder_id)
    updates = payload.model_dump(exclude_unset=True)
    for field in ("title", "due_at", "recurrence"):
        if field in updates and updates[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"{field} cannot be null.",
            )
    if "description" in updates and updates["description"] is None:
        updates["description"] = ""
    if "member_id" in updates:
        _validate_member(database, updates["member_id"])
    if updates.get("due_at") is not None:
        updates["due_at"] = _validate_due(updates["due_at"], config)
        updates["last_notified_at"] = None
    if updates.get("recurrence") is not None:
        updates["recurrence"] = _validate_recurrence(updates["recurrence"], config)
    updated = database.update_task(reminder_id, updates)
    scheduler = _scheduler(request)
    scheduler.cancel_reminder(reminder_id)
    if updated and updated["status"] == "open" and updated["due_at"]:
        scheduler.schedule_reminder(updated)
    database.audit(
        "reminder.update",
        f"id={reminder_id}",
        actor=getattr(request.state, "actor", "household"),
    )
    return updated


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    reminder_id: int,
    request: Request,
    database: Database = Depends(get_db),
) -> None:
    _reminder_or_404(database, reminder_id)
    database.delete_task(reminder_id)
    _scheduler(request).cancel_reminder(reminder_id)
    database.audit(
        "reminder.delete",
        f"id={reminder_id}",
        actor=getattr(request.state, "actor", "household"),
    )


@router.post("/{reminder_id}/complete", response_model=ReminderOut)
async def complete_reminder(
    reminder_id: int,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    _reminder_or_404(database, reminder_id)
    moment = to_iso(now_utc())
    database.complete_task(reminder_id, moment)
    database.update_task(reminder_id, {"scheduler_key": None})
    _scheduler(request).cancel_reminder(reminder_id)
    database.audit(
        "reminder.complete",
        f"id={reminder_id}",
        actor=getattr(request.state, "actor", "household"),
    )
    await request.app.state.events.publish(
        "reminder.completed", {"reminder_id": reminder_id}
    )
    return database.get_task(reminder_id)


@router.post("/{reminder_id}/postpone", response_model=ReminderOut)
def postpone_reminder(
    reminder_id: int,
    payload: ReminderPostpone,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    reminder = _reminder_or_404(database, reminder_id)
    if reminder["status"] != "open" or not reminder["due_at"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only open reminders can be postponed.",
        )
    due = parse_iso(reminder["due_at"])
    if due is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Reminder has an invalid due date.",
        )
    new_due = to_iso(due + timedelta(minutes=payload.minutes))
    updated = database.update_task(
        reminder_id,
        {"due_at": new_due, "last_notified_at": None, "status": "open"},
    )
    scheduler = _scheduler(request)
    scheduler.cancel_reminder(reminder_id)
    if updated:
        scheduler.schedule_reminder(updated)
    database.audit(
        "reminder.postpone",
        f"id={reminder_id} minutes={payload.minutes}",
        actor=getattr(request.state, "actor", "household"),
    )
    return updated
