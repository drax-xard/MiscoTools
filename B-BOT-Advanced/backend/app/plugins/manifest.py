"""Plugin manifest models and strict JSON-schema argument validation."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.plugins.errors import PluginValidationError

Permission = Literal["notify", "storage", "network", "gpio", "filesystem", "home"]
ALLOWED_PERMISSIONS = {"notify", "storage", "network", "gpio", "filesystem", "home"}
SUPPORTED_CAPABILITIES = {"notify", "storage"}

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")
_TOOL_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$")
_LIFECYCLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
_JSON_TYPES = {"object", "array", "string", "integer", "number", "boolean", "null"}


class PluginTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["schedule", "event", "webhook"]
    cron: Optional[str] = Field(default=None, max_length=120)
    event: Optional[str] = Field(default=None, max_length=120)
    webhook: Optional[str] = Field(default=None, max_length=200)


class PluginLifecycle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    setup: Optional[str] = Field(default=None)
    teardown: Optional[str] = Field(default=None)

    @field_validator("setup", "teardown")
    @classmethod
    def _valid_name(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _LIFECYCLE_RE.match(value):
            raise ValueError("Lifecycle hook name is invalid.")
        return value


class PluginTool(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str = Field(default="", max_length=500)
    parameters: Dict[str, Any] = Field(
        default_factory=lambda: {"type": "object", "properties": {}}
    )
    permissions: List[Permission] = Field(default_factory=list)
    requires_confirmation: bool = False

    @field_validator("name")
    @classmethod
    def _valid_name(cls, value: str) -> str:
        if not _TOOL_RE.match(value):
            raise ValueError("Tool name must be lower_snake_case.")
        return value

    @field_validator("parameters")
    @classmethod
    def _valid_parameters(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        validate_parameter_schema(value)
        return value


class PluginManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(min_length=1, max_length=100)
    version: str
    description: str = Field(default="", max_length=500)
    permissions: List[Permission] = Field(default_factory=list)
    entrypoint: str = Field(min_length=1, max_length=200)
    tools: List[PluginTool] = Field(default_factory=list)
    triggers: List[PluginTrigger] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    lifecycle: PluginLifecycle = Field(default_factory=PluginLifecycle)

    @field_validator("id")
    @classmethod
    def _valid_id(cls, value: str) -> str:
        if not _ID_RE.match(value):
            raise ValueError("Plugin id must be lower_snake_case.")
        return value

    @field_validator("version")
    @classmethod
    def _valid_version(cls, value: str) -> str:
        if not _VERSION_RE.match(value):
            raise ValueError("Plugin version must be semantic (e.g. 1.0.0).")
        return value

    @field_validator("entrypoint")
    @classmethod
    def _valid_entrypoint(cls, value: str) -> str:
        if (
            value.startswith("/")
            or ".." in value.replace("\\", "/").split("/")
            or "\\" in value
            or not value.endswith(".py")
        ):
            raise ValueError("Entrypoint must be a relative .py file.")
        return value

    @field_validator("permissions")
    @classmethod
    def _unique_permissions(cls, value: List[Permission]) -> List[Permission]:
        if len(set(value)) != len(value):
            raise ValueError("Permissions must be unique.")
        return value

    @field_validator("config")
    @classmethod
    def _valid_config(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if value and value.get("type", "object") != "object":
            raise ValueError("Plugin config must be an object schema.")
        properties = value.get("properties")
        if properties is not None and not isinstance(properties, dict):
            raise ValueError("Plugin config properties must be an object.")
        return value

    @model_validator(mode="after")
    def _check_tools(self) -> "PluginManifest":
        names = [tool.name for tool in self.tools]
        if len(set(names)) != len(names):
            raise ValueError("Tool names must be unique.")
        for tool in self.tools:
            if not set(tool.permissions).issubset(set(self.permissions)):
                raise ValueError(
                    f"Tool {tool.name} requests permissions not declared by the plugin."
                )
        return self

    def tool(self, name: str) -> Optional[PluginTool]:
        for tool in self.tools:
            if tool.name == name:
                return tool
        return None

    def config_defaults(self) -> Dict[str, Any]:
        defaults: Dict[str, Any] = {}
        properties = self.config.get("properties") or {}
        if isinstance(properties, dict):
            for key, schema in properties.items():
                if isinstance(schema, dict) and "default" in schema:
                    defaults[key] = schema["default"]
        return defaults


def validate_parameter_schema(schema: Any, depth: int = 0) -> None:
    if depth > 20:
        raise ValueError("JSON schema is too deeply nested.")
    if not isinstance(schema, dict):
        raise ValueError("Tool parameters must be a JSON schema object.")
    expected = schema.get("type")
    if expected not in _JSON_TYPES:
        raise ValueError("Every schema node needs a supported type.")
    if schema.get("additionalProperties") not in (None, True, False) and not isinstance(
        schema.get("additionalProperties"), dict
    ):
        raise ValueError("additionalProperties must be a boolean or schema.")
    if expected == "object":
        properties = schema.get("properties", {})
        if not isinstance(properties, dict):
            raise ValueError("Object properties must be a mapping.")
        for name, child in properties.items():
            if not isinstance(name, str):
                raise ValueError("Property names must be strings.")
            validate_parameter_schema(child, depth + 1)
        required = schema.get("required", [])
        if not isinstance(required, list) or any(
            not isinstance(item, str) for item in required
        ):
            raise ValueError("required must be a list of strings.")
        for name in required:
            if name not in properties:
                raise ValueError(f"Required property {name} has no schema.")
    elif expected == "array":
        if "items" in schema:
            validate_parameter_schema(schema["items"], depth + 1)
    if "enum" in schema and not isinstance(schema["enum"], list):
        raise ValueError("enum must be a list.")


def validate_arguments(schema: Dict[str, Any], arguments: Any) -> Dict[str, Any]:
    if not isinstance(arguments, dict):
        raise PluginValidationError("Tool arguments must be an object.")
    validate_parameter_schema(schema)
    _validate_value(schema, arguments, "arguments", 0)
    return arguments


def _validate_value(schema: Dict[str, Any], value: Any, path: str, depth: int) -> None:
    if depth > 20:
        raise PluginValidationError("Arguments are too deeply nested.")
    expected = schema["type"]
    if expected == "object":
        if not isinstance(value, dict):
            raise PluginValidationError(f"{path} must be an object.")
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        for name in required:
            if name not in value:
                raise PluginValidationError(f"{path}.{name} is required.")
        additional = schema.get("additionalProperties", False)
        for key, item in value.items():
            if key in properties:
                _validate_value(properties[key], item, f"{path}.{key}", depth + 1)
            elif additional is False:
                raise PluginValidationError(f"{path}.{key} is not allowed.")
            elif isinstance(additional, dict):
                _validate_value(additional, item, f"{path}.{key}", depth + 1)
    elif expected == "array":
        if not isinstance(value, list):
            raise PluginValidationError(f"{path} must be an array.")
        items = schema.get("items")
        if isinstance(items, dict):
            for index, item in enumerate(value):
                _validate_value(items, item, f"{path}[{index}]", depth + 1)
        min_items = schema.get("minItems")
        max_items = schema.get("maxItems")
        if min_items is not None and len(value) < min_items:
            raise PluginValidationError(f"{path} has too few items.")
        if max_items is not None and len(value) > max_items:
            raise PluginValidationError(f"{path} has too many items.")
    elif expected == "string":
        if not isinstance(value, str):
            raise PluginValidationError(f"{path} must be a string.")
        _check_string(schema, value, path)
    elif expected == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise PluginValidationError(f"{path} must be an integer.")
        _check_number(schema, value, path)
    elif expected == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise PluginValidationError(f"{path} must be a number.")
        _check_number(schema, value, path)
    elif expected == "boolean":
        if not isinstance(value, bool):
            raise PluginValidationError(f"{path} must be a boolean.")
    elif expected == "null":
        if value is not None:
            raise PluginValidationError(f"{path} must be null.")

    if "enum" in schema and value not in schema["enum"]:
        raise PluginValidationError(f"{path} must be one of the allowed values.")


def _check_string(schema: Dict[str, Any], value: str, path: str) -> None:
    if "minLength" in schema and len(value) < schema["minLength"]:
        raise PluginValidationError(f"{path} is too short.")
    if "maxLength" in schema and len(value) > schema["maxLength"]:
        raise PluginValidationError(f"{path} is too long.")
    pattern = schema.get("pattern")
    if pattern and not re.search(pattern, value):
        raise PluginValidationError(f"{path} does not match the required pattern.")


def _check_number(schema: Dict[str, Any], value: float, path: str) -> None:
    if "minimum" in schema and value < schema["minimum"]:
        raise PluginValidationError(f"{path} is below the minimum.")
    if "maximum" in schema and value > schema["maximum"]:
        raise PluginValidationError(f"{path} is above the maximum.")
