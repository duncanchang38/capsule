"""Tests for agents/to_know_agent.py — client always mocked."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_response(answer: str, search_queries: list | None = None) -> MagicMock:
    """Return a mock Anthropic message with the JSON format to_know_agent expects."""
    payload = {"answer": answer, "search_queries": search_queries or []}
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(payload))]
    return msg


@pytest.fixture
def mock_client(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("app.agents.to_know_agent.client", mock)
    return mock


@pytest.mark.asyncio
async def test_research_stores_answer(mock_client, tmp_db):
    row_id = tmp_db.save_capture("to_know", "answer", "How does compound interest work?",
                                  "How does compound interest work?", {"question": "How does compound interest work?"})
    mock_client.messages.create.return_value = _make_response(
        "Compound interest earns interest on both the principal and previously earned interest.",
        ["compound interest explained", "compound vs simple interest", "compound interest calculator"],
    )

    from app.agents.to_know_agent import research_to_know
    await research_to_know(row_id, "How does compound interest work?", {"question": "How does compound interest work?"})

    rows = tmp_db.get_recent()
    assert "answer" in rows[0]["metadata"]
    assert "compound" in rows[0]["metadata"]["answer"].lower()


@pytest.mark.asyncio
async def test_research_merges_existing_metadata(mock_client, tmp_db):
    meta = {"question": "What is a Roth IRA?", "topic": "finance"}
    row_id = tmp_db.save_capture("to_know", "answer", "What is a Roth IRA?", "What is a Roth IRA?", meta)
    mock_client.messages.create.return_value = _make_response(
        "A Roth IRA is a tax-advantaged retirement account.",
    )

    from app.agents.to_know_agent import research_to_know
    await research_to_know(row_id, "What is a Roth IRA?", meta)

    rows = tmp_db.get_recent()
    assert rows[0]["metadata"]["topic"] == "finance"
    assert rows[0]["metadata"]["answer"] is not None


@pytest.mark.asyncio
async def test_research_handles_error_gracefully(mock_client, tmp_db):
    row_id = tmp_db.save_capture("to_know", "answer", "Some question", "Some question", {})
    mock_client.messages.create.side_effect = Exception("network error")

    from app.agents.to_know_agent import research_to_know
    await research_to_know(row_id, "Some question", {})

    # Should not raise; metadata unchanged
    rows = tmp_db.get_recent()
    assert "answer" not in rows[0]["metadata"]


@pytest.mark.asyncio
async def test_research_answer_is_trimmed(mock_client, tmp_db):
    row_id = tmp_db.save_capture("to_know", "answer", "Q", "Q", {})
    mock_client.messages.create.return_value = _make_response("  The answer.  ")

    from app.agents.to_know_agent import research_to_know
    await research_to_know(row_id, "Q", {})

    rows = tmp_db.get_recent()
    assert rows[0]["metadata"]["answer"] == "The answer."
