"""Abuse-resistance primitives: rate limiting, lockout, and HTTP hardening."""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List, Optional, Tuple

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60.0
_MAX_TRACKED_CLIENTS = 4096


def client_ip(scope: Scope, trust_proxy: bool) -> str:
    if trust_proxy:
        for key, value in scope.get("headers", []):
            if key.lower() == b"x-forwarded-for":
                forwarded = value.decode("latin-1").split(",")[0].strip()
                if forwarded:
                    return forwarded
    client = scope.get("client")
    return client[0] if client else "unknown"


@dataclass
class RateLimiter:
    """In-memory sliding-window limiter and auth-failure lockout.

    State is per process; deployments with multiple workers should also apply
    limits at the reverse proxy.
    """

    requests_per_minute: int
    global_per_minute: int
    max_auth_failures: int
    lockout_seconds: int
    _hits: Dict[str, Deque[float]] = field(default_factory=dict)
    _global_hits: Deque[float] = field(default_factory=deque)
    _failures: Dict[str, Tuple[int, float]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def check_request(self, ip: str) -> Tuple[bool, int]:
        async with self._lock:
            now = time.monotonic()
            self._prune(now)
            while self._global_hits and now - self._global_hits[0] >= WINDOW_SECONDS:
                self._global_hits.popleft()
            if len(self._global_hits) >= self.global_per_minute:
                return False, max(1, math.ceil(WINDOW_SECONDS - (now - self._global_hits[0])))
            hits = self._hits.setdefault(ip, deque())
            while hits and now - hits[0] >= WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= self.requests_per_minute:
                return False, max(1, math.ceil(WINDOW_SECONDS - (now - hits[0])))
            hits.append(now)
            self._global_hits.append(now)
            return True, 0

    async def auth_locked(self, ip: str) -> int:
        async with self._lock:
            now = time.monotonic()
            failures, locked_until = self._failures.get(ip, (0, 0.0))
            if locked_until > now:
                return max(1, math.ceil(locked_until - now))
            if locked_until and locked_until <= now:
                self._failures.pop(ip, None)
            return 0

    async def record_auth_failure(self, ip: str) -> None:
        async with self._lock:
            now = time.monotonic()
            failures, locked_until = self._failures.get(ip, (0, 0.0))
            if locked_until and locked_until <= now:
                failures = 0
            failures += 1
            locked_until = now + self.lockout_seconds if failures >= self.max_auth_failures else 0.0
            self._failures[ip] = (failures, locked_until)
            if locked_until:
                logger.warning("Authentication lockout engaged for %s", ip)

    async def record_auth_success(self, ip: str) -> None:
        async with self._lock:
            self._failures.pop(ip, None)

    def _prune(self, now: float) -> None:
        if len(self._hits) <= _MAX_TRACKED_CLIENTS:
            return
        stale = [
            ip
            for ip, hits in self._hits.items()
            if not hits or now - hits[-1] >= WINDOW_SECONDS
        ]
        for ip in stale:
            self._hits.pop(ip, None)
        for ip, (_, locked_until) in list(self._failures.items()):
            if locked_until and locked_until <= now:
                self._failures.pop(ip, None)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, headers: Iterable[Tuple[str, str]]) -> None:
        self.app = app
        self.headers: List[Tuple[bytes, bytes]] = [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in headers
        ]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self.headers:
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {key.lower() for key, _ in message.get("headers", [])}
                headers = message.setdefault("headers", [])
                for key, value in self.headers:
                    if key not in existing:
                        headers.append((key, value))
            await send(message)

        await self.app(scope, receive, send_wrapper)


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length: Optional[int] = None
        for key, value in scope.get("headers", []):
            if key.lower() == b"content-length":
                try:
                    content_length = int(value)
                except ValueError:
                    content_length = None
                break
        if content_length is not None and content_length > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        received = 0
        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        class _BodyTooLarge(Exception):
            pass

        async def receive_wrapper() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge
            return message

        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except _BodyTooLarge:
            if not response_started:
                await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            {"detail": "Request body is too large."},
            status_code=413,
        )
        await response(scope, receive, send)


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, limiter: RateLimiter, trust_proxy: bool) -> None:
        self.app = app
        self.limiter = limiter
        self.trust_proxy = trust_proxy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        ip = client_ip(scope, self.trust_proxy)
        allowed, retry_after = await self.limiter.check_request(ip)
        if not allowed:
            logger.warning("Rate limit exceeded for %s", ip)
            response = JSONResponse(
                {"detail": "Too many requests. Try again later."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


SECURITY_HEADERS: Tuple[Tuple[str, str], ...] = (
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Permissions-Policy", "microphone=(), camera=(), geolocation=()"),
    (
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'self'; object-src 'none'; "
        "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ),
)
