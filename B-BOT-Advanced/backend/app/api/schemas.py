"""Request and response models for the HTTP API."""

from __future__ import annotations

from typing import List, Optional

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
