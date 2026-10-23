from __future__ import annotations

import sqlite3
from pathlib import Path

from app.core.database import Database

OLD_SCHEMA = """
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'reminder',
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    member_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE chores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cadence TEXT NOT NULL DEFAULT 'weekly',
    last_completed_at TEXT,
    next_due_at TEXT,
    member_id INTEGER,
    points INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def test_initialize_migrates_old_schema(tmp_path: Path):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(OLD_SCHEMA)
        connection.execute(
            "INSERT INTO tasks (title, created_at, updated_at) VALUES ('old', 'now', 'now')"
        )

    database = Database(path)
    database.initialize()

    with database.connect() as connection:
        task_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(tasks)")
        }
        chore_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(chores)")
        }
        log_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(notification_log)")
        }
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        old_task = connection.execute("SELECT * FROM tasks WHERE title = 'old'").fetchone()

    assert {"recurrence", "next_due_at", "last_notified_at", "scheduler_key"} <= task_columns
    assert {"last_notified_at", "scheduler_key"} <= chore_columns
    assert {"notification_id", "channel", "target", "attempts", "read_at"} <= log_columns
    assert version == 2
    assert old_task["recurrence"] == ""

    assert len(database.list_notification_channels()) == 2
    database.initialize()
    assert len(database.list_notification_channels()) == 2
