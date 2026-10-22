"""Application configuration loaded from ``config.yaml`` and ``.env``.

Environment variables always win over the YAML file so secrets can stay out of
source control. Relative storage paths are resolved against the backend root.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

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
    llm: LLMConfig = Field(default_factory=LLMConfig)
    stt: STTConfig = Field(default_factory=STTConfig)
    database_path: Path = Path("data/b-bot.db")
    projects_path: Path = Path("data/projects")
    backups_path: Path = Path("data/backups")
    voice: VoiceConfig = Field(default_factory=VoiceConfig)
    allow_cors: bool = False

    @model_validator(mode="after")
    def _validate_auth_token(self) -> "AppConfig":
        token = self.auth_token
        if not token:
            return self
        if token.lower() in _PLACEHOLDER_TOKENS:
            raise ValueError(
                "B_BOT_AUTH_TOKEN is set to a known placeholder value. "
                "Generate a strong secret (e.g., `openssl rand -hex 32`) and update your configuration."
            )
        if len(token) < 16:
            raise ValueError(
                "B_BOT_AUTH_TOKEN is too short. Use at least 16 characters (preferably a random hex/base64 string)."
            )
        return self

    def redacted(self) -> Dict[str, Any]:
        """Return a copy safe to expose to authenticated clients."""
        data = self.model_dump()
        data["auth_token"] = "***" if self.auth_token else ""
        data["llm"]["api_key"] = "***" if self.llm.api_key else ""
        data["stt"]["api_key"] = "***" if self.stt.api_key else ""
        data["database_path"] = str(self.database_path)
        data["projects_path"] = str(self.projects_path)
        data["backups_path"] = str(self.backups_path)
        return data


def _env_str(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value if value not in (None, "") else None


def _apply_env_overrides(data: Dict[str, Any]) -> Dict[str, Any]:
    mappings = {
        "B_BOT_HOST": ("host",),
        "B_BOT_AUTH_TOKEN": ("auth_token",),
        "B_BOT_LLM_BASE_URL": ("llm", "base_url"),
        "B_BOT_LLM_MODEL": ("llm", "model"),
        "B_BOT_LLM_API_KEY": ("llm", "api_key"),
        "B_BOT_STT_BASE_URL": ("stt", "base_url"),
        "B_BOT_STT_MODEL": ("stt", "model"),
        "B_BOT_DATABASE_PATH": ("database_path",),
    }
    for env_name, path in mappings.items():
        value = _env_str(env_name)
        if value is None:
            continue
        cursor = data
        for key in path[:-1]:
            cursor = cursor.setdefault(key, {})
        cursor[path[-1]] = value

    port = _env_str("B_BOT_PORT")
    if port is not None:
        data["port"] = int(port)
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
    return config
