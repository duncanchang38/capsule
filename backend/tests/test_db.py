"""Tests for storage/db.py — requires a running PostgreSQL instance.

Set TEST_DATABASE_URL env var to point at a test database, e.g.:
    TEST_DATABASE_URL=postgresql://localhost/capsule_test pytest tests/test_db.py

Each test gets a clean slate via TRUNCATE RESTART IDENTITY CASCADE.
"""
import os
import pytest
import psycopg2
import psycopg2.extras


TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://localhost/capsule_test"),
)


@pytest.fixture(autouse=True)
def tmp_db(monkeypatch):
    """Point db module at test DB and wipe tables before each test."""
    monkeypatch.setattr("app.storage.db.DATABASE_URL", TEST_DATABASE_URL)
    from app.storage import db
    db.init()
    yield
    # Truncate so each test starts fresh
    with db._get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "TRUNCATE captures, capture_entities RESTART IDENTITY CASCADE"
            )
    db._pool.closeall()
    db._pool = None


# ── Schema / init ────────────────────────────────────────────────────────────

def test_init_creates_schema():
    conn = psycopg2.connect(TEST_DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'captures'
    """)
    cols = {row[0] for row in cur.fetchall()}
    conn.close()
    assert "user_id" in cols
    assert "capture_type" in cols
    assert "deadline" in cols
    assert "metadata" in cols
    assert "search_vector" in cols


def test_init_is_idempotent():
    from app.storage import db
    db.init()  # second call should not raise
    with db._get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM captures")
            assert cur.fetchone()[0] == 0


# ── CRUD round-trip ───────────────────────────────────────────────────────────

def test_save_capture_round_trip():
    from app.storage import db
    row_id = db.save_capture(
        capture_type="to_hit",
        completion_type="archive",
        content="Call dentist",
        summary="Call dentist before Friday",
        metadata={"priority": "normal"},
        deadline="2026-04-04",
        user_id="default",
    )
    assert isinstance(row_id, int)
    assert row_id >= 1

    rows = db.get_recent()
    assert len(rows) == 1
    assert rows[0]["capture_type"] == "to_hit"
    assert rows[0]["summary"] == "Call dentist before Friday"
    assert rows[0]["deadline"] == "2026-04-04"
    assert rows[0]["user_id"] == "default"
    assert rows[0]["metadata"] == {"priority": "normal"}


def test_get_recent_filter_by_type():
    from app.storage import db
    db.save_capture("to_hit", "archive", "task", "Task summary", {})
    db.save_capture("to_learn", "absorb", "article", "Article summary", {})
    db.save_capture("to_hit", "archive", "task2", "Task 2", {})

    hits = db.get_recent(capture_type="to_hit")
    assert len(hits) == 2
    assert all(r["capture_type"] == "to_hit" for r in hits)

    learns = db.get_recent(capture_type="to_learn")
    assert len(learns) == 1


def test_get_recent_no_filter_returns_all():
    from app.storage import db
    db.save_capture("to_hit", "archive", "t", "s", {})
    db.save_capture("to_learn", "absorb", "t", "s", {})
    rows = db.get_recent()
    assert len(rows) == 2


def test_update_status():
    from app.storage import db
    row_id = db.save_capture("to_hit", "archive", "task", "Task", {})
    db.update_status(row_id, "archived")
    rows = db.get_recent()
    assert rows[0]["status"] == "archived"


def test_update_metadata():
    from app.storage import db
    row_id = db.save_capture("to_learn", "absorb", "article", "Article", {"topic": None})
    db.update_metadata(row_id, {"topic": "machine learning", "resource_type": "article", "url": None})
    rows = db.get_recent()
    assert rows[0]["metadata"]["topic"] == "machine learning"


# ── View queries ──────────────────────────────────────────────────────────────

def test_get_by_view_todos():
    from app.storage import db
    db.save_capture("to_hit", "archive", "task", "Task", {})
    db.save_capture("calendar", "archive", "event", "Event", {}, deadline="2026-04-04")
    db.save_capture("inbox", "inbox", "unclear", "Unclear", {})
    db.save_capture("to_learn", "absorb", "article", "Article", {})

    todos = db.get_by_view("todos")
    types = {r["capture_type"] for r in todos}
    assert "calendar" not in types
    assert "inbox" not in types
    assert "to_hit" in types
    assert "to_learn" in types


def test_get_by_view_todos_urgency_order():
    from app.storage import db
    db.save_capture("to_hit", "archive", "c_overdue", "Overdue task", {}, deadline="2020-01-01")
    db.save_capture("to_hit", "archive", "c_none", "No deadline task", {})
    db.save_capture("to_hit", "archive", "c_future", "Future task", {}, deadline="2099-12-31")

    todos = db.get_by_view("todos")
    summaries = [r["summary"] for r in todos]
    assert summaries.index("Overdue task") < summaries.index("Future task")
    assert summaries.index("Future task") < summaries.index("No deadline task")


def test_get_by_view_calendar():
    from app.storage import db
    db.save_capture("to_hit", "archive", "task_no_deadline", "Task no deadline", {})
    db.save_capture("to_hit", "archive", "task_with_deadline", "Task with deadline", {}, deadline="2026-04-07")
    db.save_capture("calendar", "archive", "event1", "Event 1", {}, deadline="2026-04-10")
    db.save_capture("calendar", "archive", "event2", "Event 2", {}, deadline="2026-04-05")
    db.save_capture("to_learn", "absorb", "book", "Finish the book", {}, deadline="2026-04-06")
    db.save_capture("inbox", "inbox", "junk", "Inbox item", {}, deadline="2026-04-08")

    cal = db.get_by_view("calendar")
    assert len(cal) == 4
    deadlines = [r["deadline"] for r in cal]
    assert deadlines == ["2026-04-05", "2026-04-06", "2026-04-07", "2026-04-10"]
    types = {r["capture_type"] for r in cal}
    assert "to_hit" in types
    assert "calendar" in types
    assert "to_learn" in types
    assert "inbox" not in types
