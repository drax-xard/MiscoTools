"""First-party plugin loader, registry, and tool invocation boundary."""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import inspect
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Dict, List, Optional

import yaml
from pydantic import ValidationError

from app.core.config import BACKEND_DIR, AppConfig
from app.core.database import Database
from app.notifications.dispatcher import NotificationDispatcher
from app.plugins.context import (
    NotificationCapability,
    PluginContext,
    PluginStorage,
)
from app.plugins.errors import (
    PluginConfirmationRequired,
    PluginDisabled,
    PluginError,
    PluginExecutionError,
    PluginManifestError,
    PluginNotFound,
    PluginNotLoaded,
    PluginPermissionError,
    PluginTimeout,
    PluginValidationError,
)
from app.plugins.manifest import (
    SUPPORTED_CAPABILITIES,
    PluginManifest,
    validate_arguments,
)

logger = logging.getLogger(__name__)

MANIFEST_NAMES = ("manifest.yaml", "manifest.yml", "manifest.json")


@dataclass
class LoadedPlugin:
    manifest: PluginManifest
    directory: Path
    module: Optional[ModuleType] = None
    context: Optional[PluginContext] = None
    tools: Dict[str, Callable[..., Any]] = field(default_factory=dict)
    setup: Optional[Callable[..., Any]] = None
    teardown: Optional[Callable[..., Any]] = None
    enabled: bool = False
    code_loaded: bool = False
    error: str = ""


