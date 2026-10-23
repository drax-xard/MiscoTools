"""First-party plugin registry and manual tool invocation API."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import (
    PluginOut,
    PluginToolInvoke,
    PluginToolResult,
    PluginUpdate,
)
from app.deps import require_auth
from app.plugins.errors import (
    PluginConfirmationRequired,
    PluginDisabled,
    PluginExecutionError,
    PluginNotFound,
    PluginNotLoaded,
    PluginPermissionError,
    PluginTimeout,
    PluginValidationError,
)
from app.plugins.registry import PluginRegistry

router = APIRouter(
    prefix="/api/plugins",
    tags=["plugins"],
    dependencies=[Depends(require_auth)],
)


def _registry(request: Request) -> PluginRegistry:
    return request.app.state.plugins


@router.get("", response_model=List[PluginOut])
def list_plugins(request: Request) -> List[dict]:
    return _registry(request).list_plugins()


@router.patch("/{plugin_id}", response_model=PluginOut)
async def update_plugin(
    plugin_id: str,
    payload: PluginUpdate,
    request: Request,
) -> dict:
    try:
        return await _registry(request).set_enabled(plugin_id, payload.enabled)
    except PluginNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except PluginNotLoaded as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except PluginExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc
    except PluginTimeout as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
        ) from exc


@router.post("/{plugin_id}/tools/{tool_name}", response_model=PluginToolResult)
async def invoke_tool(
    plugin_id: str,
    tool_name: str,
    payload: PluginToolInvoke,
    request: Request,
) -> dict:
    actor = getattr(request.state, "actor", "household")
    try:
        result = await _registry(request).invoke_tool(
            plugin_id,
            tool_name,
            payload.arguments,
            actor=actor,
        )
    except PluginNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except PluginNotLoaded as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except (PluginDisabled, PluginPermissionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except PluginConfirmationRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except PluginValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except PluginTimeout as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
        ) from exc
    except PluginExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc
    return {"plugin_id": plugin_id, "tool": tool_name, "result": result}
