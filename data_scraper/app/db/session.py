import os
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

# SCRAPER_DB_PATH lets you relocate the SQLite file to a persistent volume.
# Default: scraper.db in the working directory (fine for local dev).
# Production: set to /data/scraper.db and mount a volume at /data.
_db_path = os.environ.get("SCRAPER_DB_PATH", "scraper.db")
sqlite_url = f"sqlite:///{_db_path}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=False, connect_args=connect_args)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_db_session():
    """Dependency for database session management.

    Creates one database session per HTTP request and automatically
    closes it when the request completes.
    """
    with Session(engine) as session:
        yield session


# Type alias for FastAPI dependency injection
# Usage: def my_endpoint(session: SessionDep, ...):
SessionDep = Annotated[Session, Depends(get_db_session)]
