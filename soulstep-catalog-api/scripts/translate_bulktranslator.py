"""Bulk-translate a .txt export file via bulktranslator.com.

Usage (with explicit input file):
    python scripts/translate_bulktranslator.py untranslated_20260314T120000.txt \\
        --api-url http://127.0.0.1:3000/api/v1 \\
        --admin-email admin@example.com \\
        --admin-password MyPass1!

Usage (auto-export — no input file needed):
    python scripts/translate_bulktranslator.py \\
        --api-url http://127.0.0.1:3000/api/v1 \\
        --admin-email admin@example.com \\
        --admin-password MyPass1!

When no input_file is given (Phase 0), the script authenticates against the
catalog API and calls GET /admin/content-translations/export-txt with the
selected --entity-types.  The response is saved to
  <output-dir>/untranslated_<YYYYMMDDTHHMMSS>.txt
and that file is used as the input for the translation phases.

Reads lines of the form:
    [1:42:1] Sacred Temple

Splits them into batches of 50, submits each batch to bulktranslator.com
with all 4 target languages selected (AR, HI, ML, TE), then:

  1. Appends translated lines to one local file per language (audit trail):
       translated_ar.txt / translated_hi.txt / translated_ml.txt / translated_te.txt
     File writes use fcntl.flock so multiple parallel tasks are safe.

  2. If --api-url / CATALOG_API_URL is set, POSTs each language's batch
     directly to POST /admin/content-translations/import-txt, inserting
     rows into the production DB.  The token is refreshed automatically
     if it expires during a long run.

Batches run in parallel across --concurrency browser tabs (default 3).

Requirements:
    pip install playwright requests
    playwright install chromium
"""

from __future__ import annotations

import argparse
import asyncio
import fcntl
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import requests
from playwright.async_api import async_playwright

# ── Constants ──────────────────────────────────────────────────────────────────

SITE_URL = "https://bulktranslator.com/"
TARGET_LANGS = ["AR", "HI", "ML", "TE"]
BATCH_SIZE = 50
CONCURRENCY = 3  # default parallel browser tabs

# Map site lang code → output filename suffix
LANG_FILES: dict[str, str] = {
    "AR": "translated_ar.txt",
    "HI": "translated_hi.txt",
    "ML": "translated_ml.txt",
    "TE": "translated_te.txt",
}

DEFAULT_ENTITY_TYPES = ["place", "city", "attribute_def", "review"]


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
        timeout=300,
    )
    r.raise_for_status()
    return r.json()


def _api_export_txt(api_url: str, token: str, entity_types: list[str]) -> str:
    """Call GET /admin/content-translations/export-txt and return the response text."""
    entity_types_param = ",".join(entity_types)
    r = requests.get(
        f"{api_url}/admin/content-translations/export-txt",
        headers={"Authorization": f"Bearer {token}"},
        params={"entity_types": entity_types_param},
        timeout=120,
    )
    r.raise_for_status()
    return r.text


# ── Phase 0: auto-export ───────────────────────────────────────────────────────


