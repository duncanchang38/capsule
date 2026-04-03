import sqlite3
import json
import os
from pathlib import Path

_default_db = Path(__file__).parent.parent.parent / "data" / "capsule.db"
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(_default_db)))


def init():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = _connect()

    # Check columns; migrate if needed
    cols = {row[1] for row in conn.execute("PRAGMA table_info(captures)").fetchall()}
    if cols and "user_id" not in cols:
        conn.execute("DROP TABLE captures")
        conn.commit()
        cols = set()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS captures (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL DEFAULT 'default',
            capture_type    TEXT NOT NULL,
            completion_type TEXT NOT NULL,
            content         TEXT NOT NULL,
            summary         TEXT NOT NULL,
            metadata        TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'active',
            deadline        TEXT,
            notes           TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Add notes column to existing tables that don't have it
    if cols and "notes" not in cols:
        conn.execute("ALTER TABLE captures ADD COLUMN notes TEXT")
    conn.commit()
    conn.close()


def save_capture(
    capture_type: str,
    completion_type: str,
    content: str,
    summary: str,
    metadata: dict,
    deadline: str | None = None,
    user_id: str = "default",
) -> int:
    conn = _connect()
    cur = conn.execute(
        """
        INSERT INTO captures (user_id, capture_type, completion_type, content, summary, metadata, deadline)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, capture_type, completion_type, content, summary, json.dumps(metadata), deadline),
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


def get_capture(capture_id: int) -> dict | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def update_schedule(
    capture_id: int,
    deadline: str | None,
    time: str | None,
    duration_mins: int | None,
) -> None:
    """Update a capture's scheduled deadline and/or time/duration in metadata."""
    conn = _connect()
    if deadline is not None:
        conn.execute(
            "UPDATE captures SET deadline=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (deadline, capture_id),
        )
    metadata_updates: dict = {}
    if time is not None:
        metadata_updates["time"] = time
    if duration_mins is not None:
        metadata_updates["duration_mins"] = duration_mins
    if metadata_updates:
        row = conn.execute("SELECT metadata FROM captures WHERE id=?", (capture_id,)).fetchone()
        if row:
            current = json.loads(row["metadata"])
            conn.execute(
                "UPDATE captures SET metadata=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (json.dumps({**current, **metadata_updates}), capture_id),
            )
    conn.commit()
    conn.close()


def update_metadata(capture_id: int, metadata: dict) -> None:
    conn = _connect()
    conn.execute(
        "UPDATE captures SET metadata=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (json.dumps(metadata), capture_id),
    )
    conn.commit()
    conn.close()


def merge_metadata(capture_id: int, updates: dict) -> None:
    """Merge updates into existing metadata (non-destructive patch)."""
    conn = _connect()
    row = conn.execute("SELECT metadata FROM captures WHERE id=?", (capture_id,)).fetchone()
    if row:
        current = json.loads(row["metadata"])
        merged = {**current, **updates}
        conn.execute(
            "UPDATE captures SET metadata=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (json.dumps(merged), capture_id),
        )
        conn.commit()
    conn.close()


def get_recent(capture_type: str | None = None, limit: int = 20) -> list[dict]:
    conn = _connect()
    if capture_type is not None:
        rows = conn.execute(
            "SELECT * FROM captures WHERE capture_type=? ORDER BY created_at DESC LIMIT ?",
            (capture_type, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM captures ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_by_view(view: str) -> list[dict]:
    conn = _connect()
    if view == "todos":
        rows = conn.execute(
            """
            SELECT * FROM captures
            WHERE capture_type NOT IN ('calendar', 'inbox', 'query')
              AND status = 'active'
              AND json_extract(metadata, '$.sprint_index') IS NULL
            ORDER BY
              CASE
                WHEN deadline IS NOT NULL AND deadline < date('now') THEN 0
                WHEN deadline IS NOT NULL THEN 1
                ELSE 2
              END,
              deadline ASC,
              created_at DESC
            """
        ).fetchall()
    elif view == "calendar":
        rows = conn.execute(
            """
            SELECT * FROM captures
            WHERE deadline IS NOT NULL
              AND status = 'active'
              AND capture_type NOT IN ('inbox', 'query')
            ORDER BY deadline ASC
            """
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM captures ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def update_notes(capture_id: int, notes: str) -> None:
    conn = _connect()
    conn.execute(
        "UPDATE captures SET notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (notes, capture_id),
    )
    conn.commit()
    conn.close()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    if "metadata" in d:
        d["metadata"] = json.loads(d["metadata"])
    return d
