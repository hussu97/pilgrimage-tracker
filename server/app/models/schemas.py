from typing import Any, List, Literal, Optional

from pydantic import BaseModel

Religion = Literal["islam", "hinduism", "christianity"]


class UserResponse(BaseModel):
    user_code: str
    email: str
    display_name: str
    religions: List[Religion] = []
    avatar_url: Optional[str] = None
    created_at: str
    updated_at: str


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


class RegisterBody(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class LoginBody(BaseModel):
    email: str
    password: str


class UpdateMeBody(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class ForgotPasswordBody(BaseModel):
    email: str


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str


class CheckInBody(BaseModel):
    note: Optional[str] = None
    photo_url: Optional[str] = None


class ReviewCreateBody(BaseModel):
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    is_anonymous: Optional[bool] = None
    photo_urls: Optional[List[str]] = None


class ReviewUpdateBody(BaseModel):
    rating: Optional[int] = None
    title: Optional[str] = None
    body: Optional[str] = None


class GroupCreateBody(BaseModel):
    name: str
    description: Optional[str] = None
    is_private: Optional[bool] = False
    path_place_codes: Optional[List[str]] = None


class GroupUpdateBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_private: Optional[bool] = None


class GroupInviteBody(BaseModel):
    email: Optional[str] = None


class SettingsBody(BaseModel):
    notifications_on: Optional[bool] = None
    theme: Optional[str] = None  # light, dark, system
    units: Optional[str] = None  # km, miles
    language: Optional[str] = None  # en, ar, hi
    religions: Optional[List[Religion]] = None  # filter preference; empty = show all


class FilterOption(BaseModel):
    key: str
    label: str
    icon: str
    count: int


class FiltersMetadata(BaseModel):
    options: List[FilterOption]


class PlacesListResponse(BaseModel):
    places: List[Any]  # list of place dicts (dynamic fields)
    filters: FiltersMetadata


# Place list item (with optional distance)
class PlaceListItem(BaseModel):
    place_code: str
    name: str
    religion: Religion
    place_type: str
    lat: float
    lng: float
    address: str
    opening_hours: Optional[dict] = None
    image_urls: List[str] = []
    description: Optional[str] = None
    created_at: str
    distance: Optional[float] = None

    class Config:
        from_attributes = True


class PlaceAttributeInput(BaseModel):
    attribute_code: str
    value: Any  # str, number, bool, or dict


class PlaceCreate(BaseModel):
    place_code: str
    name: str
    religion: Religion
    place_type: str
    lat: float
    lng: float
    address: str
    opening_hours: Optional[dict] = None
    image_urls: List[str] = []
    description: Optional[str] = None
    religion_specific: Optional[dict] = None
    website_url: Optional[str] = None
    source: Optional[str] = None
    attributes: Optional[List[PlaceAttributeInput]] = None

