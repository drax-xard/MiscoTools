"""Request and response models for the HTTP API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    created_at: str


class ConversationOut(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str


class ConversationDetail(ConversationOut):
    messages: List[MessageOut] = Field(default_factory=list)


class ChatRequest(BaseModel):
    content: str = Field(min_length=1, max_length=32000)


class SettingsOut(BaseModel):
    settings: dict


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    points: int = Field(default=0, ge=0)


class MemberUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    active: Optional[bool] = None
    points: Optional[int] = Field(default=None, ge=0)


class MemberOut(BaseModel):
    id: int
    name: str
    active: bool
    points: int
    created_at: str


class ChoreCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    cadence: str = Field(min_length=1, max_length=40)
    member_id: Optional[int] = None
    points: int = Field(default=1, ge=0, le=1000)
    next_due_at: Optional[str] = Field(default=None, max_length=40)


class ChoreUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    cadence: Optional[str] = Field(default=None, min_length=1, max_length=40)
    member_id: Optional[int] = None
    points: Optional[int] = Field(default=None, ge=0, le=1000)
    next_due_at: Optional[str] = Field(default=None, max_length=40)


class ChoreComplete(BaseModel):
    member_id: Optional[int] = None


class ChoreOut(BaseModel):
    id: int
    title: str
    cadence: str
    last_completed_at: Optional[str] = None
    next_due_at: Optional[str] = None
    member_id: Optional[int] = None
    points: int
    last_notified_at: Optional[str] = None
    scheduler_key: Optional[str] = None
    created_at: str
    updated_at: str


class ChoreCompletionOut(BaseModel):
    id: int
    chore_id: int
    member_id: Optional[int] = None
    points_awarded: int
    completed_at: str
    member_name: Optional[str] = None


class ChoreCompleteOut(BaseModel):
    completion: ChoreCompletionOut
    chore: ChoreOut
    points_awarded: int


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    due_at: str = Field(min_length=1, max_length=40)
    recurrence: str = Field(default="", max_length=40)
    member_id: Optional[int] = None


class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    due_at: Optional[str] = Field(default=None, min_length=1, max_length=40)
    recurrence: Optional[str] = Field(default=None, max_length=40)
    member_id: Optional[int] = None


class ReminderPostpone(BaseModel):
    minutes: int = Field(ge=1, le=525600)


class ReminderOut(BaseModel):
    id: int
    title: str
    description: str
    kind: str
    due_at: Optional[str] = None
    recurrence: str
    next_due_at: Optional[str] = None
    status: str
    member_id: Optional[int] = None
    last_notified_at: Optional[str] = None
    scheduler_key: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str


class NotificationChannelUpdate(BaseModel):
    enabled: bool


class NotificationChannelOut(BaseModel):
    id: int
    kind: str
    config_json: str
    enabled: bool


class NotificationTest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    target: str = Field(default="household", min_length=1, max_length=80)
    channels: Optional[List[str]] = None


class NotificationOut(BaseModel):
    id: str
    message: str
    source: str
    created_at: str
    read_at: Optional[str] = None


class NotificationDeliveryOut(BaseModel):
    id: int
    notification_id: str
    channel: str
    target: str
    status: str
    attempts: int
    error: str
    created_at: str
    updated_at: str


class PluginOut(BaseModel):
    id: str
    name: str
    version: str
    description: str
    permissions: List[str]
    tools: List[str]
    first_party: bool
    enabled: bool
    loaded: bool
    code_loaded: bool
    error: str
    persisted_enabled: bool


class PluginUpdate(BaseModel):
    enabled: bool


class PluginToolInvoke(BaseModel):
    arguments: Dict[str, Any] = Field(default_factory=dict)


class PluginToolResult(BaseModel):
    plugin_id: str
    tool: str
    result: Any
