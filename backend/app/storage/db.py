import math
import re
import json
import os
import logging
from contextlib import contextmanager
from typing import Generator

import psycopg2
import psycopg2.pool
import psycopg2.extras

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/capsule")

# Archived captures are permanently deleted after this many days.
ARCHIVE_TTL_DAYS = 30

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


@contextmanager
def _get_conn() -> Generator[psycopg2.extensions.connection, None, None]:
    assert _pool is not None, "Call db.init() before using db functions"
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def init() -> None:
    global _pool
    if _pool is not None:
        _pool.closeall()
    _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS captures (
                    id              SERIAL PRIMARY KEY,
                    user_id         TEXT NOT NULL DEFAULT 'default',
                    capture_type    TEXT NOT NULL,
                    completion_type TEXT NOT NULL,
                    content         TEXT NOT NULL,
                    summary         TEXT NOT NULL,
                    metadata        JSONB NOT NULL DEFAULT '{}',
                    status          TEXT NOT NULL DEFAULT 'active',
                    deadline        TEXT,
                    notes           TEXT,
                    search_vector   TSVECTOR GENERATED ALWAYS AS (
                                        to_tsvector('english',
                                            coalesce(summary, '') || ' ' || coalesce(content, ''))
                                    ) STORED,
                    created_at      TIMESTAMPTZ DEFAULT NOW(),
                    updated_at      TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_captures_fts ON captures USING GIN (search_vector)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_captures_status ON captures (status)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_captures_type ON captures (capture_type)"
            )
            cur.execute("""
                CREATE TABLE IF NOT EXISTS capture_entities (
                    id          SERIAL PRIMARY KEY,
                    capture_id  INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
                    entity      TEXT NOT NULL,
                    entity_type TEXT,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_ce_capture ON capture_entities(capture_id)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_ce_entity ON capture_entities(entity)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_captures_user ON captures (user_id)"
            )
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    email         TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    name          TEXT,
                    created_at    TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS llm_usage (
                    id            SERIAL PRIMARY KEY,
                    user_id       TEXT NOT NULL DEFAULT 'default',
                    agent         TEXT NOT NULL,
                    model         TEXT,
                    input_tokens  INTEGER,
                    output_tokens INTEGER,
                    cost_usd      NUMERIC(10, 6),
                    created_at    TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage (user_id)"
            )


def save_capture(
    capture_type: str,
    completion_type: str,
    content: str,
    summary: str,
    metadata: dict,
    deadline: str | None = None,
    user_id: str = "default",
    notes: str | None = None,
) -> int:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO captures
                    (user_id, capture_type, completion_type, content, summary, metadata, deadline, notes)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                RETURNING id
                """,
                (user_id, capture_type, completion_type, content, summary,
                 json.dumps(metadata), deadline, notes),
            )
            return cur.fetchone()[0]


def update_status(capture_id: int, status: str) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE captures SET status = %s, updated_at = NOW() WHERE id = %s",
                (status, capture_id),
            )


def get_capture(capture_id: int, user_id: str | None = None) -> dict | None:
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if user_id is not None:
                cur.execute(
                    "SELECT * FROM captures WHERE id = %s AND user_id = %s",
                    (capture_id, user_id),
                )
            else:
                cur.execute("SELECT * FROM captures WHERE id = %s", (capture_id,))
            row = cur.fetchone()
            return _row_to_dict(row) if row else None


