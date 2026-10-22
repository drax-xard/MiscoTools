"""Shared FastAPI dependencies: authentication and storage access."""

from __future__ import annotations

import hmac
from typing import TYPE_CHECKING

from fastapi import Header, HTTPException, Request, status

if TYPE_CHECKING:
    from app.core.config import AppConfig
    from app.core.database import Database


def get_config(request: Request) -> "AppConfig":
    return request.app.state.config


def get_db(request: Request) -> "Database":
    return request.app.state.db


async def require_auth(
    request: Request,
    authorization: str = Header(default=""),
) -> str:
    """Validate the single household bearer token.

    The token must be configured; an unconfigured server fails closed.
    """
    config: "AppConfig" = request.app.state.config
    if not config.auth_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication token is not configured.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not hmac.compare_digest(token, config.auth_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    request.state.actor = "household"
    return "household"
