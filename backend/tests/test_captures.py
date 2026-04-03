"""Tests for routes/captures.py — uses tmp SQLite via monkeypatch."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from pathlib import Path


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db as _db
    _db.init()
    from app.main import app
    return TestClient(app)


def _seed(tmp_path, monkeypatch):
    """Return a seeded db helper; must be called before client fixture uses db."""
    pass


@pytest.fixture
def seeded_client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db as _db
    _db.init()
    _db.save_capture("to_hit", "archive", "task1", "Task 1", {})
    _db.save_capture("to_learn", "absorb", "article", "Article 1", {})
    _db.save_capture("to_cook", "persist", "idea", "Idea 1", {})
    _db.save_capture("calendar", "archive", "event1", "Event 1", {}, deadline="2026-04-10")
    _db.save_capture("calendar", "archive", "event2", "Event 2", {}, deadline="2026-04-05")
    _db.save_capture("inbox", "inbox", "unclear", "Unclear", {})
    from app.main import app
    return TestClient(app)


def test_get_captures_no_param(seeded_client):
    resp = seeded_client.get("/captures")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 6


def test_get_captures_view_todos(seeded_client):
    resp = seeded_client.get("/captures?view=todos")
    assert resp.status_code == 200
    data = resp.json()
    types = {r["capture_type"] for r in data}
    assert "calendar" not in types
    assert "inbox" not in types
    assert "to_hit" in types
    assert "to_learn" in types
    assert "to_cook" in types


def test_get_captures_view_calendar(seeded_client):
    resp = seeded_client.get("/captures?view=calendar")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all(r["capture_type"] == "calendar" for r in data)
    # sorted by deadline ASC
    assert data[0]["deadline"] == "2026-04-05"
    assert data[1]["deadline"] == "2026-04-10"


def test_patch_status(seeded_client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db as _db
    rows = _db.get_recent()
    row_id = rows[0]["id"]

    resp = seeded_client.patch(f"/captures/{row_id}/status", json={"status": "archived"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    updated = _db.get_recent()
    match = next(r for r in updated if r["id"] == row_id)
    assert match["status"] == "archived"


def test_patch_status_missing_body(seeded_client):
    resp = seeded_client.patch("/captures/1/status", json={})
    assert resp.status_code == 200
    assert resp.json() == {"error": "status required"}


def test_patch_stage_updates_metadata(seeded_client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db as _db
    idea_id = _db.save_capture("to_cook", "persist", "An idea", "An idea", {"stage": "seed"})

    resp = seeded_client.patch(f"/captures/{idea_id}/stage", json={"stage": "brewing"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["stage"] == "brewing"

    updated = _db.get_capture(idea_id)
    assert updated["metadata"]["stage"] == "brewing"


def test_patch_stage_invalid_stage(seeded_client):
    resp = seeded_client.patch("/captures/1/stage", json={"stage": "flying"})
    assert resp.status_code == 200
    assert "error" in resp.json()


def test_patch_stage_not_found(seeded_client):
    resp = seeded_client.patch("/captures/9999/stage", json={"stage": "brewing"})
    assert resp.status_code == 404


def test_post_tasks_non_cook_returns_error(seeded_client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db as _db
    task_id = _db.save_capture("to_hit", "archive", "a task", "A task", {})
    resp = seeded_client.post(f"/captures/{task_id}/tasks")
    assert resp.status_code == 200
    assert "error" in resp.json()


def test_post_tasks_not_found(seeded_client):
    resp = seeded_client.post("/captures/9999/tasks")
    assert resp.status_code == 404
