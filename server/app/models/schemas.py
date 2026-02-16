from typing import Any, List, Literal, Optional

from pydantic import BaseModel, validator

Religion = Literal["islam", "hinduism", "christianity"]


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


class RegisterBody(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class LoginBody(BaseModel):
    email: str
    password: str


class UpdateMeBody(BaseModel):
    display_name: Optional[str] = None


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

    @validator('value')
    def validate_value_type(cls, v):
        """Ensure value is one of the allowed types."""
        if not isinstance(v, (str, int, float, bool, dict, list, type(None))):
            raise ValueError(f'Invalid value type: {type(v).__name__}. Must be str, number, bool, dict, list, or null.')
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
    image_urls: List[str] = []  # Still accepted during sync, stored as PlaceImage rows
    image_blobs: Optional[List[dict]] = None  # [{"data": "base64...", "mime_type": "image/jpeg"}]
    description: Optional[str] = None
    website_url: Optional[str] = None
    source: Optional[str] = None
    attributes: Optional[List[PlaceAttributeInput]] = None
    external_reviews: Optional[List[dict]] = None  # For external reviews during sync

    @validator('image_blobs')
    def validate_image_sources(cls, v, values):
        """Ensure only one image source (urls or blobs) is provided, not both."""
        # Allow if one is empty/None - only reject if both have actual data
        image_urls = values.get('image_urls', [])
        has_urls = image_urls and len(image_urls) > 0
        has_blobs = v and len(v) > 0

        if has_urls and has_blobs:
            raise ValueError('Cannot provide both image_urls and image_blobs. Use one or the other.')
        return v

