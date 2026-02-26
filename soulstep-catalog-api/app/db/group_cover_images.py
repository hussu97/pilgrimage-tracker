"""CRUD operations for GroupCoverImage model."""

import secrets

from sqlmodel import Session, select

from app.db.models import GroupCoverImage


def _generate_code() -> str:
    return "gcov_" + secrets.token_hex(8)


def create_image(
    uploaded_by_user_code: str,
    blob_data: bytes | None,
    mime_type: str,
    file_size: int,
    width: int,
    height: int,
    session: Session,
    gcs_url: str | None = None,
) -> GroupCoverImage:
    image = GroupCoverImage(
        image_code=_generate_code(),
        uploaded_by_user_code=uploaded_by_user_code,
        blob_data=blob_data,
        gcs_url=gcs_url,
        mime_type=mime_type,
        file_size=file_size,
        width=width,
        height=height,
    )
    session.add(image)
    session.commit()
    session.refresh(image)
    return image


def get_by_code(image_code: str, session: Session) -> GroupCoverImage | None:
    stmt = select(GroupCoverImage).where(GroupCoverImage.image_code == image_code)
    return session.exec(stmt).first()