def update_schedule(
    capture_id: int,
    deadline: str | None,
    time: str | None,
    duration_mins: int | None,
) -> None:
    """Update a capture's scheduled deadline and/or time/duration in metadata."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if deadline is not None:
                cur.execute(
                    "UPDATE captures SET deadline = %s, updated_at = NOW() WHERE id = %s",
                    (deadline, capture_id),
                )
            metadata_updates: dict = {}
            if time is not None:
                metadata_updates["time"] = time
            if duration_mins is not None:
                metadata_updates["duration_mins"] = duration_mins
            if metadata_updates:
                cur.execute("SELECT metadata FROM captures WHERE id = %s", (capture_id,))
                row = cur.fetchone()
                if row:
                    current = row["metadata"] or {}
                    cur.execute(
                        "UPDATE captures SET metadata = %s::jsonb, updated_at = NOW() WHERE id = %s",
                        (json.dumps({**current, **metadata_updates}), capture_id),
                    )


def update_metadata(capture_id: int, metadata: dict) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE captures SET metadata = %s::jsonb, updated_at = NOW() WHERE id = %s",
                (json.dumps(metadata), capture_id),
            )


def merge_metadata(capture_id: int, updates: dict) -> None:
    """Merge updates into existing metadata (non-destructive patch)."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT metadata FROM captures WHERE id = %s", (capture_id,))
            row = cur.fetchone()
            if row:
                current = row["metadata"] or {}
                merged = {**current, **updates}
                cur.execute(
                    "UPDATE captures SET metadata = %s::jsonb, updated_at = NOW() WHERE id = %s",
                    (json.dumps(merged), capture_id),
                )


def update_summary(capture_id: int, summary: str) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE captures SET summary = %s, updated_at = NOW() WHERE id = %s",
                (summary, capture_id),
            )


def rename_topic(old_topic: str, new_topic: str) -> int:
    """Update metadata.topic from old_topic to new_topic for all matching captures. Returns count."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, metadata FROM captures WHERE LOWER(metadata->>'topic') = LOWER(%s)",
                (old_topic,),
            )
            rows = cur.fetchall()
            updated = 0
            for row in rows:
                meta = dict(row["metadata"])
                meta["topic"] = new_topic
                cur.execute(
                    "UPDATE captures SET metadata = %s::jsonb, updated_at = NOW() WHERE id = %s",
                    (json.dumps(meta), row["id"]),
                )
                updated += 1
            return updated


def get_recent(
    capture_type: str | None = None,
    limit: int = 20,
    user_id: str = "default",
) -> list[dict]:
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if capture_type is not None:
                cur.execute(
                    "SELECT * FROM captures WHERE capture_type = %s AND user_id = %s ORDER BY created_at DESC LIMIT %s",
                    (capture_type, user_id, limit),
                )
            else:
                cur.execute(
                    "SELECT * FROM captures WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
                    (user_id, limit),
                )
            return [_row_to_dict(r) for r in cur.fetchall()]


def get_by_view(view: str, user_id: str = "default") -> list[dict]:
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if view == "todos":
                cur.execute("""
                    SELECT * FROM captures
                    WHERE capture_type NOT IN ('calendar', 'inbox', 'query')
                      AND status = 'active'
                      AND user_id = %s
                      AND (metadata->>'sprint_index') IS NULL
                    ORDER BY
                      CASE
                        WHEN deadline IS NOT NULL
                          AND deadline < to_char(CURRENT_DATE, 'YYYY-MM-DD') THEN 0
                        WHEN deadline IS NOT NULL THEN 1
                        ELSE 2
                      END,
                      deadline ASC,
                      created_at DESC
                """, (user_id,))
            elif view == "calendar":
                cur.execute("""
                    SELECT * FROM captures
                    WHERE deadline IS NOT NULL
                      AND status = 'active'
                      AND user_id = %s
                      AND capture_type NOT IN ('inbox', 'query')
                    ORDER BY deadline ASC
                """, (user_id,))
            else:
                cur.execute(
                    "SELECT * FROM captures WHERE user_id = %s ORDER BY created_at DESC LIMIT 100",
                    (user_id,),
                )
            return [_row_to_dict(r) for r in cur.fetchall()]


def update_notes(capture_id: int, notes: str) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE captures SET notes = %s, updated_at = NOW() WHERE id = %s",
                (notes, capture_id),
            )


def delete_capture(capture_id: int) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM captures WHERE id = %s", (capture_id,))


def get_topics(limit: int = 30, user_id: str = "default") -> list[dict]:
    """Return distinct topics with capture counts, ordered by count desc."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT metadata->>'topic' AS topic, COUNT(*) AS count
                FROM captures
                WHERE capture_type IN ('to_learn', 'to_cook', 'to_know')
                  AND metadata->>'topic' IS NOT NULL
                  AND metadata->>'topic' != ''
                  AND status != 'deleted'
                  AND user_id = %s
                GROUP BY topic
                ORDER BY count DESC
                LIMIT %s
                """,
                (user_id, limit),
            )
            return [{"topic": r["topic"], "count": r["count"]} for r in cur.fetchall()]


def get_by_topic(
    topic: str,
    limit: int = 50,
    offset: int = 0,
    user_id: str = "default",
) -> list[dict]:
    """Return captures matching a topic name (case-insensitive)."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT * FROM captures
                WHERE LOWER(metadata->>'topic') = LOWER(%s)
                  AND capture_type IN ('to_learn', 'to_cook', 'to_know')
                  AND status != 'deleted'
                  AND user_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (topic, user_id, limit, offset),
            )
            return [_row_to_dict(r) for r in cur.fetchall()]


