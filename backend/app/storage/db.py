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

    import time
    max_attempts = 10
    for attempt in range(1, max_attempts + 1):
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
            break
        except psycopg2.OperationalError as e:
            if attempt == max_attempts:
                raise
            wait = min(2 ** attempt, 30)
            logger.warning("DB not ready (attempt %d/%d): %s — retrying in %ds", attempt, max_attempts, e, wait)
            time.sleep(wait)

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
                    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    email             TEXT UNIQUE NOT NULL,
                    password_hash     TEXT NOT NULL,
                    name              TEXT,
                    handle            TEXT UNIQUE,
                    handle_changed_at TIMESTAMPTZ,
                    created_at        TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            # Add handle columns to existing deployments that pre-date this migration
            cur.execute("""
                ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS handle            TEXT UNIQUE,
                    ADD COLUMN IF NOT EXISTS handle_changed_at TIMESTAMPTZ
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_ci
                ON users (LOWER(handle))
                WHERE handle IS NOT NULL
            """)
            # Tracks all previously held handles so recently-freed ones can be locked
            # for 14 days — prevents impersonation after a rename (Instagram model).
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_handle_history (
                    id          SERIAL PRIMARY KEY,
                    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    handle      TEXT NOT NULL,
                    claimed_at  TIMESTAMPTZ NOT NULL,
                    released_at TIMESTAMPTZ NOT NULL
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_handle_history_handle"
                " ON user_handle_history (handle)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_handle_history_user"
                " ON user_handle_history (user_id)"
            )
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
            cur.execute("""
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    token       TEXT PRIMARY KEY,
                    user_id     TEXT NOT NULL,
                    expires_at  TIMESTAMPTZ NOT NULL,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                )
            """)


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


def create_user(
    email: str,
    password_hash: str,
    name: str | None = None,
    handle: str | None = None,
) -> str:
    """Insert a new user row. Returns the generated id.

    If `handle` is provided it is validated and claimed atomically — raises
    ValueError if the handle is invalid or taken.
    """
    if handle:
        handle = _validate_handle(handle)

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (email, password_hash, name, handle, handle_changed_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (email, password_hash, name, handle, None),
            )
            return cur.fetchone()[0]


HANDLE_RE = re.compile(r"^[a-z0-9_]{3,20}$")
HANDLE_LOCK_DAYS = 14
HANDLE_CHANGE_COOLDOWN_DAYS = 14


def _validate_handle(handle: str) -> str:
    """Normalise to lowercase and validate format. Returns normalised handle or raises ValueError."""
    handle = handle.strip().lower()
    if not HANDLE_RE.match(handle):
        raise ValueError(
            "Handle must be 3–20 characters and contain only letters, numbers, or underscores."
        )
    return handle


