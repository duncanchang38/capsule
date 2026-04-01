import sqlite3
import json
import logging
from pathlib import Path
from typing import Any

from app.agents.classifier import ClassificationResult

logger = logging.getLogger(__name__)

# Absolute path — safe regardless of CWD when uvicorn starts
DB_PATH = Path(__file__).parent.parent.parent / "data" / "capsule.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    """Create the captures table if it doesn't exist. Idempotent."""
    try:
        with _connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS captures (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    bucket      TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    summary     TEXT NOT NULL,
                    metadata    TEXT NOT NULL,
                    status      TEXT DEFAULT 'active',
                    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
    except Exception as e:
        raise RuntimeError(f"Failed to initialize database at {DB_PATH}: {e}") from e


def save_capture(result: ClassificationResult, original_text: str) -> int:
    """Persist a classified capture. Returns the new row id."""
    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO captures (bucket, content, summary, metadata)
            VALUES (?, ?, ?, ?)
            """,
            (
                result.bucket,
                original_text,
                result.summary,
                json.dumps(result.metadata.model_dump()),
            ),
        )
        conn.commit()
        return cur.lastrowid


def get_recent(bucket: str, limit: int = 20) -> list[dict[str, Any]]:
    """Return the most recent `limit` captures for a bucket, newest first."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, bucket, content, summary, metadata, status, created_at, updated_at
            FROM captures
            WHERE bucket = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (bucket, limit),
        ).fetchall()
    return [dict(r) for r in rows]
