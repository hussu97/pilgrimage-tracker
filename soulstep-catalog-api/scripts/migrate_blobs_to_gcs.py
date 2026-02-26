#!/usr/bin/env python3
"""One-time script: migrate existing blob images to GCS.

Reads all PlaceImage / ReviewImage / GroupCoverImage rows that have blob_data
but no gcs_url, uploads each blob to GCS, sets gcs_url + image_type = GCS,
and nulls blob_data. Commits in batches of 50.

Prerequisites:
  - Run the 0015 Alembic migration first.
  - Set IMAGE_STORAGE=gcs and GCS_BUCKET_NAME before running.

Usage:
    IMAGE_STORAGE=gcs GCS_BUCKET_NAME=soulstep-images \\
        python scripts/migrate_blobs_to_gcs.py [--dry-run]
"""

import argparse
import sys
from pathlib import Path

# Make sure the catalog API package is on the path when running from the repo root
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from app.core.config import GCS_BUCKET_NAME, IMAGE_STORAGE
from app.db.enums import ImageType
from app.db.models import GroupCoverImage, PlaceImage, ReviewImage
from app.db.session import engine
from app.services.image_storage import (
    PREFIX_GROUP_COVERS,
    PREFIX_PLACES,
    PREFIX_REVIEWS,
    GCSStorageBackend,
)

BATCH_SIZE = 50


def migrate(dry_run: bool = False) -> None:
    if IMAGE_STORAGE != "gcs":
        print("ERROR: IMAGE_STORAGE must be 'gcs'. Exiting.")
        sys.exit(1)

    if not GCS_BUCKET_NAME:
        print("ERROR: GCS_BUCKET_NAME must be set. Exiting.")
        sys.exit(1)

    print(f"Bucket: {GCS_BUCKET_NAME}  dry_run={dry_run}")
    storage = GCSStorageBackend(GCS_BUCKET_NAME)

    with Session(engine) as session:
        _migrate_table(session, PlaceImage, "blob_data", "gcs_url", PREFIX_PLACES, storage, dry_run)
        _migrate_table(
            session, ReviewImage, "blob_data", "gcs_url", PREFIX_REVIEWS, storage, dry_run
        )
        _migrate_table(
            session,
            GroupCoverImage,
            "blob_data",
            "gcs_url",
            PREFIX_GROUP_COVERS,
            storage,
            dry_run,
        )

    print("Done.")


def _migrate_table(session, model, blob_field, gcs_field, prefix, storage, dry_run):
    model_name = model.__name__
    stmt = select(model).where(
        getattr(model, blob_field).is_not(None),
        getattr(model, gcs_field).is_(None),
    )
    rows = session.exec(stmt).all()
    print(f"{model_name}: {len(rows)} rows to migrate")

    count = 0
    for row in rows:
        data = getattr(row, blob_field)
        mime_type = getattr(row, "mime_type", "image/jpeg") or "image/jpeg"

        if not dry_run:
            gcs_url = storage.upload(data, mime_type, prefix)
            setattr(row, gcs_field, gcs_url)
            setattr(row, "image_type", ImageType.GCS) if hasattr(row, "image_type") else None
            setattr(row, blob_field, None)
            session.add(row)
            count += 1

            if count % BATCH_SIZE == 0:
                session.commit()
                print(f"  {model_name}: committed {count} rows")
        else:
            print(f"  [dry-run] would migrate {model_name} id={row.id}")

    if not dry_run and count % BATCH_SIZE != 0:
        session.commit()
    print(f"  {model_name}: migrated {count} rows")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate blob images to GCS")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print what would happen without doing it"
    )
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)
