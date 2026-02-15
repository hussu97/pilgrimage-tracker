import os
from sqlmodel import create_engine, SQLModel, Session

# Use DATABASE_URL from environment or fallback to local sqlite
sqlite_file_name = "pilgrimage.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
database_url = os.environ.get("DATABASE_URL", sqlite_url)

# connect_args={"check_same_thread": False} is required for SQLite
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

engine = create_engine(database_url, echo=False, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
