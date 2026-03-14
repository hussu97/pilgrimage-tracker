"""translate_content_claude.py — Translate SoulStep place content via Claude.ai browser.

Reads an "untranslated" JSON export (from GET /admin/content-translations/export-untranslated),
sends batches to Claude.ai via Playwright browser automation, and writes a flat "translated"
JSON ready for POST /admin/content-translations/bulk-upsert.

Usage
-----
Manual copy-paste workflow (no browser required):
  python translate_content_claude.py --prompts-only --input untranslated.json --output translated.json
      → writes untranslated.prompts.txt with all prompts; open claude.ai, paste each one manually

  python translate_content_claude.py --interactive --input untranslated.json --output translated.json
      → prints each prompt, waits for you to paste Claude's response, saves and continues

Browser automation workflow:
  python translate_content_claude.py --input untranslated.json --output translated.json
  python translate_content_claude.py --input untranslated.json --output translated.json --langs ar hi
  python translate_content_claude.py --input untranslated.json --output translated.json --batch-size 8 --concurrency 3
  python translate_content_claude.py --input untranslated.json --output translated.json --model haiku
  python translate_content_claude.py --input untranslated.json --output translated.json --response-timeout 600
  python translate_content_claude.py --reset-auth   # delete saved session file to re-login
  python translate_content_claude.py --dry-run      # print first batch prompt, no browser

Auth
----
On first run (no claude_auth.json), a headed browser opens so you can log in.
After login, press Enter; the session is saved to claude_auth.json for subsequent headless runs.

Anti-bot notes
--------------
Cloudflare checks navigator.webdriver, headless UA, automation Chrome flags, and
interaction timing. The mitigations applied here:
  1. channel="chrome" — real Chrome binary (full plugin set, real UA, no Chromium markers)
  2. CDP override of navigator.webdriver / window.chrome / navigator.plugins
  3. --disable-blink-features=AutomationControlled launch arg
  4. Human-like typing with per-keystroke random delays
  5. Random jitter sleeps before page interactions
  6. Realistic viewport, locale, and timezone
"""

from __future__ import annotations

import argparse
import asyncio
import json
import platform
import random
import re
import sys
from pathlib import Path
from typing import Any

AUTH_FILE = Path(__file__).parent / "claude_auth.json"

# Map short model names → substring to match in the model picker dropdown
MODEL_LABELS: dict[str, str] = {
    "haiku": "Haiku",
    "sonnet": "Sonnet",
    "opus": "Opus",
}

LANG_NAMES = {
    "ar": "Arabic",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
}

# ── Stealth init script injected into every page ──────────────────────────────
# Erases the most common automation fingerprints that Cloudflare checks.
_STEALTH_JS = """
// 1. Hide webdriver property
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. Restore window.chrome (absent in vanilla Playwright/Chromium)
if (!window.chrome) {
  window.chrome = {
    app: { isInstalled: false, InstallState: {}, RunningState: {} },
    runtime: {},
    loadTimes: function() { return {}; },
    csi: function() { return {}; },
  };
}

// 3. Make plugins look non-empty (headless Chromium has 0 plugins)
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const arr = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client',      filename: 'internal-nacl-plugin',  description: '' },
    ];
    arr.item = (i) => arr[i];
    arr.namedItem = (n) => arr.find(p => p.name === n) || null;
    arr.refresh = () => {};
    return arr;
  },
});

// 4. Spoof mimeTypes length to match a real browser
Object.defineProperty(navigator, 'mimeTypes', {
  get: () => {
    const arr = [
      { type: 'application/pdf', description: 'Portable Document Format', enabledPlugin: {} },
      { type: 'application/x-google-chrome-pdf', description: 'Portable Document Format', enabledPlugin: {} },
    ];
    arr.item = (i) => arr[i];
    arr.namedItem = (n) => arr.find(m => m.type === n) || null;
    return arr;
  },
});

// 5. languages — headless defaults to [] or ['en']
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// 6. Permissions API — headless often returns 'denied' for notifications
const _origQuery = window.Permissions && window.Permissions.prototype.query;
if (_origQuery) {
  window.Permissions.prototype.query = function(params) {
    if (params && params.name === 'notifications') {
      return Promise.resolve({ state: 'default', onchange: null });
    }
    return _origQuery.call(this, params);
  };
}
"""

