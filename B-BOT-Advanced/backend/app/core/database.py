"""SQLite storage layer.

The schema mirrors the data model in ``PLAN.md``. WAL mode is enabled for
concurrent reads while the assistant streams a reply, and FTS5 indexes message
and document text when the SQLite build supports it.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'New conversation',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'reminder',
    due_at TEXT,
    recurrence TEXT NOT NULL DEFAULT '',
    next_due_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    last_notified_at TEXT,
    scheduler_key TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cadence TEXT NOT NULL DEFAULT 'weekly',
    last_completed_at TEXT,
    next_due_at TEXT,
    member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    points INTEGER NOT NULL DEFAULT 1,
    last_notified_at TEXT,
    scheduler_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chore_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    read_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id TEXT NOT NULL DEFAULT '',
    channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT 'household',
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    read_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS plugin_config (
    plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (plugin_id, key)
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_chores_due ON chores(next_due_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
"""

SCHEMA_VERSION = 2

MIGRATIONS = {
    "tasks": {
        "recurrence": "TEXT NOT NULL DEFAULT ''",
        "next_due_at": "TEXT",
        "last_notified_at": "TEXT",
        "scheduler_key": "TEXT",
        "completed_at": "TEXT",
    },
    "chores": {
        "last_notified_at": "TEXT",
        "scheduler_key": "TEXT",
    },
    "notification_log": {
        "notification_id": "TEXT NOT NULL DEFAULT ''",
        "channel": "TEXT NOT NULL DEFAULT ''",
        "target": "TEXT NOT NULL DEFAULT 'household'",
        "attempts": "INTEGER NOT NULL DEFAULT 0",
        "error": "TEXT NOT NULL DEFAULT ''",
        "read_at": "TEXT",
        "updated_at": "TEXT NOT NULL DEFAULT ''",
    },
}

FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    conversation_id UNINDEXED,
    message_id UNINDEXED
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title,
    content,
    document_id UNINDEXED
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.fts_enabled = False

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        connection = sqlite3.connect(str(self.path), timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(SCHEMA)
            self._migrate(connection)
            try:
                connection.executescript(FTS_SCHEMA)
                self.fts_enabled = True
            except sqlite3.OperationalError:
                self.fts_enabled = False
            self._ensure_default_channels(connection)
        self._secure_permissions()

    def _migrate(self, connection: sqlite3.Connection) -> None:
        version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        if version >= SCHEMA_VERSION:
            return
        for table, columns in MIGRATIONS.items():
            existing = {
                row["name"]
                for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
            }
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(
                        f"ALTER TABLE {table} ADD COLUMN {name} {definition}"
                    )
        connection.execute("PRAGMA user_version = %d" % SCHEMA_VERSION)

    @staticmethod
    def _ensure_default_channels(connection: sqlite3.Connection) -> None:
        for kind in ("web", "voice"):
            row = connection.execute(
                "SELECT id FROM notification_channels WHERE kind = ? ORDER BY id LIMIT 1",
                (kind,),
            ).fetchone()
            if row is None:
                connection.execute(
                    """
                    INSERT INTO notification_channels (kind, config_json, enabled)
                    VALUES (?, '{}', 1)
                    """,
                    (kind,),
                )

    def _secure_permissions(self) -> None:
        """Restrict the data directory and SQLite files to the service user."""
        for directory in {self.path.parent}:
            try:
                os.chmod(directory, 0o700)
            except OSError:
                pass
        for candidate in (self.path, Path(f"{self.path}-wal"), Path(f"{self.path}-shm")):
            try:
                if candidate.exists():
                    os.chmod(candidate, 0o600)
            except OSError:
                pass

    # Conversations -------------------------------------------------------
    def create_conversation(self, title: str = "New conversation") -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                "INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
                (title, now, now),
            )
            return self.get_conversation(int(cursor.lastrowid), connection=connection)

    def list_conversations(self) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM conversations ORDER BY updated_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def get_conversation(
        self, conversation_id: int, connection: Optional[sqlite3.Connection] = None
    ) -> Optional[Dict[str, Any]]:
        if connection is None:
            with self.connect() as connection:
                return self.get_conversation(conversation_id, connection=connection)
        row = connection.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        return dict(row) if row else None

    def delete_conversation(self, conversation_id: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM conversations WHERE id = ?", (conversation_id,)
            )
            if self.fts_enabled:
                connection.execute(
                    "DELETE FROM messages_fts WHERE conversation_id = ?",
                    (conversation_id,),
                )
            return cursor.rowcount > 0

    def rename_conversation(self, conversation_id: int, title: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, _now(), conversation_id),
            )

    # Messages ------------------------------------------------------------
    def add_message(self, conversation_id: int, role: str, content: str) -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO messages (conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (conversation_id, role, content, now),
            )
            message_id = int(cursor.lastrowid)
            connection.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )
            if self.fts_enabled:
                connection.execute(
                    """
                    INSERT INTO messages_fts (content, conversation_id, message_id)
                    VALUES (?, ?, ?)
                    """,
                    (content, conversation_id, message_id),
                )
            row = connection.execute(
                "SELECT * FROM messages WHERE id = ?", (message_id,)
            ).fetchone()
        return dict(row)

    def get_messages(self, conversation_id: int) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
                (conversation_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _fts_phrase(query: str) -> Optional[str]:
        cleaned = " ".join(query.split())
        if not cleaned or len(cleaned) > 500:
            return None
        return '"' + cleaned.replace('"', '""') + '"'

    def search_messages(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        if not self.fts_enabled:
            return []
        phrase = self._fts_phrase(query)
        if phrase is None:
            return []
        limit = max(1, min(int(limit), 100))
        try:
            with self.connect() as connection:
                rows = connection.execute(
                    """
                    SELECT m.* FROM messages_fts f
                    JOIN messages m ON m.id = f.message_id
                    WHERE messages_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                    """,
                    (phrase, limit),
                ).fetchall()
        except sqlite3.OperationalError:
            return []
        return [dict(row) for row in rows]

    # Settings ------------------------------------------------------------
    def set_setting(self, key: str, value: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )

    def get_setting(self, key: str) -> Optional[str]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            ).fetchone()
        return row["value"] if row else None

    def all_settings(self) -> Dict[str, str]:
        with self.connect() as connection:
            rows = connection.execute("SELECT key, value FROM settings").fetchall()
        return {row["key"]: row["value"] for row in rows}

    # Members -------------------------------------------------------------
    def create_member(self, name: str, points: int = 0) -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO members (name, active, points, created_at)
                VALUES (?, 1, ?, ?)
                """,
                (name, points, now),
            )
            return self.get_member(int(cursor.lastrowid), connection=connection)

    def list_members(self, active_only: bool = True) -> List[Dict[str, Any]]:
        query = "SELECT * FROM members"
        if active_only:
            query += " WHERE active = 1"
        query += " ORDER BY name COLLATE NOCASE"
        with self.connect() as connection:
            rows = connection.execute(query).fetchall()
        return [dict(row) for row in rows]

    def get_member(
        self, member_id: int, connection: Optional[sqlite3.Connection] = None
    ) -> Optional[Dict[str, Any]]:
        if connection is None:
            with self.connect() as connection:
                return self.get_member(member_id, connection=connection)
        row = connection.execute(
            "SELECT * FROM members WHERE id = ?", (member_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_member(self, member_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        allowed = {"name", "active", "points"}
        filtered = {key: value for key, value in updates.items() if key in allowed}
        if not filtered:
            return self.get_member(member_id)
        assignments = ", ".join(f"{key} = ?" for key in filtered)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE members SET {assignments} WHERE id = ?",
                (*filtered.values(), member_id),
            )
            return self.get_member(member_id, connection=connection)

    def add_member_points(self, member_id: int, points: int) -> Optional[Dict[str, Any]]:
        with self.connect() as connection:
            return self._add_member_points(connection, member_id, points)

    @staticmethod
    def _add_member_points(
        connection: sqlite3.Connection, member_id: int, points: int
    ) -> Optional[Dict[str, Any]]:
        connection.execute(
            "UPDATE members SET points = points + ? WHERE id = ?",
            (points, member_id),
        )
        row = connection.execute(
            "SELECT * FROM members WHERE id = ?", (member_id,)
        ).fetchone()
        return dict(row) if row else None

    # Tasks and reminders ------------------------------------------------
    def create_task(
        self,
        title: str,
        description: str = "",
        kind: str = "reminder",
        due_at: Optional[str] = None,
        recurrence: str = "",
        member_id: Optional[int] = None,
        status: str = "open",
    ) -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO tasks
                    (title, description, kind, due_at, recurrence, status,
                     member_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (title, description, kind, due_at, recurrence, status,
                 member_id, now, now),
            )
            return self.get_task(int(cursor.lastrowid), connection=connection)

    def list_tasks(
        self,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM tasks WHERE 1 = 1"
        params: List[Any] = []
        if kind:
            query += " AND kind = ?"
            params.append(kind)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY COALESCE(due_at, created_at) ASC, id ASC LIMIT ?"
        params.append(max(1, min(int(limit), 500)))
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_task(
        self, task_id: int, connection: Optional[sqlite3.Connection] = None
    ) -> Optional[Dict[str, Any]]:
        if connection is None:
            with self.connect() as connection:
                return self.get_task(task_id, connection=connection)
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_task(self, task_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        allowed = {
            "title", "description", "due_at", "recurrence", "next_due_at",
            "status", "member_id", "last_notified_at", "scheduler_key",
            "completed_at",
        }
        filtered = {key: value for key, value in updates.items() if key in allowed}
        if not filtered:
            return self.get_task(task_id)
        filtered["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in filtered)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE tasks SET {assignments} WHERE id = ?",
                (*filtered.values(), task_id),
            )
            return self.get_task(task_id, connection=connection)

    def delete_task(self, task_id: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            return cursor.rowcount > 0

    def complete_task(self, task_id: int, completed_at: Optional[str] = None) -> None:
        now = completed_at or _now()
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE tasks
                SET status = 'completed', completed_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, task_id),
            )

    def mark_task_notified(self, task_id: int, notified_at: Optional[str] = None) -> None:
        now = notified_at or _now()
        with self.connect() as connection:
            connection.execute(
                "UPDATE tasks SET last_notified_at = ?, updated_at = ? WHERE id = ?",
                (now, now, task_id),
            )

    def pending_reminders(self, limit: int = 500) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM tasks
                WHERE kind = 'reminder' AND status = 'open' AND due_at IS NOT NULL
                ORDER BY due_at ASC LIMIT ?
                """,
                (max(1, min(int(limit), 500)),),
            ).fetchall()
        return [dict(row) for row in rows]

    def due_reminders(self, now_iso: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM tasks
                WHERE kind = 'reminder' AND status = 'open'
                  AND due_at IS NOT NULL AND due_at <= ?
                ORDER BY due_at ASC LIMIT ?
                """,
                (now_iso, max(1, min(int(limit), 500))),
            ).fetchall()
        return [dict(row) for row in rows]

    # Chores --------------------------------------------------------------
    def create_chore(
        self,
        title: str,
        cadence: str,
        next_due_at: Optional[str],
        member_id: Optional[int] = None,
        points: int = 1,
    ) -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO chores
                    (title, cadence, next_due_at, member_id, points,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (title, cadence, next_due_at, member_id, points, now, now),
            )
            return self.get_chore(int(cursor.lastrowid), connection=connection)

    def list_chores(self, active_only: bool = True) -> List[Dict[str, Any]]:
        query = "SELECT * FROM chores"
        if active_only:
            query += " WHERE next_due_at IS NOT NULL"
        query += " ORDER BY next_due_at ASC, id ASC"
        with self.connect() as connection:
            rows = connection.execute(query).fetchall()
        return [dict(row) for row in rows]

    def get_chore(
        self, chore_id: int, connection: Optional[sqlite3.Connection] = None
    ) -> Optional[Dict[str, Any]]:
        if connection is None:
            with self.connect() as connection:
                return self.get_chore(chore_id, connection=connection)
        row = connection.execute(
            "SELECT * FROM chores WHERE id = ?", (chore_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_chore(self, chore_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        allowed = {
            "title", "cadence", "next_due_at", "member_id", "points",
            "last_notified_at", "scheduler_key",
        }
        filtered = {key: value for key, value in updates.items() if key in allowed}
        if not filtered:
            return self.get_chore(chore_id)
        filtered["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in filtered)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE chores SET {assignments} WHERE id = ?",
                (*filtered.values(), chore_id),
            )
            return self.get_chore(chore_id, connection=connection)

    def delete_chore(self, chore_id: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
            return cursor.rowcount > 0

    def complete_chore(
        self,
        chore_id: int,
        completed_at: str,
        next_due_at: Optional[str],
        member_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        with self.connect() as connection:
            chore = self.get_chore(chore_id, connection=connection)
            if chore is None:
                raise ValueError("Chore not found.")
            assigned = member_id if member_id is not None else chore["member_id"]
            points = int(chore["points"])
            cursor = connection.execute(
                """
                INSERT INTO chore_completions
                    (chore_id, member_id, points_awarded, completed_at)
                VALUES (?, ?, ?, ?)
                """,
                (chore_id, assigned, points, completed_at),
            )
            connection.execute(
                """
                UPDATE chores
                SET last_completed_at = ?, next_due_at = ?,
                    last_notified_at = NULL, updated_at = ?
                WHERE id = ?
                """,
                (completed_at, next_due_at, completed_at, chore_id),
            )
            if assigned is not None:
                self._add_member_points(connection, int(assigned), points)
            completion = connection.execute(
                "SELECT * FROM chore_completions WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
            return {
                "completion": dict(completion),
                "chore": self.get_chore(chore_id, connection=connection),
                "points_awarded": points,
            }

    def chore_history(
        self, chore_id: Optional[int] = None, limit: int = 50
    ) -> List[Dict[str, Any]]:
        query = """
            SELECT c.*, m.name AS member_name
            FROM chore_completions c
            LEFT JOIN members m ON m.id = c.member_id
        """
        params: List[Any] = []
        if chore_id is not None:
            query += " WHERE c.chore_id = ?"
            params.append(chore_id)
        query += " ORDER BY c.completed_at DESC, c.id DESC LIMIT ?"
        params.append(max(1, min(int(limit), 500)))
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def pending_chores(self, limit: int = 500) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM chores WHERE next_due_at IS NOT NULL
                ORDER BY next_due_at ASC LIMIT ?
                """,
                (max(1, min(int(limit), 500)),),
            ).fetchall()
        return [dict(row) for row in rows]

    def due_chores(self, now_iso: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM chores WHERE next_due_at IS NOT NULL
                  AND next_due_at <= ?
                ORDER BY next_due_at ASC LIMIT ?
                """,
                (now_iso, max(1, min(int(limit), 500))),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_chore_notified(self, chore_id: int, notified_at: Optional[str] = None) -> None:
        now = notified_at or _now()
        with self.connect() as connection:
            connection.execute(
                "UPDATE chores SET last_notified_at = ?, updated_at = ? WHERE id = ?",
                (now, now, chore_id),
            )

    # Notification channels ----------------------------------------------
    def list_notification_channels(self) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM notification_channels ORDER BY id ASC"
            ).fetchall()
        return [dict(row) for row in rows]

    def get_notification_channel(
        self, channel_id: int, connection: Optional[sqlite3.Connection] = None
    ) -> Optional[Dict[str, Any]]:
        if connection is None:
            with self.connect() as connection:
                return self.get_notification_channel(channel_id, connection=connection)
        row = connection.execute(
            "SELECT * FROM notification_channels WHERE id = ?", (channel_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_notification_channel_by_kind(self, kind: str) -> Optional[Dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM notification_channels
                WHERE kind = ? ORDER BY id ASC LIMIT 1
                """,
                (kind,),
            ).fetchone()
        return dict(row) if row else None

    def update_notification_channel(
        self, channel_id: int, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        allowed = {"enabled", "config_json"}
        filtered = {key: value for key, value in updates.items() if key in allowed}
        if not filtered:
            return self.get_notification_channel(channel_id)
        assignments = ", ".join(f"{key} = ?" for key in filtered)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE notification_channels SET {assignments} WHERE id = ?",
                (*filtered.values(), channel_id),
            )
            return self.get_notification_channel(channel_id, connection=connection)

    def enabled_notification_channels(self) -> List[Dict[str, Any]]:
        return [channel for channel in self.list_notification_channels() if channel["enabled"]]

    # Notifications -------------------------------------------------------
    def create_notification(
        self, notification_id: str, message: str, source: str = ""
    ) -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO notifications (id, message, source, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (notification_id, message, source, now),
            )
            return self.get_notification(notification_id, connection=connection) or {}

    def get_notification(
        self, notification_id: str, connection: Optional[sqlite3.Connection] = None
    ) -> Optional[Dict[str, Any]]:
        if connection is None:
            with self.connect() as connection:
                return self.get_notification(notification_id, connection=connection)
        row = connection.execute(
            "SELECT * FROM notifications WHERE id = ?", (notification_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_notifications(
        self, unread_only: bool = False, limit: int = 50
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM notifications"
        if unread_only:
            query += " WHERE read_at IS NULL"
        query += " ORDER BY created_at DESC, id DESC LIMIT ?"
        with self.connect() as connection:
            rows = connection.execute(
                query, (max(1, min(int(limit), 200)),)
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_notification_read(self, notification_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL",
                (_now(), notification_id),
            )
            return cursor.rowcount > 0

    def mark_all_notifications_read(self) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE notifications SET read_at = ? WHERE read_at IS NULL",
                (_now(),),
            )
            return cursor.rowcount

    def add_notification_delivery(
        self,
        notification_id: str,
        channel: str,
        target: str,
        status: str,
        attempts: int = 0,
        error: str = "",
    ) -> int:
        now = _now()
        channel_row = self.get_notification_channel_by_kind(channel)
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO notification_log
                    (notification_id, channel_id, channel, target, message,
                     status, attempts, error, created_at, updated_at)
                VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?)
                """,
                (
                    notification_id,
                    channel_row["id"] if channel_row else None,
                    channel,
                    target,
                    status,
                    attempts,
                    error,
                    now,
                    now,
                ),
            )
            return int(cursor.lastrowid)

    def update_notification_delivery(
        self,
        delivery_id: int,
        status: str,
        attempts: int,
        error: str = "",
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE notification_log
                SET status = ?, attempts = ?, error = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, attempts, error, _now(), delivery_id),
            )

    def notification_deliveries(self, notification_id: str) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM notification_log
                WHERE notification_id = ?
                ORDER BY id ASC
                """,
                (notification_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def notification_deliveries_for_channel(
        self, channel: str, limit: int = 50
    ) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM notification_log
                WHERE channel = ?
                ORDER BY id DESC LIMIT ?
                """,
                (channel, max(1, min(int(limit), 200))),
            ).fetchall()
        return [dict(row) for row in rows]

    # Events --------------------------------------------------------------
    def add_event(self, event_type: str, payload_json: str = "{}") -> Dict[str, Any]:
        now = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                "INSERT INTO events (type, payload_json, created_at) VALUES (?, ?, ?)",
                (event_type, payload_json, now),
            )
            row = connection.execute(
                "SELECT * FROM events WHERE id = ?", (int(cursor.lastrowid),)
            ).fetchone()
        return dict(row)

    def list_events(
        self, event_type: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM events"
        params: List[Any] = []
        if event_type:
            query += " WHERE type = ?"
            params.append(event_type)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(max(1, min(int(limit), 500)))
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    # Audit ---------------------------------------------------------------
    def audit(self, action: str, detail: str = "", actor: str = "system") -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO audit_log (actor, action, detail, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (actor, action, detail, _now()),
            )

    # Retention -----------------------------------------------------------
    def purge_expired(self, retention_days: int) -> Dict[str, int]:
        """Delete conversations and audit rows older than the retention window."""
        if retention_days <= 0:
            return {"conversations": 0, "audit_log": 0}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT id FROM conversations WHERE updated_at < ?", (cutoff,)
            ).fetchall()
            expired_ids = [int(row["id"]) for row in rows]
            if expired_ids and self.fts_enabled:
                placeholders = ",".join("?" for _ in expired_ids)
                connection.execute(
                    f"DELETE FROM messages_fts WHERE conversation_id IN ({placeholders})",
                    expired_ids,
                )
            for conversation_id in expired_ids:
                connection.execute(
                    "DELETE FROM conversations WHERE id = ?", (conversation_id,)
                )
            audit_cursor = connection.execute(
                "DELETE FROM audit_log WHERE created_at < ?", (cutoff,)
            )
        return {"conversations": len(expired_ids), "audit_log": audit_cursor.rowcount}
