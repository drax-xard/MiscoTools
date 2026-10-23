"""Shared FastAPI dependencies: authentication and storage access."""

from __future__ import annotations

import hmac
import logging
from typing import TYPE_CHECKING, Optional

from fastapi import Header, HTTPException, Request, status

from app.core.security import RateLimiter, client_ip

if TYPE_CHECKING:
    from app.core.config import AppConfig
    from app.core.database import Database

logger = logging.getLogger(__name__)


def get_config(request: Request) -> "AppConfig":
    return request.app.state.config


def get_db(request: Request) -> "Database":
    return request.app.state.db


def _audit(request: Request, action: str, detail: str = "") -> None:
    database = getattr(request.app.state, "db", None)
    if database is None:
        return
    try:
        database.audit(action, detail, actor="anonymous")
    except Exception:  # pragma: no cover - auditing must never break auth
        logger.exception("Failed to write audit entry for %s", action)


async def _reject(
    request: Request,
    limiter: Optional[RateLimiter],
    ip: str,
    detail: str,
) -> HTTPException:
    if limiter is not None:
        await limiter.record_auth_failure(ip)
        retry_after = await limiter.auth_locked(ip)
        if retry_after:
            _audit(request, "auth.locked", f"ip={ip}")
            return HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed authentication attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )
    _audit(request, "auth.failure", f"ip={ip} {detail}")
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing bearer token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def require_auth(
    request: Request,
    authorization: str = Header(default=""),
) -> str:
    """Validate the household bearer token (current or rotation token).

    The token must be configured; an unconfigured server fails closed. Repeated
    failures from one client trigger temporary lockout.
    """
    config: "AppConfig" = request.app.state.config
    limiter: Optional[RateLimiter] = getattr(request.app.state, "limiter", None)
    ip = client_ip(request.scope, config.trust_proxy_headers)

    if limiter is not None:
        retry_after = await limiter.auth_locked(ip)
        if retry_after:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed authentication attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    if not config.auth_token:
        _audit(request, "auth.unconfigured", f"ip={ip}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication token is not configured.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise await _reject(request, limiter, ip, "missing")

    valid_tokens = [config.auth_token]
    if config.auth_token_previous:
        valid_tokens.append(config.auth_token_previous)

    matched = False
    try:
        encoded = token.encode("utf-8")
        for candidate in valid_tokens:
            if hmac.compare_digest(encoded, candidate.encode("utf-8")):
                matched = True
                break
    except (TypeError, UnicodeError):
        matched = False

    if not matched:
        raise await _reject(request, limiter, ip, "invalid")

    if limiter is not None:
        await limiter.record_auth_success(ip)
    request.state.actor = "household"
    request.state.client_ip = ip
    return "household"