# ── Stealth browser launch args ───────────────────────────────────────────────
_STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-infobars",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    # Exclude the automation extension that sets navigator.webdriver
    "--exclude-switches=enable-automation",
    "--disable-extensions-except=",
]


# ── Human-like helpers ────────────────────────────────────────────────────────


async def _jitter(lo: float = 0.3, hi: float = 0.9) -> None:
    """Sleep a random duration to simulate human reaction time."""
    await asyncio.sleep(random.uniform(lo, hi))


async def _paste_text(page: Any, text: str) -> None:
    """Set clipboard content and paste — orders of magnitude faster than character typing."""
    await page.evaluate("(t) => navigator.clipboard.writeText(t)", text)
    await asyncio.sleep(0.1)
    await page.keyboard.press("ControlOrMeta+v")


# ── Prompt construction ────────────────────────────────────────────────────────


def build_prompt(items: list[dict[str, Any]], target_langs: list[str]) -> str:
    lang_list = ", ".join(f"{LANG_NAMES.get(lc, lc)} ({lc})" for lc in target_langs)
    lang_keys = ", ".join(f'"{lc}"' for lc in target_langs)

    example_langs = {lc: {"name": "...", "description": "..."} for lc in target_langs}
    example = json.dumps(
        [{"entity_code": "entity_example", **example_langs}],
        ensure_ascii=False,
        indent=2,
    )

    items_json = json.dumps(
        [
            {"entity_code": p["entity_code"], "entity_type": p["entity_type"], **p["fields"]}
            for p in items
        ],
        ensure_ascii=False,
        indent=2,
    )

    return f"""You are translating UI content for "SoulStep" — a sacred sites discovery app (mosques, temples, churches, shrines, mandirs, gurudwaras, etc.).

Translate the fields below into: {lang_list}.

Entity types may include: place (name, description, address), city (name), attribute_def (name), review (title, body).

Rules:
- Keep names and addresses concise and accurate
- Use culturally appropriate religious terminology
- For review title/body: preserve the original meaning and tone
- Preserve any {{placeholder}} tokens exactly as-is
- Only translate fields that are present in each object
- Return ONLY valid JSON, no explanation

Required format:
```json
{example}
```

The JSON array must have exactly one object per input entity, using the same entity_code.
Each object must have keys: {lang_keys} — each value is an object mapping field names to translated strings.

Entities to translate:
```json
{items_json}
```"""


# ── JSON extraction ────────────────────────────────────────────────────────────


def extract_json(text: str) -> list[dict[str, Any]]:
    """Extract the first JSON array from Claude's response text."""
    m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        raise ValueError("No JSON array found in response")
    return json.loads(m.group(0))


# ── Browser factory ───────────────────────────────────────────────────────────


async def _new_stealth_context(browser: Any, storage_state: str | None = None) -> Any:
    """Create a browser context with stealth overrides pre-applied."""
    kwargs: dict[str, Any] = {
        "viewport": {"width": 1280, "height": 800},
        "locale": "en-US",
        "timezone_id": "America/New_York",
        "java_script_enabled": True,
        "permissions": ["clipboard-read", "clipboard-write"],
    }
    if storage_state:
        kwargs["storage_state"] = storage_state

    ctx = await browser.new_context(**kwargs)
    # Inject stealth script before any page script runs
    await ctx.add_init_script(_STEALTH_JS)
    return ctx