def claim_handle(user_id: str, new_handle: str) -> None:
    """
    Assign `new_handle` to `user_id`.

    Rules (Instagram model):
    - Format: 3–20 chars, [a-z0-9_] only (normalised to lowercase)
    - Not already taken by another user
    - Not locked: released by someone else within the last HANDLE_LOCK_DAYS days
    - Rate-limited: user cannot change handle again within HANDLE_CHANGE_COOLDOWN_DAYS
      (only applies when the user already has a handle — first-time claim is free)

    Old handle is archived to user_handle_history so the lock window can be enforced
    and history can be queried later.
    """
    from datetime import datetime, timezone, timedelta

    new_handle = _validate_handle(new_handle)
    now = datetime.now(timezone.utc)
    lock_cutoff = now - timedelta(days=HANDLE_LOCK_DAYS)
    cooldown_cutoff = now - timedelta(days=HANDLE_CHANGE_COOLDOWN_DAYS)

    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch current user state
            cur.execute(
                "SELECT handle, handle_changed_at FROM users WHERE id = %s",
                (user_id,),
            )
            user = cur.fetchone()
            if not user:
                raise ValueError("User not found.")

            current_handle = user["handle"]
            handle_changed_at = user["handle_changed_at"]

            # No-op if same handle
            if current_handle and current_handle.lower() == new_handle:
                return

            # Rate-limit: if user already has a handle, enforce cooldown
            if current_handle and handle_changed_at and handle_changed_at > cooldown_cutoff:
                days_left = (handle_changed_at + timedelta(days=HANDLE_CHANGE_COOLDOWN_DAYS) - now).days + 1
                raise ValueError(
                    f"You can only change your handle once every {HANDLE_CHANGE_COOLDOWN_DAYS} days. "
                    f"Try again in {days_left} day(s)."
                )

            # Check not taken by another user
            cur.execute(
                "SELECT id FROM users WHERE LOWER(handle) = %s AND id != %s",
                (new_handle, user_id),
            )
            if cur.fetchone():
                raise ValueError("That handle is already taken.")

            # Check not locked (recently released by someone else)
            cur.execute(
                """
                SELECT 1 FROM user_handle_history
                WHERE handle = %s
                  AND released_at > %s
                """,
                (new_handle, lock_cutoff),
            )
            if cur.fetchone():
                raise ValueError(
                    "That handle was recently released and is temporarily unavailable. "
                    f"Try again in a few days."
                )

            # Purge expired locks while we're here — rows older than the lock
            # window are no longer load-bearing, so clean them up lazily.
            cur.execute(
                "DELETE FROM user_handle_history WHERE released_at < %s",
                (lock_cutoff,),
            )

            # Archive the old handle before overwriting
            if current_handle:
                cur.execute(
                    """
                    INSERT INTO user_handle_history (user_id, handle, claimed_at, released_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, current_handle, handle_changed_at or now, now),
                )

            # Assign the new handle
            cur.execute(
                "UPDATE users SET handle = %s, handle_changed_at = %s WHERE id = %s",
                (new_handle, now, user_id),
            )


def get_user_by_handle(handle: str) -> dict | None:
    """Fetch a user row by handle (case-insensitive)."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM users WHERE LOWER(handle) = LOWER(%s)",
                (handle.strip(),),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def get_activity_stats(user_id: str, today_str: str) -> dict:
    """Return activity streak + today's captured/completed/deferred counts for a user.

    `today_str` is the caller's local date in ISO format (YYYY-MM-DD).
    Streak is computed from UTC dates of capture creation.
    """
    from datetime import date, timedelta

    with _get_conn() as conn:
        with conn.cursor() as cur:
            # Captured today
            cur.execute(
                """
                SELECT COUNT(*) FROM captures
                WHERE user_id = %s
                  AND DATE(created_at) = %s::date
                  AND status != 'deleted'
                  AND capture_type NOT IN ('inbox', 'query')
                """,
                (user_id, today_str),
            )
            captured_today: int = cur.fetchone()[0]

            # Completed today (status updated to a terminal state today)
            cur.execute(
                """
                SELECT COUNT(*) FROM captures
                WHERE user_id = %s
                  AND DATE(updated_at) = %s::date
                  AND status IN ('done', 'absorbed', 'answered', 'archived')
                """,
                (user_id, today_str),
            )
            completed_today: int = cur.fetchone()[0]

            # Deferred today (deferred_to set and updated today)
            cur.execute(
                """
                SELECT COUNT(*) FROM captures
                WHERE user_id = %s
                  AND DATE(updated_at) = %s::date
                  AND (metadata->>'deferred_to') IS NOT NULL
                  AND (metadata->>'deferred_to') > %s
                """,
                (user_id, today_str, today_str),
            )
            deferred_today: int = cur.fetchone()[0]

            # Distinct UTC dates with captures — used for streak
            cur.execute(
                """
                SELECT DISTINCT DATE(created_at) AS d
                FROM captures
                WHERE user_id = %s
                  AND status != 'deleted'
                  AND capture_type NOT IN ('inbox', 'query')
                ORDER BY d DESC
                LIMIT 365
                """,
                (user_id,),
            )
            capture_dates = [row[0] for row in cur.fetchall()]

    streak = _compute_streak(capture_dates, today_str)
    return {
        "streak": streak,
        "captured_today": captured_today,
        "completed_today": completed_today,
        "deferred_today": deferred_today,
    }


def _compute_streak(capture_dates: list, today_str: str) -> int:
    """Count consecutive days ending today (or yesterday if nothing yet today)."""
    from datetime import date, timedelta

    if not capture_dates:
        return 0
    today = date.fromisoformat(today_str)
    sorted_dates = sorted(set(capture_dates), reverse=True)
    # Streak is broken if last activity was 2+ days ago
    if sorted_dates[0] < today - timedelta(days=1):
        return 0
    streak = 0
    cursor = today
    for d in sorted_dates:
        if d == cursor:
            streak += 1
            cursor -= timedelta(days=1)
        elif d < cursor:
            break
    return streak


def get_user_by_email(email: str) -> dict | None:
    """Fetch a user row by email."""
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            return dict(row) if row else None


def create_reset_token(user_id: str, expires_minutes: int = 60) -> str:
    """Generate a password reset token valid for `expires_minutes`."""
    import uuid
    from datetime import datetime, timezone, timedelta
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    with _get_conn() as conn:
        with conn.cursor() as cur:
            # One active token per user — delete any existing ones first
            cur.execute("DELETE FROM password_reset_tokens WHERE user_id = %s", (user_id,))
            cur.execute(
                "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (%s, %s, %s)",
                (token, user_id, expires_at),
            )
    return token


def consume_reset_token(token: str) -> str | None:
    """Validate and delete a reset token. Returns user_id on success, None if invalid/expired."""
    from datetime import datetime, timezone
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT user_id, expires_at FROM password_reset_tokens WHERE token = %s",
                (token,),
            )
            row = cur.fetchone()
            if not row:
                return None
            if row["expires_at"] < datetime.now(timezone.utc):
                cur.execute("DELETE FROM password_reset_tokens WHERE token = %s", (token,))
                return None
            cur.execute("DELETE FROM password_reset_tokens WHERE token = %s", (token,))
            return row["user_id"]


def update_password(user_id: str, password_hash: str) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (password_hash, user_id),
            )


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
