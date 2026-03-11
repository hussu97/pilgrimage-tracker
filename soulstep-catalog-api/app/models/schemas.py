import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

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
    user_code: str = Field(description="Unique opaque user identifier, e.g. usr_abc123")
    email: str
    display_name: str
    is_admin: bool = Field(default=False, description="Whether the user has admin privileges")
    religions: list[Religion] = Field(default=[], description="User's religion filter preferences")
    created_at: str = Field(description="ISO 8601 UTC timestamp")
    updated_at: str = Field(description="ISO 8601 UTC timestamp")


class AuthResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "user": {
                    "user_code": "usr_abc123de",
                    "email": "user@example.com",
                    "display_name": "Ahmed",
                    "religions": ["islam"],
                    "created_at": "2024-01-15T10:30:00Z",
                    "updated_at": "2024-01-15T10:30:00Z",
                },
                "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            }
        }
    )

    user: UserResponse
    token: str = Field(description="Short-lived JWT access token (Bearer)")
    refresh_token: str | None = Field(
        default=None, description="Deprecated — refresh token is set as an HTTP-only cookie"
    )


class VisitorResponse(BaseModel):
    visitor_code: str
    created_at: str


class VisitorSettingsResponse(BaseModel):
    theme: str
    units: str
    language: str
    religions: list[Religion]


class VisitorSettingsBody(BaseModel):
    theme: str | None = None
    units: str | None = None
    language: str | None = None
    religions: list[Religion] | None = None


class RegisterBody(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "SecurePass1",
                "display_name": "Ahmed Al-Rashid",
            }
        }
    )

    email: str = Field(description="Unique email address for the account")
    password: str = Field(
        description=(
            "Must be at least 8 characters and contain at least one uppercase letter, "
            "one lowercase letter, and one digit."
        )
    )
    display_name: str | None = Field(
        default=None, description="Optional display name; defaults to the email prefix"
    )
    visitor_code: str | None = Field(
        default=None, description="Anonymous visitor code to merge settings on account creation"
    )

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        return _validate_password(v)


class LoginBody(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"email": "user@example.com", "password": "SecurePass1"}}
    )

    email: str = Field(description="Registered email address")
    password: str = Field(description="Account password")
    visitor_code: str | None = Field(
        default=None, description="Anonymous visitor code to merge settings on login"
    )


class UpdateMeBody(BaseModel):
    display_name: str | None = None


class ForgotPasswordBody(BaseModel):
    email: str


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str

    @field_validator("newPassword")
    @classmethod
    def validate_new_password_strength(cls, v: str) -> str:
        return _validate_password(v)


class CheckInBody(BaseModel):
    note: str | None = None
    photo_url: str | None = None
    group_code: str | None = None


class ReviewCreateBody(BaseModel):
    rating: int
    title: str | None = None
    body: str | None = None
    is_anonymous: bool | None = None
    photo_urls: list[str] | None = None


class ReviewUpdateBody(BaseModel):
    rating: int | None = None
    title: str | None = None
    body: str | None = None


class GroupCreateBody(BaseModel):
    name: str
    description: str | None = None
    is_private: bool | None = False
    path_place_codes: list[str] | None = None
    cover_image_url: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class GroupUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    is_private: bool | None = None
    path_place_codes: list[str] | None = None
    cover_image_url: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class GroupPlaceNoteBody(BaseModel):
    text: str


class UpdateMemberRoleBody(BaseModel):
    role: str


class GroupInviteBody(BaseModel):
    email: str | None = None


class SettingsBody(BaseModel):
    notifications_on: bool | None = None
    theme: str | None = None  # light, dark, system
    units: str | None = None  # km, miles
    language: str | None = None  # en, ar, hi
    religions: list[Religion] | None = None  # filter preference; empty = show all


class FilterOption(BaseModel):
    key: str
    label: str
    icon: str
    count: int


class FiltersMetadata(BaseModel):
    options: list[FilterOption]


class PlacesListResponse(BaseModel):
    places: list  # list of place dicts (dynamic fields)
    filters: FiltersMetadata


# Allowed scalar types for place attribute values (no arbitrary dict/object)
_AllowedAttributeValue = str | int | float | bool | list[str]


class PlaceAttributeInput(BaseModel):
    attribute_code: str
    value: _AllowedAttributeValue

    @field_validator("value")
    @classmethod
    def validate_value_type(cls, v: _AllowedAttributeValue) -> _AllowedAttributeValue:
        """Ensure value is one of the allowed types."""
        if isinstance(v, list):
            for item in v:
                if not isinstance(item, str):
                    raise ValueError("List values must contain only strings.")
        elif not isinstance(v, str | int | float | bool):
            raise ValueError("Value must be a string, number, boolean, or list of strings.")
        return v


class ExternalReviewInput(BaseModel):
    """Typed schema for external (e.g. Google) reviews imported during sync."""

    author_name: str
    rating: int
    text: str
    time: int  # Unix timestamp
    language: str = "en"

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: int) -> int:
        if not (1 <= v <= 5):
            raise ValueError("Rating must be between 1 and 5.")
        return v


class PlaceTranslationInput(BaseModel):
    """Per-field non-English translations provided at ingest time by the scraper."""

    name: dict[str, str] | None = None  # {"ar": "...", "hi": "...", "te": "..."}
    description: dict[str, str] | None = None
    address: dict[str, str] | None = None


class PlaceCreate(BaseModel):
    place_code: str
    name: str
    religion: Religion
    place_type: str
    lat: float
    lng: float
    address: str
    opening_hours: dict | None = None
    utc_offset_minutes: int | None = None
    image_urls: list[str] = []  # Still accepted during sync, stored as PlaceImage rows
    image_blobs: list[dict] | None = None  # [{"data": "base64...", "mime_type": "image/jpeg"}]
    description: str | None = None
    website_url: str | None = None
    source: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    attributes: list[PlaceAttributeInput] | None = None
    external_reviews: list[ExternalReviewInput] | None = None
    translations: PlaceTranslationInput | None = None

    @field_validator("image_blobs")
    @classmethod
    def validate_image_sources(
        cls, v: list[dict] | None, info: ValidationInfo
    ) -> list[dict] | None:
        """Ensure only one image source (urls or blobs) is provided, not both."""
        image_urls = info.data.get("image_urls", [])
        has_urls = image_urls and len(image_urls) > 0
        has_blobs = v and len(v) > 0
        if has_urls and has_blobs:
            raise ValueError(
                "Cannot provide both image_urls and image_blobs. Use one or the other."
            )
        return v


class PlaceBatch(BaseModel):
    """Wraps a list of places for the batch create/update endpoint."""

    places: list[PlaceCreate]
