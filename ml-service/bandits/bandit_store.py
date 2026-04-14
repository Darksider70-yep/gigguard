"""PostgreSQL-backed persistence for contextual bandit state."""

from __future__ import annotations

import atexit
import logging
from typing import Any, Callable, Dict, Optional

import psycopg2
from psycopg2.extras import Json


LOGGER = logging.getLogger(__name__)


class BanditStateStore:
    """Persist bandit state in a single JSONB row."""

    def __init__(
        self,
        database_url: str,
        state_provider: Callable[[], Dict[str, Any]],
        autosave_every: int = 50,
    ) -> None:
        """Initialize store and register force-save shutdown hook."""
        self.database_url = database_url
        self.state_provider = state_provider
        self.autosave_every = autosave_every
        self._pending_updates = 0
        self._dirty = False
        self._is_sqlite = database_url.startswith("sqlite")
        self._ensure_table()
        atexit.register(self.force_save)

    def _connect(self):
        """Get connection from the central pool."""
        if self._is_sqlite:
            import sqlite3
            sqlite_path = self.database_url.replace("sqlite+pysqlite:///", "")
            sqlite_path = sqlite_path if sqlite_path else ":memory:"
            return sqlite3.connect(sqlite_path)
            
        from db.connection import connection_pool
        return connection_pool.getconn()

    def _release(self, conn):
        """Release connection back to the pool."""
        if self._is_sqlite:
            conn.close()
            return
            
        from db.connection import connection_pool
        connection_pool.putconn(conn)

    def _ensure_table(self) -> None:
        """Create table only for sqlite test databases."""
        if not self._is_sqlite:
            return

        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS bandit_state (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    state TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.commit()
        finally:
            self._release(connection)

    def load(self) -> Dict[str, Any]:
        """Load persisted state from bandit_state table."""
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT state FROM bandit_state WHERE id = 1")
            row = cursor.fetchone()
            if not row:
                return {}
            state = row[0]
            if self._is_sqlite:
                import json

                return json.loads(state) if state else {}
            return state if isinstance(state, dict) else {}
        except Exception:
            return {}
        finally:
            self._release(connection)

    def load_bandit_state(self) -> Dict[str, Any]:
        """Compatibility alias for loading bandit state."""
        return self.load()

    def save(self, state: Dict[str, Any]) -> None:
        """Persist provided state using atomic upsert."""
        connection = self._connect()
        try:
            cursor = connection.cursor()
            if self._is_sqlite:
                import json

                payload = json.dumps(state)
                cursor.execute(
                    """
                    INSERT INTO bandit_state (id, state, updated_at)
                    VALUES (1, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id)
                    DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP
                    """,
                    (payload,),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO bandit_state (id, state)
                    VALUES (1, %s)
                    ON CONFLICT (id)
                    DO UPDATE SET state = %s, updated_at = NOW()
                    """,
                    (Json(state), Json(state)),
                )
            connection.commit()
        finally:
            self._release(connection)
        self._pending_updates = 0
        self._dirty = False

    def save_bandit_state(self, state: Dict[str, Any]) -> None:
        """Compatibility alias for saving bandit state."""
        self.save(state)

    def record_update(self) -> None:
        """Track update count and autosave every configured threshold."""
        self._pending_updates += 1
        self._dirty = True
        if self._pending_updates >= self.autosave_every:
            try:
                self.save(self.state_provider())
            except Exception as exc:  # pragma: no cover - defensive operational path
                LOGGER.warning("Bandit autosave failed: %s", exc)

    def force_save(self) -> None:
        """Force-save state on shutdown if there are unsaved updates."""
        if not self._dirty:
            return
        try:
            self.save(self.state_provider())
        except Exception as exc:  # pragma: no cover - defensive shutdown path
            LOGGER.warning("Bandit force-save failed: %s", exc)