async def _select_model(page: Any, model: str | None) -> None:
    """Click the model picker and select the requested model. No-op if model is None."""
    if not model:
        return
    label = MODEL_LABELS.get(model.lower(), model)
    try:
        # The model picker button sits near the chat input — try common selectors
        picker = page.locator('[data-testid="model-selector-trigger"]')
        if await picker.count() == 0:
            picker = (
                page.locator("button")
                .filter(has_text=re.compile(r"Claude (Haiku|Sonnet|Opus)", re.I))
                .first
            )
        await picker.click()
        await _jitter(0.3, 0.7)

        # Click the matching option in the dropdown
        option = page.locator('[role="option"]').filter(has_text=label).first
        if await option.count() == 0:
            option = page.get_by_text(label, exact=False).first
        await option.click()
        await _jitter(0.2, 0.5)
        print(f"  ✓ Model set to: Claude {label}")
    except Exception as exc:  # noqa: BLE001
        print(f"  ⚠ Could not select model '{label}': {exc} — using account default")


def _detect_chrome_profile() -> Path:
    """Return the default Chrome User Data directory for the current OS."""
    os_name = platform.system()
    if os_name == "Darwin":
        return Path.home() / "Library" / "Application Support" / "Google" / "Chrome"
    if os_name == "Linux":
        return Path.home() / ".config" / "google-chrome"
    # Windows
    return Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"


async def _launch_browser(playwright: Any, headless: bool) -> Any:
    """Launch Chrome (preferred) or fall back to Chromium with stealth args."""
    common_kwargs: dict[str, Any] = {
        "headless": headless,
        "args": _STEALTH_ARGS,
    }
    try:
        return await playwright.chromium.launch(channel="chrome", **common_kwargs)
    except Exception:  # noqa: BLE001
        print(
            "⚠ 'chrome' channel not found — falling back to Playwright Chromium.\n"
            "  Install Chrome for better anti-bot evasion: https://www.google.com/chrome/"
        )
        return await playwright.chromium.launch(**common_kwargs)


async def _connect_cdp(playwright: Any, port: int) -> tuple[Any, Any]:
    """Connect to an already-running Chrome via CDP.

    Returns (browser, context). The user must have started Chrome with:
        open -a "Google Chrome" --args --remote-debugging-port=<port>
    """
    url = f"http://127.0.0.1:{port}"
    print(f"✓ Connecting to Chrome via CDP at {url}")
    browser = await playwright.chromium.connect_over_cdp(url)
    contexts = browser.contexts
    if contexts:
        ctx = contexts[0]
        print(f"  Using existing context with {len(ctx.pages)} open page(s).")
    else:
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            permissions=["clipboard-read", "clipboard-write"],
        )
        print("  Created new browser context.")
    await ctx.add_init_script(_STEALTH_JS)
    return browser, ctx


# ── Auth ──────────────────────────────────────────────────────────────────────


