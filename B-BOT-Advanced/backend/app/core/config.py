"""Application configuration loaded from ``config.yaml`` and ``.env``.

Environment variables always win over the YAML file so secrets can stay out of
source control. Relative storage paths are resolved against the backend root.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, model_validator

BACKEND_DIR = Path(__file__).resolve().parents[2]

_PLACEHOLDER_TOKENS = {
    "change-this-to-a-secret-token",
    "changeme",
    "replace-me",
    "secret",
    "token",
    "test",
    "test-token",
    "default",
}

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


class LLMConfig(BaseModel):
    base_url: str = "http://localhost:8080/v1"
    model: str = ""
    api_key: str = ""
    temperature: float = 0.7
    max_tokens: int = 1024
    timeout: float = 120.0

    @property
    def chat_completions_url(self) -> str:
        return self.base_url.rstrip("/") + "/chat/completions"


class STTConfig(BaseModel):
    base_url: str = "http://localhost:8080/v1"
    model: str = "whisper-1"
    api_key: str = ""
    language: str = "auto"

    @property
    def transcriptions_url(self) -> str:
        return self.base_url.rstrip("/") + "/audio/transcriptions"


class WakeWordsConfig(BaseModel):
    en: str = "b-bot"
    es: str = "bebote"


class VoiceConfig(BaseModel):
    enabled: bool = False
    microphone: str = ""
    speaker: str = ""
    wake_words: WakeWordsConfig = Field(default_factory=WakeWordsConfig)


class AppConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8000
    auth_token: str = ""
    # Previous token kept valid for a bounded rotation window.
    auth_token_previous: str = ""
    llm: LLMConfig = Field(default_factory=LLMConfig)
    stt: STTConfig = Field(default_factory=STTConfig)
    database_path: Path = Path("data/b-bot.db")
    projects_path: Path = Path("data/projects")
    backups_path: Path = Path("data/backups")
    voice: VoiceConfig = Field(default_factory=VoiceConfig)
    allow_cors: bool = False

    # Household scheduling and device timezone.
    timezone: str = "America/Argentina/Buenos_Aires"
    scheduler_enabled: bool = True
    max_scheduled_jobs: int = Field(default=500, ge=1)
    min_recurrence_seconds: int = Field(default=60, ge=1)
    reminder_grace_seconds: int = Field(default=3600, ge=0)

    # Notification abuse controls.
    max_notifications_per_minute: int = Field(default=30, ge=1)
    max_notification_retries: int = Field(default=2, ge=0, le=10)

    # First-party plugin loading.
    plugins_path: Path = Path("plugins")
    plugins_enabled: bool = True
    plugin_tool_timeout_seconds: float = Field(default=10.0, ge=0.1, le=300)
    plugin_max_manifest_bytes: int = Field(default=262144, ge=1024)

    # Abuse resistance (SEC-02/SEC-05).
    rate_limit_per_minute: int = Field(default=120, ge=1)
    global_rate_limit_per_minute: int = Field(default=600, ge=1)
    auth_max_failures: int = Field(default=5, ge=1)
    auth_lockout_seconds: int = Field(default=300, ge=1)
    max_request_body_bytes: int = Field(default=1_000_000, ge=1024)
    max_response_bytes: int = Field(default=200_000, ge=1024)
    max_concurrent_streams: int = Field(default=4, ge=1)
    max_history_messages: int = Field(default=40, ge=2)
    max_history_chars: int = Field(default=24_000, ge=1000)
    max_message_chars: int = Field(default=32_000, ge=1)
    max_stored_message_chars: int = Field(default=64_000, ge=1)

    # Exposure hardening (SEC-06/SEC-07/SEC-28).
    docs_enabled: bool = False
    security_headers: bool = True
    serve_frontend: bool = True
    trust_proxy_headers: bool = False
    allow_insecure_transport: bool = False

    # Retention (SEC-09/SEC-30): 0 disables automatic cleanup.
    retention_days: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _validate_auth_token(self) -> "AppConfig":
        _validate_token(self.auth_token, "B_BOT_AUTH_TOKEN")
        if self.auth_token_previous:
            _validate_token(self.auth_token_previous, "B_BOT_AUTH_TOKEN_PREVIOUS")
        return self

    @model_validator(mode="after")
    def _validate_timezone(self) -> "AppConfig":
        try:
            ZoneInfo(self.timezone)
        except Exception as exc:
            raise ValueError(f"Unknown timezone: {self.timezone}") from exc
        return self

    @model_validator(mode="after")
    def _validate_transport(self) -> "AppConfig":
        if self.allow_insecure_transport:
            return self
        for name, url in (
            ("llm.base_url", self.llm.base_url),
            ("stt.base_url", self.stt.base_url),
        ):
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if parsed.scheme == "http" and host not in _LOOPBACK_HOSTS:
                raise ValueError(
                    f"{name} uses plaintext HTTP for a non-loopback host. "
                    "Use HTTPS (preferred) or set allow_insecure_transport=true "
                    "only on a trusted private network."
                )
        return self

    def redacted(self) -> Dict[str, Any]:
        """Return only user-relevant settings (no network topology or paths)."""
        return {
            "auth_token": "***" if self.auth_token else "",
            "voice": {
                "enabled": self.voice.enabled,
                "wake_words": self.voice.wake_words.model_dump(),
            },
            "timezone": self.timezone,
            "retention_days": self.retention_days,
        }


def _validate_token(token: str, name: str) -> None:
    if not token:
        return
    if token.lower() in _PLACEHOLDER_TOKENS:
        raise ValueError(
            f"{name} is set to a known placeholder value. "
            "Generate a strong secret (e.g., `openssl rand -hex 32`) and update your configuration."
        )
    if len(token) < 16:
        raise ValueError(
            f"{name} is too short. Use at least 16 characters "
            "(preferably a random hex/base64 string)."
        )


def _env_str(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value if value not in (None, "") else None


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str) -> int:
    return int(value)


def _parse_float(value: str) -> float:
    return float(value)


def _set_path(data: Dict[str, Any], path: tuple, value: Any) -> None:
    cursor = data
    for key in path[:-1]:
        cursor = cursor.setdefault(key, {})
    cursor[path[-1]] = value


def _apply_env_overrides(data: Dict[str, Any]) -> Dict[str, Any]:
    string_mappings = {
        "B_BOT_HOST": ("host",),
        "B_BOT_AUTH_TOKEN": ("auth_token",),
        "B_BOT_AUTH_TOKEN_PREVIOUS": ("auth_token_previous",),
        "B_BOT_LLM_BASE_URL": ("llm", "base_url"),
        "B_BOT_LLM_MODEL": ("llm", "model"),
        "B_BOT_LLM_API_KEY": ("llm", "api_key"),
        "B_BOT_STT_BASE_URL": ("stt", "base_url"),
        "B_BOT_STT_MODEL": ("stt", "model"),
        "B_BOT_DATABASE_PATH": ("database_path",),
        "B_BOT_PLUGINS_PATH": ("plugins_path",),
        "B_BOT_TIMEZONE": ("timezone",),
    }
    typed_mappings: Dict[str, tuple] = {
        "B_BOT_PORT": (("port",), _parse_int),
        "B_BOT_RATE_LIMIT_PER_MINUTE": (("rate_limit_per_minute",), _parse_int),
        "B_BOT_GLOBAL_RATE_LIMIT_PER_MINUTE": (("global_rate_limit_per_minute",), _parse_int),
        "B_BOT_AUTH_MAX_FAILURES": (("auth_max_failures",), _parse_int),
        "B_BOT_AUTH_LOCKOUT_SECONDS": (("auth_lockout_seconds",), _parse_int),
        "B_BOT_MAX_REQUEST_BODY_BYTES": (("max_request_body_bytes",), _parse_int),
        "B_BOT_MAX_RESPONSE_BYTES": (("max_response_bytes",), _parse_int),
        "B_BOT_MAX_CONCURRENT_STREAMS": (("max_concurrent_streams",), _parse_int),
        "B_BOT_MAX_SCHEDULED_JOBS": (("max_scheduled_jobs",), _parse_int),
        "B_BOT_MIN_RECURRENCE_SECONDS": (("min_recurrence_seconds",), _parse_int),
        "B_BOT_REMINDER_GRACE_SECONDS": (("reminder_grace_seconds",), _parse_int),
        "B_BOT_MAX_NOTIFICATIONS_PER_MINUTE": (("max_notifications_per_minute",), _parse_int),
        "B_BOT_MAX_NOTIFICATION_RETRIES": (("max_notification_retries",), _parse_int),
        "B_BOT_SCHEDULER_ENABLED": (("scheduler_enabled",), _parse_bool),
        "B_BOT_PLUGINS_ENABLED": (("plugins_enabled",), _parse_bool),
        "B_BOT_PLUGIN_TOOL_TIMEOUT_SECONDS": (
            ("plugin_tool_timeout_seconds",),
            _parse_float,
        ),
        "B_BOT_PLUGIN_MAX_MANIFEST_BYTES": (("plugin_max_manifest_bytes",), _parse_int),
        "B_BOT_MAX_HISTORY_MESSAGES": (("max_history_messages",), _parse_int),
        "B_BOT_MAX_HISTORY_CHARS": (("max_history_chars",), _parse_int),
        "B_BOT_RETENTION_DAYS": (("retention_days",), _parse_int),
        "B_BOT_DOCS_ENABLED": (("docs_enabled",), _parse_bool),
        "B_BOT_SECURITY_HEADERS": (("security_headers",), _parse_bool),
        "B_BOT_SERVE_FRONTEND": (("serve_frontend",), _parse_bool),
        "B_BOT_TRUST_PROXY_HEADERS": (("trust_proxy_headers",), _parse_bool),
        "B_BOT_ALLOW_INSECURE_TRANSPORT": (("allow_insecure_transport",), _parse_bool),
        "B_BOT_ALLOW_CORS": (("allow_cors",), _parse_bool),
    }

    for env_name, path in string_mappings.items():
        value = _env_str(env_name)
        if value is not None:
            _set_path(data, path, value)

    for env_name, (path, parser) in typed_mappings.items():
        value = _env_str(env_name)
        if value is not None:
            _set_path(data, path, parser(value))
    return data


def _resolve_path(value: Any) -> Path:
    path = Path(str(value)).expanduser()
    return path if path.is_absolute() else (BACKEND_DIR / path)


def load_config(config_path: Optional[Path] = None) -> AppConfig:
    load_dotenv(BACKEND_DIR / ".env", override=False)

    if config_path is None:
        config_path = Path(os.getenv("B_BOT_CONFIG", BACKEND_DIR / "config.yaml"))

    raw: Dict[str, Any] = {}
    if config_path.is_file():
        with config_path.open("r", encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"Configuration file must contain a mapping: {config_path}")
        raw = loaded

    raw = _apply_env_overrides(raw)
    config = AppConfig.model_validate(raw)
    config.database_path = _resolve_path(config.database_path)
    config.projects_path = _resolve_path(config.projects_path)
    config.backups_path = _resolve_path(config.backups_path)
    config.plugins_path = _resolve_path(config.plugins_path)
    return config
