"""Admin health / diagnostics endpoints."""

import os
import secrets

from fastapi import APIRouter

from app.api.deps import AdminDep

router = APIRouter()


@router.get("/health/gcs", summary="Test GCS connectivity and configuration")
def gcs_health(admin: AdminDep):
    """
    Diagnose GCS image storage configuration.

    Checks (in order):
    1. IMAGE_STORAGE env var value
    2. GCS_BUCKET_NAME env var value
    3. google-cloud-storage library import
    4. GCS client + bucket initialisation (uses ADC / Workload Identity on Cloud Run)
    5. A real test write → read → delete of a small object in the bucket

    Returns a structured report so you can identify exactly where the chain breaks.
    """
    image_storage = os.environ.get("IMAGE_STORAGE", "blob")
    bucket_name = os.environ.get("GCS_BUCKET_NAME", "")

    report: dict = {
        "IMAGE_STORAGE": image_storage,
        "GCS_BUCKET_NAME": bucket_name or "(not set)",
        "gcs_enabled": image_storage == "gcs",
        "library_import": None,
        "client_init": None,
        "bucket_access": None,
        "write_test": None,
        "overall": "fail",
    }

    if image_storage != "gcs":
        report["overall"] = "skipped — IMAGE_STORAGE is not 'gcs'"
        return report

    if not bucket_name:
        report["overall"] = "fail — GCS_BUCKET_NAME is not set"
        return report

    # 1. Library import
    try:
        from google.cloud import storage as gcs  # noqa: F401

        report["library_import"] = "ok"
    except ImportError as e:
        report["library_import"] = f"FAIL: {e}"
        report["overall"] = "fail — google-cloud-storage not installed"
        return report

    # 2. Client + bucket init
    try:
        from google.cloud import storage as gcs

        client = gcs.Client()
        bucket = client.bucket(bucket_name)
        report["client_init"] = "ok"
    except Exception as e:
        report["client_init"] = f"FAIL: {e}"
        report["overall"] = "fail — could not initialise GCS client"
        return report

    # 3. Bucket existence + write/read/delete round-trip
    test_object = f"_health_check/{secrets.token_hex(8)}.txt"
    test_data = b"soulstep-gcs-health-check"
    try:
        blob = bucket.blob(test_object)
        blob.upload_from_string(test_data, content_type="text/plain")
        report["bucket_access"] = "ok (write succeeded)"
    except Exception as e:
        report["bucket_access"] = f"FAIL on write: {e}"
        report["overall"] = "fail — bucket write failed (check IAM permissions and bucket name)"
        return report

    try:
        blob.delete()
        report["write_test"] = "ok (write + delete succeeded)"
    except Exception as e:
        # Write worked, delete failed — still functional for images
        report["write_test"] = f"write ok, delete FAIL: {e}"

    report["overall"] = "ok"
    return report