async def ensure_auth(
    playwright: Any, cdp_port: int | None = None, headless: bool = False
) -> tuple[Any, Any]:
    """Return (closer, context).

    - cdp_port set  → connect to running Chrome via CDP; closer = browser
    - cdp_port None → stealth + claude_auth.json; closer = browser
    """
    if cdp_port is not None:
        browser, ctx = await _connect_cdp(playwright, cdp_port)
        print("  Verifying claude.ai login…")
        page = await ctx.new_page()
        await page.bring_to_front()
        await page.goto("https://claude.ai", timeout=30000)
        await page.wait_for_load_state("domcontentloaded", timeout=30000)
        await _jitter(1.0, 2.0)
        if "login" in page.url or "onboarding" in page.url:
            print("⚠ Not logged into claude.ai. Log in in Chrome, then re-run.")
            await browser.close()
            sys.exit(1)
        print(f"✓ Logged in. URL: {page.url}")
        await page.close()
        return browser, ctx

    # ── Stealth + cookie-file mode ─────────────────────────────────────────────
    if not headless and AUTH_FILE.exists():
        # Visible non-headless run with saved cookies
        browser = await _launch_browser(playwright, headless=False)
        ctx = await _new_stealth_context(browser, storage_state=str(AUTH_FILE))
        page = await ctx.new_page()
        await page.bring_to_front()
        await page.goto("https://claude.ai")
        await page.wait_for_load_state("domcontentloaded")
        if "login" in page.url or "onboarding" in page.url:
            print("⚠ Session expired — delete claude_auth.json and re-run to login again.")
            await browser.close()
            sys.exit(1)
        await page.close()
        print("✓ Loaded existing Claude.ai session (visible, stealth).")
        return browser, ctx

    if headless and AUTH_FILE.exists():
        browser = await _launch_browser(playwright, headless=True)
        ctx = await _new_stealth_context(browser, storage_state=str(AUTH_FILE))
        page = await ctx.new_page()
        await page.goto("https://claude.ai")
        await page.wait_for_load_state("domcontentloaded")
        if "login" in page.url or "onboarding" in page.url:
            print("⚠ Session expired — delete claude_auth.json and re-run to login again.")
            await browser.close()
            sys.exit(1)
        await page.close()
        print("✓ Loaded existing Claude.ai session (headless + stealth).")
        return browser, ctx

    # No auth file — open browser for first-time login
    browser = await _launch_browser(playwright, headless=False)
    ctx = await _new_stealth_context(browser)
    page = await ctx.new_page()
    await page.bring_to_front()
    await page.goto("https://claude.ai/login")
    print("\nA browser window has opened. Complete login, then press Enter here...")
    input()
    await ctx.storage_state(path=str(AUTH_FILE))
    await page.close()
    print(f"✓ Session saved to {AUTH_FILE}.")
    return browser, ctx


# ── Claude.ai interaction ─────────────────────────────────────────────────────


async def translate_batch(
    ctx: Any,
    prompt: str,
    batch_label: str = "",
    model: str | None = None,
    response_timeout: int = 300000,
) -> list[dict[str, Any]]:
    """Send one prompt to claude.ai/new and return the parsed JSON response."""
    tag = f"[{batch_label}]" if batch_label else ""
    print(f"  {tag} Opening new tab → https://claude.ai/new")
    page = await ctx.new_page()
    try:
        await page.bring_to_front()
        await page.goto("https://claude.ai/new")
        print(f"  {tag} Waiting for page load (domcontentloaded)…")
        # domcontentloaded is more reliable than networkidle (claude.ai has persistent WS)
        await page.wait_for_load_state("domcontentloaded", timeout=30000)
        print(f"  {tag} Page loaded. URL: {page.url}")
        await _jitter(0.8, 1.8)  # let Cloudflare challenge resolve

        print(f"  {tag} Waiting for editor… (URL: {page.url})")
        # Try multiple selectors in order — claude.ai occasionally changes its markup
        _editor_selectors = [
            '[contenteditable="true"]',
            '[role="textbox"]',
            "div[contenteditable]",
            "textarea",
        ]
        editor_sel: str | None = None
        for sel in _editor_selectors:
            try:
                await page.wait_for_selector(sel, timeout=10000)
                editor_sel = sel
                print(f"  {tag} Editor found with selector: {sel!r}")
                break
            except Exception:
                print(f"  {tag} Selector {sel!r} not found, trying next…")
        if editor_sel is None:
            screenshot_path = (
                Path(__file__).parent / f"debug_batch_{batch_label.replace('/', '-')}.png"
            )
            await page.screenshot(path=str(screenshot_path))
            print(f"  {tag} ✗ No editor found. Screenshot saved to {screenshot_path}")
            print(f"  {tag} Page title: {await page.title()!r}  URL: {page.url!r}")
            raise TimeoutError(
                "Could not find a text editor on the page — see screenshot for what rendered"
            )
        await _jitter(0.4, 1.0)

        # Select model before typing (picker is near the input area)
        await _select_model(page, model)

        editor = page.locator(editor_sel).first
        await editor.hover()
        await _jitter(0.2, 0.5)
        await editor.click()
        await _jitter(0.1, 0.3)

        print(f"  {tag} Pasting prompt ({len(prompt)} chars)…")
        # Paste via clipboard — avoids the multi-minute char-by-char typing timeout
        await _paste_text(page, prompt)
        await _jitter(0.3, 0.7)

        print(f"  {tag} Sending message…")
        await page.keyboard.press("Enter")

        print(
            f"  {tag} Waiting for Claude to finish streaming (timeout: {response_timeout // 1000}s)…"
        )
        # Wait for streaming to finish (send button re-enables when Claude is done)
        await page.wait_for_selector(
            '[aria-label="Send message"]:not([disabled])',
            timeout=response_timeout,
        )
        print(f"  {tag} Response received.")
        await _jitter(0.3, 0.6)

        messages = await page.locator('[data-testid="claude-message"]').all()
        print(f"  {tag} Found {len(messages)} assistant message(s).")
        if not messages:
            raise ValueError("No assistant message found in response")
        raw_text = await messages[-1].inner_text()
        print(f"  {tag} Raw response length: {len(raw_text)} chars. Extracting JSON…")
        result = extract_json(raw_text)
        print(f"  {tag} JSON parsed: {len(result)} place(s).")
        return result
    finally:
        print(f"  {tag} Closing tab.")
        await page.close()