def _phase0_export(args) -> Path:
    """Authenticate and export untranslated strings; return path to saved file."""
    api_url = args.api_url
    if not api_url:
        print(
            "Error: --api-url is required when no input_file is provided.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not args.admin_email or not args.admin_password:
        print(
            "Error: --admin-email and --admin-password are required when no input_file is provided.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("\n── Phase 0: auto-export ──────────────────────────────────────────────────")
    print(f"Logging in to {api_url} as {args.admin_email}…")
    token = _api_login(api_url, args.admin_email, args.admin_password)
    print("  ✓ Token acquired")

    entity_types: list[str] = args.entity_types
    print(f"Exporting missing translations for entity types: {', '.join(entity_types)}…")
    export_text = _api_export_txt(api_url, token, entity_types)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    export_path = output_dir / f"untranslated_{timestamp}.txt"
    export_path.write_text(export_text, encoding="utf-8")

    line_count = sum(
        1 for ln in export_text.splitlines() if ln.strip() and not ln.strip().startswith("#")
    )
    print(f"  ✓ Saved {line_count} translatable lines → {export_path}")
    return export_path


# ── Async browser session ───────────────────────────────────────────────────────


async def _translate_batch_async(
    page,
    batch_lines: list[str],
    batch_num: int,
    total_batches: int,
) -> dict[str, list[str]]:
    """Submit one batch to bulktranslator.com and return {lang_code: [output_lines]}."""

    identifiers = [_parse_identifier(line) for line in batch_lines]
    source_texts = []
    for line in batch_lines:
        end = line.find("]")
        source_texts.append(line[end + 1 :].strip() if end != -1 else line)

    paste_text = "\n".join(source_texts)

    print(f"  Batch {batch_num}/{total_batches} — {len(batch_lines)} lines")

    await page.goto(SITE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("textarea#text", timeout=15_000)

    await page.fill("textarea#text", paste_text)

    for lang in TARGET_LANGS:
        cb = page.locator(f'input[name="lang[]"][value="{lang}"]')
        if not await cb.is_checked():
            await cb.check()

    await page.click("button#result")
    await page.wait_for_url("**/#result", timeout=30_000)
    await page.wait_for_selector("div.bg-vijay", timeout=30_000)

    # Small pause to ensure all result textareas are fully populated
    await asyncio.sleep(1)

    results: dict[str, list[str]] = {}
    blocks = await page.query_selector_all("div.bg-vijay")
    for block in blocks:
        lang_el = await block.query_selector(".target-name")
        text_el = await block.query_selector("textarea")
        if not lang_el or not text_el:
            continue
        lang_code = (await lang_el.inner_text() or "").strip().upper()
        translated_blob = (await text_el.input_value()).strip()
        translated_lines = [ln.strip() for ln in translated_blob.splitlines()]

        if lang_code not in TARGET_LANGS:
            continue

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


DB_IMPORT_CHUNK = 500  # rows per import-txt call


async def _import_lang(api_url: str, token: str, lang_code: str, out_file: Path) -> None:
    """Read a translated_*.txt file and POST in DB_IMPORT_CHUNK-row sequential calls."""
    lines = [ln for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if not lines:
        print(f"  {lang_code}: nothing to import (file empty)")
        return

    chunks = [lines[i : i + DB_IMPORT_CHUNK] for i in range(0, len(lines), DB_IMPORT_CHUNK)]
    print(f"  {lang_code}: importing {len(lines)} lines in {len(chunks)} chunks…")
    total_saved = 0

    for idx, chunk in enumerate(chunks, start=1):
        job = await asyncio.to_thread(_api_import, api_url, token, lang_code.lower(), chunk)
        saved = job.get("completed_items", 0)
        total_saved += saved
        print(
            f"    {lang_code} chunk {idx}/{len(chunks)}: {saved} saved (job {job.get('job_code', '?')})"
        )

    print(f"  ✓ {lang_code}: {total_saved} total saved")


async def _run(args) -> None:
    # ── Phase 0: auto-export if no input_file ──────────────────────────────────
    if args.input_file is None:
        input_path = _phase0_export(args)
    else:
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
    active = [(i + 1, b) for i, b in enumerate(batches) if i + 1 >= args.start_batch]

    print(f"Loaded {len(all_lines)} lines → {len(batches)} batches of ≤{args.batch_size}")
    if args.start_batch > 1:
        print(f"  Skipping batches 1–{args.start_batch - 1}")
    print(f"  Running {len(active)} batches with concurrency={args.concurrency}")

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
        # If we already logged in during Phase 0, re-use the same token by
        # logging in again (stateless JWTs are fine to re-acquire).
        print(f"Logging in to {api_url} as {args.admin_email}…")
        api_token = await asyncio.to_thread(
            _api_login, api_url, args.admin_email, args.admin_password
        )
        print("  ✓ Token acquired")
    else:
        print("No --api-url provided — translations will be written to files only.")

    # ── Phase 1: scrape all batches → write to txt files ──────────────────────
    print("\n── Phase 1: scraping ─────────────────────────────────────────────────────")
    semaphore = asyncio.Semaphore(args.concurrency)

    async def process_batch(batch_num: int, batch: list[str]) -> None:
        async with semaphore:
            page = await context.new_page()
            try:
                results = await _translate_batch_async(page, batch, batch_num, len(batches))
            except Exception as exc:
                print(f"  ✗ Batch {batch_num} failed: {exc}")
                print("    Retrying once after 5 s…")
                await asyncio.sleep(5)
                try:
                    results = await _translate_batch_async(page, batch, batch_num, len(batches))
                except Exception as exc2:
                    print(f"  ✗ Retry also failed: {exc2} — skipping batch {batch_num}")
                    return
            finally:
                await page.close()

            for lang_code, output_lines in results.items():
                if not output_lines:
                    continue
                out_file = output_dir / LANG_FILES[lang_code]
                await asyncio.to_thread(_append_lines_atomic, out_file, output_lines)
                print(
                    f"    ✓ {lang_code}: {len(output_lines)} lines → {out_file}"
                    f"  [batch {batch_num}]"
                )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,  # visible so you can see what's happening
            args=["--ignore-certificate-errors"],
        )
        context = await browser.new_context(ignore_https_errors=True)

        await asyncio.gather(*[process_batch(num, batch) for num, batch in active])

        await context.close()
        await browser.close()

    # ── Summary of txt files ───────────────────────────────────────────────────
    print("\nScraping complete.")
    for lang_code in TARGET_LANGS:
        out_file = output_dir / LANG_FILES[lang_code]
        if out_file.exists():
            count = sum(1 for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip())
            print(f"  {lang_code}: {count} lines in {out_file}")

    # ── Phase 2: bulk import all 4 languages concurrently ─────────────────────
    if not api_url or not api_token:
        print("\nNo --api-url — skipping DB import.")
        return

    print("\n── Phase 2: DB import (all 4 languages in parallel) ─────────────────────")
    import_tasks = []
    for lang_code in TARGET_LANGS:
        out_file = output_dir / LANG_FILES[lang_code]
        if out_file.exists():
            import_tasks.append(_import_lang(api_url, api_token, lang_code, out_file))

    await asyncio.gather(*import_tasks)
    print("\nDone.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Translate export .txt via bulktranslator.com. "
            "If no input_file is provided, automatically exports missing translations "
            "from the catalog API (Phase 0) before running the translation phases."
        )
    )
    parser.add_argument(
        "input_file",
        nargs="?",
        default=None,
        help=(
            "Path to the exported .txt file. "
            "If omitted, the script auto-exports from the API using --admin-email/--admin-password."
        ),
    )
    parser.add_argument(
        "--entity-types",
        nargs="+",
        default=DEFAULT_ENTITY_TYPES,
        metavar="TYPE",
        help=(
            "Entity types to export/translate (default: place city attribute_def review). "
            "Only used during auto-export (Phase 0) when no input_file is given."
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BATCH_SIZE,
        help=f"Lines per batch (default {BATCH_SIZE})",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=CONCURRENCY,
        help=f"Number of parallel browser tabs (default {CONCURRENCY})",
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
        default=os.environ.get("CATALOG_API_URL", "http://127.0.0.1:3000/api/v1"),
        help=(
            "Catalog API base URL, e.g. http://127.0.0.1:3000/api/v1 "
            "(env: CATALOG_API_URL, default: http://127.0.0.1:3000/api/v1)"
        ),
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
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
