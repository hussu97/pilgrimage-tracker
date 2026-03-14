"""translate_content_claude.py — Translate SoulStep place content via Claude.ai browser.

Reads an "untranslated" JSON export (from GET /admin/content-translations/export-untranslated),
sends batches to Claude.ai via Playwright browser automation, and writes a flat "translated"
JSON ready for POST /admin/content-translations/bulk-upsert.

Usage
-----
  python translate_content_claude.py --input untranslated.json --output translated.json
  python translate_content_claude.py --input untranslated.json --output translated.json --langs ar hi
  python translate_content_claude.py --input untranslated.json --output translated.json --batch-size 8 --concurrency 3
  python translate_content_claude.py --reset-auth   # delete saved session file to re-login
  python translate_content_claude.py --dry-run      # print prompts, no browser

Auth
----
On first run (no claude_auth.json), a headed browser opens so you can log in.
After login, press Enter; the session is saved to claude_auth.json for subsequent headless runs.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

AUTH_FILE = Path(__file__).parent / "claude_auth.json"

LANG_NAMES = {
    "ar": "Arabic",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
}


# ── Prompt construction ────────────────────────────────────────────────────────


def build_prompt(places: list[dict[str, Any]], target_langs: list[str]) -> str:
    lang_list = ", ".join(f"{LANG_NAMES.get(lc, lc)} ({lc})" for lc in target_langs)
    lang_keys = ", ".join(f'"{lc}"' for lc in target_langs)

    example_langs = {lc: {"name": "...", "description": "..."} for lc in target_langs}
    example = json.dumps(
        [{"entity_code": "plc_example", **example_langs}],
        ensure_ascii=False,
        indent=2,
    )

    places_json = json.dumps(
        [{"entity_code": p["entity_code"], **p["fields"]} for p in places],
        ensure_ascii=False,
        indent=2,
    )

    return f"""You are translating UI content for "SoulStep" — a sacred sites discovery app (mosques, temples, churches, shrines, mandirs, gurudwaras, etc.).

Translate the place fields below into: {lang_list}.

Rules:
- Keep names and addresses concise and accurate
- Use culturally appropriate religious terminology
- Preserve any {{placeholder}} tokens exactly as-is
- Only translate fields that are present in each place object
- Return ONLY valid JSON, no explanation

Required format:
```json
{example}
```

The JSON array must have exactly one object per input place, using the same entity_code.
Each object must have keys: {lang_keys} — each value is an object mapping field names to translated strings.

Places to translate:
```json
{places_json}
```"""


# ── JSON extraction ────────────────────────────────────────────────────────────


def extract_json(text: str) -> list[dict[str, Any]]:
    """Extract the first JSON array from Claude's response text."""
    # Try fenced code block first
    m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    # Fall back to first bare array
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        raise ValueError("No JSON array found in response")
    return json.loads(m.group(0))


# ── Auth ──────────────────────────────────────────────────────────────────────


async def ensure_auth(playwright: Any) -> tuple[Any, Any]:
    """Return (browser, context), opening a headed browser for first-time login if needed."""
    headless = AUTH_FILE.exists()
    browser = await playwright.chromium.launch(headless=headless)

    if headless:
        ctx = await browser.new_context(storage_state=str(AUTH_FILE))
        page = await ctx.new_page()
        await page.goto("https://claude.ai")
        await page.wait_for_load_state("domcontentloaded")
        if "login" in page.url or "onboarding" in page.url:
            print("⚠ Session expired — delete claude_auth.json and re-run to login again.")
            await browser.close()
            sys.exit(1)
        await page.close()
        print("✓ Loaded existing Claude.ai session (headless).")
    else:
        ctx = await browser.new_context()
        page = await ctx.new_page()
        await page.goto("https://claude.ai/login")
        print("\nA browser window has opened. Complete login, then press Enter here...")
        input()
        await ctx.storage_state(path=str(AUTH_FILE))
        await page.close()
        print(f"✓ Session saved to {AUTH_FILE}.")

    return browser, ctx


# ── Claude.ai interaction ─────────────────────────────────────────────────────


async def translate_batch(ctx: Any, prompt: str) -> list[dict[str, Any]]:
    """Send one prompt to claude.ai/new and return the parsed JSON response."""
    page = await ctx.new_page()
    try:
        await page.goto("https://claude.ai/new")
        await page.wait_for_selector('[contenteditable="true"]', timeout=20000)

        # Fill the prompt
        editor = page.locator('[contenteditable="true"]').first
        await editor.click()
        await editor.fill(prompt)
        await page.keyboard.press("Enter")

        # Wait for streaming to finish (send button re-enables)
        await page.wait_for_selector(
            '[aria-label="Send message"]:not([disabled])',
            timeout=180000,
        )

        # Grab the last assistant message
        messages = await page.locator('[data-testid="claude-message"]').all()
        if not messages:
            raise ValueError("No assistant message found in response")
        raw_text = await messages[-1].inner_text()
        return extract_json(raw_text)
    finally:
        await page.close()


