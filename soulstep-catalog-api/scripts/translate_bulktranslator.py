"""Bulk-translate a .txt export file via bulktranslator.com.

Usage:
    python scripts/translate_bulktranslator.py untranslated_20260314T120000.txt \\
        --api-url http://127.0.0.1:3000/api/v1 \\
        --admin-email admin@example.com \\
        --admin-password MyPass1!

Reads lines of the form:
    [1:42:1] Sacred Temple

Splits them into batches of 50, submits each batch to bulktranslator.com
with all 4 target languages selected (AR, HI, ML, TE), then:

  1. Appends translated lines to one local file per language (audit trail):
       translated_ar.txt / translated_hi.txt / translated_ml.txt / translated_te.txt
     File writes use fcntl.flock so multiple parallel sessions are safe.

  2. If --api-url / CATALOG_API_URL is set, POSTs each language's batch
     directly to POST /admin/content-translations/import-txt, inserting
     rows into the production DB.  The token is refreshed automatically
     if it expires during a long run.

Requirements:
    pip install playwright requests
    playwright install chromium
"""

from __future__ import annotations

import argparse
import fcntl
import os
import sys
import time
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

# ── Constants ──────────────────────────────────────────────────────────────────

SITE_URL = "https://bulktranslator.com/"
TARGET_LANGS = ["AR", "HI", "ML", "TE"]
BATCH_SIZE = 50

# Map site lang code → output filename suffix
LANG_FILES: dict[str, str] = {
    "AR": "translated_ar.txt",
    "HI": "translated_hi.txt",
    "ML": "translated_ml.txt",
    "TE": "translated_te.txt",
}


# ── Helpers ────────────────────────────────────────────────────────────────────


def _read_data_lines(path: Path) -> list[str]:
    """Return non-blank, non-comment lines from the export file."""
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if stripped and not stripped.startswith("#"):
            lines.append(stripped)
    return lines


def _batches(lines: list[str], size: int) -> list[list[str]]:
    return [lines[i : i + size] for i in range(0, len(lines), size)]


def _append_lines_atomic(filepath: Path, lines: list[str]) -> None:
    """Append translated lines to file with an exclusive lock (parallel-safe)."""
    lock_path = filepath.with_suffix(".lock")
    with open(lock_path, "w") as lock_f:
        fcntl.flock(lock_f, fcntl.LOCK_EX)
        try:
            with open(filepath, "a", encoding="utf-8") as f:
                for line in lines:
                    f.write(line + "\n")
        finally:
            fcntl.flock(lock_f, fcntl.LOCK_UN)


def _parse_identifier(line: str) -> str | None:
    """Extract the [N:N:N] prefix from a source line, or None if malformed."""
    if line.startswith("["):
        end = line.find("]")
        if end != -1:
            return line[: end + 1]
    return None


# ── API helpers ────────────────────────────────────────────────────────────────


