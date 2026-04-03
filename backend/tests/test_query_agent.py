"""Tests for agents/query_agent.py — client always mocked."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path


def _make_response(text: str) -> MagicMock:
    msg = MagicMock()
    msg.content = [MagicMock(text=text)]
    return msg


@pytest.fixture
def mock_client(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("app.agents.query_agent.client", mock)
    return mock


@pytest.fixture
def seeded_db(tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage.db.DB_PATH", tmp_path / "test.db")
    from app.storage import db
    db.init()
    db.save_capture("to_hit", "archive", "Call dentist", "Call dentist", {})
    db.save_capture("to_learn", "absorb", "Atomic Habits", "Read Atomic Habits", {"topic": "productivity"})
    db.save_capture("calendar", "archive", "Lunch", "Lunch with Sarah", {}, deadline="2026-04-10")
    return db


@pytest.mark.asyncio
async def test_answer_returns_claude_response(mock_client, seeded_db):
    mock_client.messages.create.return_value = _make_response("You have 2 active todos.")
    from app.agents.query_agent import answer
    result = await answer("show me my tasks")
    assert result == "You have 2 active todos."
    mock_client.messages.create.assert_called_once()


@pytest.mark.asyncio
async def test_answer_includes_captures_in_context(mock_client, seeded_db):
    mock_client.messages.create.return_value = _make_response("Here are your items.")
    from app.agents.query_agent import answer
    await answer("what do I have?")

    call_args = mock_client.messages.create.call_args
    messages = call_args.kwargs["messages"]
    user_content = messages[0]["content"]
    assert "Call dentist" in user_content
    assert "Atomic Habits" in user_content


@pytest.mark.asyncio
async def test_answer_handles_exception_gracefully(mock_client, seeded_db):
    mock_client.messages.create.side_effect = Exception("timeout")
    from app.agents.query_agent import answer
    result = await answer("show me tasks")
    assert "Couldn't look that up" in result


@pytest.mark.asyncio
async def test_query_bypasses_confirmation_in_state_machine():
    """Query type should return immediately without entering AWAITING_CONFIRMATION."""
    from unittest.mock import AsyncMock
    from app.agents.classifier import ClassificationResult
    from app.session.state_machine import SessionState, advance

    query_result = ClassificationResult(
        capture_type="query",
        summary="Show me my tasks",
        deadline=None,
        confidence=0.95,
        metadata={"raw": "show me my tasks"},
    )
    classify = AsyncMock(return_value=query_result)
    state = SessionState()
    new_state, reply, store = await advance(state, "show me my tasks", classify)

    # Should NOT go to AWAITING_CONFIRMATION
    assert new_state.state == "AWAITING_CAPTURE"
    assert reply == ""
    # capture_to_store carries the query signal
    assert store is not None
    assert store.capture_type == "query"
