from __future__ import annotations

import textwrap
from pathlib import Path
from typing import Tuple

import pytest
from fastapi.testclient import TestClient

from app.core.config import AppConfig
from app.core.database import Database
from app.core.events import EventBus
from app.main import create_app
from app.notifications.dispatcher import NotificationDispatcher
from app.plugins.errors import (
    PluginConfirmationRequired,
    PluginDisabled,
    PluginExecutionError,
    PluginNotLoaded,
    PluginPermissionError,
    PluginTimeout,
    PluginValidationError,
)
from app.plugins.registry import PluginRegistry
from tests.conftest import HEADERS, TOKEN

DEMO_MANIFEST = """
id: demo
name: Demo
version: 1.0.0
description: Demo plugin
permissions: [storage, notify, network]
entrypoint: plugin.py
lifecycle:
  setup: setup
  teardown: teardown
config:
  type: object
  properties:
    greeting:
      type: string
      default: hello
tools:
  - name: echo
    description: Echo text
    parameters:
      type: object
      properties:
        text:
          type: string
          minLength: 1
          maxLength: 20
      required: [text]
      additionalProperties: false
  - name: remember
    parameters:
      type: object
      properties:
        key: {type: string}
        value: {type: string}
      required: [key, value]
  - name: recall
    parameters:
      type: object
      properties:
        key: {type: string}
      required: [key]
  - name: notify
    permissions: [notify]
    parameters:
      type: object
      properties:
        message: {type: string}
      required: [message]
  - name: boom
    parameters: {type: object, properties: {}}
  - name: slow
    parameters:
      type: object
      properties:
        seconds: {type: number}
      required: [seconds]
  - name: network_tool
    permissions: [network]
    parameters: {type: object, properties: {}}
  - name: confirm_me
    requires_confirmation: true
    parameters: {type: object, properties: {}}
"""

DEMO_CODE = """
import asyncio

STATE = {"setup": 0, "teardown": 0}


def setup(context):
    STATE["setup"] += 1


def teardown(context):
    STATE["teardown"] += 1


async def echo(context, text):
    return {"echo": text, "greeting": context.config["greeting"]}


def remember(context, key, value):
    context.storage.set(key, value)
    return {"stored": key}


def recall(context, key):
    return {"value": context.storage.get(key)}


async def notify(context, message):
    result = await context.notify.send(message)
    return {"status": result["deliveries"][0]["status"]}


async def boom(context):
    raise RuntimeError("internal detail that must not reach the client")


async def slow(context, seconds):
    await asyncio.sleep(seconds)
    return {"ok": True}


async def network_tool(context):
    return {"ok": True}


async def confirm_me(context):
    return {"confirmed": True}
"""


def write_plugin(root: Path, directory: str, manifest: str, code: str = DEMO_CODE) -> Path:
    plugin_dir = root / directory
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "manifest.yaml").write_text(textwrap.dedent(manifest), encoding="utf-8")
    (plugin_dir / "plugin.py").write_text(textwrap.dedent(code), encoding="utf-8")
    return plugin_dir


def make_stack(
    tmp_path: Path, *, timeout: float = 2.0
) -> Tuple[AppConfig, Database, PluginRegistry]:
    config = AppConfig(
        auth_token=TOKEN,
        database_path=tmp_path / "test.db",
        plugins_path=tmp_path / "plugins",
        plugin_tool_timeout_seconds=timeout,
    )
    database = Database(config.database_path)
    database.initialize()
    events = EventBus(database)
    notifications = NotificationDispatcher(database, config, events)
    registry = PluginRegistry(config, database, notifications)
    return config, database, registry


@pytest.mark.asyncio
async def test_plugin_disabled_by_default_and_enable_persists(tmp_path):
    write_plugin(tmp_path / "plugins", "demo", DEMO_MANIFEST)
    config, database, registry = make_stack(tmp_path)
    await registry.start()

    info = registry.get_plugin("demo")
    assert info["loaded"] is True
    assert info["code_loaded"] is False
    assert info["enabled"] is False
    assert info["persisted_enabled"] is False
    assert info["tools"] == [
        "echo",
        "remember",
        "recall",
        "notify",
        "boom",
        "slow",
        "network_tool",
        "confirm_me",
    ]

    with pytest.raises(PluginDisabled):
        await registry.invoke_tool("demo", "echo", {"text": "hi"})

    enabled = await registry.set_enabled("demo", True)
    assert enabled["enabled"] is True
    assert enabled["code_loaded"] is True
    assert database.get_plugin_row("demo")["enabled"] == 1
    assert registry.plugins["demo"].module.STATE["setup"] == 1

    result = await registry.invoke_tool("demo", "echo", {"text": "hi"})
    assert result == {"echo": "hi", "greeting": "hello"}

    await registry.set_enabled("demo", False)
    assert registry.plugins["demo"].module.STATE["teardown"] == 1
    await registry.set_enabled("demo", True)

    events = EventBus(database)
    notifications = NotificationDispatcher(database, config, events)
    restarted = PluginRegistry(config, database, notifications)
    await restarted.start()
    assert restarted.get_plugin("demo")["enabled"] is True
    assert restarted.get_plugin("demo")["code_loaded"] is True
    assert restarted.get_plugin("demo")["persisted_enabled"] is True
    await restarted.shutdown()


