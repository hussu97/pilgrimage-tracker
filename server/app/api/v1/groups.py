from datetime import date
from io import BytesIO

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from PIL import Image

from app.api.deps import UserDep
from app.db import check_ins as check_ins_db
from app.db import group_cover_images as cover_images_db
from app.db import group_place_notes as notes_db
from app.db import groups as groups_db
from app.db import notifications as notifications_db
from app.db import places as places_db
from app.db import store as user_store
from app.db.enums import GroupRole, NotificationType
from app.db.session import SessionDep
from app.models.schemas import (
    GroupCreateBody,
    GroupPlaceNoteBody,
    GroupUpdateBody,
    UpdateMemberRoleBody,
)

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
                chk_time = chk.checked_in_at.isoformat().replace("+00:00", "Z")
                if last_activity is None or chk_time > last_activity:
                    last_activity = chk_time

        # Compute progress using pre-fetched check-ins
        visited_by_group = {
            chk.place_code for uc in member_user_codes for chk in check_ins_by_user.get(uc, [])
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
                "path_place_codes": g.path_place_codes or [],
                "cover_image_url": g.cover_image_url,
                "start_date": g.start_date.isoformat() if g.start_date else None,
                "end_date": g.end_date.isoformat() if g.end_date else None,
                "created_at": g.created_at,
                "updated_at": g.updated_at,
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
    groups_db.add_member(g.group_code, user.user_code, session, GroupRole.MEMBER)
    notifications_db.create_notification(
        user.user_code,
        NotificationType.GROUP_JOINED,
        {"group_code": g.group_code, "group_name": g.name},
        session,
    )
    return {"ok": True, "group_code": g.group_code}


@router.post("")
def create_group(body: GroupCreateBody, user: UserDep, session: SessionDep):
    start_date = None
    end_date = None
    if body.start_date:
        try:
            start_date = date.fromisoformat(body.start_date)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid start_date format (use YYYY-MM-DD)"
            )
    if body.end_date:
        try:
            end_date = date.fromisoformat(body.end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format (use YYYY-MM-DD)")

    g = groups_db.create_group(
        name=body.name,
        description=body.description or "",
        created_by_user_code=user.user_code,
        is_private=body.is_private or False,
        path_place_codes=body.path_place_codes,
        cover_image_url=body.cover_image_url,
        start_date=start_date,
        end_date=end_date,
        session=session,
    )
    return {
        "group_code": g.group_code,
        "name": g.name,
        "description": g.description,
        "invite_code": g.invite_code,
        "is_private": g.is_private,
        "path_place_codes": g.path_place_codes or [],
        "cover_image_url": g.cover_image_url,
        "start_date": g.start_date.isoformat() if g.start_date else None,
        "end_date": g.end_date.isoformat() if g.end_date else None,
        "created_at": g.created_at,
        "updated_at": g.updated_at,
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
        "path_place_codes": g.path_place_codes or [],
        "cover_image_url": g.cover_image_url,
        "start_date": g.start_date.isoformat() if g.start_date else None,
        "end_date": g.end_date.isoformat() if g.end_date else None,
        "created_at": g.created_at,
        "updated_at": g.updated_at,
        "member_count": len(members),
    }


@router.patch("/{group_code}")
def update_group(group_code: str, body: GroupUpdateBody, user: UserDep, session: SessionDep):
    from datetime import UTC, datetime

    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    members = groups_db.get_members(group_code, session)
    is_admin = any(m[0] == user.user_code and m[1] == GroupRole.ADMIN for m in members)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Not an admin")
    if body.name is not None:
        g.name = body.name
    if body.description is not None:
        g.description = body.description
    if body.is_private is not None:
        g.is_private = body.is_private
    if body.path_place_codes is not None:
        g.path_place_codes = body.path_place_codes
    if body.cover_image_url is not None:
        g.cover_image_url = body.cover_image_url
    if body.start_date is not None:
        try:
            g.start_date = date.fromisoformat(body.start_date)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid start_date format (use YYYY-MM-DD)"
            )
    if body.end_date is not None:
        try:
            g.end_date = date.fromisoformat(body.end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format (use YYYY-MM-DD)")
    g.updated_at = datetime.now(UTC)
    session.add(g)
    session.commit()
    return {
        "group_code": g.group_code,
        "name": g.name,
        "description": g.description,
        "is_private": g.is_private,
        "path_place_codes": g.path_place_codes or [],
        "cover_image_url": g.cover_image_url,
        "start_date": g.start_date.isoformat() if g.start_date else None,
        "end_date": g.end_date.isoformat() if g.end_date else None,
        "updated_at": g.updated_at,
    }


@router.delete("/{group_code}")
def delete_group(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    member = groups_db.get_member(group_code, user.user_code, session)
    if not member or member.role != GroupRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not an admin")
    groups_db.delete_group(group_code, session)
    return {"ok": True}


@router.post("/{group_code}/join")
def join_group(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if groups_db.is_member(group_code, user.user_code, session):
        return {"ok": True, "message": "Already a member"}
    groups_db.add_member(group_code, user.user_code, session, GroupRole.MEMBER)
    notifications_db.create_notification(
        user.user_code,
        NotificationType.GROUP_JOINED,
        {"group_code": g.group_code, "group_name": g.name},
        session,
    )
    return {"ok": True}


@router.post("/{group_code}/leave")
def leave_group(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    if g.created_by_user_code == user.user_code:
        raise HTTPException(status_code=400, detail="Creator cannot leave the group")
    groups_db.remove_member(group_code, user.user_code, session)
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
                "is_creator": uc == g.created_by_user_code,
            }
        )
    return out


@router.delete("/{group_code}/members/{target_user_code}")
def remove_member(group_code: str, target_user_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    admin_member = groups_db.get_member(group_code, user.user_code, session)
    if not admin_member or admin_member.role != GroupRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not an admin")
    if target_user_code == g.created_by_user_code:
        raise HTTPException(status_code=400, detail="Cannot remove the group creator")
    if not groups_db.is_member(group_code, target_user_code, session):
        raise HTTPException(status_code=404, detail="User is not a member")
    groups_db.remove_member(group_code, target_user_code, session)
    return {"ok": True}


@router.patch("/{group_code}/members/{target_user_code}")
def update_member_role(
    group_code: str,
    target_user_code: str,
    body: UpdateMemberRoleBody,
    user: UserDep,
    session: SessionDep,
):
    if body.role not in (GroupRole.ADMIN, GroupRole.MEMBER):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'")
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    admin_member = groups_db.get_member(group_code, user.user_code, session)
    if not admin_member or admin_member.role != GroupRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not an admin")
    if not groups_db.is_member(group_code, target_user_code, session):
        raise HTTPException(status_code=404, detail="User is not a member")
    groups_db.update_member_role(group_code, target_user_code, body.role, session)
    return {"ok": True, "user_code": target_user_code, "role": body.role}


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


@router.get("/{group_code}/checklist")
def get_checklist(group_code: str, user: UserDep, session: SessionDep):
    """Return the shared itinerary checklist with per-place check-in status and notes."""
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")

    path = g.path_place_codes or []
    if not path:
        return {
            "places": [],
            "total_places": 0,
            "group_visited": 0,
            "personal_visited": 0,
            "group_progress": 0,
            "personal_progress": 0,
        }

    # Fetch place details
    place_list = places_db.get_places_by_codes(path, session)
    places_map = {p.place_code: p for p in place_list}

    # Get first image for each place
    from app.db import place_images as place_images_db

    images_bulk = place_images_db.get_images_bulk(path, session)
    images_map: dict[str, str | None] = {}
    for pc in path:
        img_list = images_bulk.get(pc, [])
        images_map[pc] = img_list[0]["url"] if img_list and img_list[0].get("url") else None

    # Get all group members
    members = groups_db.get_members(group_code, session)
    member_codes = [uc for uc, _, _ in members]

    # Batch fetch check-ins for all members at these places
    all_check_ins = check_ins_db.get_check_ins_for_users_at_places(member_codes, path, session)

    # Build per-place check-in lookup: place_code -> list of check-ins
    checkins_by_place: dict[str, list] = {pc: [] for pc in path}
    for chk in all_check_ins:
        if chk.place_code in checkins_by_place:
            checkins_by_place[chk.place_code].append(chk)

    # Batch fetch notes for all places
    notes_by_place = notes_db.get_notes_bulk(group_code, path, session)

    # Build user display name map
    user_display_names: dict[str, str] = {}
    for uc in member_codes:
        u = user_store.get_user_by_code(uc, session)
        user_display_names[uc] = u.display_name if u else "Unknown"

    # Build per-place note display name map
    note_user_codes = set()
    for note_list in notes_by_place.values():
        for note in note_list:
            note_user_codes.add(note.user_code)
    for uc in note_user_codes - set(member_codes):
        u = user_store.get_user_by_code(uc, session)
        user_display_names[uc] = u.display_name if u else "Unknown"

    group_visited = 0
    personal_visited = 0
    places_out = []

    for pc in path:
        place = places_map.get(pc)
        checkins = checkins_by_place.get(pc, [])

        # Deduplicate by user (each user counts once per place)
        seen_users: set[str] = set()
        checked_in_by = []
        for chk in checkins:
            if chk.user_code not in seen_users:
                seen_users.add(chk.user_code)
                checked_in_by.append(
                    {
                        "user_code": chk.user_code,
                        "display_name": user_display_names.get(chk.user_code, "Unknown"),
                        "checked_in_at": chk.checked_in_at.isoformat().replace("+00:00", "Z"),
                    }
                )

        user_checked_in = user.user_code in seen_users
        if seen_users:
            group_visited += 1
        if user_checked_in:
            personal_visited += 1

        note_list = notes_by_place.get(pc, [])
        notes_out = [
            {
                "note_code": n.note_code,
                "user_code": n.user_code,
                "display_name": user_display_names.get(n.user_code, "Unknown"),
                "text": n.text,
                "created_at": n.created_at.isoformat().replace("+00:00", "Z"),
            }
            for n in note_list
        ]

        places_out.append(
            {
                "place_code": pc,
                "name": place.name if place else pc,
                "religion": place.religion if place else None,
                "address": place.address if place else None,
                "image_url": images_map.get(pc),
                "checked_in_by": checked_in_by,
                "user_checked_in": user_checked_in,
                "check_in_count": len(seen_users),
                "notes": notes_out,
            }
        )

    total = len(path)
    return {
        "places": places_out,
        "total_places": total,
        "group_visited": group_visited,
        "personal_visited": personal_visited,
        "group_progress": round(group_visited / total * 100) if total else 0,
        "personal_progress": round(personal_visited / total * 100) if total else 0,
    }


@router.get("/{group_code}/places/{place_code}/notes")
def get_place_notes(group_code: str, place_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    note_list = notes_db.get_notes(group_code, place_code, session)
    return [
        {
            "note_code": n.note_code,
            "user_code": n.user_code,
            "group_code": n.group_code,
            "place_code": n.place_code,
            "text": n.text,
            "created_at": n.created_at.isoformat().replace("+00:00", "Z"),
        }
        for n in note_list
    ]


@router.post("/{group_code}/places/{place_code}/notes")
def add_place_note(
    group_code: str,
    place_code: str,
    body: GroupPlaceNoteBody,
    user: UserDep,
    session: SessionDep,
):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    if not places_db.get_place_by_code(place_code, session):
        raise HTTPException(status_code=404, detail="Place not found")
    note = notes_db.create_note(group_code, place_code, user.user_code, body.text, session)
    return {
        "note_code": note.note_code,
        "user_code": note.user_code,
        "group_code": note.group_code,
        "place_code": note.place_code,
        "text": note.text,
        "created_at": note.created_at.isoformat().replace("+00:00", "Z"),
    }


@router.delete("/{group_code}/notes/{note_code}")
def delete_place_note(group_code: str, note_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    note = notes_db.get_note_by_code(note_code, session)
    if not note or note.group_code != group_code:
        raise HTTPException(status_code=404, detail="Note not found")
    # Only author or admin can delete
    admin_member = groups_db.get_member(group_code, user.user_code, session)
    is_admin = admin_member and admin_member.role == GroupRole.ADMIN
    if note.user_code != user.user_code and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")
    notes_db.delete_note(note_code, session)
    return {"ok": True}


@router.post("/{group_code}/invite")
def create_invite(group_code: str, user: UserDep, session: SessionDep):
    g = groups_db.get_group_by_code(group_code, session)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if not groups_db.is_member(group_code, user.user_code, session):
        raise HTTPException(status_code=403, detail="Not a member")
    return {"invite_code": g.invite_code, "invite_url": f"/join?code={g.invite_code}"}


@router.post("/upload-cover")
async def upload_group_cover(
    user: UserDep,
    session: SessionDep,
    file: UploadFile = File(...),
):
    """Upload a cover image for a group. Returns image_code and URL."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Only JPEG, PNG, and WebP images are allowed. Got: {file.content_type}",
        )

    file_data = await file.read()
    file_size = len(file_data)

    MAX_SIZE = 5 * 1024 * 1024
    if file_size > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size {file_size} bytes exceeds maximum of {MAX_SIZE} bytes (5MB)",
        )

    try:
        img = Image.open(BytesIO(file_data))

        MAX_DIMENSION = 4000
        if img.width > MAX_DIMENSION or img.height > MAX_DIMENSION:
            raise HTTPException(
                status_code=400,
                detail=f"Image dimensions {img.width}x{img.height} exceed maximum of {MAX_DIMENSION}x{MAX_DIMENSION}",
            )

        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        MAX_WIDTH = 1200
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            new_height = int(img.height * ratio)
            img = img.resize((MAX_WIDTH, new_height), Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format="JPEG", quality=85, optimize=True)
        compressed_data = output.getvalue()
        final_width, final_height = img.width, img.height
        final_size = len(compressed_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

    try:
        cover_image = cover_images_db.create_image(
            uploaded_by_user_code=user.user_code,
            blob_data=compressed_data,
            mime_type="image/jpeg",
            file_size=final_size,
            width=final_width,
            height=final_height,
            session=session,
        )
        return {
            "image_code": cover_image.image_code,
            "url": f"/api/v1/groups/cover/{cover_image.image_code}",
            "width": final_width,
            "height": final_height,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store image: {str(e)}")


@router.get("/cover/{image_code}")
def get_cover_image(image_code: str, session: SessionDep):
    """Serve a group cover image by code."""
    image = cover_images_db.get_by_code(image_code, session)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=image.blob_data,
        media_type=image.mime_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
