"""Tests for storage/db.py — uses a temp SQLite file per test."""
import pytest
import sqlite3
from pathlib import Path
from unittest.mock import patch


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """Redirect DB_PATH to a temp file for each test."""
    db_path = tmp_path / "test.db"
    monkeypatch.setattr("app.storage.db.DB_PATH", db_path)
    return db_path


def test_init_creates_schema_with_user_id(tmp_db):
    from app.storage import db
    db.init()
    conn = sqlite3.connect(tmp_db)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(captures)").fetchall()}
    conn.close()
    assert "user_id" in cols
    assert "capture_type" in cols
    assert "deadline" in cols


def test_init_is_idempotent(tmp_db):
    from app.storage import db
    db.init()
    db.init()  # second call should not raise
    conn = sqlite3.connect(tmp_db)
    count = conn.execute("SELECT count(*) FROM captures").fetchone()[0]
    conn.close()
    assert count == 0


def test_init_migrates_missing_user_id(tmp_db):
    """Old schema without user_id should be recreated."""
    conn = sqlite3.connect(tmp_db)
    conn.execute("""
        CREATE TABLE captures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            capture_type TEXT NOT NULL,
            content TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

    from app.storage import db
    db.init()

    conn = sqlite3.connect(tmp_db)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(captures)").fetchall()}
    conn.close()
    assert "user_id" in cols


def test_save_capture_round_trip(tmp_db):
    from app.storage import db
    db.init()
    row_id = db.save_capture(
        capture_type="to_hit",
        completion_type="archive",
        content="Call dentist",
        summary="Call dentist before Friday",
        metadata={"priority": "normal"},
        deadline="2026-04-04",
        user_id="default",
    )
    assert row_id == 1

    rows = db.get_recent()
    assert len(rows) == 1
    assert rows[0]["capture_type"] == "to_hit"
    assert rows[0]["summary"] == "Call dentist before Friday"
    assert rows[0]["deadline"] == "2026-04-04"
    assert rows[0]["user_id"] == "default"
    assert rows[0]["metadata"] == {"priority": "normal"}


def test_get_recent_filter_by_type(tmp_db):
    from app.storage import db
    db.init()
    db.save_capture("to_hit", "archive", "task", "Task summary", {})
    db.save_capture("to_learn", "absorb", "article", "Article summary", {})
    db.save_capture("to_hit", "archive", "task2", "Task 2", {})

    hits = db.get_recent(capture_type="to_hit")
    assert len(hits) == 2
    assert all(r["capture_type"] == "to_hit" for r in hits)

    learns = db.get_recent(capture_type="to_learn")
    assert len(learns) == 1


def test_get_recent_no_filter_returns_all(tmp_db):
    from app.storage import db
    db.init()
    db.save_capture("to_hit", "archive", "t", "s", {})
    db.save_capture("to_learn", "absorb", "t", "s", {})
    rows = db.get_recent()
    assert len(rows) == 2


def test_update_status(tmp_db):
    from app.storage import db
    db.init()
    row_id = db.save_capture("to_hit", "archive", "task", "Task", {})
    db.update_status(row_id, "archived")
    rows = db.get_recent()
    assert rows[0]["status"] == "archived"


def test_update_metadata(tmp_db):
    from app.storage import db
    db.init()
    row_id = db.save_capture("to_learn", "absorb", "article", "Article", {"topic": None})
    db.update_metadata(row_id, {"topic": "machine learning", "resource_type": "article", "url": None})
    rows = db.get_recent()
    assert rows[0]["metadata"]["topic"] == "machine learning"


def test_get_by_view_todos(tmp_db):
    from app.storage import db
    db.init()
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


def test_get_by_view_todos_urgency_order(tmp_db):
    from app.storage import db
    db.init()
    # overdue (past deadline)
    db.save_capture("to_hit", "archive", "c_overdue", "Overdue task", {}, deadline="2020-01-01")
    # no deadline
    db.save_capture("to_hit", "archive", "c_none", "No deadline task", {})
    # future deadline
    db.save_capture("to_hit", "archive", "c_future", "Future task", {}, deadline="2099-12-31")

    todos = db.get_by_view("todos")
    summaries = [r["summary"] for r in todos]
    assert summaries.index("Overdue task") < summaries.index("Future task")
    assert summaries.index("Future task") < summaries.index("No deadline task")


def test_get_by_view_calendar(tmp_db):
    from app.storage import db
    db.init()
    # no deadline — excluded
    db.save_capture("to_hit", "archive", "task_no_deadline", "Task no deadline", {})
    # to_hit with deadline — included
    db.save_capture("to_hit", "archive", "task_with_deadline", "Task with deadline", {}, deadline="2026-04-07")
    # calendar events — included
    db.save_capture("calendar", "archive", "event1", "Event 1", {}, deadline="2026-04-10")
    db.save_capture("calendar", "archive", "event2", "Event 2", {}, deadline="2026-04-05")
    # to_learn with deadline — now included (any type with deadline)
    db.save_capture("to_learn", "absorb", "book", "Finish the book", {}, deadline="2026-04-06")
    # inbox with deadline — excluded
    db.save_capture("inbox", "inbox", "junk", "Inbox item", {}, deadline="2026-04-08")

    cal = db.get_by_view("calendar")
    # 4 items with deadline, excluding inbox and no-deadline task
    assert len(cal) == 4
    deadlines = [r["deadline"] for r in cal]
    assert deadlines == ["2026-04-05", "2026-04-06", "2026-04-07", "2026-04-10"]
    types = {r["capture_type"] for r in cal}
    assert "to_hit" in types
    assert "calendar" in types
    assert "to_learn" in types
    assert "inbox" not in types
