"""SQLite storage layer.

The schema mirrors the data model in ``PLAN.md``. WAL mode is enabled for
concurrent reads while the assistant streams a reply, and FTS5 indexes message
and document text when the SQLite build supports it.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
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
    status TEXT NOT NULL DEFAULT 'open',
    member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
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
"""

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
        self.path.parent.mkdir(parents=True, exist_ok=True)
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
            try:
                connection.executescript(FTS_SCHEMA)
                self.fts_enabled = True
            except sqlite3.OperationalError:
                self.fts_enabled = False

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

    def search_messages(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        if not self.fts_enabled:
            return []
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT m.* FROM messages_fts f
                JOIN messages m ON m.id = f.message_id
                WHERE messages_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (query, limit),
            ).fetchall()
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
