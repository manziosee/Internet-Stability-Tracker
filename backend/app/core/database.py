from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool

from .config import settings
from . import turso_dbapi


def _create_connection():
    """Factory called by SQLAlchemy's StaticPool to get a Turso connection."""
    return turso_dbapi.connect(
        url=settings.TURSO_DB_URL,
        auth_token=settings.TURSO_AUTH_TOKEN,
    )


# Use the SQLite dialect for SQL generation (libSQL is SQLite-compatible).
# The actual transport is our pure-Python Turso HTTP adapter.
engine = create_engine(
    "sqlite+pysqlite://",
    creator=_create_connection,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
