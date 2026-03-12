import secrets

from sqlmodel import Session, and_, select

from app.db.enums import GroupRole, NotificationType
from app.db.models import Group, GroupMember, GroupPlaceNote


def _generate_group_code() -> str:
    return "grp_" + secrets.token_hex(8)


def _generate_invite_code() -> str:
    return secrets.token_hex(8)


def create_group(
    name: str,
    description: str,
    created_by_user_code: str,
    session: Session,
    is_private: bool = False,
    path_place_codes: list[str] | None = None,
    cover_image_url: str | None = None,
    start_date=None,
    end_date=None,
) -> Group:
    group_code = _generate_group_code()
    invite_code = _generate_invite_code()
    group = Group(
        group_code=group_code,
        name=name,
        description=description,
        created_by_user_code=created_by_user_code,
        invite_code=invite_code,
        is_private=is_private,
        path_place_codes=path_place_codes or [],
        cover_image_url=cover_image_url,
        start_date=start_date,
        end_date=end_date,
    )
    session.add(group)

    # Add creator as admin member
    member = GroupMember(
        group_code=group_code, user_code=created_by_user_code, role=GroupRole.ADMIN
    )
    session.add(member)

    session.commit()
    session.refresh(group)
    return group


def get_group_by_code(group_code: str, session: Session) -> Group | None:
    return session.exec(select(Group).where(Group.group_code == group_code)).first()


def get_group_by_invite_code(invite_code: str, session: Session) -> Group | None:
    return session.exec(select(Group).where(Group.invite_code == invite_code)).first()


def get_groups_for_user(user_code: str, session: Session) -> list[Group]:
    # Join Group and GroupMember
    statement = (
        select(Group)
        .join(GroupMember)
        .where(GroupMember.user_code == user_code)
        .order_by(Group.created_at.desc())
    )
    return session.exec(statement).all()


def is_member(group_code: str, user_code: str, session: Session) -> bool:
    statement = select(GroupMember).where(
        and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code)
    )
    return session.exec(statement).first() is not None


def add_member(
    group_code: str, user_code: str, session: Session, role: str = GroupRole.MEMBER
) -> bool:
    # Check if group exists
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        return False

    # Check if already member
    statement = select(GroupMember).where(
        and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code)
    )
    if session.exec(statement).first():
        return True

    member = GroupMember(group_code=group_code, user_code=user_code, role=role)
    session.add(member)
    session.commit()
    return True


def get_members_bulk(group_codes: list[str], session: Session) -> dict[str, list[tuple]]:
    """Batch-fetch members for multiple groups in a single query.

    Returns a dict mapping group_code -> [(user_code, role, joined_at_iso), ...].
    """
    if not group_codes:
        return {}
    members = session.exec(select(GroupMember).where(GroupMember.group_code.in_(group_codes))).all()
    result: dict[str, list[tuple]] = {gc: [] for gc in group_codes}
    for m in members:
        result[m.group_code].append(
            (m.user_code, m.role, m.joined_at.isoformat().replace("+00:00", "Z"))
        )
    return result


def get_members(group_code: str, session: Session) -> list[tuple]:
    members = session.exec(select(GroupMember).where(GroupMember.group_code == group_code)).all()
    return [(m.user_code, m.role, m.joined_at.isoformat().replace("+00:00", "Z")) for m in members]


def get_leaderboard(group_code: str, check_ins_db, session: Session) -> list[dict]:
    members = get_members(group_code, session)
    if not members:
        return []
    member_codes = [uc for uc, _role, _joined in members]
    counts = check_ins_db.count_places_visited_bulk(member_codes, session)
    sorted_users = sorted(member_codes, key=lambda uc: -counts.get(uc, 0))
    return [
        {"user_code": u, "places_visited": counts.get(u, 0), "rank": i + 1}
        for i, u in enumerate(sorted_users)
    ]


def get_last_activity(group_code: str, check_ins_db, session: Session) -> str | None:
    members = get_members(group_code, session)
    user_codes = [m[0] for m in members]
    all_check_ins = check_ins_db.get_check_ins_for_users(user_codes, session)
    if not all_check_ins:
        return None
    latest = max(all_check_ins, key=lambda chk: chk.checked_in_at)
    return latest.checked_in_at.isoformat().replace("+00:00", "Z")


