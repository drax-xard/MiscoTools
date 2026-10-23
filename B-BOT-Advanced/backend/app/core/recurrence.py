"""Strict recurrence parsing and household-timezone helpers."""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from zoneinfo import ZoneInfo

_EVERY_RE = re.compile(r"^every:(\d+):(days|weeks)$")
_MAX_DAYS = 3650
_MAX_WEEKS = 520


class RecurrenceError(ValueError):
    """Raised when a cadence or timestamp is invalid."""


@dataclass(frozen=True)
class Cadence:
    kind: str
    interval: int = 1

    def label(self) -> str:
        if self.kind == "days":
            return "daily" if self.interval == 1 else f"every:{self.interval}:days"
        if self.kind == "weeks":
            if self.interval == 1:
                return "weekly"
            if self.interval == 2:
                return "biweekly"
            return f"every:{self.interval}:weeks"
        return "monthly"


def parse_cadence(value: str, min_recurrence_seconds: int = 60) -> Cadence:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        raise RecurrenceError("Cadence is required.")
    if cleaned == "daily":
        cadence = Cadence("days", 1)
    elif cleaned == "weekly":
        cadence = Cadence("weeks", 1)
    elif cleaned == "biweekly":
        cadence = Cadence("weeks", 2)
    elif cleaned == "monthly":
        cadence = Cadence("months", 1)
    else:
        match = _EVERY_RE.match(cleaned)
        if not match:
            raise RecurrenceError(
                "Invalid cadence. Use daily, weekly, biweekly, monthly, "
                "every:N:days, or every:N:weeks."
            )
        interval = int(match.group(1))
        cadence = Cadence(match.group(2), interval)

    if cadence.kind == "days" and not 1 <= cadence.interval <= _MAX_DAYS:
        raise RecurrenceError("Day interval is out of range.")
    if cadence.kind == "weeks" and not 1 <= cadence.interval <= _MAX_WEEKS:
        raise RecurrenceError("Week interval is out of range.")
    if cadence.kind == "months" and cadence.interval != 1:
        raise RecurrenceError("Only monthly is supported for month cadences.")

    seconds = _cadence_seconds(cadence)
    if seconds < min_recurrence_seconds:
        raise RecurrenceError(
            f"Cadence is shorter than the minimum of {min_recurrence_seconds} seconds."
        )
    return cadence


def _cadence_seconds(cadence: Cadence) -> int:
    if cadence.kind == "days":
        return cadence.interval * 86400
    if cadence.kind == "weeks":
        return cadence.interval * 7 * 86400
    return 28 * 86400


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: Union[datetime, str], tz: ZoneInfo) -> datetime:
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            raise RecurrenceError("Timestamp is required.")
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise RecurrenceError("Timestamp must be ISO 8601.") from exc
    else:
        parsed = value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz)
    return parsed.astimezone(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def next_occurrence(anchor: datetime, cadence: Cadence, tz: ZoneInfo) -> datetime:
    local = anchor.astimezone(tz)
    local_naive = local.replace(tzinfo=None)
    if cadence.kind == "days":
        result = local_naive + timedelta(days=cadence.interval)
    elif cadence.kind == "weeks":
        result = local_naive + timedelta(weeks=cadence.interval)
    else:
        result = _add_months(local_naive, 1)
    return result.replace(tzinfo=tz).astimezone(timezone.utc)


def _add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)
