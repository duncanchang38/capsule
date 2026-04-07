"""Shared pytest fixtures for all backend tests.

Uses a real PostgreSQL test database (capsule_test by default).
Each test gets a clean slate via TRUNCATE before and after.

Override the DB with:
    TEST_DATABASE_URL=postgresql://localhost/mydb pytest
"""
import os
import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://localhost/capsule_test"),
)

_TRUNCATE = (
    "TRUNCATE captures, capture_entities, users, user_handle_history,"
    " llm_usage, password_reset_tokens RESTART IDENTITY CASCADE"
)


@pytest.fixture
def tmp_db(monkeypatch):
    """Clean PostgreSQL test DB. Truncates before and after each test."""
    monkeypatch.setattr("app.storage.db.DATABASE_URL", TEST_DATABASE_URL)
    from app.storage import db
    db.init()
    with db._get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(_TRUNCATE)
    yield db
    with db._get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(_TRUNCATE)
    if db._pool:
        db._pool.closeall()
        db._pool = None


@pytest.fixture
def seeded_db(tmp_db):
    """Test DB pre-seeded with a handful of captures (for query_agent tests)."""
    tmp_db.save_capture("to_hit", "archive", "Call dentist", "Call dentist", {})
    tmp_db.save_capture("to_learn", "absorb", "Atomic Habits", "Read Atomic Habits", {"topic": "productivity"})
    tmp_db.save_capture("calendar", "archive", "Lunch", "Lunch with Sarah", {}, deadline="2026-04-10")
    return tmp_db
