"""
In-memory i18n store (languages and translations). Populated from seed.
"""

languages: list[dict[str, str]] = []  # [{"code": "en", "name": "English"}, ...]
translations: dict[str, dict[str, str]] = {}  # lang_code -> { key -> value }


def get_languages() -> list[dict[str, str]]:
    return list(languages)


def get_translations(lang: str) -> dict[str, str]:
    lang = (lang or "en").lower()
    if lang not in translations:
        lang = "en"
    en_map = translations.get("en", {})
    lang_map = translations.get(lang, {})
    result = dict(en_map)
    for k, v in lang_map.items():
        result[k] = v
    return result


def set_languages(data: list[dict[str, str]]) -> None:
    languages.clear()
    languages.extend(data)


def set_translations(data: dict[str, dict[str, str]]) -> None:
    translations.clear()
    for lang_code, key_values in data.items():
        translations[lang_code] = dict(key_values)
