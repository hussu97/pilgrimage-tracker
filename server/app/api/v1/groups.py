from fastapi import APIRouter, HTTPException, Query

from app.api.deps import UserDep
from app.db import check_ins as check_ins_db
from app.db import groups as groups_db
from app.db import notifications as notifications_db
from app.db import places as places_db
from app.db import store as user_store
from app.db.session import SessionDep
from app.models.schemas import GroupCreateBody, GroupUpdateBody

router = APIRouter()


@router.get("")
def list_groups(user: UserDep, session: SessionDep):
    group_list = groups_db.get_groups_for_user(user.user_code, session)
    if not group_list:
        return []

    group_codes = [g.group_code for g in group_list]

    # Batch-fetch all members for all groups (1 query)
    all_members = groups_db.get_members_bulk(group_codes, session)

    # Collect all unique user codes across all groups
    all_user_codes = {uc for members in all_members.values() for uc, _, _ in members}

    # Batch-fetch all check-ins for all member users (1 query)
    all_check_ins = check_ins_db.get_check_ins_for_users(list(all_user_codes), session)

    # Build per-user check-in lookup
    check_ins_by_user: dict[str, list] = {}
    for chk in all_check_ins:
        check_ins_by_user.setdefault(chk.user_code, []).append(chk)

    # Collect all path place codes across all groups for progress computation
    all_path_codes = {pc for g in group_list for pc in (g.path_place_codes or [])}

    # Batch-fetch path place names (1 query)
    path_places: dict[str, object] = {}
    if all_path_codes:
        path_place_list = places_db.get_places_by_codes(list(all_path_codes), session)
        path_places = {p.place_code: p for p in path_place_list}

    out = []
    for i, g in enumerate(group_list):
        members = all_members.get(g.group_code, [])
        member_user_codes = {uc for uc, _, _ in members}

        # Compute last_activity: latest check-in timestamp among all group members
        last_activity = None
        for uc in member_user_codes:
            for chk in check_ins_by_user.get(uc, []):
                chk_time = chk.checked_in_at.isoformat() + "Z"
                if last_activity is None or chk_time > last_activity:
                    last_activity = chk_time

        # Compute progress using pre-fetched check-ins
        visited_by_group = {
            chk.place_code
            for uc in member_user_codes
            for chk in check_ins_by_user.get(uc, [])
        }
        path = g.path_place_codes or []
        if path:
            sites_visited = sum(1 for pc in path if pc in visited_by_group)
            total_sites = len(path)
            next_place_code = None
            next_place_name = None
            for pc in path:
                if pc not in visited_by_group:
                    next_place_code = pc
                    place = path_places.get(pc)
                    next_place_name = place.name if place else pc
                    break
        else:
            sites_visited = len(visited_by_group)
            total_sites = 0
            next_place_code = None
            next_place_name = None

        out.append(
            {
                "group_code": g.group_code,
                "name": g.name,
                "description": g.description,
                "created_by_user_code": g.created_by_user_code,
                "invite_code": g.invite_code,
                "is_private": g.is_private,
                "created_at": g.created_at,
                "member_count": len(members),
                "last_activity": last_activity,
                "sites_visited": sites_visited,
                "total_sites": total_sites,
                "next_place_code": next_place_code,
                "next_place_name": next_place_name,
                "featured": i == 0,
            }
        )
    return out


@router.get("/by-invite/{invite_code}")
def get_group_by_invite(invite_code: str, user: UserDep, session: SessionDep):
    """Resolve group_code from invite code (for join flow)."""
    g = groups_db.get_group_by_invite_code(invite_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")
    return {"group_code": g.group_code, "name": g.name}


@router.post("/join-by-code")
def join_by_invite_code(body: dict, user: UserDep, session: SessionDep):
    """Join a group using invite code (from /join?code=xxx)."""
    invite_code = body.get("invite_code") or body.get("code")
    if not invite_code:
        raise HTTPException(status_code=400, detail="invite_code required")
    g = groups_db.get_group_by_invite_code(invite_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")
    if groups_db.is_member(g.group_code, user.user_code, session):
        return {"ok": True, "group_code": g.group_code}
    groups_db.add_member(g.group_code, user.user_code, session, "member")
    notifications_db.create_notification(
        user.user_code, "group_joined", {"group_code": g.group_code, "group_name": g.name}, session
    )
    return {"ok": True, "group_code": g.group_code}


@router.post("")
def create_group(body: GroupCreateBody, user: UserDep, session: SessionDep):
    g = groups_db.create_group(
        name=body.name,
        description=body.description or "",
        created_by_user_code=user.user_code,
        is_private=body.is_private or False,
        path_place_codes=body.path_place_codes,
        session=session,
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
def get_group(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    members = groups_db.get_members(group_code, session)
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
def update_group(group_code: str, body: GroupUpdateBody, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    members = groups_db.get_members(group_code, session)
    is_admin = any(m[0] == user.user_code and m[1] == "admin" for m in members)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Not an admin")
    if body.name is not None:
        g.name = body.name
    if body.description is not None:
        g.description = body.description
    if body.is_private is not None:
        g.is_private = body.is_private
    session.add(g)
    session.commit()
    return {
        "group_code": g.group_code,
        "name": g.name,
        "description": g.description,
        "is_private": g.is_private,
    }


@router.post("/{group_code}/join")
def join_group(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if groups_db.is_member(group_code, user.user_code, session):
        return {"ok": True, "message": "Already a member"}
    groups_db.add_member(group_code, user.user_code, session, "member")
    notifications_db.create_notification(
        user.user_code, "group_joined", {"group_code": g.group_code, "group_name": g.name}, session
    )
    return {"ok": True}


@router.get("/{group_code}/members")
def get_group_members(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    members = groups_db.get_members(group_code, session)
    out = []
    for uc, role, joined_at in members:
        u = user_store.get_user_by_code(uc, session)
        out.append(
            {
                "user_code": uc,
                "display_name": u.display_name if u else "Unknown",
                "role": role,
                "joined_at": joined_at,
            }
        )
    return out


@router.get("/{group_code}/leaderboard")
def get_leaderboard(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    entries = groups_db.get_leaderboard(group_code, check_ins_db, session)
    out = []
    for e in entries:
        u = user_store.get_user_by_code(e["user_code"], session)
        out.append(
            {
                "user_code": e["user_code"],
                "display_name": u.display_name if u else "Unknown",
                "places_visited": e["places_visited"],
                "rank": e["rank"],
            }
        )
    return out


@router.get("/{group_code}/activity")
def get_activity(
    group_code: str,
    user: UserDep,
    session: SessionDep,
    limit: int = Query(20),
):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    return groups_db.get_activity(
        group_code, check_ins_db, user_store, places_db, session, limit=limit
    )


@router.post("/{group_code}/invite")
def create_invite(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    return {"invite_code": g.invite_code, "invite_url": f"/join?code={g.invite_code}"}
