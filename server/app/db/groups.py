import secrets
from typing import List, Optional

from sqlmodel import Session, select, and_
from app.db.models import Group, GroupMember


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
    path_place_codes: Optional[List[str]] = None,
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
    )
    session.add(group)

    # Add creator as admin member
    member = GroupMember(
        group_code=group_code,
        user_code=created_by_user_code,
        role="admin"
    )
    session.add(member)

    session.commit()
    session.refresh(group)
    return group


def get_group_by_code(group_code: str, session: Session) -> Optional[Group]:
    return session.exec(select(Group).where(Group.group_code == group_code)).first()


def get_group_by_invite_code(invite_code: str, session: Session) -> Optional[Group]:
    return session.exec(select(Group).where(Group.invite_code == invite_code)).first()


def get_groups_for_user(user_code: str, session: Session) -> List[Group]:
    # Join Group and GroupMember
    statement = select(Group).join(GroupMember).where(GroupMember.user_code == user_code).order_by(Group.created_at.desc())
    return session.exec(statement).all()


def is_member(group_code: str, user_code: str, session: Session) -> bool:
    statement = select(GroupMember).where(and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code))
    return session.exec(statement).first() is not None


def add_member(group_code: str, user_code: str, session: Session, role: str = "member") -> bool:
    # Check if group exists
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        return False

    # Check if already member
    statement = select(GroupMember).where(and_(GroupMember.group_code == group_code, GroupMember.user_code == user_code))
    if session.exec(statement).first():
        return True

    member = GroupMember(
        group_code=group_code,
        user_code=user_code,
        role=role
    )
    session.add(member)
    session.commit()
    return True


def get_members(group_code: str, session: Session) -> List[tuple]:
    members = session.exec(select(GroupMember).where(GroupMember.group_code == group_code)).all()
    return [(m.user_code, m.role, m.joined_at.isoformat() + "Z") for m in members]


def get_leaderboard(group_code: str, check_ins_db, session: Session) -> List[dict]:
    members = get_members(group_code, session)
    if not members:
        return []
    counts = {}
    for user_code, _role, _joined in members:
        counts[user_code] = check_ins_db.count_places_visited(user_code, session)
    sorted_users = sorted(counts.items(), key=lambda x: -x[1])
    return [
        {"user_code": u, "places_visited": c, "rank": i + 1}
        for i, (u, c) in enumerate(sorted_users)
    ]


def get_last_activity(group_code: str, check_ins_db, session: Session) -> Optional[str]:
    members = get_members(group_code, session)
    user_codes = {m[0] for m in members}
    latest = None
    for uc in user_codes:
        for chk in check_ins_db.get_check_ins_by_user(uc, session):
            chk_time = chk.checked_in_at.isoformat() + "Z"
            if latest is None or chk_time > latest:
                latest = chk_time
    return latest


def get_group_progress(
    group_code: str,
    check_ins_db,
    places_db,
    session: Session,
) -> dict:
    members = get_members(group_code, session)
    user_codes = {m[0] for m in members}
    visited_place_codes = set()
    for uc in user_codes:
        for chk in check_ins_db.get_check_ins_by_user(uc, session):
            visited_place_codes.add(chk.place_code)

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


def get_activity(group_code: str, check_ins_db, user_store, places_db, session: Session, limit: int = 20) -> List[dict]:
    members = get_members(group_code, session)
    user_codes = {m[0] for m in members}

    # Collect all check-ins from all members
    all_check_ins = []
    for uc in user_codes:
        for chk in check_ins_db.get_check_ins_by_user(uc, session):
            all_check_ins.append((chk, uc))

    # Sort by time and take top N
    all_check_ins.sort(key=lambda x: x[0].checked_in_at, reverse=True)
    top_check_ins = all_check_ins[:limit]

    # Bulk fetch users and places for the top N check-ins
    relevant_user_codes = {uc for _, uc in top_check_ins}
    relevant_place_codes = {chk.place_code for chk, _ in top_check_ins}

    users_map = {uc: user_store.get_user_by_code(uc, session) for uc in relevant_user_codes}
    places_map = {pc: places_db.get_place_by_code(pc, session) for pc in relevant_place_codes}

    # Build output using cached data
    out = []
    for chk, uc in top_check_ins:
        user = users_map.get(uc)
        place = places_map.get(chk.place_code)
        out.append({
            "type": "check_in",
            "user_code": uc,
            "display_name": user.display_name if user else "Unknown",
            "place_code": chk.place_code,
            "place_name": place.name if place else chk.place_code,
            "checked_in_at": chk.checked_in_at.isoformat() + "Z",
        })
    return out
