"""Notification fan-out with per-channel isolation, retries, and logging."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import deque
from typing import Any, Deque, Dict, List, Optional

from app.core.config import AppConfig
from app.core.database import Database
from app.core.events import EventBus
from app.notifications.base import (
    NotificationError,
    validate_message,
    validate_target,
)
from app.notifications.channels import VoiceChannel, WebChannel

logger = logging.getLogger(__name__)


class NotificationDispatcher:
    def __init__(self, database: Database, config: AppConfig, events: EventBus) -> None:
        self.database = database
        self.config = config
        self.events = events
        self.channels = {
            "web": WebChannel(),
            "voice": VoiceChannel(events),
        }
        self._sends: Deque[float] = deque()
        self._lock = asyncio.Lock()

    async def _check_rate_limit(self) -> None:
        async with self._lock:
            now = time.monotonic()
            while self._sends and now - self._sends[0] >= 60:
                self._sends.popleft()
            if len(self._sends) >= self.config.max_notifications_per_minute:
                raise NotificationError("Notification rate limit exceeded.")
            self._sends.append(now)

    async def send(
        self,
        message: str,
        target: str = "household",
        source: str = "system",
        channels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        body = validate_message(message)
        destination = validate_target(target)
        await self._check_rate_limit()

        notification_id = uuid.uuid4().hex
        self.database.create_notification(notification_id, body, source)
        configured = {
            row["kind"]: row for row in self.database.list_notification_channels()
        }
        requested = channels or list(self.channels.keys())
        results: List[Dict[str, Any]] = []

        for kind in requested:
            configured_channel = configured.get(kind)
            channel = self.channels.get(kind)
            if configured_channel is None or not channel:
                results.append(
                    self._record_skipped(notification_id, kind, destination)
                )
                continue
            if not configured_channel["enabled"]:
                results.append(
                    self._record_skipped(notification_id, kind, destination)
                )
                continue

            delivery_id = self.database.add_notification_delivery(
                notification_id, kind, destination, "pending"
            )
            status = "failed"
            attempts = 0
            error = ""
            for attempt in range(self.config.max_notification_retries + 1):
                attempts = attempt + 1
                try:
                    result = await asyncio.wait_for(
                        channel.send(notification_id, body, destination),
                        timeout=5.0,
                    )
                    status = result.status
                    error = result.error
                    break
                except Exception as exc:
                    error = type(exc).__name__
                    logger.exception(
                        "Notification delivery failed (channel=%s attempt=%s)",
                        kind,
                        attempts,
                    )
                    if attempt < self.config.max_notification_retries:
                        await asyncio.sleep(0.05 * (attempt + 1))
            self.database.update_notification_delivery(
                delivery_id, status, attempts, error
            )
            results.append(
                {
                    "channel": kind,
                    "target": destination,
                    "status": status,
                    "attempts": attempts,
                    "error": error,
                }
            )

        await self.events.publish(
            "notification.dispatched",
            {
                "notification_id": notification_id,
                "source": source,
                "target": destination,
                "results": results,
            },
        )
        return {
            "notification": self.database.get_notification(notification_id),
            "deliveries": self.database.notification_deliveries(notification_id),
        }

    def _record_skipped(
        self, notification_id: str, kind: str, target: str
    ) -> Dict[str, Any]:
        delivery_id = self.database.add_notification_delivery(
            notification_id, kind, target, "skipped"
        )
        return {
            "id": delivery_id,
            "channel": kind,
            "target": target,
            "status": "skipped",
            "attempts": 0,
            "error": "",
        }