def _api_login(api_url: str, email: str, password: str) -> str:
    """Login and return a JWT token."""
    r = requests.post(
        f"{api_url}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["token"]


def _api_import(api_url: str, token: str, lang: str, lines: list[str]) -> dict:
    """POST translated lines to /admin/content-translations/import-txt."""
    txt_bytes = "\n".join(lines).encode("utf-8")
    r = requests.post(
        f"{api_url}/admin/content-translations/import-txt",
        headers={"Authorization": f"Bearer {token}"},
        data={"lang": lang},
        files={"file": ("translated.txt", txt_bytes, "text/plain")},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


# ── Browser session ────────────────────────────────────────────────────────────


def _translate_batch(
    page,
    batch_lines: list[str],
    batch_num: int,
    total_batches: int,
) -> dict[str, list[str]]:
    """Submit one batch to bulktranslator.com and return {lang_code: [output_lines]}."""

    # Build identifiers list in the same order as batch_lines
    identifiers = [_parse_identifier(line) for line in batch_lines]
    # Source text = everything after the "] " prefix
    source_texts = []
    for line in batch_lines:
        end = line.find("]")
        source_texts.append(line[end + 1 :].strip() if end != -1 else line)

    paste_text = "\n".join(source_texts)

    print(f"  Batch {batch_num}/{total_batches} — {len(batch_lines)} lines")

    # Navigate (first batch navigates fresh; subsequent batches already on page)
    page.goto(SITE_URL, wait_until="domcontentloaded")
    page.wait_for_selector("textarea#text", timeout=15_000)

    # Clear and fill source textarea
    page.fill("textarea#text", paste_text)

    # Uncheck all language boxes that might already be ticked, then tick ours
    for lang in TARGET_LANGS:
        cb = page.locator(f'input[name="lang[]"][value="{lang}"]')
        if not cb.is_checked():
            cb.check()

    # Submit
    page.click("button#result")
    page.wait_for_url("**/#result", timeout=30_000)
    page.wait_for_selector("div.bg-vijay", timeout=30_000)

    # Small pause to ensure all result textareas are fully populated
    time.sleep(1)

    # Extract results
    results: dict[str, list[str]] = {}
    blocks = page.query_selector_all("div.bg-vijay")
    for block in blocks:
        lang_el = block.query_selector(".target-name")
        text_el = block.query_selector("textarea")
        if not lang_el or not text_el:
            continue
        lang_code = (lang_el.inner_text() or "").strip().upper()
        translated_blob = text_el.input_value().strip()
        translated_lines = [ln.strip() for ln in translated_blob.splitlines()]

        if lang_code not in TARGET_LANGS:
            continue

        # Zip identifiers with translated lines; skip if counts don't match
        if len(translated_lines) != len(identifiers):
            print(
                f"    ⚠  {lang_code}: got {len(translated_lines)} lines, "
                f"expected {len(identifiers)} — skipping batch for this language"
            )
            results[lang_code] = []
            continue

        output_lines = []
        for ident, trans_text in zip(identifiers, translated_lines, strict=False):
            if ident and trans_text:
                output_lines.append(f"{ident} {trans_text}")
        results[lang_code] = output_lines

    return results


# ── Main ───────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Translate export .txt via bulktranslator.com")
    parser.add_argument("input_file", help="Path to the exported .txt file")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BATCH_SIZE,
        help=f"Lines per batch (default {BATCH_SIZE})",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory to write translated_*.txt files (default: current dir)",
    )
    parser.add_argument(
        "--start-batch",
        type=int,
        default=1,
        help="Skip to this batch number (1-based) — useful for resuming",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N lines (default: all)",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("CATALOG_API_URL"),
        help="Catalog API base URL, e.g. http://127.0.0.1:3000/api/v1 (env: CATALOG_API_URL)",
    )
    parser.add_argument(
        "--admin-email",
        default=os.environ.get("ADMIN_EMAIL"),
        help="Admin email for API login (env: ADMIN_EMAIL)",
    )
    parser.add_argument(
        "--admin-password",
        default=os.environ.get("ADMIN_PASSWORD"),
        help="Admin password for API login (env: ADMIN_PASSWORD)",
    )
    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    all_lines = _read_data_lines(input_path)
    if not all_lines:
        print("No translatable lines found in input file.")
        sys.exit(0)

    if args.limit is not None:
        all_lines = all_lines[: args.limit]

    batches = _batches(all_lines, args.batch_size)
    print(f"Loaded {len(all_lines)} lines → {len(batches)} batches of ≤{args.batch_size}")

    # ── API setup ──────────────────────────────────────────────────────────────
    api_url = args.api_url
    api_token: str | None = None

    if api_url:
        if not args.admin_email or not args.admin_password:
            print(
                "Error: --api-url requires --admin-email and --admin-password "
                "(or ADMIN_EMAIL / ADMIN_PASSWORD env vars).",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"Logging in to {api_url} as {args.admin_email}…")
        api_token = _api_login(api_url, args.admin_email, args.admin_password)
        print("  ✓ Token acquired")
    else:
        print("No --api-url provided — translations will be written to files only.")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,  # visible so you can see what's happening
            args=["--ignore-certificate-errors"],
        )
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()

        for batch_idx, batch in enumerate(batches, start=1):
            if batch_idx < args.start_batch:
                print(f"  Skipping batch {batch_idx}/{len(batches)}")
                continue

            try:
                results = _translate_batch(page, batch, batch_idx, len(batches))
            except Exception as exc:
                print(f"  ✗ Batch {batch_idx} failed: {exc}")
                print("    Retrying once after 5 s…")
                time.sleep(5)
                try:
                    results = _translate_batch(page, batch, batch_idx, len(batches))
                except Exception as exc2:
                    print(f"  ✗ Retry also failed: {exc2} — skipping batch {batch_idx}")
                    continue

            # ── Step 1: write ALL languages to txt first (always safe) ──────────
            saved: dict[str, list[str]] = {}
            for lang_code, output_lines in results.items():
                if not output_lines:
                    continue
                out_file = output_dir / LANG_FILES[lang_code]
                _append_lines_atomic(out_file, output_lines)
                saved[lang_code] = output_lines
                print(f"    ✓ {lang_code}: {len(output_lines)} lines → {out_file}")

            # ── Step 2: import each language's batch into the DB ─────────────
            if api_url and api_token and saved:
                for lang_code, output_lines in saved.items():
                    try:
                        job = _api_import(api_url, api_token, lang_code.lower(), output_lines)
                        print(
                            f"    → DB {lang_code}: {job.get('completed_items', '?')} saved"
                            f" (job {job.get('job_code', '?')})"
                        )
                    except requests.HTTPError as exc:
                        if exc.response is not None and exc.response.status_code == 401:
                            # Token expired — re-login and retry once
                            print(f"    → DB {lang_code}: token expired, re-logging in…")
                            api_token = _api_login(api_url, args.admin_email, args.admin_password)
                            try:
                                job = _api_import(
                                    api_url, api_token, lang_code.lower(), output_lines
                                )
                                print(
                                    f"    → DB {lang_code}: {job.get('completed_items', '?')} saved"
                                    f" (job {job.get('job_code', '?')})"
                                )
                            except Exception as exc2:
                                print(
                                    f"    ✗ DB {lang_code}: failed after re-login: {exc2}"
                                    " (data safe in txt)"
                                )
                        else:
                            print(f"    ✗ DB {lang_code}: failed: {exc} (data safe in txt)")
                    except Exception as exc:
                        print(f"    ✗ DB {lang_code}: failed: {exc} (data safe in txt)")

            # Brief pause between batches to be polite to the server
            if batch_idx < len(batches):
                time.sleep(2)

        context.close()
        browser.close()

    print("\nDone.")
    for lang_code in TARGET_LANGS:
        out_file = output_dir / LANG_FILES[lang_code]
        if out_file.exists():
            count = sum(1 for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip())
            print(f"  {lang_code}: {count} lines in {out_file}")


if __name__ == "__main__":
    main()
