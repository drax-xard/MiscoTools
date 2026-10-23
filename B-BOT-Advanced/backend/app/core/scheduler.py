"""APScheduler wrapper backed by SQLite state.

The database is the source of truth. APScheduler holds only in-memory triggers
that are rebuilt from pending reminders and chores at startup.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger

from app.core.config import AppConfig
from app.core.database import Database
from app.core.events import EventBus
from app.core.recurrence import (
    RecurrenceError,
    next_occurrence,
    now_utc,
    parse_cadence,
    parse_iso,
    to_iso,
)
from app.notifications.dispatcher import NotificationDispatcher

logger = logging.getLogger(__name__)

REMINDER_PREFIX = "reminder:"
CHORE_PREFIX = "chore:"


class SchedulerError(ValueError):
    pass


class SchedulerService:
    def __init__(
        self,
        config: AppConfig,
        database: Database,
        events: EventBus,
        notifications: NotificationDispatcher,
    ) -> None:
        self.config = config
        self.database = database
        self.events = events
        self.notifications = notifications
        try:
            self.timezone = ZoneInfo(config.timezone)
        except Exception:
            self.timezone = timezone.utc
        self.scheduler: Optional[AsyncIOScheduler] = None

    def start(self) -> None:
        if not self.config.scheduler_enabled:
            return
        if self.scheduler is not None:
            return
        self.scheduler = AsyncIOScheduler(timezone=self.timezone)
        self.scheduler.start()
        self.rebuild()

    def shutdown(self) -> None:
        if self.scheduler is not None:
            try:
                self.scheduler.shutdown(wait=False)
            except Exception:  # pragma: no cover - shutdown is best effort
                logger.exception("Failed to shut down the scheduler")
            self.scheduler = None

    def rebuild(self) -> None:
        if self.scheduler is None:
            return
        self.scheduler.remove_all_jobs()
        for reminder in self.database.pending_reminders(self.config.max_scheduled_jobs):
            try:
                self.schedule_reminder(reminder)
            except SchedulerError:
                logger.warning("Scheduler job cap reached during reminder rebuild")
                break
        for chore in self.database.pending_chores(self.config.max_scheduled_jobs):
            try:
                self.schedule_chore(chore)
            except SchedulerError:
                logger.warning("Scheduler job cap reached during chore rebuild")
                break

    def _ensure_capacity(self, job_id: str) -> None:
        if self.scheduler is None:
            return
        jobs = self.scheduler.get_jobs()
        if len(jobs) < self.config.max_scheduled_jobs:
            return
        if any(job.id == job_id for job in jobs):
            return
        raise SchedulerError("Scheduler job limit reached.")

    def schedule_reminder(self, reminder: Dict[str, Any]) -> None:
        if self.scheduler is None or not reminder.get("due_at"):
            return
        due = parse_iso(reminder["due_at"])
        if due is None:
            return
        job_id = f"{REMINDER_PREFIX}{reminder['id']}"
        self._ensure_capacity(job_id)
        run_date = self._run_date(due)
        self.scheduler.add_job(
            self._fire_reminder,
            DateTrigger(run_date=run_date),
            args=[int(reminder["id"])],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=max(60, self.config.reminder_grace_seconds),
            coalesce=True,
            max_instances=1,
        )
        self.database.update_task(int(reminder["id"]), {"scheduler_key": job_id})

    def schedule_chore(self, chore: Dict[str, Any]) -> None:
        if self.scheduler is None or not chore.get("next_due_at"):
            return
        due = parse_iso(chore["next_due_at"])
        if due is None:
            return
        job_id = f"{CHORE_PREFIX}{chore['id']}"
        self._ensure_capacity(job_id)
        self.scheduler.add_job(
            self._fire_chore,
            DateTrigger(run_date=self._run_date(due)),
            args=[int(chore["id"])],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=max(60, self.config.reminder_grace_seconds),
            coalesce=True,
            max_instances=1,
        )
        self.database.update_chore(int(chore["id"]), {"scheduler_key": job_id})

    def cancel_reminder(self, reminder_id: int) -> None:
        if self.scheduler is None:
            return
        job = self.scheduler.get_job(f"{REMINDER_PREFIX}{reminder_id}")
        if job is not None:
            self.scheduler.remove_job(job.id)

    def cancel_chore(self, chore_id: int) -> None:
        if self.scheduler is None:
            return
        job = self.scheduler.get_job(f"{CHORE_PREFIX}{chore_id}")
        if job is not None:
            self.scheduler.remove_job(job.id)

    @staticmethod
    def _run_date(due: datetime) -> datetime:
        floor = now_utc() + timedelta(seconds=1)
        return due if due > floor else floor

    async def run_due(self, at: Optional[datetime] = None) -> None:
        moment = at or now_utc()
        for reminder in self.database.due_reminders(to_iso(moment), limit=200):
            await self._fire_reminder(int(reminder["id"]))
        for chore in self.database.due_chores(to_iso(moment), limit=200):
            await self._fire_chore(int(chore["id"]))

    async def _fire_reminder(self, reminder_id: int) -> None:
        reminder = self.database.get_task(reminder_id)
        if not reminder or reminder["status"] != "open" or not reminder["due_at"]:
            return
        due = parse_iso(reminder["due_at"])
        if due is None:
            return
        last_notified = parse_iso(reminder.get("last_notified_at"))
        if last_notified is not None and last_notified >= due:
            return

        moment = now_utc()
        if moment < due:
            self.schedule_reminder(reminder)
            return

        try:
            overdue = (moment - due).total_seconds()
            if overdue > self.config.reminder_grace_seconds:
                await self._mark_reminder_missed(reminder, due, moment)
                return

            await self.notifications.send(
                f"Reminder: {reminder['title']}",
                source=f"reminder:{reminder_id}",
            )
            recurrence = (reminder.get("recurrence") or "").strip()
            if recurrence:
                cadence = parse_cadence(
                    recurrence, self.config.min_recurrence_seconds
                )
                next_due = next_occurrence(due, cadence, self.timezone)
                while next_due <= moment:
                    next_due = next_occurrence(next_due, cadence, self.timezone)
                updated = self.database.update_task(
                    reminder_id,
                    {
                        "due_at": to_iso(next_due),
                        "next_due_at": to_iso(next_due),
                        "last_notified_at": to_iso(moment),
                        "status": "open",
                    },
                )
                if updated:
                    self.schedule_reminder(updated)
            else:
                self.database.complete_task(reminder_id, to_iso(moment))
                self.database.mark_task_notified(reminder_id, to_iso(moment))
                self.database.update_task(reminder_id, {"scheduler_key": None})
                self.cancel_reminder(reminder_id)
            await self.events.publish(
                "reminder.fired",
                {"reminder_id": reminder_id, "due_at": to_iso(due)},
            )
        except RecurrenceError as exc:
            logger.warning("Reminder %s has an invalid recurrence: %s", reminder_id, exc)
            self.database.audit(
                "reminder.invalid_recurrence",
                f"id={reminder_id}",
                actor="scheduler",
            )
        except Exception:  # pragma: no cover - scheduler jobs must not crash
            logger.exception("Reminder %s failed", reminder_id)
            self.database.audit(
                "reminder.failed", f"id={reminder_id}", actor="scheduler"
            )

    async def _mark_reminder_missed(
        self, reminder: Dict[str, Any], due: datetime, moment: datetime
    ) -> None:
        self.database.audit(
            "reminder.missed",
            f"id={reminder['id']} due={to_iso(due)}",
            actor="scheduler",
        )
        recurrence = (reminder.get("recurrence") or "").strip()
        if recurrence:
            try:
                cadence = parse_cadence(
                    recurrence, self.config.min_recurrence_seconds
                )
                next_due = next_occurrence(due, cadence, self.timezone)
                while next_due <= moment:
                    next_due = next_occurrence(next_due, cadence, self.timezone)
                updated = self.database.update_task(
                    int(reminder["id"]),
                    {
                        "due_at": to_iso(next_due),
                        "next_due_at": to_iso(next_due),
                        "last_notified_at": None,
                        "scheduler_key": None,
                    },
                )
                if updated:
                    self.schedule_reminder(updated)
            except RecurrenceError:
                self.database.update_task(
                    int(reminder["id"]), {"status": "missed", "scheduler_key": None}
                )
        else:
            self.database.update_task(
                int(reminder["id"]),
                {
                    "status": "missed",
                    "last_notified_at": to_iso(moment),
                    "scheduler_key": None,
                },
            )

    async def _fire_chore(self, chore_id: int) -> None:
        chore = self.database.get_chore(chore_id)
        if not chore or not chore["next_due_at"]:
            return
        due = parse_iso(chore["next_due_at"])
        if due is None:
            return
        last_notified = parse_iso(chore.get("last_notified_at"))
        if last_notified is not None and last_notified >= due:
            return
        moment = now_utc()
        if moment < due:
            self.schedule_chore(chore)
            return
        overdue = (moment - due).total_seconds()
        if overdue > self.config.reminder_grace_seconds:
            self.database.mark_chore_notified(chore_id, to_iso(moment))
            self.database.audit(
                "chore.missed",
                f"id={chore_id} due={to_iso(due)}",
                actor="scheduler",
            )
            return
        try:
            await self.notifications.send(
                f"Chore due: {chore['title']}",
                source=f"chore:{chore_id}",
            )
            self.database.mark_chore_notified(chore_id, to_iso(moment))
            await self.events.publish(
                "chore.due",
                {"chore_id": chore_id, "due_at": to_iso(due)},
            )
        except Exception:  # pragma: no cover - scheduler jobs must not crash
            logger.exception("Chore notification %s failed", chore_id)
            self.database.audit("chore.failed", f"id={chore_id}", actor="scheduler")
