import sqlite3
import json
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "data" / "capsule.db"


def init():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS captures (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            capture_type    TEXT NOT NULL,
            completion_type TEXT NOT NULL,
            content         TEXT NOT NULL,
            summary         TEXT NOT NULL,
            metadata        TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'active',
            deadline        TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def save_capture(
    capture_type: str,
    completion_type: str,
    content: str,
    summary: str,
    metadata: dict,
    deadline: str | None = None,
) -> int:
    conn = _connect()
    cur = conn.execute(
        """
        INSERT INTO captures (capture_type, completion_type, content, summary, metadata, deadline)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (capture_type, completion_type, content, summary, json.dumps(metadata), deadline),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def update_status(capture_id: int, status: str) -> None:
    conn = _connect()
    conn.execute(
        "UPDATE captures SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (status, capture_id),
    )
    conn.commit()
    conn.close()


def get_recent(limit: int = 20) -> list[dict]:
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM captures ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    if "metadata" in d:
        d["metadata"] = json.loads(d["metadata"])
    return d