@pytest.mark.asyncio
async def test_plugin_storage_and_notification_capabilities(tmp_path):
    write_plugin(tmp_path / "plugins", "demo", DEMO_MANIFEST)
    _, database, registry = make_stack(tmp_path)
    await registry.start()
    await registry.set_enabled("demo", True)

    await registry.invoke_tool("demo", "remember", {"key": "note", "value": "hello"})
    recalled = await registry.invoke_tool("demo", "recall", {"key": "note"})
    assert recalled == {"value": "hello"}
    assert database.get_plugin_config_values("demo") == {'note': '"hello"'}

    await registry.invoke_tool("demo", "notify", {"message": "Plugin says hi"})
    notifications = database.list_notifications()
    assert notifications[0]["source"] == "plugin:demo"
    deliveries = database.notification_deliveries(notifications[0]["id"])
    assert {item["channel"]: item["status"] for item in deliveries} == {
        "web": "sent",
        "voice": "queued",
    }


@pytest.mark.asyncio
async def test_plugin_tool_validation_denials_and_isolation(tmp_path):
    write_plugin(tmp_path / "plugins", "demo", DEMO_MANIFEST)
    _, database, registry = make_stack(tmp_path)
    await registry.start()
    await registry.set_enabled("demo", True)

    with pytest.raises(PluginValidationError):
        await registry.invoke_tool("demo", "echo", {"text": "hi", "extra": 1})
    with pytest.raises(PluginValidationError):
        await registry.invoke_tool("demo", "echo", {})
    with pytest.raises(PluginValidationError):
        await registry.invoke_tool("demo", "echo", {"text": 5})

    with pytest.raises(PluginPermissionError):
        await registry.invoke_tool("demo", "network_tool", {})
    with pytest.raises(PluginConfirmationRequired):
        await registry.invoke_tool("demo", "confirm_me", {})

    with pytest.raises(PluginExecutionError):
        await registry.invoke_tool("demo", "boom", {})
    assert await registry.invoke_tool("demo", "echo", {"text": "still"}) == {
        "echo": "still",
        "greeting": "hello",
    }

    with database.connect() as connection:
        actions = {
            row["action"]
            for row in connection.execute(
                "SELECT action FROM audit_log WHERE action LIKE 'plugin.tool.%'"
            )
        }
    assert {"plugin.tool.call", "plugin.tool.result", "plugin.tool.failed"} <= actions
    assert "plugin.tool.denied" in actions


@pytest.mark.asyncio
async def test_plugin_tool_timeout_and_audit_digest(tmp_path):
    write_plugin(tmp_path / "plugins", "demo", DEMO_MANIFEST)
    _, database, registry = make_stack(tmp_path, timeout=0.1)
    await registry.start()
    await registry.set_enabled("demo", True)

    await registry.invoke_tool("demo", "echo", {"text": "supersecret"})
    with pytest.raises(PluginTimeout):
        await registry.invoke_tool("demo", "slow", {"seconds": 0.3})

    with database.connect() as connection:
        row = connection.execute(
            """
            SELECT detail FROM audit_log
            WHERE action = 'plugin.tool.call'
            ORDER BY id DESC LIMIT 1
            """
        ).fetchone()
    assert "args_sha256=" in row["detail"]
    assert "supersecret" not in row["detail"]


@pytest.mark.asyncio
async def test_invalid_manifests_are_rejected(tmp_path):
    root = tmp_path / "plugins"
    write_plugin(
        root,
        "bad-id",
        """
        id: Bad ID
        name: Bad
        version: 1.0.0
        entrypoint: plugin.py
        """,
    )
    write_plugin(
        root,
        "traversal",
        """
        id: traversal
        name: Traversal
        version: 1.0.0
        entrypoint: ../evil.py
        """,
    )
    write_plugin(
        root,
        "bad-tool",
        """
        id: bad_tool
        name: Bad tool
        version: 1.0.0
        entrypoint: plugin.py
        tools:
          - name: BadName
            parameters: {type: object, properties: {}}
        """,
    )
    write_plugin(
        root,
        "bad-schema",
        """
        id: bad_schema
        name: Bad schema
        version: 1.0.0
        entrypoint: plugin.py
        tools:
          - name: broken
            parameters:
              type: object
              properties:
                value: {description: no type}
        """,
    )
    write_plugin(
        root,
        "missing-tool",
        """
        id: missing_tool
        name: Missing tool
        version: 1.0.0
        entrypoint: plugin.py
        tools:
          - name: not_implemented
            parameters: {type: object, properties: {}}
        """,
    )
    _, _, registry = make_stack(tmp_path)
    await registry.start()

    assert set(registry.errors) == {
        "bad-id",
        "traversal",
        "bad-tool",
        "bad-schema",
    }
    listed = registry.list_plugins()
    assert len(listed) == 1
    assert listed[0]["id"] == "missing_tool"
    assert listed[0]["loaded"] is True
    assert listed[0]["code_loaded"] is False

    with pytest.raises(PluginNotLoaded):
        await registry.set_enabled("missing_tool", True)
    assert registry.get_plugin("missing_tool")["loaded"] is False


