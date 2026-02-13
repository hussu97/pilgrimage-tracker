from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.db import store as user_store
from app.db import groups as groups_db
from app.db import check_ins as check_ins_db
from app.db import places as places_db
from app.db import notifications as notifications_db
from app.models.schemas import GroupCreateBody, GroupUpdateBody

router = APIRouter()


@router.get("")
def list_groups(user: Annotated[any, Depends(get_current_user)]):
    group_list = groups_db.get_groups_for_user(user.user_code)
    out = []
    for i, g in enumerate(group_list):
        members = groups_db.get_members(g.group_code)
        last_activity = groups_db.get_last_activity(g.group_code, check_ins_db)
        progress = groups_db.get_group_progress(g.group_code, check_ins_db, places_db)
        out.append({
            "group_code": g.group_code,
            "name": g.name,
            "description": g.description,
            "created_by_user_code": g.created_by_user_code,
            "invite_code": g.invite_code,
            "is_private": g.is_private,
            "created_at": g.created_at,
            "member_count": len(members),
            "last_activity": last_activity,
            "sites_visited": progress["sites_visited"],
            "total_sites": progress["total_sites"],
            "next_place_code": progress["next_place_code"],
            "next_place_name": progress["next_place_name"],
            "featured": i == 0,
        })
    return out


@router.get("/by-invite/{invite_code}")
def get_group_by_invite(invite_code: str, user: Annotated[any, Depends(get_current_user)]):
    """Resolve group_code from invite code (for join flow)."""
    g = groups_db.get_group_by_invite_code(invite_code)
    if not g:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")
    return {"group_code": g.group_code, "name": g.name}


@router.post("/join-by-code")
def join_by_invite_code(body: dict, user: Annotated[any, Depends(get_current_user)]):
    """Join a group using invite code (from /join?code=xxx)."""
    invite_code = body.get("invite_code") or body.get("code")
    if not invite_code:
        raise HTTPException(status_code=400, detail="invite_code required")
    g = groups_db.get_group_by_invite_code(invite_code)
    if not g:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")
    if groups_db.is_member(g.group_code, user.user_code):
        return {"ok": True, "group_code": g.group_code}
    groups_db.add_member(g.group_code, user.user_code, "member")
    notifications_db.create_notification(user.user_code, "group_joined", {"group_code": g.group_code, "group_name": g.name})
    return {"ok": True, "group_code": g.group_code}


@router.post("")
def create_group(body: GroupCreateBody, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.create_group(
        name=body.name,
        description=body.description or "",
        created_by_user_code=user.user_code,
        is_private=body.is_private or False,
        path_place_codes=body.path_place_codes,
    )
    return {
        "group_code": g.group_code,
        "name": g.name,
        "description": g.description,
        "invite_code": g.invite_code,
        "is_private": g.is_private,
        "created_at": g.created_at,
    }


@router.get("/{group_code}")
def get_group(group_code: str, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code):
        raise HTTPException(status_code=403, detail="Not a member")
    members = groups_db.get_members(group_code)
    return {
        "group_code": g.group_code,
        "name": g.name,
        "description": g.description,
        "created_by_user_code": g.created_by_user_code,
        "invite_code": g.invite_code,
        "is_private": g.is_private,
        "created_at": g.created_at,
        "member_count": len(members),
    }


@router.patch("/{group_code}")
def update_group(group_code: str, body: GroupUpdateBody, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    members = groups_db.get_members(group_code)
    is_admin = any(m[0] == user.user_code and m[1] == "admin" for m in members)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Not an admin")
    if body.name is not None:
        g.name = body.name
    if body.description is not None:
        g.description = body.description
    if body.is_private is not None:
        g.is_private = body.is_private
    return {"group_code": g.group_code, "name": g.name, "description": g.description, "is_private": g.is_private}


@router.post("/{group_code}/join")
def join_group(group_code: str, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if groups_db.is_member(group_code, user.user_code):
        return {"ok": True, "message": "Already a member"}
    groups_db.add_member(group_code, user.user_code, "member")
    notifications_db.create_notification(user.user_code, "group_joined", {"group_code": g.group_code, "group_name": g.name})
    return {"ok": True}


@router.get("/{group_code}/members")
def get_group_members(group_code: str, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code):
        raise HTTPException(status_code=403, detail="Not a member")
    members = groups_db.get_members(group_code)
    out = []
    for uc, role, joined_at in members:
        u = user_store.get_user_by_code(uc)
        out.append({
            "user_code": uc,
            "display_name": u.display_name if u else "Unknown",
            "role": role,
            "joined_at": joined_at,
        })
    return out


@router.get("/{group_code}/leaderboard")
def get_leaderboard(group_code: str, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code):
        raise HTTPException(status_code=403, detail="Not a member")
    entries = groups_db.get_leaderboard(group_code, check_ins_db)
    out = []
    for e in entries:
        u = user_store.get_user_by_code(e["user_code"])
        out.append({
            "user_code": e["user_code"],
            "display_name": u.display_name if u else "Unknown",
            "places_visited": e["places_visited"],
            "rank": e["rank"],
        })
    return out


@router.get("/{group_code}/activity")
def get_activity(
    group_code: str,
    user: Annotated[any, Depends(get_current_user)],
    limit: int = Query(20),
):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code):
        raise HTTPException(status_code=403, detail="Not a member")
    return groups_db.get_activity(group_code, check_ins_db, user_store, places_db, limit=limit)


@router.post("/{group_code}/invite")
def create_invite(group_code: str, user: Annotated[any, Depends(get_current_user)]):
    g = groups_db.get_group_by_code(group_code)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code):
        raise HTTPException(status_code=403, detail="Not a member")
    return {"invite_code": g.invite_code, "invite_url": f"/join?code={g.invite_code}"}