# ── Output flattening ─────────────────────────────────────────────────────────


def flatten_response(
    batch_response: list[dict[str, Any]],
    source_items: list[dict[str, Any]],
    target_langs: list[str],
) -> list[dict[str, Any]]:
    """Convert Claude's grouped response to flat BulkUpsertItem dicts."""
    by_code: dict[str, dict[str, Any]] = {r["entity_code"]: r for r in batch_response}
    flat: list[dict[str, Any]] = []

    for item in source_items:
        code = item["entity_code"]
        resp = by_code.get(code)
        if not resp:
            print(f"  ⚠ No response for {code} ({item.get('place_name', '')})")
            continue

        for lang in target_langs:
            lang_data = resp.get(lang, {})
            for field, text in lang_data.items():
                if text and isinstance(text, str):
                    flat.append(
                        {
                            "entity_type": item["entity_type"],
                            "entity_code": code,
                            "field": field,
                            "lang": lang,
                            "translated_text": text,
                            "source": "claude_ai",
                        }
                    )
    return flat


# ── Manual copy-paste modes ───────────────────────────────────────────────────

_DIVIDER = "=" * 72


def _write_prompts(
    batches: list[list[dict[str, Any]]],
    target_langs: list[str],
    output: str,
) -> None:
    """Write all batch prompts to a text file for manual copy-paste into Claude.ai.

    Each batch is separated by a clear header so you know which prompt is which.
    After pasting each batch into Claude.ai, save the raw JSON responses and pass
    them to --interactive mode (or assemble them manually).
    """
    out_path = Path(output).with_suffix(".prompts.txt")
    lines: list[str] = [
        "SoulStep Translation Prompts",
        f"Batches: {len(batches)}  |  Generated by translate_content_claude.py",
        "",
        "INSTRUCTIONS",
        "------------",
        "1. Open https://claude.ai/new",
        "2. Copy each prompt block below (between the === lines) and paste it into Claude",
        "3. Copy Claude's entire response (the JSON array) and save it somewhere",
        "4. Once you have all responses, run:",
        f"   python translate_content_claude.py --interactive --input <your-export>.json --output {Path(output).name}",
        "   and paste each response when prompted.",
        "",
        _DIVIDER,
        "",
    ]

    for idx, batch in enumerate(batches):
        entity_labels = ", ".join(p.get("place_name", p["entity_code"]) for p in batch)
        lines += [
            f"BATCH {idx + 1} of {len(batches)}  ({len(batch)} entities: {entity_labels})",
            _DIVIDER,
            build_prompt(batch, target_langs),
            "",
            _DIVIDER,
            "",
        ]

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"✓ Wrote {len(batches)} prompts to {out_path}")
    print("  Open the file, copy each prompt into https://claude.ai/new, then run:")
    print(f"  python translate_content_claude.py --interactive --output {Path(output).name}")


