"""Capability-scoped plugin context."""

from __future__ import annotations

import json
import re
from types import MappingProxyType
from typing import Any, Dict, Mapping, Optional

from app.core.database import Database
from app.notifications.dispatcher import NotificationDispatcher
from app.plugins.errors import PluginExecutionError, PluginPermissionError

_KEY_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,100}$")
_MAX_VALUE_BYTES = 65536


class PluginStorage:
    def __init__(self, database: Database, plugin_id: str) -> None:
        self.database = database
        self.plugin_id = plugin_id

    @staticmethod
    def _key(key: str) -> str:
        if not isinstance(key, str) or not _KEY_RE.match(key):
            raise PluginExecutionError("Invalid plugin storage key.")
        return key

    def get(self, key: str, default: Any = None) -> Any:
        validated = self._key(key)
        raw = self.database.get_plugin_config_values(self.plugin_id).get(validated)
        if raw is None:
            return default
        return json.loads(raw)

    def set(self, key: str, value: Any) -> None:
        validated = self._key(key)
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if len(encoded.encode("utf-8")) > _MAX_VALUE_BYTES:
            raise PluginExecutionError("Plugin storage value is too large.")
        self.database.set_plugin_config_value(self.plugin_id, validated, encoded)

    def delete(self, key: str) -> None:
        self.database.delete_plugin_config_value(self.plugin_id, self._key(key))

    def all(self) -> Dict[str, Any]:
        return {
            key: json.loads(value)
            for key, value in self.database.get_plugin_config_values(self.plugin_id).items()
        }


class NotificationCapability:
    def __init__(self, dispatcher: NotificationDispatcher, plugin_id: str) -> None:
        self.dispatcher = dispatcher
        self.plugin_id = plugin_id

    async def send(self, message: str, target: str = "household") -> Dict[str, Any]:
        return await self.dispatcher.send(
            message,
            target=target,
            source=f"plugin:{self.plugin_id}",
        )


class PluginContext:
    __slots__ = ("plugin_id", "_capabilities", "config")

    def __init__(
        self,
        plugin_id: str,
        capabilities: Dict[str, Any],
        config: Optional[Mapping[str, Any]] = None,
    ) -> None:
        object.__setattr__(self, "plugin_id", plugin_id)
        object.__setattr__(self, "_capabilities", capabilities)
        object.__setattr__(self, "config", MappingProxyType(dict(config or {})))

    def __getattr__(self, name: str) -> Any:
        capabilities = object.__getattribute__(self, "_capabilities")
        if name in capabilities:
            return capabilities[name]
        raise PluginPermissionError(
            f"Plugin {object.__getattribute__(self, 'plugin_id')} lacks the {name} capability."
        )

    def has_capability(self, name: str) -> bool:
        return name in self._capabilities
