"""Built-in notification channels: web and voice."""

from __future__ import annotations

from app.core.events import EventBus
from app.notifications.base import DeliveryResult, channel_payload


class WebChannel:
    kind = "web"

    async def send(
        self, notification_id: str, message: str, target: str
    ) -> DeliveryResult:
        return DeliveryResult(status="sent")


class VoiceChannel:
    kind = "voice"

    def __init__(self, events: EventBus) -> None:
        self.events = events

    async def send(
        self, notification_id: str, message: str, target: str
    ) -> DeliveryResult:
        await self.events.publish(
            "voice.notify",
            channel_payload(notification_id, message, target),
        )
        return DeliveryResult(status="queued")
