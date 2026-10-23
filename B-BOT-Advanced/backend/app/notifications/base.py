"""Provider-neutral notification channel contract."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Protocol

_TARGET_RE = re.compile(r"^[A-Za-z0-9 _:-]+$")


class NotificationError(ValueError):
    """Raised for invalid or rate-limited notification requests."""


@dataclass
class DeliveryResult:
    status: str
    error: str = ""


class NotificationChannel(Protocol):
    kind: str

    async def send(
        self, notification_id: str, message: str, target: str
    ) -> DeliveryResult:
        ...


def validate_target(target: str) -> str:
    cleaned = (target or "household").strip()
    if not cleaned or len(cleaned) > 80:
        raise NotificationError("Invalid notification target.")
    if not _TARGET_RE.match(cleaned):
        raise NotificationError("Invalid notification target.")
    return cleaned


def validate_message(message: str) -> str:
    cleaned = (message or "").strip()
    if not cleaned:
        raise NotificationError("Notification message is required.")
    if len(cleaned) > 4000:
        raise NotificationError("Notification message is too long.")
    return cleaned


def channel_payload(notification_id: str, message: str, target: str) -> Dict[str, Any]:
    return {
        "notification_id": notification_id,
        "message": message,
        "target": target,
    }
