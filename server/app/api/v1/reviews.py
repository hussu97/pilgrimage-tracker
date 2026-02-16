from io import BytesIO
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from sqlmodel import Session

from app.api.deps import get_current_user
from app.db import reviews as reviews_db
from app.db import review_images as review_images_db
from app.db.session import SessionDep
from app.models.schemas import ReviewUpdateBody

router = APIRouter()


@router.patch("/{review_code}")
def update_review(
    review_code: str,
    body: ReviewUpdateBody,
    user: Annotated[Any, Depends(get_current_user)],
    session: SessionDep,
):
    row = reviews_db.get_review_by_code(review_code, session)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    if row.user_code != user.user_code:
        raise HTTPException(status_code=403, detail="Not the author")
    if body.rating is not None and not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    if body.rating is not None:
        row.rating = body.rating
    if body.title is not None:
        row.title = body.title
    if body.body is not None:
        row.body = body.body
    session.add(row)
    session.commit()
    return {"review_code": row.review_code, "rating": row.rating, "title": row.title, "body": row.body, "created_at": row.created_at}


@router.delete("/{review_code}")
def delete_review(
    review_code: str,
    user: Annotated[Any, Depends(get_current_user)],
    session: SessionDep,
):
    row = reviews_db.get_review_by_code(review_code, session)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    if row.user_code != user.user_code:
        raise HTTPException(status_code=403, detail="Not the author")

    deleted = reviews_db.delete_review(review_code, session)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete review")

    return {"ok": True}


@router.post("/upload-photo")
async def upload_review_photo(
    user: Annotated[Any, Depends(get_current_user)],
    session: SessionDep,
    file: UploadFile = File(...),
):
    """
    Upload a photo for use in a review.

    Accepts JPEG, PNG, or WebP images up to 5MB.
    Images are resized to max 1200px width and compressed to 85% JPEG quality.
    Returns image ID and URL for inclusion in review photo_urls.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Only JPEG, PNG, and WebP images are allowed. Got: {file.content_type}"
        )

    # Read file data
    file_data = await file.read()
    file_size = len(file_data)

    # Validate file size (max 5MB)
    MAX_SIZE = 5 * 1024 * 1024  # 5MB
    if file_size > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size {file_size} bytes exceeds maximum of {MAX_SIZE} bytes (5MB)"
        )

    # Process image with Pillow
    try:
        img = Image.open(BytesIO(file_data))

        # Validate dimensions (max 4000x4000)
        MAX_DIMENSION = 4000
        if img.width > MAX_DIMENSION or img.height > MAX_DIMENSION:
            raise HTTPException(
                status_code=400,
                detail=f"Image dimensions {img.width}x{img.height} exceed maximum of {MAX_DIMENSION}x{MAX_DIMENSION}"
            )

        # Convert to RGB if needed (handles RGBA, P, etc.)
        if img.mode in ("RGBA", "LA", "P"):
            # Create white background for transparency
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Resize if width > 1200px, maintaining aspect ratio
        MAX_WIDTH = 1200
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            new_height = int(img.height * ratio)
            img = img.resize((MAX_WIDTH, new_height), Image.Resampling.LANCZOS)

        # Save as JPEG with 85% quality
        output = BytesIO()
        img.save(output, format="JPEG", quality=85, optimize=True)
        compressed_data = output.getvalue()

        final_width, final_height = img.width, img.height
        final_size = len(compressed_data)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

    # Store in database
    try:
        review_image = review_images_db.create_review_image(
            uploaded_by_user_code=user.user_code,
            blob_data=compressed_data,
            mime_type="image/jpeg",
            file_size=final_size,
            width=final_width,
            height=final_height,
            display_order=0,
            session=session,
        )

        return {
            "id": review_image.id,
            "url": f"/api/v1/reviews/images/{review_image.id}",
            "width": final_width,
            "height": final_height,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store image: {str(e)}")


@router.get("/images/{image_id}")
def get_review_image(
    image_id: int,
    session: SessionDep,
):
    """
    Serve a review image by ID.
    Returns the image blob with aggressive caching (1 year).
    """
    image = review_images_db.get_image_by_id(image_id, session)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    return Response(
        content=image.blob_data,
        media_type=image.mime_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
        }
    )
