"""Household member profiles and chore scoring."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.schemas import MemberCreate, MemberOut, MemberUpdate
from app.core.database import Database
from app.deps import get_db, require_auth

router = APIRouter(
    prefix="/api/members",
    tags=["members"],
    dependencies=[Depends(require_auth)],
)


def _member_or_404(database: Database, member_id: int) -> dict:
    member = database.get_member(member_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found.",
        )
    return member


def _check_name(database: Database, name: str, exclude_id: int = 0) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Member name is required.",
        )
    for member in database.list_members(active_only=False):
        if member["id"] != exclude_id and member["name"].casefold() == cleaned.casefold():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A member with that name already exists.",
            )
    return cleaned


@router.get("", response_model=List[MemberOut])
def list_members(
    active_only: bool = True,
    database: Database = Depends(get_db),
) -> List[dict]:
    return database.list_members(active_only=active_only)


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: MemberCreate,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    name = _check_name(database, payload.name)
    member = database.create_member(name, points=payload.points)
    database.audit(
        "member.create",
        f"id={member['id']}",
        actor=getattr(request.state, "actor", "household"),
    )
    return member


@router.patch("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: int,
    payload: MemberUpdate,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    _member_or_404(database, member_id)
    updates = payload.model_dump(exclude_unset=True)
    for field in ("name", "active", "points"):
        if field in updates and updates[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"{field} cannot be null.",
            )
    if "name" in updates:
        updates["name"] = _check_name(database, updates["name"], exclude_id=member_id)
    if "active" in updates:
        updates["active"] = 1 if updates["active"] else 0
    member = database.update_member(member_id, updates)
    database.audit(
        "member.update",
        f"id={member_id}",
        actor=getattr(request.state, "actor", "household"),
    )
    return member


@router.delete("/{member_id}", response_model=MemberOut)
def deactivate_member(
    member_id: int,
    request: Request,
    database: Database = Depends(get_db),
) -> dict:
    _member_or_404(database, member_id)
    member = database.update_member(member_id, {"active": 0})
    database.audit(
        "member.deactivate",
        f"id={member_id}",
        actor=getattr(request.state, "actor", "household"),
    )
    return member
