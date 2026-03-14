"""Quick smoke test for browser_translation: translate a sample string to all 5 languages."""

import asyncio
import logging
import os
import sys

# Make sure the app module is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Show all debug logs from the module
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)

from app.services.browser_translation import shutdown_pool, translate_single_browser  # noqa: E402

SAMPLE = "Holy site located in the heart of the city, visited by thousands of pilgrims each year."
LANGUAGES = {
    "ar": "Arabic",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
}


async def main() -> None:
    print(f"\nSource (en): {SAMPLE}\n")
    print("=" * 70)

    for lang_code, lang_name in LANGUAGES.items():
        print(f"\n[{lang_name} ({lang_code})] translating…")
        result = await translate_single_browser(SAMPLE, target_lang=lang_code, source_lang="en")
        if result:
            print(f"  ✓ {result}")
        else:
            print("  ✗ FAILED (returned None)")

    print("\n" + "=" * 70)
    print("Done.")
    await shutdown_pool()


asyncio.run(main())
