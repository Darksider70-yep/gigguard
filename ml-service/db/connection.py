"""Database engine and session management for the ML service."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required for db/connection.py")


def _create_engine(database_url: str) -> Engine:
    """Create SQLAlchemy engine with production pool settings."""
    try:
        return create_engine(
            database_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            future=True,
        )
    except TypeError:
        # Some test URLs (for example sqlite) do not support pool options.
        return create_engine(database_url, pool_pre_ping=True, future=True)


ENGINE: Engine = _create_engine(DATABASE_URL)
SessionLocal = sessionmaker(
    bind=ENGINE,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


def _validate_connection() -> None:
    """Verify that the database is reachable when this module is imported."""
    try:
        with ENGINE.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise RuntimeError(
            f"Database connection check failed for DATABASE_URL='{DATABASE_URL}'. "
            f"Original error: {exc}"
        ) from exc


_validate_connection()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Yield a managed SQLAlchemy session with commit/rollback semantics."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

