from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import Column, Field, JSON, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_code: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    display_name: str
    avatar_url: Optional[str] = None
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
    image_urls: List[str] = Field(default=[], sa_column=Column(JSON))
    description: Optional[str] = None
    religion_specific: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    website_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Review(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    review_code: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    place_code: str = Field(index=True, foreign_key="place.place_code")
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    is_anonymous: bool = Field(default=False)
    photo_urls: List[str] = Field(default=[], sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
