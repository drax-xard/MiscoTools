"""Chat endpoints: conversations, streamed replies, and Markdown export."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, AsyncIterator, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.api.schemas import (
    ChatRequest,
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationRename,
)
from app.core.config import AppConfig
from app.core.database import Database
from app.core.llm import LLMError, LLMProvider
from app.deps import get_db, require_auth

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chat",
    tags=["chat"],
    dependencies=[Depends(require_auth)],
)

DEFAULT_SYSTEM_PROMPT = (
    "You are B-BOT, a concise household and work assistant. "
    "Reply in the language the user spoke (English or Argentinian Spanish). "
    "Prefer short, practical answers."
)


def _sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _fit_bytes(text: str, remaining: int) -> str:
    if remaining <= 0:
        return ""
    return text.encode("utf-8")[:remaining].decode("utf-8", "ignore")


def _get_conversation(db: Database, conversation_id: int) -> Dict[str, Any]:
    conversation = db.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    return conversation


def _trim_history(
    history: List[Dict[str, Any]],
    max_messages: int,
    max_chars: int,
) -> List[Dict[str, Any]]:
    """Keep the newest turns within the configured message and character budget."""
    selected = [
        {"role": message["role"], "content": message["content"]}
        for message in history
        if message["role"] in ("user", "assistant")
    ][-max_messages:]
    total = sum(len(message["content"]) for message in selected)
    while len(selected) > 1 and total > max_chars:
        removed = selected.pop(0)
        total -= len(removed["content"])
    if selected and total > max_chars:
        selected[0]["content"] = selected[0]["content"][:max_chars]
    return selected


@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(db: Database = Depends(get_db)) -> List[Dict[str, Any]]:
    return db.list_conversations()


@router.post(
    "/conversations",
    response_model=ConversationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    payload: ConversationCreate,
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    title = (payload.title or "").strip() or "New conversation"
    return db.create_conversation(title)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    conversation = _get_conversation(db, conversation_id)
    conversation["messages"] = db.get_messages(conversation_id)
    return conversation


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def rename_conversation(
    conversation_id: int,
    payload: ConversationRename,
    request: Request,
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    _get_conversation(db, conversation_id)
    db.rename_conversation(conversation_id, payload.title.strip())
    db.audit(
        "conversation.rename",
        f"id={conversation_id}",
        actor=getattr(request.state, "actor", "household"),
    )
    return _get_conversation(db, conversation_id)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    request: Request,
    db: Database = Depends(get_db),
) -> None:
    _get_conversation(db, conversation_id)
    db.delete_conversation(conversation_id)
    db.audit(
        "conversation.delete",
        f"id={conversation_id}",
        actor=getattr(request.state, "actor", "household"),
    )


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: int,
    payload: ChatRequest,
    request: Request,
    db: Database = Depends(get_db),
) -> StreamingResponse:
    config: AppConfig = request.app.state.config
    conversation = _get_conversation(db, conversation_id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content is empty.",
        )
    if len(content) > config.max_message_chars:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Message content is too long.",
        )

    semaphore = getattr(request.app.state, "stream_semaphore", None)
    acquired = False
    if semaphore is not None:
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=0.05)
            acquired = True
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many concurrent replies. Try again shortly.",
            ) from None

    try:
        user_message = db.add_message(conversation_id, "user", content)
        if conversation["title"] == "New conversation":
            db.rename_conversation(conversation_id, content[:60])

        history = db.get_messages(conversation_id)
        system_prompt = db.get_setting("system_prompt") or DEFAULT_SYSTEM_PROMPT
        llm_messages = [{"role": "system", "content": system_prompt}]
        llm_messages.extend(
            _trim_history(
                history,
                max_messages=config.max_history_messages,
                max_chars=config.max_history_chars,
            )
        )

        llm: LLMProvider = request.app.state.llm
    except Exception:
        if acquired:
            semaphore.release()
        raise

    async def _event_stream() -> AsyncIterator[str]:
        chunks: List[str] = []
        buffered = 0
        truncated = False
        yield _sse({"type": "user", "message": user_message})
        try:
            async for chunk in llm.stream_chat(llm_messages):
                chunk_bytes = len(chunk.encode("utf-8"))
                remaining = config.max_response_bytes - buffered
                if chunk_bytes > remaining:
                    partial_chunk = _fit_bytes(chunk, remaining)
                    if partial_chunk:
                        chunks.append(partial_chunk)
                        yield _sse({"type": "delta", "content": partial_chunk})
                    truncated = True
                    break
                buffered += chunk_bytes
                chunks.append(chunk)
                yield _sse({"type": "delta", "content": chunk})
            text = "".join(chunks).strip()[: config.max_stored_message_chars]
            if text:
                assistant_message = db.add_message(conversation_id, "assistant", text)
                if truncated:
                    yield _sse(
                        {
                            "type": "error",
                            "error": "The reply exceeded the configured size limit.",
                        }
                    )
                    yield _sse({"type": "done", "message": assistant_message})
                else:
                    yield _sse({"type": "done", "message": assistant_message})
            else:
                yield _sse({"type": "error", "error": "The model returned an empty reply."})
        except LLMError as exc:
            correlation_id = uuid.uuid4().hex[:12]
            logger.error(
                "Chat stream failed (reference=%s conversation=%s): %s",
                correlation_id,
                conversation_id,
                exc,
                exc_info=True,
            )
            if chunks:
                partial = "".join(chunks).strip()[: config.max_stored_message_chars]
                if partial:
                    db.add_message(conversation_id, "assistant", partial)
            yield _sse(
                {
                    "type": "error",
                    "error": (
                        "The assistant is temporarily unavailable. "
                        f"Reference: {correlation_id}."
                    ),
                }
            )
        except asyncio.CancelledError:
            if chunks:
                partial = "".join(chunks).strip()[: config.max_stored_message_chars]
                if partial:
                    db.add_message(conversation_id, "assistant", partial)
            raise

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for item in _event_stream():
                yield item
        finally:
            if acquired:
                semaphore.release()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/conversations/{conversation_id}/export", response_class=PlainTextResponse)
def export_conversation(
    conversation_id: int,
    db: Database = Depends(get_db),
) -> PlainTextResponse:
    conversation = _get_conversation(db, conversation_id)
    lines = [f"# {conversation['title']}", ""]
    for message in db.get_messages(conversation_id):
        speaker = "User" if message["role"] == "user" else "B-BOT"
        lines.extend([f"**{speaker}:**", "", message["content"], ""])
    filename = f"b-bot-conversation-{conversation_id}.md"
    return PlainTextResponse(
        "\n".join(lines),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
