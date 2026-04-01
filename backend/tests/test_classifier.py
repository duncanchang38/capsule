"""Unit tests for classifier.py — all external API calls are mocked."""
import json
import pytest
from unittest.mock import MagicMock, patch

from app.agents.classifier import (
    ClassificationResult,
    TodoMetadata,
    ToKnowMetadata,
    ToLearnMetadata,
    IdeaMetadata,
    CalendarMetadata,
    InboxMetadata,
    classify_intent,
)


def _mock_response(payload: dict) -> MagicMock:
    """Build a fake anthropic Messages response."""
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(payload))]
    return msg


def _patch_create(payload: dict):
    return patch(
        "app.agents.classifier.anthropic.Anthropic",
        return_value=MagicMock(
            messages=MagicMock(
                create=MagicMock(return_value=_mock_response(payload))
            )
        ),
    )


# ── Happy path: one per bucket ─────────────────────────────────────────────────

@pytest.mark.unit
def test_classify_todo():
    payload = {
        "bucket": "todo",
        "confidence": 0.95,
        "summary": "Call dentist before Friday",
        "metadata": {"deadline": "Friday", "priority": "high"},
    }
    with _patch_create(payload):
        result = classify_intent("call dentist before Friday")
    assert result.bucket == "todo"
    assert isinstance(result.metadata, TodoMetadata)
    assert result.metadata.deadline == "Friday"


@pytest.mark.unit
def test_classify_calendar():
    payload = {
        "bucket": "calendar",
        "confidence": 0.92,
        "summary": "Dentist appointment Thursday 3pm",
        "metadata": {"event_name": "Dentist", "date": "Thursday", "time": "3pm", "location": None},
    }
    with _patch_create(payload):
        result = classify_intent("dentist appointment Thursday 3pm")
    assert result.bucket == "calendar"
    assert isinstance(result.metadata, CalendarMetadata)
    assert result.metadata.time == "3pm"


@pytest.mark.unit
def test_classify_to_know():
    payload = {
        "bucket": "to_know",
        "confidence": 0.90,
        "summary": "How does compound interest work",
        "metadata": {"question": "How does compound interest work?", "topic": "finance"},
    }
    with _patch_create(payload):
        result = classify_intent("how does compound interest work?")
    assert result.bucket == "to_know"
    assert isinstance(result.metadata, ToKnowMetadata)
    assert "compound" in result.metadata.question.lower()


@pytest.mark.unit
def test_classify_to_learn():
    payload = {
        "bucket": "to_learn",
        "confidence": 0.88,
        "summary": "Read article on AI agents",
        "metadata": {
            "resource_type": "article",
            "url": "https://example.com/ai-agents",
            "topic": "AI",
        },
    }
    with _patch_create(payload):
        result = classify_intent("read this article on AI agents: https://example.com/ai-agents")
    assert result.bucket == "to_learn"
    assert isinstance(result.metadata, ToLearnMetadata)
    assert result.metadata.url == "https://example.com/ai-agents"


@pytest.mark.unit
def test_classify_idea():
    payload = {
        "bucket": "idea",
        "confidence": 0.85,
        "summary": "App idea: Spotify for podcasts",
        "metadata": {"domain": "product"},
    }
    with _patch_create(payload):
        result = classify_intent("app idea: spotify for podcasts")
    assert result.bucket == "idea"
    assert isinstance(result.metadata, IdeaMetadata)
    assert result.metadata.domain == "product"


# ── to_learn URL extraction ────────────────────────────────────────────────────

@pytest.mark.unit
def test_to_learn_url_populated_when_present():
    payload = {
        "bucket": "to_learn",
        "confidence": 0.87,
        "summary": "Read blog on distributed systems",
        "metadata": {
            "resource_type": "article",
            "url": "https://blog.example.com/dist-sys",
            "topic": "engineering",
        },
    }
    with _patch_create(payload):
        result = classify_intent("read https://blog.example.com/dist-sys")
    assert result.metadata.url == "https://blog.example.com/dist-sys"


# ── correction_hint ────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_correction_hint_changes_classification():
    original_payload = {
        "bucket": "to_know",
        "confidence": 0.75,
        "summary": "Question about sleep",
        "metadata": {"question": "How does sleep affect memory?", "topic": "neuroscience"},
    }
    corrected_payload = {
        "bucket": "idea",
        "confidence": 0.80,
        "summary": "Interesting: sleep affects memory",
        "metadata": {"domain": "creative"},
    }

    client_mock = MagicMock()
    client_mock.messages.create.side_effect = [
        _mock_response(original_payload),
        _mock_response(corrected_payload),
    ]

    with patch("app.agents.classifier.anthropic.Anthropic", return_value=client_mock):
        first = classify_intent("interesting: sleep affects memory consolidation")
        second = classify_intent(
            "interesting: sleep affects memory consolidation",
            correction_hint="put this in ideas",
        )

    assert first.bucket == "to_know"
    assert second.bucket == "idea"


# ── Error handling ─────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_api_error_propagates():
    import anthropic as anthropic_lib

    with patch(
        "app.agents.classifier.anthropic.Anthropic",
        return_value=MagicMock(
            messages=MagicMock(
                create=MagicMock(side_effect=anthropic_lib.APIError("API down", request=None, body=None))
            )
        ),
    ):
        with pytest.raises(anthropic_lib.APIError):
            classify_intent("call dentist")


@pytest.mark.unit
def test_malformed_json_raises_value_error():
    msg = MagicMock()
    msg.content = [MagicMock(text="not valid json {{{")]

    with patch(
        "app.agents.classifier.anthropic.Anthropic",
        return_value=MagicMock(
            messages=MagicMock(create=MagicMock(return_value=msg))
        ),
    ):
        with pytest.raises(ValueError):
            classify_intent("call dentist")


# ── Inbox threshold ────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_low_confidence_forced_to_inbox():
    payload = {
        "bucket": "to_know",
        "confidence": 0.3,  # below 0.4 threshold
        "summary": "Hmm",
        "metadata": {"question": "hmm", "topic": None},
    }
    with _patch_create(payload):
        result = classify_intent("hmm")
    assert result.bucket == "inbox"
    assert isinstance(result.metadata, InboxMetadata)
