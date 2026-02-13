"""
In-memory groups store for local dev.

Optional group path: path_place_codes is an ordered list of place_codes defining
the group's "sites" (e.g. pilgrimage path). Progress = how many of those sites
at least one member has visited; next = first site in path not yet visited.
"""
import secrets
from datetime import datetime
from typing import List, Optional

groups_by_code: dict = {}
members_by_group: dict = {}  # group_code -> list of (user_code, role, joined_at)
invites_by_code: dict = {}  # invite_code -> (group_code, expires_at, used_at)
invite_code_to_group: dict = {}  # invite_code -> group_code (for join by code)


class GroupRow:
    def __init__(
        self,
        group_code: str,
        name: str,
        description: str,
        created_by_user_code: str,
        invite_code: str,
        is_private: bool,
        created_at: str,
        path_place_codes: Optional[List[str]] = None,
    ):
        self.group_code = group_code
        self.name = name
        self.description = description
        self.created_by_user_code = created_by_user_code
        self.invite_code = invite_code
        self.is_private = is_private
        self.created_at = created_at
        self.path_place_codes = path_place_codes or []


def _generate_group_code() -> str:
    return "grp_" + secrets.token_hex(8)


def _generate_invite_code() -> str:
    return secrets.token_hex(8)


def create_group(
    name: str,
    description: str,
    created_by_user_code: str,
    is_private: bool = False,
    path_place_codes: Optional[List[str]] = None,
) -> GroupRow:
    group_code = _generate_group_code()
    invite_code = _generate_invite_code()
    now = datetime.utcnow().isoformat() + "Z"
    row = GroupRow(
        group_code=group_code,
        name=name,
        description=description,
        created_by_user_code=created_by_user_code,
        invite_code=invite_code,
        is_private=is_private,
        created_at=now,
        path_place_codes=path_place_codes or [],
    )
    groups_by_code[group_code] = row
    members_by_group[group_code] = [(created_by_user_code, "admin", now)]
    invite_code_to_group[invite_code] = group_code
    return row


def get_group_by_code(group_code: str) -> Optional[GroupRow]:
    return groups_by_code.get(group_code)


def get_group_by_invite_code(invite_code: str) -> Optional[GroupRow]:
    group_code = invite_code_to_group.get(invite_code)
    return groups_by_code.get(group_code) if group_code else None


def get_groups_for_user(user_code: str) -> List[GroupRow]:
    result = []
    for group_code, members in members_by_group.items():
        if any(m[0] == user_code for m in members):
            g = groups_by_code.get(group_code)
            if g:
                result.append(g)
    result.sort(key=lambda g: g.created_at, reverse=True)
    return result


def is_member(group_code: str, user_code: str) -> bool:
    members = members_by_group.get(group_code, [])
    return any(m[0] == user_code for m in members)


def add_member(group_code: str, user_code: str, role: str = "member") -> bool:
    if group_code not in groups_by_code:
        return False
    members = members_by_group[group_code]
    if any(m[0] == user_code for m in members):
        return True  # already member
    now = datetime.utcnow().isoformat() + "Z"
    members.append((user_code, role, now))
    return True


def get_members(group_code: str) -> List[tuple]:
    return list(members_by_group.get(group_code, []))


def get_leaderboard(group_code: str, check_ins_db) -> List[dict]:
    """Return list of { user_code, place_count, rank } for members, sorted by place_count desc."""
    members = members_by_group.get(group_code, [])
    if not members:
        return []
    # Count distinct places visited per user (from check_ins)
    counts = {}
    for user_code, _role, _joined in members:
        counts[user_code] = check_ins_db.count_places_visited(user_code)
    sorted_users = sorted(counts.items(), key=lambda x: -x[1])
    return [
        {"user_code": u, "places_visited": c, "rank": i + 1}
        for i, (u, c) in enumerate(sorted_users)
    ]


def get_last_activity(group_code: str, check_ins_db) -> Optional[str]:
    """Most recent checked_in_at among any group member, or None."""
    members = members_by_group.get(group_code, [])
    user_codes = {m[0] for m in members}
    latest = None
    for uc in user_codes:
        for chk in check_ins_db.get_check_ins_by_user(uc):
            if latest is None or (chk.checked_in_at and chk.checked_in_at > latest):
                latest = chk.checked_in_at
    return latest


def get_group_progress(
    group_code: str,
    check_ins_db,
    places_db,
) -> dict:
    """
    Return { sites_visited, total_sites, next_place_code, next_place_name }.
    If group has path_place_codes: progress is over that path; next = first in path
    not visited by any member. If no path: sites_visited = distinct places any
    member visited, total_sites = 0, next = None.
    """
    members = members_by_group.get(group_code, [])
    user_codes = {m[0] for m in members}
    visited_place_codes = set()
    for uc in user_codes:
        for chk in check_ins_db.get_check_ins_by_user(uc):
            visited_place_codes.add(chk.place_code)
    path = getattr(
        groups_by_code.get(group_code),
        "path_place_codes",
        None,
    ) or []
    if path:
        sites_visited = sum(1 for pc in path if pc in visited_place_codes)
        total_sites = len(path)
        next_place_code = None
        next_place_name = None
        for pc in path:
            if pc not in visited_place_codes:
                next_place_code = pc
                place = places_db.get_place_by_code(pc)
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


def get_activity(group_code: str, check_ins_db, user_store, places_db, limit: int = 20) -> List[dict]:
    """Recent check-ins by any group member, for activity feed."""
    members = members_by_group.get(group_code, [])
    user_codes = {m[0] for m in members}
    all_check_ins = []
    for uc in user_codes:
        for chk in check_ins_db.get_check_ins_by_user(uc):
            all_check_ins.append((chk, uc))
    all_check_ins.sort(key=lambda x: x[0].checked_in_at, reverse=True)
    out = []
    for chk, uc in all_check_ins[:limit]:
        user = user_store.get_user_by_code(uc)
        place = places_db.get_place_by_code(chk.place_code)
        out.append({
            "type": "check_in",
            "user_code": uc,
            "display_name": user.display_name if user else "Unknown",
            "place_code": chk.place_code,
            "place_name": place.name if place else chk.place_code,
            "checked_in_at": chk.checked_in_at,
        })
    return out
