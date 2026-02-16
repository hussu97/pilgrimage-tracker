import os
from typing import Annotated
from fastapi import Depends
from sqlmodel import create_engine, SQLModel, Session

# Use DATABASE_URL from environment or fallback to local sqlite
sqlite_file_name = "pilgrimage.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
database_url = os.environ.get("DATABASE_URL", sqlite_url)

# connect_args={"check_same_thread": False} is required for SQLite
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

# Connection pool configuration
pool_config = {}
if not database_url.startswith("sqlite"):
    # For PostgreSQL/MySQL, configure connection pool
    pool_config = {
        "pool_size": 20,        # Increase from default 5
        "max_overflow": 30,     # Increase from default 10
        "pool_timeout": 30,     # Timeout in seconds
        "pool_recycle": 3600,   # Recycle connections after 1 hour
        "pool_pre_ping": True,  # Verify connections before using
    }

engine = create_engine(
    database_url,
    echo=False,
    connect_args=connect_args,
    **pool_config
)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_db_session():
    """Dependency for database session management.

    Creates one database session per HTTP request and automatically
    closes it when the request completes. This prevents connection
    pool exhaustion by reusing a single session throughout the request.
    """
    with Session(engine) as session:
        yield session

# Type alias for FastAPI dependency injection
# Usage: def my_endpoint(session: SessionDep, ...):
SessionDep = Annotated[Session, Depends(get_db_session)]
