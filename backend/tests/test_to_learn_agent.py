"""Tests for agents/to_learn_agent.py — AsyncAnthropicBedrock always mocked."""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

_NO_PAGE = (None, None)  # sentinel for _fetch_page_title returning nothing useful


def _make_response(payload: dict) -> MagicMock:
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(payload))]
    return msg


@pytest.fixture
def mock_client(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("app.agents.to_learn_agent.client", mock)
    return mock



@pytest.mark.asyncio
async def test_enrich_updates_metadata(mock_client, tmp_db):
    row_id = tmp_db.save_capture("to_learn", "absorb", "Read Atomic Habits", "Atomic Habits", {})
    mock_client.messages.create.return_value = _make_response({
        "topic": "productivity",
        "resource_type": "book",
        "url": None,
    })

    from app.agents.to_learn_agent import enrich_to_learn
    await enrich_to_learn(row_id, "Read Atomic Habits", {})

    rows = tmp_db.get_recent()
    assert rows[0]["metadata"]["topic"] == "productivity"
    assert rows[0]["metadata"]["resource_type"] == "book"
    assert rows[0]["metadata"]["url"] is None


@pytest.mark.asyncio
async def test_enrich_defaults_resource_type_to_other(mock_client, tmp_db):
    row_id = tmp_db.save_capture("to_learn", "absorb", "some content", "Some content", {})
    mock_client.messages.create.return_value = _make_response({
        "topic": "misc",
        "resource_type": None,
        "url": None,
    })

    from app.agents.to_learn_agent import enrich_to_learn
    await enrich_to_learn(row_id, "some content", {})

    rows = tmp_db.get_recent()
    assert rows[0]["metadata"]["resource_type"] == "other"


@pytest.mark.asyncio
async def test_enrich_extracts_url(mock_client, tmp_db):
    row_id = tmp_db.save_capture("to_learn", "absorb", "https://example.com/article", "Example article", {})
    mock_client.messages.create.return_value = _make_response({
        "topic": "tech",
        "resource_type": "article",
        "url": "https://example.com/article",
    })

    from app.agents.to_learn_agent import enrich_to_learn
    await enrich_to_learn(row_id, "https://example.com/article", {})

    rows = tmp_db.get_recent()
    assert rows[0]["metadata"]["url"] == "https://example.com/article"


@pytest.mark.asyncio
async def test_enrich_handles_json_error_gracefully(mock_client, tmp_db):
    """Enrichment failure should not raise — just log and return."""
    row_id = tmp_db.save_capture("to_learn", "absorb", "content", "Content", {"resource_type": "article"})
    mock_client.messages.create.side_effect = Exception("network error")

    from app.agents.to_learn_agent import enrich_to_learn
    # Should not raise
    await enrich_to_learn(row_id, "content", {"resource_type": "article"})

    # Metadata unchanged since enrichment failed
    rows = tmp_db.get_recent()
    assert rows[0]["metadata"]["resource_type"] == "article"


@pytest.mark.asyncio
async def test_enrich_merges_with_existing_metadata(mock_client, tmp_db):
    existing_meta = {"resource_type": "video", "url": "https://youtube.com/watch?v=abc"}
    row_id = tmp_db.save_capture("to_learn", "absorb", "Watch this", "Watch this", existing_meta)
    mock_client.messages.create.return_value = _make_response({
        "topic": "programming",
        "resource_type": "video",
        "url": "https://youtube.com/watch?v=abc",
    })

    # Prevent real network calls to YouTube — the URL is fake and would race the mock
    with patch("app.agents.to_learn_agent._fetch_page_title", return_value=_NO_PAGE):
        from app.agents.to_learn_agent import enrich_to_learn
        await enrich_to_learn(row_id, "Watch this", existing_meta)

    rows = tmp_db.get_recent()
    meta = rows[0]["metadata"]
    assert meta["topic"] == "programming"
    assert meta["resource_type"] == "video"
    assert meta["url"] == "https://youtube.com/watch?v=abc"
