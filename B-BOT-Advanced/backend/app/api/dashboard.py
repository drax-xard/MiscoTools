"""Today aggregation for the household dashboard."""

from __future__ import annotations

from datetime import timedelta, timezone
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from app.api.schemas import DashboardTodayOut
from app.core.config import AppConfig
from app.core.database import Database
from app.core.recurrence import now_utc, parse_iso, to_iso
from app.deps import get_config, get_db, require_auth

router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_auth)],
)


def _split_by_day(
    rows: List[Dict[str, Any]],
    field: str,
    start: str,
    end: str,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    overdue: List[Dict[str, Any]] = []
    today: List[Dict[str, Any]] = []
    upcoming: List[Dict[str, Any]] = []
    start_moment = parse_iso(start)
    end_moment = parse_iso(end)
    if start_moment is None or end_moment is None:
        return overdue, today, upcoming
    for row in rows:
        moment = parse_iso(row.get(field))
        if moment is None:
            continue
        if moment < start_moment:
            overdue.append(row)
        elif moment < end_moment:
            today.append(row)
        else:
            upcoming.append(row)
    return overdue, today, upcoming


@router.get("/today", response_model=DashboardTodayOut)
def today(
    config: AppConfig = Depends(get_config),
    database: Database = Depends(get_db),
) -> Dict[str, Any]:
    tz = ZoneInfo(config.timezone)
    moment = now_utc()
    local_now = moment.astimezone(tz)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    start = to_iso(start_local.astimezone(timezone.utc))
    end = to_iso(end_local.astimezone(timezone.utc))

    chores = database.list_chores(active_only=True)
    reminders = database.list_tasks(kind="reminder", status="open", limit=500)
    overdue_chores, today_chores, upcoming_chores = _split_by_day(
        chores, "next_due_at", start, end
    )
    overdue_reminders, today_reminders, upcoming_reminders = _split_by_day(
        reminders, "due_at", start, end
    )
    stats = database.chore_completion_stats(start, end)

    return {
        "date": local_now.date().isoformat(),
        "timezone": config.timezone,
        "generated_at": to_iso(moment),
        "members": database.list_members(active_only=True),
        "overdue_chores": overdue_chores[:100],
        "due_today_chores": today_chores[:100],
        "upcoming_chores": upcoming_chores[:100],
        "overdue_reminders": overdue_reminders[:100],
        "due_today_reminders": today_reminders[:100],
        "upcoming_reminders": upcoming_reminders[:100],
        "unread_notifications": database.list_notifications(
            unread_only=True, limit=10
        ),
        "unread_notification_count": database.count_unread_notifications(),
        "chores_completed_today": stats["completions"],
        "points_earned_today": stats["points"],
    }
