"""Recurring chores, assignments, completion history, and points."""

from __future__ import annotations

from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import (
    ChoreComplete,
    ChoreCompleteOut,
    ChoreCompletionOut,
    ChoreCreate,
    ChoreOut,
    ChoreUpdate,
)
from app.core.config import AppConfig
from app.core.database import Database
from app.core.recurrence import (
    RecurrenceError,
    ensure_utc,
    next_occurrence,
    now_utc,
    parse_cadence,
    to_iso,
)
from app.core.scheduler import SchedulerService
from app.deps import get_config, get_db, require_auth

router = APIRouter(
    prefix="/api/chores",
    tags=["chores"],
    dependencies=[Depends(require_auth)],
)


def _scheduler(request: Request) -> SchedulerService:
    return request.app.state.scheduler


def _chore_or_404(database: Database, chore_id: int) -> dict:
    chore = database.get_chore(chore_id)
    if chore is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chore not found.",
        )
    return chore


def _validate_member(database: Database, member_id: Optional[int]) -> None:
    if member_id is None:
        return
    member = database.get_member(member_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found.",
        )
    if not member["active"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Member is inactive.",
        )


def _due_or_none(value: Optional[str], config: AppConfig) -> Optional[str]:
    if value is None:
        return None
    try:
        return to_iso(ensure_utc(value, ZoneInfo(config.timezone)))
    except RecurrenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get("", response_model=List[ChoreOut])
def list_chores(
    active_only: bool = True,
    database: Database = Depends(get_db),
) -> List[dict]:
    return database.list_chores(active_only=active_only)


@router.get("/history", response_model=List[ChoreCompletionOut])
def all_chore_history(
    limit: int = 50,
    database: Database = Depends(get_db),
) -> List[dict]:
    return database.chore_history(limit=limit)


@router.get("/due", response_model=List[ChoreOut])
def due_chores(database: Database = Depends(get_db)) -> List[dict]:
    return database.due_chores(to_iso(now_utc()))


@router.post("", response_model=ChoreOut, status_code=status.HTTP_201_CREATED)
def create_chore(
    payload: ChoreCreate,
    request: Request,
    config: AppConfig = Depends(get_config),
    database: Database = Depends(get_db),
) -> dict:
    try:
        cadence = parse_cadence(payload.cadence, config.min_recurrence_seconds)
    except RecurrenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    _validate_member(database, payload.member_id)
    if payload.next_due_at:
        next_due = _due_or_none(payload.next_due_at, config)
    else:
        next_due = to_iso(next_occurrence(now_utc(), cadence, ZoneInfo(config.timezone)))
    chore = database.create_chore(
        title=payload.title.strip(),
        cadence=cadence.label(),
        next_due_at=next_due,
        member_id=payload.member_id,
        points=payload.points,
    )
    _scheduler(request).schedule_chore(chore)
    database.audit(
        "chore.create",
        f"id={chore['id']}",
        actor=getattr(request.state, "actor", "household"),
    )
    return chore


@router.get("/{chore_id}", response_model=ChoreOut)
def get_chore(chore_id: int, database: Database = Depends(get_db)) -> dict:
    return _chore_or_404(database, chore_id)


@router.patch("/{chore_id}", response_model=ChoreOut)
def update_chore(
    chore_id: int,
    payload: ChoreUpdate,
    request: Request,
    config: AppConfig = Depends(get_config),
    database: Database = Depends(get_db),
) -> dict:
    _chore_or_404(database, chore_id)
    updates = payload.model_dump(exclude_unset=True)
    for field in ("title", "cadence", "points"):
        if field in updates and updates[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"{field} cannot be null.",
            )
    if "member_id" in updates:
        _validate_member(database, updates["member_id"])
    cadence_changed = False
    if updates.get("cadence") is not None:
        try:
            cadence = parse_cadence(updates["cadence"], config.min_recurrence_seconds)
        except RecurrenceError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
            ) from exc
        updates["cadence"] = cadence.label()
        cadence_changed = True
    if updates.get("next_due_at") is not None:
        updates["next_due_at"] = _due_or_none(updates["next_due_at"], config)
        updates["last_notified_at"] = None
    elif cadence_changed:
        cadence = parse_cadence(updates["cadence"], config.min_recurrence_seconds)
        updates["next_due_at"] = to_iso(
            next_occurrence(now_utc(), cadence, ZoneInfo(config.timezone))
        )
        updates["last_notified_at"] = None
    updated = database.update_chore(chore_id, updates)
    scheduler = _scheduler(request)
    scheduler.cancel_chore(chore_id)
    if updated and updated["next_due_at"]:
        scheduler.schedule_chore(updated)
    database.audit(
        "chore.update",
        f"id={chore_id}",
        actor=getattr(request.state, "actor", "household"),
    )
    return updated


@router.delete("/{chore_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chore(
    chore_id: int,
    request: Request,
    database: Database = Depends(get_db),
) -> None:
    _chore_or_404(database, chore_id)
    database.delete_chore(chore_id)
    _scheduler(request).cancel_chore(chore_id)
    database.audit(
        "chore.delete",
        f"id={chore_id}",
        actor=getattr(request.state, "actor", "household"),
    )


@router.post("/{chore_id}/complete", response_model=ChoreCompleteOut)
async def complete_chore(
    chore_id: int,
    payload: ChoreComplete,
    request: Request,
    config: AppConfig = Depends(get_config),
    database: Database = Depends(get_db),
) -> dict:
    chore = _chore_or_404(database, chore_id)
    _validate_member(database, payload.member_id)
    try:
        cadence = parse_cadence(chore["cadence"], config.min_recurrence_seconds)
    except RecurrenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    moment = now_utc()
    next_due = to_iso(next_occurrence(moment, cadence, ZoneInfo(config.timezone)))
    result = database.complete_chore(
        chore_id,
        completed_at=to_iso(moment),
        next_due_at=next_due,
        member_id=payload.member_id,
    )
    scheduler = _scheduler(request)
    scheduler.cancel_chore(chore_id)
    if result["chore"] and result["chore"]["next_due_at"]:
        scheduler.schedule_chore(result["chore"])
    database.audit(
        "chore.complete",
        f"id={chore_id} points={result['points_awarded']}",
        actor=getattr(request.state, "actor", "household"),
    )
    await request.app.state.events.publish(
        "chore.completed",
        {
            "chore_id": chore_id,
            "member_id": result["completion"]["member_id"],
            "points": result["points_awarded"],
        },
    )
    return result


@router.get("/{chore_id}/history", response_model=List[ChoreCompletionOut])
def chore_history(
    chore_id: int,
    limit: int = 50,
    database: Database = Depends(get_db),
) -> List[dict]:
    _chore_or_404(database, chore_id)
    return database.chore_history(chore_id=chore_id, limit=limit)
