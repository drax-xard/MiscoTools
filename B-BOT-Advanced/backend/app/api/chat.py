"""Chat endpoints: conversations, streamed replies, and Markdown export."""

from __future__ import annotations

import asyncio
import json
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
from app.core.database import Database
from app.core.llm import LLMError, LLMProvider
from app.deps import get_db, require_auth

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


def _get_conversation(db: Database, conversation_id: int) -> Dict[str, Any]:
    conversation = db.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    return conversation


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
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    _get_conversation(db, conversation_id)
    db.rename_conversation(conversation_id, payload.title.strip())
    return _get_conversation(db, conversation_id)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    db: Database = Depends(get_db),
) -> None:
    _get_conversation(db, conversation_id)
    db.delete_conversation(conversation_id)


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: int,
    payload: ChatRequest,
    request: Request,
    db: Database = Depends(get_db),
) -> StreamingResponse:
    conversation = _get_conversation(db, conversation_id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content is empty.",
        )

    user_message = db.add_message(conversation_id, "user", content)
    if conversation["title"] == "New conversation":
        db.rename_conversation(conversation_id, content[:60])

    history = db.get_messages(conversation_id)
    system_prompt = db.get_setting("system_prompt") or DEFAULT_SYSTEM_PROMPT
    llm_messages = [{"role": "system", "content": system_prompt}]
    llm_messages.extend(
        {"role": message["role"], "content": message["content"]}
        for message in history
        if message["role"] in ("user", "assistant")
    )

    llm: LLMProvider = request.app.state.llm

    async def event_stream() -> AsyncIterator[str]:
        chunks: List[str] = []
        yield _sse({"type": "user", "message": user_message})
        try:
            async for chunk in llm.stream_chat(llm_messages):
                chunks.append(chunk)
                yield _sse({"type": "delta", "content": chunk})
            text = "".join(chunks).strip()
            if text:
                assistant_message = db.add_message(conversation_id, "assistant", text)
                yield _sse({"type": "done", "message": assistant_message})
            else:
                yield _sse({"type": "error", "error": "The model returned an empty reply."})
        except LLMError as exc:
            if chunks:
                db.add_message(conversation_id, "assistant", "".join(chunks).strip())
            yield _sse({"type": "error", "error": str(exc)})
        except asyncio.CancelledError:
            if chunks:
                db.add_message(conversation_id, "assistant", "".join(chunks).strip())
            raise

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
