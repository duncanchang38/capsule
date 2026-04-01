"""Unit tests for storage/db.py — uses a temp SQLite file."""
import json
import pytest
import tempfile
import os
from pathlib import Path
from unittest.mock import patch

from app.agents.classifier import (
    ClassificationResult,
    TodoMetadata,
    ToLearnMetadata,
    InboxMetadata,
)


@pytest.fixture
def tmp_db(tmp_path):
    """Patch DB_PATH to a temp file for each test."""
    db_file = tmp_path / "test.db"
    with patch("app.storage.db.DB_PATH", db_file):
        from app.storage import db
        db.init()
        yield db


def _todo_result() -> ClassificationResult:
    return ClassificationResult.model_validate({
        "bucket": "todo",
        "confidence": 0.9,
        "summary": "Call dentist",
        "metadata": {"deadline": "Friday", "priority": "high"},
    })


def _to_learn_result(url: str | None = None) -> ClassificationResult:
    return ClassificationResult.model_validate({
        "bucket": "to_learn",
        "confidence": 0.88,
        "summary": "Read article on AI",
        "metadata": {"resource_type": "article", "url": url, "topic": "AI"},
    })


# ── init() ─────────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_init_idempotent(tmp_db):
    tmp_db.init()  # second call — should not raise
    tmp_db.init()  # third call — still fine


# ── save_capture() ─────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_save_capture_returns_positive_id(tmp_db):
    row_id = tmp_db.save_capture(_todo_result(), "call dentist before Friday")
    assert isinstance(row_id, int)
    assert row_id > 0


@pytest.mark.unit
def test_save_capture_todo_metadata_roundtrip(tmp_db):
    tmp_db.save_capture(_todo_result(), "call dentist")
    rows = tmp_db.get_recent("todo")
    assert len(rows) == 1
    meta = json.loads(rows[0]["metadata"])
    assert meta["deadline"] == "Friday"
    assert meta["priority"] == "high"


@pytest.mark.unit
def test_save_capture_to_learn_url_preserved(tmp_db):
    result = _to_learn_result(url="https://example.com/ai-agents")
    tmp_db.save_capture(result, "read https://example.com/ai-agents")
    rows = tmp_db.get_recent("to_learn")
    meta = json.loads(rows[0]["metadata"])
    assert meta["url"] == "https://example.com/ai-agents"


# ── get_recent() ───────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_get_recent_only_returns_correct_bucket(tmp_db):
    tmp_db.save_capture(_todo_result(), "call dentist")
    tmp_db.save_capture(_to_learn_result(), "read article")
    todos = tmp_db.get_recent("todo")
    learns = tmp_db.get_recent("to_learn")
    assert len(todos) == 1
    assert len(learns) == 1
    assert todos[0]["bucket"] == "todo"


@pytest.mark.unit
def test_get_recent_empty_bucket_returns_empty(tmp_db):
    result = tmp_db.get_recent("calendar")
    assert result == []


@pytest.mark.unit
def test_get_recent_respects_limit(tmp_db):
    for i in range(25):
        tmp_db.save_capture(
            ClassificationResult.model_validate({
                "bucket": "todo",
                "confidence": 0.9,
                "summary": f"Task {i}",
                "metadata": {"deadline": None, "priority": None},
            }),
            f"task {i}",
        )
    rows = tmp_db.get_recent("todo", limit=20)
    assert len(rows) == 20