class PluginRegistry:
    def __init__(
        self,
        config: AppConfig,
        database: Database,
        notifications: NotificationDispatcher,
        plugins_dir: Optional[Path] = None,
    ) -> None:
        self.config = config
        self.database = database
        self.notifications = notifications
        if plugins_dir is None:
            candidate = Path(config.plugins_path).expanduser()
            plugins_dir = candidate if candidate.is_absolute() else BACKEND_DIR / candidate
        self.plugins_dir = Path(plugins_dir)
        self.plugins: Dict[str, LoadedPlugin] = {}
        self.errors: Dict[str, str] = {}
        self._started = False
        self._enable_lock = asyncio.Lock()

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        if not self.config.plugins_enabled:
            logger.info("Plugin loading is disabled by configuration")
            return
        self._load_all()
        for plugin in list(self.plugins.values()):
            if plugin.error:
                continue
            row = self.database.get_plugin_row(plugin.manifest.id)
            if row is None or not row["enabled"]:
                continue
            try:
                await self._ensure_code(plugin)
            except PluginError:
                plugin.enabled = False
                continue
            try:
                await self._run_lifecycle(plugin, plugin.setup)
            except PluginError as exc:
                self.database.set_plugin_enabled(plugin.manifest.id, False)
                plugin.enabled = False
                self._audit(
                    "plugin.setup_failed",
                    f"plugin={plugin.manifest.id} error={type(exc).__name__}",
                )
            else:
                plugin.enabled = True

    async def shutdown(self) -> None:
        for plugin in list(self.plugins.values()):
            if not plugin.enabled:
                continue
            try:
                await self._run_lifecycle(plugin, plugin.teardown)
            except PluginError:
                self._audit(
                    "plugin.teardown_failed",
                    f"plugin={plugin.manifest.id}",
                )
            plugin.enabled = False

    def list_plugins(self) -> List[Dict[str, Any]]:
        return [
            self._serialize(plugin)
            for plugin in sorted(self.plugins.values(), key=lambda item: item.manifest.id)
        ]

    def get_plugin(self, plugin_id: str) -> Dict[str, Any]:
        plugin = self.plugins.get(plugin_id)
        if plugin is None:
            raise PluginNotFound("Plugin not found.")
        return self._serialize(plugin)

    async def set_enabled(self, plugin_id: str, enabled: bool) -> Dict[str, Any]:
        async with self._enable_lock:
            return await self._set_enabled_locked(plugin_id, enabled)

    async def _set_enabled_locked(
        self, plugin_id: str, enabled: bool
    ) -> Dict[str, Any]:
        plugin = self.plugins.get(plugin_id)
        if plugin is None:
            raise PluginNotFound("Plugin not found.")
        if plugin.error:
            raise PluginNotLoaded("Plugin code is not loaded.")

        if enabled and not plugin.enabled:
            await self._ensure_code(plugin)
            try:
                await self._run_lifecycle(plugin, plugin.setup)
            except PluginError as exc:
                self.database.set_plugin_enabled(plugin_id, False)
                plugin.enabled = False
                self._audit(
                    "plugin.enable_failed",
                    f"plugin={plugin_id} error={type(exc).__name__}",
                )
                raise
            plugin.enabled = True
            self.database.set_plugin_enabled(plugin_id, True)
            self._audit("plugin.enable", f"plugin={plugin_id}")
        elif not enabled and plugin.enabled:
            try:
                await self._run_lifecycle(plugin, plugin.teardown)
            except PluginError:
                self._audit("plugin.teardown_failed", f"plugin={plugin_id}")
            plugin.enabled = False
            self.database.set_plugin_enabled(plugin_id, False)
            self._audit("plugin.disable", f"plugin={plugin_id}")
        return self._serialize(plugin)

    async def invoke_tool(
        self,
        plugin_id: str,
        tool_name: str,
        arguments: Any,
        actor: str = "household",
    ) -> Any:
        plugin = self.plugins.get(plugin_id)
        if plugin is None:
            raise PluginNotFound("Plugin not found.")
        if plugin.error:
            raise PluginNotLoaded("Plugin code is not loaded.")
        if not plugin.enabled:
            self._audit(
                "plugin.tool.denied",
                f"plugin={plugin_id} tool={tool_name} reason=disabled",
                actor=actor,
            )
            raise PluginDisabled("Plugin is disabled.")

        tool = plugin.manifest.tool(tool_name)
        if tool is None:
            raise PluginNotFound("Tool not found.")
        if tool.requires_confirmation:
            self._audit(
                "plugin.tool.denied",
                f"plugin={plugin_id} tool={tool_name} reason=confirmation",
                actor=actor,
            )
            raise PluginConfirmationRequired(
                "Confirmation-required tools are disabled until the "
                "single-use confirmation protocol is implemented."
            )

        missing = set(tool.permissions) - SUPPORTED_CAPABILITIES
        if missing:
            self._audit(
                "plugin.tool.denied",
                f"plugin={plugin_id} tool={tool_name} reason=unsupported_capability",
                actor=actor,
            )
            raise PluginPermissionError(
                "This tool requires a capability that is not available yet."
            )
        for permission in tool.permissions:
            if plugin.context is None or not plugin.context.has_capability(permission):
                self._audit(
                    "plugin.tool.denied",
                    f"plugin={plugin_id} tool={tool_name} reason=permission",
                    actor=actor,
                )
                raise PluginPermissionError("Plugin lacks the required capability.")

        try:
            validated = validate_arguments(tool.parameters, arguments)
        except PluginValidationError:
            self._audit(
                "plugin.tool.denied",
                f"plugin={plugin_id} tool={tool_name} reason=invalid_arguments",
                actor=actor,
            )
            raise

        digest = hashlib.sha256(
            json.dumps(
                validated,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        self._audit(
            "plugin.tool.call",
            f"plugin={plugin_id} tool={tool_name} args_sha256={digest}",
            actor=actor,
        )

        callable_tool = plugin.tools[tool_name]
        try:
            result = await self._call(callable_tool, plugin.context, **validated)
        except asyncio.TimeoutError as exc:
            self._audit(
                "plugin.tool.timeout",
                f"plugin={plugin_id} tool={tool_name}",
                actor=actor,
            )
            raise PluginTimeout("Plugin tool timed out.") from exc
        except PluginPermissionError:
            self._audit(
                "plugin.tool.denied",
                f"plugin={plugin_id} tool={tool_name} reason=permission",
                actor=actor,
            )
            raise
        except Exception as exc:
            logger.exception("Plugin tool failed: %s.%s", plugin_id, tool_name)
            self._audit(
                "plugin.tool.failed",
                f"plugin={plugin_id} tool={tool_name} error={type(exc).__name__}",
                actor=actor,
            )
            raise PluginExecutionError("Plugin tool failed.") from exc

        try:
            json.dumps(result, ensure_ascii=False)
        except (TypeError, ValueError) as exc:
            self._audit(
                "plugin.tool.invalid_result",
                f"plugin={plugin_id} tool={tool_name}",
                actor=actor,
            )
            raise PluginExecutionError("Plugin returned a non-serializable result.") from exc

        self._audit(
            "plugin.tool.result",
            f"plugin={plugin_id} tool={tool_name} status=ok",
            actor=actor,
        )
        return result

    def _load_all(self) -> None:
        if not self.plugins_dir.is_dir():
            logger.info("Plugin directory does not exist: %s", self.plugins_dir)
            return
        try:
            directories = sorted(self.plugins_dir.iterdir(), key=lambda item: item.name)
        except OSError:
            logger.exception("Could not read plugin directory: %s", self.plugins_dir)
            return
        for directory in directories:
            if not directory.is_dir() or directory.is_symlink():
                continue
            manifest_path = next(
                (directory / name for name in MANIFEST_NAMES if (directory / name).is_file()),
                None,
            )
            if manifest_path is None:
                continue
            try:
                manifest = self._read_manifest(manifest_path)
            except PluginError as exc:
                self.errors[directory.name] = str(exc)
                self._audit(
                    "plugin.manifest_rejected",
                    f"directory={directory.name} error={type(exc).__name__}",
                )
                continue

            if manifest.id in self.plugins:
                self.errors[directory.name] = "Duplicate plugin id."
                self._audit(
                    "plugin.manifest_rejected",
                    f"directory={directory.name} error=duplicate_id",
                )
                continue

            self.database.sync_plugin(manifest.id, manifest.name, manifest.version)
            plugin = LoadedPlugin(manifest=manifest, directory=directory)
            try:
                self._validate_entrypoint(manifest, directory)
            except PluginManifestError as exc:
                plugin.error = str(exc)
                self.database.set_plugin_enabled(manifest.id, False)
                self.errors[directory.name] = plugin.error
                self._audit(
                    "plugin.load_failed",
                    f"plugin={manifest.id} error={type(exc).__name__}",
                )
            else:
                self._audit("plugin.discovered", f"plugin={manifest.id}")
                if manifest.triggers:
                    logger.warning(
                        "Plugin %s declares triggers; trigger execution is not enabled yet",
                        manifest.id,
                    )
            self.plugins[manifest.id] = plugin

    def _read_manifest(self, path: Path) -> PluginManifest:
        if path.is_symlink():
            raise PluginManifestError("Plugin manifest must not be a symlink.")
        try:
            size = path.stat().st_size
            if size > self.config.plugin_max_manifest_bytes:
                raise PluginManifestError("Plugin manifest is too large.")
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except PluginManifestError:
            raise
        except Exception as exc:
            raise PluginManifestError("Plugin manifest could not be read.") from exc
        if not isinstance(raw, dict):
            raise PluginManifestError("Plugin manifest must be a mapping.")
        try:
            return PluginManifest.model_validate(raw)
        except ValidationError as exc:
            first = exc.errors()[0]
            location = ".".join(str(item) for item in first.get("loc", ()))
            detail = first.get("msg", "invalid manifest")
            raise PluginManifestError(f"Invalid manifest at {location}: {detail}") from exc

    @staticmethod
    def _validate_entrypoint(manifest: PluginManifest, directory: Path) -> Path:
        raw_entry = directory / manifest.entrypoint
        if raw_entry.is_symlink():
            raise PluginManifestError("Entrypoint must not be a symlink.")
        entry = raw_entry.resolve()
        root = directory.resolve()
        if not entry.is_relative_to(root):
            raise PluginManifestError("Entrypoint escapes the plugin directory.")
        if not entry.is_file():
            raise PluginManifestError("Entrypoint is missing.")
        return entry

    async def _ensure_code(self, plugin: LoadedPlugin) -> None:
        if plugin.code_loaded:
            return
        if plugin.error:
            raise PluginNotLoaded(plugin.error)
        try:
            await asyncio.wait_for(
                asyncio.to_thread(self._load_code, plugin),
                timeout=self.config.plugin_tool_timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            plugin.error = "Plugin code load timed out."
            self.database.set_plugin_enabled(plugin.manifest.id, False)
            self._audit(
                "plugin.load_failed",
                f"plugin={plugin.manifest.id} error=timeout",
            )
            raise PluginNotLoaded(plugin.error) from exc
        except PluginError as exc:
            plugin.error = str(exc)
            self.database.set_plugin_enabled(plugin.manifest.id, False)
            self._audit(
                "plugin.load_failed",
                f"plugin={plugin.manifest.id} error={type(exc).__name__}",
            )
            raise PluginNotLoaded(plugin.error) from exc
        except Exception as exc:  # pragma: no cover - defensive import guard
            logger.exception("Unexpected plugin load failure: %s", plugin.manifest.id)
            plugin.error = f"Load failed: {type(exc).__name__}"
            self.database.set_plugin_enabled(plugin.manifest.id, False)
            self._audit(
                "plugin.load_failed",
                f"plugin={plugin.manifest.id} error={type(exc).__name__}",
            )
            raise PluginNotLoaded(plugin.error) from exc

    def _load_code(self, plugin: LoadedPlugin) -> None:
        manifest = plugin.manifest
        entry = self._validate_entrypoint(manifest, plugin.directory)
        module = self._import_module(manifest.id, entry)
        tools: Dict[str, Callable[..., Any]] = {}
        for tool in manifest.tools:
            candidate = getattr(module, tool.name, None)
            if not callable(candidate):
                raise PluginManifestError(
                    f"Tool {tool.name} is not implemented by the entrypoint."
                )
            tools[tool.name] = candidate
        setup = self._hook(module, manifest, "setup")
        teardown = self._hook(module, manifest, "teardown")
        context = PluginContext(
            manifest.id,
            self._capabilities(manifest),
            manifest.config_defaults(),
        )
        plugin.module = module
        plugin.tools = tools
        plugin.setup = setup
        plugin.teardown = teardown
        plugin.context = context
        plugin.code_loaded = True

    @staticmethod
    def _import_module(plugin_id: str, entry: Path) -> ModuleType:
        module_name = f"b_bot_plugin_{plugin_id}_{abs(hash(str(entry)))}"
        spec = importlib.util.spec_from_file_location(module_name, entry)
        if spec is None or spec.loader is None:
            raise PluginManifestError("Entrypoint could not be imported.")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except Exception:
            sys.modules.pop(module_name, None)
            raise
        return module

    @staticmethod
    def _hook(
        module: ModuleType, manifest: PluginManifest, name: str
    ) -> Optional[Callable[..., Any]]:
        hook_name = getattr(manifest.lifecycle, name)
        if hook_name is None:
            return None
        hook = getattr(module, hook_name, None)
        if not callable(hook):
            raise PluginManifestError(
                f"Lifecycle hook {hook_name} is not implemented by the entrypoint."
            )
        return hook

    def _capabilities(self, manifest: PluginManifest) -> Dict[str, Any]:
        capabilities: Dict[str, Any] = {}
        if "storage" in manifest.permissions:
            capabilities["storage"] = PluginStorage(self.database, manifest.id)
        if "notify" in manifest.permissions:
            capabilities["notify"] = NotificationCapability(
                self.notifications, manifest.id
            )
        return capabilities

    async def _run_lifecycle(
        self, plugin: LoadedPlugin, hook: Optional[Callable[..., Any]]
    ) -> None:
        if hook is None:
            return
        if plugin.context is None:
            raise PluginNotLoaded("Plugin context is unavailable.")
        try:
            await self._call(hook, plugin.context)
        except asyncio.TimeoutError as exc:
            raise PluginTimeout("Plugin lifecycle hook timed out.") from exc
        except PluginError:
            raise
        except Exception as exc:
            logger.exception("Plugin lifecycle hook failed: %s", plugin.manifest.id)
            raise PluginExecutionError("Plugin lifecycle hook failed.") from exc

    async def _call(self, function: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        timeout = self.config.plugin_tool_timeout_seconds
        if inspect.iscoroutinefunction(function):
            return await asyncio.wait_for(
                function(*args, **kwargs), timeout=timeout
            )
        result = await asyncio.wait_for(
            asyncio.to_thread(function, *args, **kwargs), timeout=timeout
        )
        if inspect.isawaitable(result):
            return await asyncio.wait_for(result, timeout=timeout)
        return result

    def _serialize(self, plugin: LoadedPlugin) -> Dict[str, Any]:
        row = self.database.get_plugin_row(plugin.manifest.id) or {}
        return {
            "id": plugin.manifest.id,
            "name": plugin.manifest.name,
            "version": plugin.manifest.version,
            "description": plugin.manifest.description,
            "permissions": list(plugin.manifest.permissions),
            "tools": [tool.name for tool in plugin.manifest.tools],
            "first_party": True,
            "enabled": bool(plugin.enabled),
            "loaded": plugin.error == "",
            "code_loaded": plugin.code_loaded,
            "error": plugin.error,
            "persisted_enabled": bool(row.get("enabled", 0)),
        }

    def _audit(self, action: str, detail: str, actor: str = "system") -> None:
        try:
            self.database.audit(action, detail[:500], actor=actor)
        except Exception:  # pragma: no cover - audit must not break plugins
            logger.exception("Failed to write plugin audit entry: %s", action)
