"""Create or promote a user to admin.

Usage (from the server/ directory with .venv active):

  # Create a new admin user
  python scripts/create_admin.py --email admin@example.com --password AdminPass1 --display-name "Admin"

  # Promote an existing user to admin
  python scripts/create_admin.py --email existing@example.com
"""

import argparse
import secrets
import string
import sys
from pathlib import Path

# Allow running as `python scripts/create_admin.py` from the server/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlmodel import Session, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.models import User, UserSettings  # noqa: E402
from app.db.session import engine, run_migrations  # noqa: E402


def _generate_user_code() -> str:
    alphabet = string.ascii_lowercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"usr_{suffix}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a new admin user or promote an existing user to admin.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--email", required=True, help="Email address of the admin user")
    parser.add_argument(
        "--password",
        default=None,
        help="Password for a new user (required if user doesn't exist)",
    )
    parser.add_argument(
        "--display-name",
        default="Admin",
        help="Display name for a new user (default: Admin)",
    )
    args = parser.parse_args()

    run_migrations()

    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == args.email)).first()

        if existing:
            if existing.is_admin:
                print(f"User '{args.email}' is already an admin. No changes made.")
            else:
                existing.is_admin = True
                session.add(existing)
                session.commit()
                print(f"Promoted existing user '{args.email}' to admin.")
        else:
            if not args.password:
                print("Error: --password is required when creating a new user.", file=sys.stderr)
                sys.exit(1)

            user_code = _generate_user_code()
            user = User(
                user_code=user_code,
                email=args.email,
                password_hash=hash_password(args.password),
                display_name=args.display_name,
                is_admin=True,
            )
            settings = UserSettings(user_code=user_code)
            session.add(user)
            session.add(settings)
            session.commit()
            print(f"Created admin user '{args.email}' with user_code '{user_code}'.")


if __name__ == "__main__":
    main()
