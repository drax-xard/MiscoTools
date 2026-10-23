"""Async event bus with optional persistence."""

from __future__ import annotations

import inspect
import json
import logging
from collections import defaultdict
from typing import Any, Awaitable, Callable, DefaultDict, Dict, List, Optional, Union

from app.core.database import Database

logger = logging.getLogger(__name__)

Handler = Callable[[str, Dict[str, Any]], Union[None, Awaitable[None]]]


class EventBus:
    def __init__(self, database: Database) -> None:
        self.database = database
        self._subscribers: DefaultDict[str, List[Handler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._subscribers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Handler) -> None:
        handlers = self._subscribers.get(event_type, [])
        if handler in handlers:
            handlers.remove(handler)

    async def publish(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        persist: bool = True,
    ) -> Dict[str, Any]:
        body = payload or {}
        record: Dict[str, Any] = {"type": event_type, "payload": body}
        if persist:
            try:
                record = self.database.add_event(
                    event_type,
                    json.dumps(body, ensure_ascii=False, default=str, sort_keys=True),
                )
            except Exception:  # pragma: no cover - persistence must not break events
                logger.exception("Failed to persist event %s", event_type)

        handlers = list(self._subscribers.get(event_type, []))
        handlers.extend(self._subscribers.get("*", []))
        for handler in handlers:
            try:
                result = handler(event_type, body)
                if inspect.isawaitable(result):
                    await result
            except Exception:  # pragma: no cover - isolate subscriber failures
                logger.exception("Event handler failed for %s", event_type)
        return record
