from __future__ import annotations

from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _normalize_sqlite_url(url: str) -> str:
    if not url.startswith("sqlite:///"):
        return url
    db_path = url.replace("sqlite:///", "", 1)
    if db_path.startswith("./"):
        api_root = Path(__file__).resolve().parents[2]
        absolute = api_root / db_path[2:]
        absolute.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{absolute.as_posix()}"
    return url


settings = get_settings()
engine = create_engine(
    _normalize_sqlite_url(settings.database.url),
    connect_args={"check_same_thread": False} if settings.database.url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
