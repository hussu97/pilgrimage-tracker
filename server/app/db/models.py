from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import LargeBinary, UniqueConstraint
from sqlmodel import Column, Field, JSON, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_code: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    display_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserSettings(SQLModel, table=True):
    user_code: str = Field(primary_key=True, foreign_key="user.user_code")
    notifications_on: bool = Field(default=True)
    theme: str = Field(default="light")  # light, dark, system
    units: str = Field(default="km")  # km, miles
    language: str = Field(default="en")  # en, ar, hi
    religions: List[str] = Field(default=[], sa_column=Column(JSON))


class Place(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    religion: str = Field(index=True)  # islam, hinduism, christianity
    place_type: str = Field(index=True)
    lat: float
    lng: float
    address: str
    opening_hours: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    utc_offset_minutes: Optional[int] = None  # e.g., 240 for UTC+4 (UAE), 330 for UTC+5:30 (India)
    description: Optional[str] = None
    website_url: Optional[str] = None
    source: Optional[str] = None  # gmaps, overpass, manual
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlaceImage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, foreign_key="place.place_code")
    image_type: str = Field(default="url")  # "url" or "blob"
    url: Optional[str] = None
    blob_data: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    mime_type: Optional[str] = None  # "image/jpeg", "image/png"
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Review(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    review_code: str = Field(index=True, unique=True)
    user_code: Optional[str] = Field(default=None, index=True, foreign_key="user.user_code")
    place_code: str = Field(index=True, foreign_key="place.place_code")
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    is_anonymous: bool = Field(default=False)
    photo_urls: List[str] = Field(default=[], sa_column=Column(JSON))
    source: str = Field(default="user")  # "user" or "google"
    author_name: Optional[str] = None  # For Google reviews
    review_time: Optional[int] = None  # Unix timestamp from Google
    language: Optional[str] = None  # Review language from Google
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReviewImage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    review_code: Optional[str] = Field(default=None, index=True, foreign_key="review.review_code")
    uploaded_by_user_code: str = Field(index=True, foreign_key="user.user_code")
    blob_data: bytes = Field(sa_column=Column(LargeBinary))
    mime_type: str  # "image/jpeg", "image/png", "image/webp"
    file_size: int
    width: int
    height: int
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    attached_at: Optional[datetime] = None


class CheckIn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    check_in_code: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    place_code: str = Field(index=True, foreign_key="place.place_code")
    note: Optional[str] = None
    photo_url: Optional[str] = None
    checked_in_at: datetime = Field(default_factory=datetime.utcnow)


class Favorite(SQLModel, table=True):
    user_code: str = Field(primary_key=True, foreign_key="user.user_code")
    place_code: str = Field(primary_key=True, foreign_key="place.place_code")


class Group(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    group_code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    created_by_user_code: str = Field(foreign_key="user.user_code")
    invite_code: str = Field(index=True, unique=True)
    is_private: bool = Field(default=False)
    path_place_codes: List[str] = Field(default=[], sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GroupMember(SQLModel, table=True):
    group_code: str = Field(primary_key=True, foreign_key="group.group_code")
    user_code: str = Field(primary_key=True, foreign_key="user.user_code")
    role: str = Field(default="member")  # admin, member
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    notification_code: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    type: str  # group_invite, check_in_activity, etc.
    payload: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    read_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PasswordReset(SQLModel, table=True):
    token: str = Field(primary_key=True)
    user_code: str = Field(foreign_key="user.user_code")
    expires_at: datetime
    used_at: Optional[datetime] = None


class RefreshToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlaceAttributeDefinition(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    attribute_code: str = Field(index=True, unique=True)
    name: str
    data_type: str  # "boolean", "string", "number", "json"
    icon: Optional[str] = None
    label_key: Optional[str] = None
    is_filterable: bool = False
    is_specification: bool = False
    category: Optional[str] = None  # "facility", "timing", "info"
    religion: Optional[str] = None  # null = all, "islam", "hinduism", "christianity"
    display_order: int = Field(default=0)


class PlaceAttribute(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("place_code", "attribute_code"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, foreign_key="place.place_code")
    attribute_code: str = Field(index=True, foreign_key="placeattributedefinition.attribute_code")
    value_text: Optional[str] = None
    value_json: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
