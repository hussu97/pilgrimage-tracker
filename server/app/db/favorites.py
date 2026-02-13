"""In-memory favorites: (user_code, place_code) -> True."""
favorites: set = set()  # (user_code, place_code)


def add_favorite(user_code: str, place_code: str) -> None:
    favorites.add((user_code, place_code))


def remove_favorite(user_code: str, place_code: str) -> None:
    favorites.discard((user_code, place_code))


def is_favorite(user_code: str, place_code: str) -> bool:
    return (user_code, place_code) in favorites


def get_favorite_place_codes(user_code: str) -> list:
    return [pc for uc, pc in favorites if uc == user_code]
