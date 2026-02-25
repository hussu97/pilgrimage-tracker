"""Centralized StrEnum types for all magic string constants used across the app."""

from enum import StrEnum


class ReviewSource(StrEnum):
    USER = "user"
    EXTERNAL = "external"


class ImageType(StrEnum):
    URL = "url"
    BLOB = "blob"


class GroupRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class Theme(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class Units(StrEnum):
    KM = "km"
    MILES = "miles"


class Language(StrEnum):
    EN = "en"
    AR = "ar"
    HI = "hi"
    TE = "te"
    ML = "ml"


class Religion(StrEnum):
    ISLAM = "islam"
    HINDUISM = "hinduism"
    CHRISTIANITY = "christianity"
    ALL = "all"


class NotificationType(StrEnum):
    GROUP_JOINED = "group_joined"
    GROUP_INVITE = "group_invite"
    GROUP_CHECK_IN = "group_check_in"
    CHECK_IN_ACTIVITY = "check_in_activity"
    CHECK_IN = "check_in"


class OpenStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    UNKNOWN = "unknown"
