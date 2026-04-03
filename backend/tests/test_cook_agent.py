"""Tests for agents/cook_agent.py — AsyncAnthropicBedrock always mocked."""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db
    db.init()
    return db


def _mock_client(response_json: dict):
    content_block = MagicMock()
    content_block.text = json.dumps(response_json)
    message = MagicMock()
    message.content = [content_block]
    mock = AsyncMock()
    mock.messages.create = AsyncMock(return_value=message)
    return mock


async def test_expand_idea_writes_threads_and_domain(tmp_db):
    row_id = tmp_db.save_capture("to_cook", "persist", "Build habit tracker for dogs", "Habit tracker for dogs", {"domain": "apps"})

    payload = {
        "threads": [
            "Who currently tracks habits for their pets and why?",
            "What would the key habit loop look like?",
            "Is this B2C or would vets be the buyer?",
        ],
        "domain": "consumer app / pet care",
    }
    with patch("app.agents.cook_agent.client", _mock_client(payload)):
        from app.agents.cook_agent import expand_idea
        await expand_idea(row_id, "Build habit tracker for dogs", {"domain": "apps"})

    capture = tmp_db.get_capture(row_id)
    assert capture["metadata"]["stage"] == "seed"
    assert len(capture["metadata"]["threads"]) == 3
    assert capture["metadata"]["domain"] == "consumer app / pet care"


async def test_expand_idea_sets_stage_seed(tmp_db):
    row_id = tmp_db.save_capture("to_cook", "persist", "onboarding game idea", "Onboarding as a game", {})
    payload = {"threads": ["thread1", "thread2", "thread3"], "domain": "product"}
    with patch("app.agents.cook_agent.client", _mock_client(payload)):
        from app.agents.cook_agent import expand_idea
        await expand_idea(row_id, "onboarding game idea", {})

    capture = tmp_db.get_capture(row_id)
    assert capture["metadata"]["stage"] == "seed"


async def test_expand_idea_caps_threads_at_five(tmp_db):
    row_id = tmp_db.save_capture("to_cook", "persist", "idea", "Big idea", {})
    payload = {
        "threads": ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],  # 7 threads
        "domain": "product",
    }
    with patch("app.agents.cook_agent.client", _mock_client(payload)):
        from app.agents.cook_agent import expand_idea
        await expand_idea(row_id, "idea", {})

    capture = tmp_db.get_capture(row_id)
    assert len(capture["metadata"]["threads"]) == 5


async def test_expand_idea_handles_api_error_gracefully(tmp_db):
    row_id = tmp_db.save_capture("to_cook", "persist", "idea", "An idea", {})
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(side_effect=Exception("API error"))
    with patch("app.agents.cook_agent.client", mock_client):
        from app.agents.cook_agent import expand_idea
        await expand_idea(row_id, "idea", {})  # should not raise

    # metadata unchanged — no crash
    capture = tmp_db.get_capture(row_id)
    assert "stage" not in capture["metadata"]


async def test_expand_idea_handles_malformed_json(tmp_db):
    row_id = tmp_db.save_capture("to_cook", "persist", "idea", "An idea", {})
    content_block = MagicMock()
    content_block.text = "not json"
    message = MagicMock()
    message.content = [content_block]
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=message)
    with patch("app.agents.cook_agent.client", mock_client):
        from app.agents.cook_agent import expand_idea
        await expand_idea(row_id, "idea", {})  # should not raise
