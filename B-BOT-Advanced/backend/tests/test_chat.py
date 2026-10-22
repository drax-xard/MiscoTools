from __future__ import annotations

import json

from tests.conftest import HEADERS


class FakeLLM:
    def __init__(self, parts=None):
        self.parts = parts or ["Hello", ", ", "world", "!"]

    async def stream_chat(self, messages, **kwargs):
        for part in self.parts:
            yield part


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
