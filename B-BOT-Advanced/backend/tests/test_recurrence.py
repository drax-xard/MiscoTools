from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.core.recurrence import (
    RecurrenceError,
    ensure_utc,
    next_occurrence,
    parse_cadence,
)

TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def test_parse_supported_cadences():
    assert parse_cadence("daily").label() == "daily"
    assert parse_cadence("weekly").label() == "weekly"
    assert parse_cadence("biweekly").label() == "biweekly"
    assert parse_cadence("monthly").label() == "monthly"
    assert parse_cadence("every:3:days").label() == "every:3:days"
    assert parse_cadence("every:4:weeks").label() == "every:4:weeks"


@pytest.mark.parametrize(
    "value",
    ["", "hourly", "*/5 * * * *", "every:0:days", "every:1:months", "every:999999:weeks"],
)
def test_reject_invalid_cadences(value):
    with pytest.raises(RecurrenceError):
        parse_cadence(value)


def test_reject_cadence_below_minimum_interval():
    with pytest.raises(RecurrenceError):
        parse_cadence("every:1:days", min_recurrence_seconds=2 * 86400)


def test_next_occurrence_preserves_local_wall_clock():
    anchor = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)
    result = next_occurrence(anchor, parse_cadence("weekly"), TZ)
    assert result == datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc)


def test_monthly_clamps_short_months():
    anchor = datetime(2026, 1, 31, 12, 0, tzinfo=timezone.utc)
    result = next_occurrence(anchor, parse_cadence("monthly"), TZ)
    assert result.date().isoformat() == "2026-02-28"


def test_naive_timestamp_uses_household_timezone():
    parsed = ensure_utc("2026-10-23T09:00:00", TZ)
    assert parsed == datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def test_z_suffix_is_accepted():
    parsed = ensure_utc("2026-10-23T12:00:00Z", TZ)
    assert parsed.tzinfo == timezone.utc
