"""Tests for classifier.py — all Bedrock calls mocked."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _mock_response(data: dict) -> MagicMock:
    """Build a fake Bedrock response with JSON content."""
    block = MagicMock()
    block.text = json.dumps(data)
    resp = MagicMock()
    resp.content = [block]
    return resp


def _bad_response(text: str) -> MagicMock:
    """Build a fake response with non-JSON text."""
    block = MagicMock()
    block.text = text
    resp = MagicMock()
    resp.content = [block]
    return resp


@pytest.fixture(autouse=True)
def mock_bedrock(monkeypatch):
    """Patch AsyncAnthropicBedrock so no real API calls are made."""
    mock_client = AsyncMock()
    monkeypatch.setattr(
        "app.agents.classifier.client",
        mock_client,
    )
    return mock_client


# ── Type classification ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_classify_to_hit(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "to_hit",
        "summary": "Call dentist before Friday",
        "deadline": "2026-04-04",
        "confidence": 0.95,
        "metadata": {"priority": "normal"},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("Call dentist before Friday")
    assert result.capture_type == "to_hit"
    assert result.deadline == "2026-04-04"
    assert result.confidence == 0.95
    assert result.metadata == {"priority": "normal"}


@pytest.mark.asyncio
async def test_classify_to_learn(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "to_learn",
        "summary": "Read Atomic Habits",
        "deadline": None,
        "confidence": 0.97,
        "metadata": {"resource_type": "book", "url": None, "topic": "habits"},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("Read Atomic Habits")
    assert result.capture_type == "to_learn"
    assert result.metadata["resource_type"] == "book"
    assert result.metadata["topic"] == "habits"


@pytest.mark.asyncio
async def test_classify_to_cook(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "to_cook",
        "summary": "Build a habit tracker for my dog",
        "deadline": None,
        "confidence": 0.88,
        "metadata": {"domain": "product"},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("Build a habit tracker for my dog")
    assert result.capture_type == "to_cook"
    assert result.metadata["domain"] == "product"


@pytest.mark.asyncio
async def test_classify_to_know(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "to_know",
        "summary": "How does compound interest work?",
        "deadline": None,
        "confidence": 0.93,
        "metadata": {"question": "How does compound interest work?", "topic": "finance"},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("How does compound interest work?")
    assert result.capture_type == "to_know"
    assert "question" in result.metadata


@pytest.mark.asyncio
async def test_classify_calendar(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "calendar",
        "summary": "Dentist Thursday 3pm",
        "deadline": "2026-04-03",
        "confidence": 0.98,
        "metadata": {"event_name": "Dentist", "date": "2026-04-03", "time": "15:00", "location": None},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("Dentist Thursday 3pm")
    assert result.capture_type == "calendar"
    assert result.metadata["event_name"] == "Dentist"
    assert result.metadata["time"] == "15:00"


@pytest.mark.asyncio
async def test_classify_inbox(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "inbox",
        "summary": "Something vague",
        "deadline": None,
        "confidence": 0.3,
        "metadata": {"raw": "Something vague"},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("Something vague")
    assert result.capture_type == "inbox"
    assert result.confidence < 0.4


@pytest.mark.asyncio
async def test_classify_query(mock_bedrock):
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "query",
        "summary": "Show me my tasks",
        "deadline": None,
        "confidence": 0.95,
        "metadata": {"raw": "Show me my tasks"},
    })
    from app.agents.classifier import classify_intent
    result = await classify_intent("Show me my tasks")
    assert result.capture_type == "query"


# ── Error handling ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_json_decode_error_returns_to_learn_fallback(mock_bedrock):
    """Non-JSON response → to_learn fallback, no exception."""
    mock_bedrock.messages.create.return_value = _bad_response("Sorry, I can't help with that.")
    from app.agents.classifier import classify_intent
    result = await classify_intent("some input text")
    assert result.capture_type == "to_learn"
    assert result.confidence == 0.0
    assert result.summary == "some input text"


@pytest.mark.asyncio
async def test_correction_hint_appended(mock_bedrock):
    """correction_hint should be appended to the user message."""
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "to_hit",
        "summary": "Call dentist",
        "deadline": None,
        "confidence": 0.9,
        "metadata": {"priority": "normal"},
    })
    from app.agents.classifier import classify_intent
    await classify_intent("Call dentist", correction_hint="make it a task")

    call_args = mock_bedrock.messages.create.call_args
    messages = call_args.kwargs["messages"]
    assert "[Correction hint: make it a task]" in messages[0]["content"]


@pytest.mark.asyncio
async def test_no_correction_hint_no_append(mock_bedrock):
    """Without correction_hint, user content is unmodified."""
    mock_bedrock.messages.create.return_value = _mock_response({
        "capture_type": "to_hit",
        "summary": "Buy milk",
        "deadline": None,
        "confidence": 0.9,
        "metadata": {"priority": "normal"},
    })
    from app.agents.classifier import classify_intent
    await classify_intent("Buy milk")

    call_args = mock_bedrock.messages.create.call_args
    messages = call_args.kwargs["messages"]
    assert messages[0]["content"] == "Buy milk"
