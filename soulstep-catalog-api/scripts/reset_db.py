"""
Reset the server database and optionally seed demo data.

Usage (from the server/ directory with .venv active):

  # Reset DB + seed only reference data (languages, translations, attribute definitions)
  python scripts/reset_db.py

  # Reset DB + seed reference data AND demo data (places, users, groups, etc.)
  python scripts/reset_db.py --with-demo-data

The script always:
  1. Drops all tables
  2. Runs Alembic migrations to recreate the schema
  3. Seeds reference/system data (languages, translations, attribute definitions)

With --with-demo-data it additionally seeds:
  - Places and place images
  - Users and user settings
  - Groups and group members
  - Notifications
  - Password reset tokens
"""

import argparse
import sys
from pathlib import Path

# Allow running as `python scripts/reset_db.py` from the server/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import SQLModel

from app.db.seed import run_seed_demo, run_seed_system
from app.db.session import engine, run_migrations


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset the database and optionally seed demo data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--with-demo-data",
        action="store_true",
        help=(
            "Also seed demo data: places, users, groups, notifications, etc. "
            "Default: seed reference data only."
        ),
    )
    args = parser.parse_args()

    print("Dropping all tables...")
    SQLModel.metadata.drop_all(engine)

    print("Running migrations...")
    run_migrations()

    print("Seeding reference data (languages, translations, attribute definitions)...")
    run_seed_system()

    if args.with_demo_data:
        print("Seeding demo data (places, users, groups, notifications)...")
        run_seed_demo()
        print("Done. Reference data + demo data loaded.")
    else:
        print("Done. Reference data only (no places, users, or groups seeded).")
        print("Run with --with-demo-data to also load demo records.")


if __name__ == "__main__":
    main()