def save_entities(capture_id: int, entities: list[dict]) -> None:
    """Replace all entities for a capture."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM capture_entities WHERE capture_id = %s", (capture_id,))
            for e in entities:
                name = (e.get("entity") or "").strip().lower()
                if name:
                    cur.execute(
                        "INSERT INTO capture_entities (capture_id, entity, entity_type) VALUES (%s, %s, %s)",
                        (capture_id, name, e.get("entity_type")),
                    )


def get_related_by_entities(
    capture_id: int,
    limit: int = 5,
    min_score: float = 0.0,
) -> list[dict]:
    """
    Returns captures related to capture_id, scored by IDF-weighted entity overlap.
    Score = sum of 1/log2(entity_frequency + 2) for each shared entity.
    """
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT entity FROM capture_entities WHERE capture_id = %s",
                (capture_id,),
            )
            my_entities = [row["entity"] for row in cur.fetchall()]
            if not my_entities:
                return []

            cur.execute(
                """
                SELECT entity, COUNT(DISTINCT capture_id) AS cnt
                FROM capture_entities
                WHERE entity = ANY(%s)
                GROUP BY entity
                """,
                (my_entities,),
            )
            freq = {row["entity"]: row["cnt"] for row in cur.fetchall()}

            cur.execute(
                """
                SELECT ce.capture_id, ce.entity
                FROM capture_entities ce
                WHERE ce.entity = ANY(%s)
                  AND ce.capture_id != %s
                """,
                (my_entities, capture_id),
            )
            shared_rows = cur.fetchall()

    scores: dict[int, float] = {}
    for row in shared_rows:
        cid = row["capture_id"]
        cnt = freq.get(row["entity"], 1)
        scores[cid] = scores.get(cid, 0.0) + 1.0 / math.log2(cnt + 2)

    ranked = sorted(
        ((cid, s) for cid, s in scores.items() if s >= min_score),
        key=lambda x: x[1],
        reverse=True,
    )[:limit]

    if not ranked:
        return []

    results = []
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for cid, score in ranked:
                cur.execute(
                    """
                    SELECT * FROM captures
                    WHERE id = %s
                      AND status = 'active'
                      AND capture_type NOT IN ('inbox', 'query', 'calendar')
                    """,
                    (cid,),
                )
                row = cur.fetchone()
                if row:
                    d = _row_to_dict(row)
                    d["_entity_score"] = score
                    results.append(d)
    return results


def get_entity_cluster(
    capture_id: int,
    min_score: float = 0.4,
    limit: int = 8,
) -> list[dict]:
    """
    Returns the entity cluster for Organize synthesis.
    Includes the anchor capture itself + related captures above min_score.
    """
    related = get_related_by_entities(capture_id, limit=limit, min_score=min_score)
    if not related:
        return []

    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM captures WHERE id = %s", (capture_id,))
            row = cur.fetchone()

    anchor = _row_to_dict(row) if row else None
    if not anchor:
        return related
    return [anchor] + related


def create_user(email: str, password_hash: str, name: str | None = None) -> str:
    """Insert a new user row. Returns the generated id."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (email, password_hash, name)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (email, password_hash, name),
            )
            return cur.fetchone()[0]