@pytest.mark.asyncio
async def test_duplicate_plugin_id_is_rejected(tmp_path):
    root = tmp_path / "plugins"
    write_plugin(root, "first", DEMO_MANIFEST)
    write_plugin(root, "second", DEMO_MANIFEST)
    _, _, registry = make_stack(tmp_path)
    await registry.start()

    assert list(registry.plugins) == ["demo"]
    assert "second" in registry.errors


def test_plugin_api_requires_auth_and_invokes_tools(tmp_path):
    write_plugin(tmp_path / "plugins", "demo", DEMO_MANIFEST)
    config = AppConfig(
        auth_token=TOKEN,
        database_path=tmp_path / "api.db",
        plugins_path=tmp_path / "plugins",
    )
    app = create_app(config)
    with TestClient(app) as client:
        assert client.get("/api/plugins").status_code == 401
        listed = client.get("/api/plugins", headers=HEADERS)
        assert listed.status_code == 200
        assert listed.json()[0]["enabled"] is False

        denied = client.post(
            "/api/plugins/demo/tools/echo",
            json={"arguments": {"text": "hi"}},
            headers=HEADERS,
        )
        assert denied.status_code == 403

        enabled = client.patch(
            "/api/plugins/demo", json={"enabled": True}, headers=HEADERS
        )
        assert enabled.status_code == 200
        assert enabled.json()["enabled"] is True

        invoked = client.post(
            "/api/plugins/demo/tools/echo",
            json={"arguments": {"text": "hi"}},
            headers=HEADERS,
        )
        assert invoked.status_code == 200
        assert invoked.json()["result"] == {"echo": "hi", "greeting": "hello"}

        invalid = client.post(
            "/api/plugins/demo/tools/echo",
            json={"arguments": {"text": "hi", "extra": True}},
            headers=HEADERS,
        )
        assert invalid.status_code == 422

        missing = client.patch(
            "/api/plugins/unknown", json={"enabled": True}, headers=HEADERS
        )
        assert missing.status_code == 404

@pytest.mark.asyncio
async def test_entrypoint_is_not_imported_until_enabled(tmp_path):
    marker = tmp_path / "imported.txt"
    code = f"""
from pathlib import Path

Path({str(marker)!r}).write_text("imported", encoding="utf-8")


def setup(context):
    pass


async def ping(context):
    return {{"ok": True}}
"""
    write_plugin(
        tmp_path / "plugins",
        "lazy",
        """
        id: lazy
        name: Lazy
        version: 1.0.0
        entrypoint: plugin.py
        lifecycle:
          setup: setup
        tools:
          - name: ping
            parameters: {type: object, properties: {}}
        """,
        code=code,
    )
    _, _, registry = make_stack(tmp_path)
    await registry.start()
    assert marker.exists() is False

    await registry.set_enabled("lazy", True)
    assert marker.read_text(encoding="utf-8") == "imported"

@pytest.mark.asyncio
async def test_setup_failure_disables_plugin(tmp_path):
    write_plugin(
        tmp_path / "plugins",
        "broken_setup",
        """
        id: broken_setup
        name: Broken setup
        version: 1.0.0
        entrypoint: plugin.py
        lifecycle:
          setup: setup
        tools:
          - name: ping
            parameters: {type: object, properties: {}}
        """,
        code="""
def setup(context):
    raise RuntimeError("setup exploded")


async def ping(context):
    return {"ok": True}
""",
    )
    _, database, registry = make_stack(tmp_path)
    await registry.start()
    with pytest.raises(PluginExecutionError):
        await registry.set_enabled("broken_setup", True)
    assert database.get_plugin_row("broken_setup")["enabled"] == 0
    with database.connect() as connection:
        row = connection.execute(
            "SELECT action FROM audit_log WHERE action = 'plugin.enable_failed'"
        ).fetchone()
    assert row is not None

