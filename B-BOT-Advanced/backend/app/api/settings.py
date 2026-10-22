"""Read-only configuration and editable high-level settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.schemas import SettingsOut
from app.core.config import AppConfig
from app.core.database import Database
from app.deps import get_config, get_db, require_auth

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)


class SystemPromptUpdate(BaseModel):
    system_prompt: str = Field(default="", max_length=8000)


@router.get("", response_model=SettingsOut)
def read_settings(
    config: AppConfig = Depends(get_config),
    db: Database = Depends(get_db),
) -> SettingsOut:
    settings = config.redacted()
    settings["system_prompt"] = db.get_setting("system_prompt") or ""
    return SettingsOut(settings=settings)


@router.put("/system-prompt", response_model=SettingsOut)
def update_system_prompt(
    payload: SystemPromptUpdate,
    config: AppConfig = Depends(get_config),
    db: Database = Depends(get_db),
) -> SettingsOut:
    db.set_setting("system_prompt", payload.system_prompt.strip())
    settings = config.redacted()
    settings["system_prompt"] = db.get_setting("system_prompt") or ""
    return SettingsOut(settings=settings)