# ── Output flattening ─────────────────────────────────────────────────────────


def flatten_response(
    batch_response: list[dict[str, Any]],
    source_places: list[dict[str, Any]],
    target_langs: list[str],
) -> list[dict[str, Any]]:
    """Convert Claude's grouped response to flat BulkUpsertItem dicts."""
    # Build lookup: entity_code -> response entry
    by_code: dict[str, dict[str, Any]] = {r["entity_code"]: r for r in batch_response}
    flat: list[dict[str, Any]] = []

    for place in source_places:
        code = place["entity_code"]
        resp = by_code.get(code)
        if not resp:
            print(f"  ⚠ No response for {code} ({place.get('place_name', '')})")
            continue

        for lang in target_langs:
            lang_data = resp.get(lang, {})
            for field, text in lang_data.items():
                if text and isinstance(text, str):
                    flat.append(
                        {
                            "entity_type": place["entity_type"],
                            "entity_code": code,
                            "field": field,
                            "lang": lang,
                            "translated_text": text,
                            "source": "claude_ai",
                        }
                    )
    return flat


# ── Main ──────────────────────────────────────────────────────────────────────


async def run(args: argparse.Namespace) -> None:
    if args.reset_auth:
        if AUTH_FILE.exists():
            AUTH_FILE.unlink()
            print(f"Deleted {AUTH_FILE}. Next run will prompt for login.")
        else:
            print("No auth file found.")
        return

    # Load input
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        sys.exit(1)

    places: list[dict[str, Any]] = json.loads(input_path.read_text())
    if not places:
        print("Input file is empty — nothing to translate.")
        return

    # Filter langs
    target_langs: list[str] = args.langs or list(LANG_NAMES.keys())

    # Filter places to only those with missing langs in our target set
    work_items = [p for p in places if any(lc in p.get("missing_langs", []) for lc in target_langs)]
    print(f"Places to translate: {len(work_items)} (of {len(places)} total)")

    if not work_items:
        print("Nothing to translate for the selected languages.")
        return

    # Chunk into batches
    batch_size: int = args.batch_size
    batches: list[list[dict[str, Any]]] = [
        work_items[i : i + batch_size] for i in range(0, len(work_items), batch_size)
    ]
    print(f"Batches: {len(batches)} × up to {batch_size} places each")

    if args.dry_run:
        print("\n── DRY RUN — Prompts (first batch only) ──────────────────────────")
        print(build_prompt(batches[0], target_langs))
        return

    all_flat: list[dict[str, Any]] = []
    sem = asyncio.Semaphore(args.concurrency)

    from playwright.async_api import async_playwright  # noqa: PLC0415

    async with async_playwright() as pw:
        browser, ctx = await ensure_auth(pw)

        async def process_batch(idx: int, batch: list[dict[str, Any]]) -> None:
            async with sem:
                print(f"\n[Batch {idx + 1}/{len(batches)}] Translating {len(batch)} places…")
                prompt = build_prompt(batch, target_langs)
                try:
                    resp = await translate_batch(ctx, prompt)
                    flat = flatten_response(resp, batch, target_langs)
                    all_flat.extend(flat)
                    print(f"  ✓ {len(flat)} translation records from batch {idx + 1}")
                except Exception as exc:  # noqa: BLE001
                    print(f"  ✗ Batch {idx + 1} failed: {exc}")

        tasks = [process_batch(i, b) for i, b in enumerate(batches)]
        await asyncio.gather(*tasks)
        await browser.close()

    # Write output
    output_path = Path(args.output)
    output_path.write_text(json.dumps(all_flat, ensure_ascii=False, indent=2))
    print(f"\n✓ Wrote {len(all_flat)} records to {output_path}")
    print("Upload this file via the admin UI → Bulk Translations → Upload translated (JSON)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Translate SoulStep place content via Claude.ai browser automation."
    )
    parser.add_argument("--input", "-i", default="untranslated.json", help="Input JSON file")
    parser.add_argument("--output", "-o", default="translated.json", help="Output JSON file")
    parser.add_argument(
        "--langs",
        nargs="+",
        default=None,
        help="Target language codes (default: ar hi te ml)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5,
        help="Places per Claude.ai request (default: 5)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="Parallel browser contexts (default: 2, max recommended: 4)",
    )
    parser.add_argument(
        "--reset-auth",
        action="store_true",
        help="Delete saved session file to force re-login",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print prompts without opening browser",
    )
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
