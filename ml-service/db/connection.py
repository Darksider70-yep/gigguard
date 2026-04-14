"""Database engine and session management for the ML service."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
import psycopg2
from psycopg2 import pool as pg_pool

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required for db/connection.py")


def _create_engine(database_url: str) -> Engine:
    """Create SQLAlchemy engine with production pool settings."""
    connect_args = {}
    if os.environ.get("PYTHON_ENV") == 'production':
        connect_args["sslmode"] = "require"

    try:
        return create_engine(
            database_url,
            pool_size=5,
            max_overflow=0, # Stick to the 5 limit
            pool_pre_ping=True,
            future=True,
            connect_args=connect_args
        )
    except TypeError:
        # Some test URLs (for example sqlite) do not support pool options.
        return create_engine(database_url, pool_pre_ping=True, future=True)


# Psycopg2 raw connection pool for bandit store etc.
connection_pool = pg_pool.ThreadedConnectionPool(
    minconn=1, maxconn=5,
    dsn=DATABASE_URL,
    sslmode='require' if os.environ.get('PYTHON_ENV') == 'production' else 'prefer'
)


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

