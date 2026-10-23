from __future__ import annotations

import json

from app.core.llm import LLMError
from tests.conftest import HEADERS


class FakeLLM:
    def __init__(self, parts=None):
        self.parts = parts or ["Hello", ", ", "world", "!"]
        self.seen = []

    async def stream_chat(self, messages, **kwargs):
        self.seen.append(list(messages))
        for part in self.parts:
            yield part


class ErrorLLM:
    async def stream_chat(self, messages, **kwargs):
        raise LLMError("internal upstream detail http://10.0.0.5/v1")
        yield ""  # pragma: no cover


def read_events(response):
    events = []
    for line in response.text.splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[len("data:") :].strip()))
    return events


def create_conversation(client) -> int:
    response = client.post("/api/chat/conversations", json={}, headers=HEADERS)
    assert response.status_code == 201
    return response.json()["id"]


def test_conversation_crud(client):
    conversation_id = create_conversation(client)

    listing = client.get("/api/chat/conversations", headers=HEADERS).json()
    assert [item["id"] for item in listing] == [conversation_id]

    response = client.patch(
        f"/api/chat/conversations/{conversation_id}",
        json={"title": "Groceries"},
        headers=HEADERS,
    )
    assert response.json()["title"] == "Groceries"

    detail = client.get(f"/api/chat/conversations/{conversation_id}", headers=HEADERS)
    assert detail.status_code == 200
    assert detail.json()["messages"] == []

    deleted = client.delete(f"/api/chat/conversations/{conversation_id}", headers=HEADERS)
    assert deleted.status_code == 204
    missing = client.get(f"/api/chat/conversations/{conversation_id}", headers=HEADERS)
    assert missing.status_code == 404


def test_unknown_conversation_returns_404(client):
    assert client.get("/api/chat/conversations/9999", headers=HEADERS).status_code == 404


def test_send_message_streams_and_persists(client, app):
    app.state.llm = FakeLLM()
    conversation_id = create_conversation(client)

    response = client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "Hi there"},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = []
    for line in response.text.splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[len("data:") :].strip()))
    assert events[0]["type"] == "user"
    assert "".join(
        event["content"] for event in events if event["type"] == "delta"
    ) == "Hello, world!"
    assert events[-1]["type"] == "done"

    detail = client.get(f"/api/chat/conversations/{conversation_id}", headers=HEADERS).json()
    assert [message["role"] for message in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["content"] == "Hello, world!"
    assert detail["title"] == "Hi there"


def test_export_markdown(client, app):
    app.state.llm = FakeLLM(["Sure."])
    conversation_id = create_conversation(client)
    client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "Export this"},
        headers=HEADERS,
    )

    response = client.get(
        f"/api/chat/conversations/{conversation_id}/export", headers=HEADERS
    )
    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert "**User:**" in response.text
    assert "**B-BOT:**" in response.text
    assert "Sure." in response.text


def test_system_prompt_setting(client):
    response = client.put(
        "/api/settings/system-prompt",
        json={"system_prompt": "Be brief."},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["settings"]["system_prompt"] == "Be brief."


def test_history_is_trimmed(client, app):
    app.state.llm = FakeLLM(["ok"])
    app.state.config.max_history_messages = 4
    conversation_id = create_conversation(client)
    for index in range(5):
        client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"content": f"message {index}"},
            headers=HEADERS,
        )
    sent = app.state.llm.seen[-1]
    assert sent[0]["role"] == "system"
    assert len(sent) == 5
    assert sent[-1]["content"] == "message 4"


def test_history_character_budget(client, app):
    app.state.llm = FakeLLM(["ok"])
    app.state.config.max_history_chars = 25
    conversation_id = create_conversation(client)
    for content in ("aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"):
        client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"content": content},
            headers=HEADERS,
        )
    sent = app.state.llm.seen[-1]
    assert sum(len(message["content"]) for message in sent[1:]) <= 25
    assert sent[-1]["content"] == "cccccccccc"


def test_streamed_response_is_capped(client, app):
    app.state.config.max_response_bytes = 1024
    app.state.llm = FakeLLM(["a" * 700, "b" * 700])
    conversation_id = create_conversation(client)
    response = client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "Long reply"},
        headers=HEADERS,
    )
    events = read_events(response)
    assert any(event["type"] == "error" for event in events)
    detail = client.get(f"/api/chat/conversations/{conversation_id}", headers=HEADERS).json()
    stored = detail["messages"][-1]["content"]
    assert stored == "a" * 700 + "b" * 324


def test_upstream_errors_are_redacted(client, app):
    app.state.llm = ErrorLLM()
    conversation_id = create_conversation(client)
    response = client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "Trigger failure"},
        headers=HEADERS,
    )
    events = read_events(response)
    error = next(event for event in events if event["type"] == "error")
    assert "Reference:" in error["error"]
    assert "10.0.0.5" not in error["error"]
    assert "internal upstream detail" not in error["error"]


def test_delete_is_audited(client, app):
    conversation_id = create_conversation(client)
    client.delete(f"/api/chat/conversations/{conversation_id}", headers=HEADERS)
    with app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT action, detail FROM audit_log WHERE action = 'conversation.delete'"
        ).fetchone()
    assert row is not None
    assert f"id={conversation_id}" == row["detail"]


def test_settings_update_is_audited(client, app):
    client.put(
        "/api/settings/system-prompt",
        json={"system_prompt": "Be brief."},
        headers=HEADERS,
    )
    with app.state.db.connect() as connection:
        row = connection.execute(
            "SELECT action FROM audit_log WHERE action = 'settings.system_prompt.update'"
        ).fetchone()
    assert row is not None


def test_fts_query_is_escaped(client, app):
    database = app.state.db
    with database.connect() as connection:
        cursor = connection.execute(
            "INSERT INTO conversations (title, created_at, updated_at) VALUES ('t', 'now', 'now')"
        )
        conversation_id = int(cursor.lastrowid)
    database.add_message(conversation_id, "user", "hello world")
    assert database.search_messages('" OR *') == []
    if database.fts_enabled:
        assert database.search_messages("hello")[0]["content"] == "hello world"
