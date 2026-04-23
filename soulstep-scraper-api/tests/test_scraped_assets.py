import os
import sys
from datetime import UTC, datetime
from unittest.mock import patch

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    return engine


async def test_asset_barrier_uploads_place_and_review_assets():
    from app.db.models import ScrapedAsset, ScrapedPlace, ScraperRun
    from app.services.scraped_assets import wait_for_asset_barrier

    engine = _make_engine()

    with Session(engine) as session:
        run = ScraperRun(run_code="run_assets_1", location_code="loc_assets", status="running")
        place = ScrapedPlace(
            run_code="run_assets_1",
            place_code="gplc_assets_1",
            name="Asset Place",
            raw_data={
                "image_urls": [],
                "source_image_urls": ["https://example.com/place.jpg"],
                "external_reviews": [
                    {
                        "text": "Great",
                        "photo_urls": [],
                        "source_photo_urls": ["https://example.com/review.jpg"],
                    }
                ],
            },
        )
        asset1 = ScrapedAsset(
            run_code="run_assets_1",
            place_code="gplc_assets_1",
            asset_kind="place_image",
            asset_index=0,
            source_url="https://example.com/place.jpg",
            status="pending_upload",
            inline_bytes_b64="aGVsbG8=",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        asset2 = ScrapedAsset(
            run_code="run_assets_1",
            place_code="gplc_assets_1",
            asset_kind="review_image",
            review_index=0,
            asset_index=0,
            source_url="https://example.com/review.jpg",
            status="pending_upload",
            inline_bytes_b64="d29ybGQ=",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(run)
        session.add(place)
        session.add(asset1)
        session.add(asset2)
        session.commit()

    with (
        patch(
            "app.services.gcs.upload_image_bytes",
            return_value="https://storage.googleapis.com/bucket/place.jpg",
        ),
        patch(
            "app.services.gcs.upload_review_image_bytes",
            return_value="https://storage.googleapis.com/bucket/review.jpg",
        ),
    ):
        stats = await wait_for_asset_barrier("run_assets_1", engine, timeout_s=10)

    assert stats.pending == 0
    with Session(engine) as session:
        place = session.exec(
            select(ScrapedPlace).where(ScrapedPlace.run_code == "run_assets_1")
        ).first()
        assets = session.exec(
            select(ScrapedAsset).where(ScrapedAsset.run_code == "run_assets_1")
        ).all()
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == "run_assets_1")).first()

    assert place.raw_data["image_urls"] == ["https://storage.googleapis.com/bucket/place.jpg"]
    assert place.raw_data["external_reviews"][0]["photo_urls"] == [
        "https://storage.googleapis.com/bucket/review.jpg"
    ]
    assert all(asset.status == "uploaded" for asset in assets)
    assert run.images_downloaded == 1
    assert run.review_images_downloaded == 1
