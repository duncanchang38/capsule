"""Tests for agents/idea_tasks_agent.py — AsyncAnthropicBedrock always mocked."""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch



def _mock_client(response_json):
    content_block = MagicMock()
    content_block.text = json.dumps(response_json)
    message = MagicMock()
    message.content = [content_block]
    mock = AsyncMock()
    mock.messages.create = AsyncMock(return_value=message)
    return mock


async def test_generate_idea_tasks_creates_to_hit_captures(tmp_db):
    idea_id = tmp_db.save_capture(
        "to_cook", "persist", "Build habit tracker for dogs", "Habit tracker for dogs",
        {"threads": ["Who are the users?"], "domain": "consumer app", "stage": "seed"},
    )

    tasks = ["Research existing pet apps", "Interview 5 dog owners", "Write a problem statement"]
    with patch("app.agents.idea_tasks_agent.client", _mock_client(tasks)):
        from app.agents.idea_tasks_agent import generate_idea_tasks
        count = await generate_idea_tasks(idea_id, "Build habit tracker for dogs", {"threads": [], "domain": "consumer app"})

    assert count == 3
    hits = tmp_db.get_recent(capture_type="to_hit")
    assert len(hits) == 3
    assert all(h["metadata"]["source_id"] == idea_id for h in hits)
    assert all(h["metadata"]["source_title"] for h in hits)


async def test_generate_idea_tasks_advances_stage_to_developing(tmp_db):
    idea_id = tmp_db.save_capture(
        "to_cook", "persist", "idea", "Some idea",
        {"stage": "seed"},
    )
    tasks = ["Task A", "Task B", "Task C"]
    with patch("app.agents.idea_tasks_agent.client", _mock_client(tasks)):
        from app.agents.idea_tasks_agent import generate_idea_tasks
        await generate_idea_tasks(idea_id, "idea", {"stage": "seed"})

    idea = tmp_db.get_capture(idea_id)
    assert idea["metadata"]["stage"] == "developing"


async def test_generate_idea_tasks_caps_at_five(tmp_db):
    idea_id = tmp_db.save_capture("to_cook", "persist", "idea", "Big idea", {})
    tasks = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"]
    with patch("app.agents.idea_tasks_agent.client", _mock_client(tasks)):
        from app.agents.idea_tasks_agent import generate_idea_tasks
        count = await generate_idea_tasks(idea_id, "idea", {})

    assert count == 5
    assert len(tmp_db.get_recent(capture_type="to_hit")) == 5


async def test_generate_idea_tasks_handles_error_gracefully(tmp_db):
    idea_id = tmp_db.save_capture("to_cook", "persist", "idea", "An idea", {})
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(side_effect=Exception("API error"))
    with patch("app.agents.idea_tasks_agent.client", mock_client):
        from app.agents.idea_tasks_agent import generate_idea_tasks
        count = await generate_idea_tasks(idea_id, "idea", {})

    assert count == 0
    assert len(tmp_db.get_recent(capture_type="to_hit")) == 0
