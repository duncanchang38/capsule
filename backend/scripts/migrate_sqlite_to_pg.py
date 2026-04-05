#!/usr/bin/env python3
"""
Migrate existing SQLite data to PostgreSQL.

Usage:
    SQLITE_PATH=/data/capsule.db \
    DATABASE_URL=postgresql://user:pass@host/capsule \
    python scripts/migrate_sqlite_to_pg.py

The script is safe to re-run — it skips rows already present in Postgres
(matched by original SQLite id stored in a migration tracking table).
"""
import json
import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("psycopg2-binary not installed. Run: pip install psycopg2-binary")

SQLITE_PATH = os.environ.get("SQLITE_PATH", str(Path(__file__).parent.parent / "data" / "capsule.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/capsule")


def connect_sqlite(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_migration_table(pg_cur) -> None:
    """Track which SQLite IDs have already been migrated."""
    pg_cur.execute("""
        CREATE TABLE IF NOT EXISTS _sqlite_migration (
            sqlite_id   INTEGER NOT NULL,
            pg_id       INTEGER NOT NULL,
            table_name  TEXT NOT NULL,
            migrated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (sqlite_id, table_name)
        )
    """)


def migrate_captures(sqlite_conn: sqlite3.Connection, pg_conn) -> int:
    sqlite_rows = sqlite_conn.execute("SELECT * FROM captures ORDER BY id ASC").fetchall()
    if not sqlite_rows:
        print("  No captures to migrate.")
        return 0

    with pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        already_migrated = set()
        cur.execute("SELECT sqlite_id FROM _sqlite_migration WHERE table_name = 'captures'")
        already_migrated = {row["sqlite_id"] for row in cur.fetchall()}

        inserted = 0
        for row in sqlite_rows:
            sqlite_id = row["id"]
            if sqlite_id in already_migrated:
                continue

            metadata = row["metadata"] if row["metadata"] else "{}"
            if isinstance(metadata, str):
                try:
                    json.loads(metadata)  # validate
                except json.JSONDecodeError:
                    metadata = "{}"

            cur.execute(
                """
                INSERT INTO captures
                    (user_id, capture_type, completion_type, content, summary,
                     metadata, status, deadline, notes, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    row["user_id"] or "default",
                    row["capture_type"],
                    row["completion_type"],
                    row["content"],
                    row["summary"],
                    metadata,
                    row["status"] or "active",
                    row["deadline"],
                    row["notes"],
                    row["created_at"],
                    row["updated_at"],
                ),
            )
            pg_id = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO _sqlite_migration (sqlite_id, pg_id, table_name) VALUES (%s, %s, 'captures')",
                (sqlite_id, pg_id),
            )
            inserted += 1

    pg_conn.commit()
    return inserted


def migrate_entities(sqlite_conn: sqlite3.Connection, pg_conn) -> int:
    sqlite_rows = sqlite_conn.execute(
        "SELECT * FROM capture_entities ORDER BY id ASC"
    ).fetchall()
    if not sqlite_rows:
        print("  No entities to migrate.")
        return 0

    with pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT sqlite_id FROM _sqlite_migration WHERE table_name = 'entities'")
        already_migrated = {row["sqlite_id"] for row in cur.fetchall()}

        # Build SQLite capture_id → Postgres capture_id mapping
        cur.execute("SELECT sqlite_id, pg_id FROM _sqlite_migration WHERE table_name = 'captures'")
        id_map = {row["sqlite_id"]: row["pg_id"] for row in cur.fetchall()}

        inserted = 0
        for row in sqlite_rows:
            sqlite_id = row["id"]
            if sqlite_id in already_migrated:
                continue

            pg_capture_id = id_map.get(row["capture_id"])
            if pg_capture_id is None:
                print(f"  Warning: capture_id {row['capture_id']} not found in migration map, skipping entity {sqlite_id}")
                continue

            cur.execute(
                """
                INSERT INTO capture_entities (capture_id, entity, entity_type, created_at)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (pg_capture_id, row["entity"], row["entity_type"], row["created_at"]),
            )
            pg_id = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO _sqlite_migration (sqlite_id, pg_id, table_name) VALUES (%s, %s, 'entities')",
                (sqlite_id, pg_id),
            )
            inserted += 1

    pg_conn.commit()
    return inserted


def main() -> None:
    if not Path(SQLITE_PATH).exists():
        sys.exit(f"SQLite file not found: {SQLITE_PATH}\nSet SQLITE_PATH env var.")

    print(f"Source:      {SQLITE_PATH}")
    print(f"Destination: {DATABASE_URL}\n")

    sqlite_conn = connect_sqlite(SQLITE_PATH)
    pg_conn = psycopg2.connect(DATABASE_URL)

    with pg_conn.cursor() as cur:
        ensure_migration_table(cur)
    pg_conn.commit()

    print("Migrating captures...")
    n_captures = migrate_captures(sqlite_conn, pg_conn)
    print(f"  Inserted {n_captures} capture(s).")

    print("Migrating entities...")
    n_entities = migrate_entities(sqlite_conn, pg_conn)
    print(f"  Inserted {n_entities} entity row(s).")

    sqlite_conn.close()
    pg_conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