def _read_multiline_response() -> str:
    """Read lines from stdin until the user types END on its own line."""
    print("  (paste Claude's response below, then type END on a new line and press Enter)")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "END":
            break
        lines.append(line)
    return "\n".join(lines)


def _run_interactive(
    batches: list[list[dict[str, Any]]],
    target_langs: list[str],
    output: str,
) -> None:
    """Walk through batches one at a time: print prompt → user pastes response → save."""
    output_path = Path(output)
    # Load existing results so a partial run can be resumed
    all_flat: list[dict[str, Any]] = []
    if output_path.exists():
        try:
            all_flat = json.loads(output_path.read_text())
            print(f"Resuming — loaded {len(all_flat)} existing records from {output_path}")
        except Exception:  # noqa: BLE001
            pass

    print(f"\n{_DIVIDER}")
    print(f"Interactive mode — {len(batches)} batch(es) to process")
    print(f"{_DIVIDER}\n")

    for idx, batch in enumerate(batches):
        entity_labels = ", ".join(p.get("place_name", p["entity_code"]) for p in batch)
        print(f"\n{'─' * 72}")
        print(f"BATCH {idx + 1}/{len(batches)}  ({len(batch)} entities: {entity_labels})")
        print(f"{'─' * 72}\n")
        print("── PROMPT (copy everything between the markers) ──────────────────────")
        print(">>>START<<<")
        print(build_prompt(batch, target_langs))
        print(">>>END<<<")
        print()

        while True:
            raw = _read_multiline_response()
            if not raw.strip():
                skip = input("  Empty response — skip this batch? [y/N] ").strip().lower()
                if skip == "y":
                    print(f"  Skipped batch {idx + 1}.")
                    break
                continue
            try:
                parsed = extract_json(raw)
                flat = flatten_response(parsed, batch, target_langs)
                all_flat.extend(flat)
                # Save after every batch so progress isn't lost
                output_path.write_text(json.dumps(all_flat, ensure_ascii=False, indent=2))
                print(f"  ✓ {len(flat)} records saved ({len(all_flat)} total so far)")
                break
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗ Could not parse response: {exc}")
                retry = input("  Try again? [Y/n] ").strip().lower()
                if retry == "n":
                    print(f"  Skipped batch {idx + 1}.")
                    break

    print(f"\n{_DIVIDER}")
    print(f"✓ Done — {len(all_flat)} total records written to {output_path}")
    print("Upload this file via the admin UI → Bulk Translations → Upload translated (JSON)")


# ── Main ──────────────────────────────────────────────────────────────────────


