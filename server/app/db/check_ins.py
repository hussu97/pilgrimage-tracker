"""In-memory check-ins store."""
from datetime import datetime
from typing import List, Optional

check_ins_by_code: dict = {}
check_ins_by_user: dict = {}  # user_code -> list of check_in_code


class CheckInRow:
    def __init__(self, check_in_code: str, user_code: str, place_code: str, checked_in_at: str, note: Optional[str], photo_url: Optional[str]):
        self.check_in_code = check_in_code
        self.user_code = user_code
        self.place_code = place_code
        self.checked_in_at = checked_in_at
        self.note = note
        self.photo_url = photo_url


def _generate_code() -> str:
    import secrets
    return "chk_" + secrets.token_hex(8)


def create_check_in(user_code: str, place_code: str, note: Optional[str] = None, photo_url: Optional[str] = None) -> CheckInRow:
    code = _generate_code()
    now = datetime.utcnow().isoformat() + "Z"
    row = CheckInRow(check_in_code=code, user_code=user_code, place_code=place_code, checked_in_at=now, note=note, photo_url=photo_url)
    check_ins_by_code[code] = row
    if user_code not in check_ins_by_user:
        check_ins_by_user[user_code] = []
    check_ins_by_user[user_code].append(code)
    return row


def get_check_ins_by_user(user_code: str) -> List[CheckInRow]:
    codes = check_ins_by_user.get(user_code, [])
    return [check_ins_by_code[c] for c in reversed(codes) if c in check_ins_by_code]


def has_checked_in(user_code: str, place_code: str) -> bool:
    for code in check_ins_by_user.get(user_code, []):
        row = check_ins_by_code.get(code)
        if row and row.place_code == place_code:
            return True
    return False


def count_places_visited(user_code: str) -> int:
    seen = set()
    for code in check_ins_by_user.get(user_code, []):
        row = check_ins_by_code.get(code)
        if row:
            seen.add(row.place_code)
    return len(seen)


def count_check_ins_this_year(user_code: str) -> int:
    year = str(datetime.utcnow().year)
    n = 0
    for code in check_ins_by_user.get(user_code, []):
        row = check_ins_by_code.get(code)
        if row and row.checked_in_at.startswith(year):
            n += 1
    return n


def count_check_ins_for_place(place_code: str) -> int:
    """Total check-ins across ALL users for this place."""
    total = 0
    for codes in check_ins_by_user.values():
        for code in codes:
            row = check_ins_by_code.get(code)
            if row and row.place_code == place_code:
                total += 1
    return total


def get_check_ins_this_month(user_code: str) -> List[CheckInRow]:
    """Return check-ins for the current calendar month."""
    now = datetime.utcnow()
    out = []
    for code in check_ins_by_user.get(user_code, []):
        row = check_ins_by_code.get(code)
        if row and row.checked_in_at:
            try:
                dt = datetime.fromisoformat(row.checked_in_at.replace("Z", ""))
                if dt.month == now.month and dt.year == now.year:
                    out.append(row)
            except Exception:
                pass
    return out


def get_check_ins_on_this_day(user_code: str) -> List[CheckInRow]:
    """Return check-ins from past years on today's month+day (anniversary visits)."""
    now = datetime.utcnow()
    out = []
    for code in check_ins_by_user.get(user_code, []):
        row = check_ins_by_code.get(code)
        if row and row.checked_in_at:
            try:
                dt = datetime.fromisoformat(row.checked_in_at.replace("Z", ""))
                if dt.month == now.month and dt.day == now.day and dt.year != now.year:
                    out.append(row)
            except Exception:
                pass
    return out