def get_group_progress(
    group_code: str,
    check_ins_db,
    places_db,
    session: Session,
) -> dict:
    members = get_members(group_code, session)
    user_codes = [m[0] for m in members]
    all_check_ins = check_ins_db.get_check_ins_for_users(user_codes, session)
    visited_place_codes = {chk.place_code for chk in all_check_ins}

    group = get_group_by_code(group_code, session)
    path = group.path_place_codes if group else []

    if path:
        sites_visited = sum(1 for pc in path if pc in visited_place_codes)
        total_sites = len(path)
        next_place_code = None
        next_place_name = None
        for pc in path:
            if pc not in visited_place_codes:
                next_place_code = pc
                place = places_db.get_place_by_code(pc, session)
                next_place_name = place.name if place else pc
                break
        return {
            "sites_visited": sites_visited,
            "total_sites": total_sites,
            "next_place_code": next_place_code,
            "next_place_name": next_place_name,
        }
    return {
        "sites_visited": len(visited_place_codes),
        "total_sites": 0,
        "next_place_code": None,
        "next_place_name": None,
    }


def remove_member(group_code: str, user_code: str, session: Session) -> bool:
    statement = select(GroupMember).where(
        and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code)
    )
    member = session.exec(statement).first()
    if not member:
        return False
    session.delete(member)
    session.commit()
    return True


def update_member_role(group_code: str, user_code: str, role: str, session: Session) -> bool:
    statement = select(GroupMember).where(
        and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code)
    )
    member = session.exec(statement).first()
    if not member:
        return False
    member.role = role
    session.add(member)
    session.commit()
    return True


def get_member(group_code: str, user_code: str, session: Session) -> GroupMember | None:
    return session.exec(
        select(GroupMember).where(
            and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code)
        )
    ).first()


def add_place_to_itinerary(group_code: str, place_code: str, session: Session) -> bool:
    """Append place_code to path_place_codes if not present. Returns True if added."""
    from datetime import UTC, datetime

    group = get_group_by_code(group_code, session)
    if not group:
        return False
    path = list(group.path_place_codes or [])
    if place_code in path:
        return False
    path.append(place_code)
    group.path_place_codes = path
    group.updated_at = datetime.now(UTC)
    session.add(group)
    session.commit()
    return True


def delete_group(group_code: str, session: Session) -> bool:
    group = get_group_by_code(group_code, session)
    if not group:
        return False
    # Delete all group place notes
    notes = session.exec(
        select(GroupPlaceNote).where(GroupPlaceNote.group_code == group_code)
    ).all()
    for note in notes:
        session.delete(note)
    # Delete all members
    members = session.exec(select(GroupMember).where(GroupMember.group_code == group_code)).all()
    for m in members:
        session.delete(m)
    session.delete(group)
    session.commit()
    return True


def get_activity(
    group_code: str, check_ins_db, user_store, places_db, session: Session, limit: int = 20
) -> list[dict]:
    members = get_members(group_code, session)
    user_codes = [m[0] for m in members]

    # Single bulk query for all check-ins
    all_check_ins = check_ins_db.get_check_ins_for_users(user_codes, session)

    # Sort by time and take top N
    all_check_ins.sort(key=lambda chk: chk.checked_in_at, reverse=True)
    top_check_ins = all_check_ins[:limit]

    # Bulk fetch users and places for the top N check-ins
    relevant_user_codes = list({chk.user_code for chk in top_check_ins})
    relevant_place_codes = list({chk.place_code for chk in top_check_ins})

    users_map = user_store.get_users_bulk(relevant_user_codes, session)
    places_map = {
        p.place_code: p for p in places_db.get_places_by_codes(relevant_place_codes, session)
    }

    # Build output using cached data
    out = []
    for chk in top_check_ins:
        u = users_map.get(chk.user_code)
        place = places_map.get(chk.place_code)
        out.append(
            {
                "type": NotificationType.CHECK_IN,
                "user_code": chk.user_code,
                "display_name": u.display_name if u else "Unknown",
                "place_code": chk.place_code,
                "place_name": place.name if place else chk.place_code,
                "checked_in_at": chk.checked_in_at.isoformat().replace("+00:00", "Z"),
                "note": chk.note,
                "photo_url": chk.photo_url,
                "group_code": chk.group_code,
            }
        )
    return out
