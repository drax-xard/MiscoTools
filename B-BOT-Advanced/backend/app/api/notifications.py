"""Notification channels, test sends, delivery log, and the web inbox."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import (
    NotificationChannelOut,
    NotificationChannelUpdate,
    NotificationDeliveryOut,
    NotificationOut,
    NotificationTest,
)
from app.core.database import Database
from app.deps import get_db, require_auth
from app.notifications.base import NotificationError
from app.notifications.dispatcher import NotificationDispatcher

router = APIRouter(
    prefix="/api/notifications",
    tags=["notifications"],
    dependencies=[Depends(require_auth)],
)


def _dispatcher(request: Request) -> NotificationDispatcher:
    return request.app.state.notifications


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    database: Database = Depends(get_db),
) -> List[dict]:
    return database.list_notifications(unread_only=unread_only, limit=limit)


@router.get("/channels", response_model=List[NotificationChannelOut])
def list_channels(database: Database = Depends(get_db)) -> List[dict]:
    return database.list_notification_channels()


@router.patch("/channels/{channel_id}", response_model=NotificationChannelOut)
def update_channel(
    channel_id: int,
    payload: NotificationChannelUpdate,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    channel = database.get_notification_channel(channel_id)
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found.",
        )
    updated = database.update_notification_channel(
        channel_id, {"enabled": 1 if payload.enabled else 0}
    )
    database.audit(
        "notification_channel.update",
        f"id={channel_id} enabled={payload.enabled}",
        actor=getattr(request.state, "actor", "household"),
    )
    return updated


@router.get("/log", response_model=List[NotificationDeliveryOut])
def notification_log(
    notification_id: Optional[str] = None,
    limit: int = 50,
    database: Database = Depends(get_db),
) -> List[dict]:
    if notification_id:
        return database.notification_deliveries(notification_id)
    channels = database.list_notification_channels()
    rows: List[dict] = []
    for channel in channels:
        rows.extend(
            database.notification_deliveries_for_channel(
                channel["kind"], limit=limit
            )
        )
    rows.sort(key=lambda row: (row["created_at"], row["id"]), reverse=True)
    return rows[: max(1, min(int(limit), 200))]


@router.post("/test")
async def send_test_notification(
    payload: NotificationTest,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    try:
        result = await _dispatcher(request).send(
            payload.message,
            target=payload.target,
            source="manual-test",
            channels=payload.channels,
        )
    except NotificationError as exc:
        code = (
            status.HTTP_429_TOO_MANY_REQUESTS
            if "rate limit" in str(exc).lower()
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    database.audit(
        "notification.test",
        f"id={result['notification']['id']}",
        actor=getattr(request.state, "actor", "household"),
    )
    return result


@router.post("/read-all")
def mark_all_read(
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    count = database.mark_all_notifications_read()
    database.audit(
        "notifications.read_all",
        f"count={count}",
        actor=getattr(request.state, "actor", "household"),
    )
    return {"updated": count}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: str,
    database: Database = Depends(get_db),
) -> dict:
    notification = database.get_notification(notification_id)
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    database.mark_notification_read(notification_id)
    return database.get_notification(notification_id)