async def run(args: argparse.Namespace) -> None:
    if args.reset_auth:
        if AUTH_FILE.exists():
            AUTH_FILE.unlink()
            print(f"Deleted {AUTH_FILE}. Next run will prompt for login.")
        else:
            print("No auth file found.")
        return

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        sys.exit(1)

    items: list[dict[str, Any]] = json.loads(input_path.read_text())
    if not items:
        print("Input file is empty — nothing to translate.")
        return

    target_langs: list[str] = args.langs or list(LANG_NAMES.keys())

    work_items = [p for p in items if any(lc in p.get("missing_langs", []) for lc in target_langs)]
    print(f"Entities to translate: {len(work_items)} (of {len(items)} total)")

    if not work_items:
        print("Nothing to translate for the selected languages.")
        return

    batch_size: int = args.batch_size
    batches: list[list[dict[str, Any]]] = [
        work_items[i : i + batch_size] for i in range(0, len(work_items), batch_size)
    ]
    print(f"Batches: {len(batches)} × up to {batch_size} entities each")

    if args.prompts_only:
        _write_prompts(batches, target_langs, args.output)
        return

    if args.interactive:
        _run_interactive(batches, target_langs, args.output)
        return

    if args.dry_run:
        print("\n── DRY RUN — Prompts (first batch only) ──────────────────────────")
        print(build_prompt(batches[0], target_langs))
        return

    all_flat: list[dict[str, Any]] = []
    sem = asyncio.Semaphore(args.concurrency)

    from playwright.async_api import async_playwright  # noqa: PLC0415

    print(f"\n{'═' * 60}")
    print(f"Model:       {args.model or 'account default'}")
    print(f"Concurrency: {args.concurrency} tab(s) at a time")
    print(f"Timeout:     {args.response_timeout}s per batch")
    print(f"Batch size:  {batch_size} entity/entities")
    print(f"Total:       {len(batches)} batch(es), {len(work_items)} entity/entities")
    print(f"{'═' * 60}\n")

    cdp_port: int | None = args.cdp if args.cdp else None

    async with async_playwright() as pw:
        closer, ctx = await ensure_auth(pw, cdp_port=cdp_port, headless=args.headless)

        async def process_batch(idx: int, batch: list[dict[str, Any]]) -> None:
            label = f"Batch {idx + 1}/{len(batches)}"
            async with sem:
                entity_labels = ", ".join(p.get("place_name", p["entity_code"]) for p in batch)
                print(f"\n{'─' * 60}")
                print(f"[{label}] Starting — {len(batch)} entity/entities: {entity_labels}")
                print(f"[{label}] Languages: {', '.join(target_langs)}")
                # Stagger concurrent batches so they don't all hit Claude at the same instant
                if idx > 0:
                    delay = idx * random.uniform(0.5, 1.5)
                    print(f"[{label}] Stagger delay: {delay:.1f}s…")
                    await asyncio.sleep(delay)
                prompt = build_prompt(batch, target_langs)
                print(f"[{label}] Prompt size: {len(prompt)} chars")
                try:
                    resp = await translate_batch(
                        ctx,
                        prompt,
                        batch_label=label,
                        model=args.model,
                        response_timeout=args.response_timeout * 1000,
                    )
                    flat = flatten_response(resp, batch, target_langs)
                    all_flat.extend(flat)
                    print(
                        f"[{label}] ✓ Done — {len(flat)} translation records (total so far: {len(all_flat)})"
                    )
                except Exception as exc:  # noqa: BLE001
                    print(f"[{label}] ✗ Failed: {exc}")

        tasks = [process_batch(i, b) for i, b in enumerate(batches)]
        await asyncio.gather(*tasks)
        await closer.close()

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
        default=1,
        help="Parallel tabs/batches (default: 1 = sequential, safe; max recommended: 3)",
    )
    parser.add_argument(
        "--prompts-only",
        action="store_true",
        help="Write all prompts to <output>.prompts.txt for manual copy-paste — no browser",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Print each prompt, wait for you to paste Claude's response, then save and continue",
    )
    parser.add_argument(
        "--reset-auth",
        action="store_true",
        help="Delete saved session file to force re-login",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print first batch prompt only, no browser",
    )
    parser.add_argument(
        "--model",
        "-m",
        default=None,
        help="Model to use: haiku, sonnet, opus (default: account default)",
    )
    parser.add_argument(
        "--response-timeout",
        type=int,
        default=300,
        help="Seconds to wait for Claude's response per batch (default: 300)",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=False,
        help="Run browser in headless mode (default: visible — more reliable against bot detection)",
    )
    parser.add_argument(
        "--cdp",
        type=int,
        default=None,
        metavar="PORT",
        help=(
            "Connect to an already-running Chrome via CDP (bypasses Cloudflare). "
            "Start Chrome first: open -a 'Google Chrome' --args --remote-debugging-port=9222 "
            "Then pass --cdp 9222"
        ),
    )
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
