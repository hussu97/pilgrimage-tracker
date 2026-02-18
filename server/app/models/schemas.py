import re
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, validator

Religion = Literal["islam", "hinduism", "christianity", "all"]

_PASSWORD_REQUIREMENTS = (
    "Password must be at least 8 characters and contain at least one uppercase letter, "
    "one lowercase letter, and one digit."
)


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError(_PASSWORD_REQUIREMENTS)
    if not re.search(r"[A-Z]", v):
        raise ValueError(_PASSWORD_REQUIREMENTS)
    if not re.search(r"[a-z]", v):
        raise ValueError(_PASSWORD_REQUIREMENTS)
    if not re.search(r"\d", v):
        raise ValueError(_PASSWORD_REQUIREMENTS)
    return v


class UserResponse(BaseModel):
    user_code: str
    email: str
    display_name: str
    religions: List[Religion] = []
    created_at: str
    updated_at: str


class AuthResponse(BaseModel):
    user: UserResponse
    token: str
    refresh_token: Optional[str] = None


class VisitorResponse(BaseModel):
    visitor_code: str
    created_at: str


class VisitorSettingsResponse(BaseModel):
    theme: str
    units: str
    language: str
    religions: List[Religion]


class VisitorSettingsBody(BaseModel):
    theme: Optional[str] = None
    units: Optional[str] = None
    language: Optional[str] = None
    religions: Optional[List[Religion]] = None


class RegisterBody(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    visitor_code: Optional[str] = None  # for settings merge on upgrade

    @validator("password")
    def validate_password_strength(cls, v):
        return _validate_password(v)


class LoginBody(BaseModel):
    email: str
    password: str
    visitor_code: Optional[str] = None  # for settings merge on upgrade


class UpdateMeBody(BaseModel):
    display_name: Optional[str] = None


class ForgotPasswordBody(BaseModel):
    email: str


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str

    @validator("newPassword")
    def validate_new_password_strength(cls, v):
        return _validate_password(v)


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
    places: List  # list of place dicts (dynamic fields)
    filters: FiltersMetadata


# Allowed scalar types for place attribute values (no arbitrary dict/object)
_AllowedAttributeValue = Union[str, int, float, bool, List[str]]


class PlaceAttributeInput(BaseModel):
    attribute_code: str
    value: _AllowedAttributeValue

    @validator("value")
    def validate_value_type(cls, v):
        """Ensure value is one of the allowed types."""
        if isinstance(v, list):
            for item in v:
                if not isinstance(item, str):
                    raise ValueError(
                        "List values must contain only strings."
                    )
        elif not isinstance(v, (str, int, float, bool)):
            raise ValueError(
                "Value must be a string, number, boolean, or list of strings."
            )
        return v


class ExternalReviewInput(BaseModel):
    """Typed schema for external (e.g. Google) reviews imported during sync."""
    author_name: str
    rating: int
    text: str
    time: int  # Unix timestamp
    language: str = "en"

    @validator("rating")
    def validate_rating(cls, v):
        if not (1 <= v <= 5):
            raise ValueError("Rating must be between 1 and 5.")
        return v


class PlaceCreate(BaseModel):
    place_code: str
    name: str
    religion: Religion
    place_type: str
    lat: float
    lng: float
    address: str
    opening_hours: Optional[dict] = None
    utc_offset_minutes: Optional[int] = None
    image_urls: List[str] = []  # Still accepted during sync, stored as PlaceImage rows
    image_blobs: Optional[List[dict]] = None  # [{"data": "base64...", "mime_type": "image/jpeg"}]
    description: Optional[str] = None
    website_url: Optional[str] = None
    source: Optional[str] = None
    attributes: Optional[List[PlaceAttributeInput]] = None
    external_reviews: Optional[List[ExternalReviewInput]] = None

    @validator("image_blobs")
    def validate_image_sources(cls, v, values):
        """Ensure only one image source (urls or blobs) is provided, not both."""
        image_urls = values.get("image_urls", [])
        has_urls = image_urls and len(image_urls) > 0
        has_blobs = v and len(v) > 0
        if has_urls and has_blobs:
            raise ValueError("Cannot provide both image_urls and image_blobs. Use one or the other.")
        return v


class PlaceBatch(BaseModel):
    """Wraps a list of places for the batch create/update endpoint."""
    places: List[PlaceCreate]