def get_user_by_email(email: str) -> dict | None:
    """Fetch a user row by email."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            return dict(row) if row else None


def log_llm_usage(
    user_id: str,
    agent: str,
    model: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cost_usd: float | None = None,
) -> None:
    """Log a single LLM API call for usage tracking."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO llm_usage (user_id, agent, model, input_tokens, output_tokens, cost_usd)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, agent, model, input_tokens, output_tokens, cost_usd),
            )


def get_llm_usage(user_id: str, days: int = 30) -> dict:
    """Return aggregated LLM usage stats for a user over the past N days."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    SUM(input_tokens) AS total_input,
                    SUM(output_tokens) AS total_output,
                    SUM(cost_usd) AS total_cost,
                    COUNT(*) AS total_calls
                FROM llm_usage
                WHERE user_id = %s
                  AND created_at >= NOW() - INTERVAL '%s days'
                """,
                (user_id, days),
            )
            row = cur.fetchone()
            return {
                "total_input_tokens": row["total_input"] or 0,
                "total_output_tokens": row["total_output"] or 0,
                "total_cost_usd": float(row["total_cost"] or 0),
                "total_calls": row["total_calls"] or 0,
            }


def search_similar(
    query: str,
    exclude_id: int | None = None,
    limit: int = 10,
    user_id: str = "default",
) -> list[dict]:
    """
    Full-text search via tsvector/GIN index. Returns captures ranked by ts_rank.
    Falls back to empty list if query is empty or search fails.
    """
    query = query.strip()
    if not query:
        return []

    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            try:
                cur.execute(
                    """
                    SELECT *
                    FROM captures
                    WHERE search_vector @@ plainto_tsquery('english', %s)
                      AND capture_type NOT IN ('inbox', 'query', 'calendar')
                      AND status = 'active'
                      AND user_id = %s
                    ORDER BY ts_rank(search_vector, plainto_tsquery('english', %s)) DESC
                    LIMIT %s
                    """,
                    (query, user_id, query, limit + (1 if exclude_id else 0)),
                )
                rows = cur.fetchall()
            except Exception:
                rows = []

    results = [_row_to_dict(r) for r in rows]
    if exclude_id is not None:
        results = [r for r in results if r["id"] != exclude_id]
    return results[:limit]


def delete_old_deleted(ttl_days: int = ARCHIVE_TTL_DAYS) -> int:
    """
    Permanently delete captures in the deletion bin older than ttl_days.
    Uses metadata.deleted_at (ISO datetime string) to determine age.
    Returns the number of rows deleted.
    """
    from datetime import datetime, timezone, timedelta

    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, metadata FROM captures
                WHERE status = 'deleted'
                  AND metadata->>'deleted_at' IS NOT NULL
                """
            )
            rows = cur.fetchall()

    cutoff = datetime.now(timezone.utc) - timedelta(days=ttl_days)
    to_delete: list[int] = []
    for row in rows:
        meta = row["metadata"] or {}
        deleted_at_str = meta.get("deleted_at")
        if not deleted_at_str:
            continue
        try:
            deleted_at = datetime.fromisoformat(deleted_at_str)
            if deleted_at.tzinfo is None:
                deleted_at = deleted_at.replace(tzinfo=timezone.utc)
            if deleted_at < cutoff:
                to_delete.append(row["id"])
        except ValueError:
            continue

    if to_delete:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM captures WHERE id = ANY(%s)", (to_delete,))

    return len(to_delete)


def clear_deleted() -> None:
    """Permanently delete all captures in the deletion bin (status = 'deleted')."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM captures WHERE status = 'deleted'")


def _row_to_dict(row) -> dict:
    d = dict(row)
    # JSONB comes back as a Python dict from psycopg2 — no json.loads needed
    if d.get("metadata") is None:
        d["metadata"] = {}
    # Drop internal search_vector column — not needed in API responses
    d.pop("search_vector", None)
    return d
