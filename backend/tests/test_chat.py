"""Integration tests for the chat state machine — uses FastAPI TestClient."""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

os.environ.setdefault("CLAUDE_PLUGIN_ROOT", "/fake/path")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from app.agents.classifier import ClassificationResult
from app.routes.chat import _sessions


def _todo_result(summary: str = "Call dentist") -> ClassificationResult:
    return ClassificationResult.model_validate({
        "bucket": "todo",
        "confidence": 0.9,
        "summary": summary,
        "metadata": {"deadline": "Friday", "priority": "normal"},
    })


def _inbox_result(text: str = "hmm") -> ClassificationResult:
    return ClassificationResult.model_validate({
        "bucket": "inbox",
        "confidence": 0.2,
        "summary": text,
        "metadata": {"raw": text},
    })


def _idea_result() -> ClassificationResult:
    return ClassificationResult.model_validate({
        "bucket": "idea",
        "confidence": 0.85,
        "summary": "App idea spotify for podcasts",
        "metadata": {"domain": "product"},
    })


@pytest.fixture(autouse=True)
def clear_sessions():
    """Reset session state between tests."""
    _sessions.clear()
    yield
    _sessions.clear()


@pytest.fixture
def client():
    with patch("app.storage.db.DB_PATH"):
        with patch("app.storage.db.init"):
            from app.main import app
            with TestClient(app, raise_server_exceptions=True) as c:
                yield c


SESSION_HEADER = {"X-Session-ID": "test-session-1"}


def _post(client, content: str):
    resp = client.post("/chat", json={"content": content}, headers=SESSION_HEADER)
    assert resp.status_code == 200
    # Collect SSE text
    text = ""
    for line in resp.text.splitlines():
        if line.startswith("data:") and "[DONE]" not in line:
            import json
            text += json.loads(line[5:].strip()).get("text", "")
    return text.strip()


# ── New session ────────────────────────────────────────────────────────────────

@pytest.mark.integration
def test_unknown_session_creates_awaiting_capture(client):
    with patch("app.routes.chat.classify_intent", return_value=_todo_result()):
        with patch("app.routes.chat.BucketSession"):
            response = _post(client, "call dentist before Friday")
    assert "To Do" in response
    assert "Sound right?" in response


# ── Input validation ───────────────────────────────────────────────────────────

@pytest.mark.integration
def test_input_over_2000_chars_returns_400(client):
    resp = client.post(
        "/chat",
        json={"content": "x" * 2001},
        headers=SESSION_HEADER,
    )
    assert resp.status_code == 422  # Pydantic validation error


# ── AWAITING_CONFIRMATION: yes ─────────────────────────────────────────────────

@pytest.mark.integration
def test_yes_stores_and_resets(client):
    with patch("app.routes.chat.classify_intent", return_value=_todo_result()):
        _post(client, "call dentist")  # → AWAITING_CONFIRMATION

    mock_session = MagicMock()
    mock_session.store.return_value = "Added to To Do. 1 item total."

    with patch("app.routes.chat.BucketSession", return_value=mock_session):
        response = _post(client, "yes")

    assert "Added to To Do" in response
    assert _sessions["test-session-1"].state == "AWAITING_CAPTURE"


# ── AWAITING_CONFIRMATION: correction → re-classify ───────────────────────────

@pytest.mark.integration
def test_no_reclassifies_with_correction_hint(client):
    with patch("app.routes.chat.classify_intent", return_value=_todo_result()) as mock_clf:
        _post(client, "call dentist")  # → AWAITING_CONFIRMATION

        with patch("app.routes.chat.classify_intent", return_value=_idea_result()) as mock_clf2:
            response = _post(client, "no, put it in ideas")
            mock_clf2.assert_called_once()
            call_kwargs = mock_clf2.call_args
            assert call_kwargs.kwargs.get("correction_hint") or call_kwargs.args[1]

    assert "Ideas" in response


# ── AWAITING_CONFIRMATION: cancel ─────────────────────────────────────────────

@pytest.mark.integration
def test_cancel_resets_to_awaiting_capture(client):
    with patch("app.routes.chat.classify_intent", return_value=_todo_result()):
        _post(client, "call dentist")

    response = _post(client, "cancel")
    assert "discarded" in response.lower()
    assert _sessions["test-session-1"].state == "AWAITING_CAPTURE"


# ── 3 retries exhausted ────────────────────────────────────────────────────────

@pytest.mark.integration
def test_three_retries_asks_for_explicit_bucket(client):
    with patch("app.routes.chat.classify_intent", return_value=_todo_result()):
        _post(client, "call dentist")
        # Force 3 retries
        for _ in range(3):
            with patch("app.routes.chat.classify_intent", return_value=_todo_result()):
                _post(client, "wrong bucket")

    response = _post(client, "still wrong")
    assert "pick a bucket" in response.lower() or "todo" in response.lower()


# ── AWAITING_CLASSIFICATION (inbox) ───────────────────────────────────────────

@pytest.mark.integration
def test_inbox_result_goes_to_awaiting_classification(client):
    with patch("app.routes.chat.classify_intent", return_value=_inbox_result()):
        response = _post(client, "hmm")
    assert _sessions["test-session-1"].state == "AWAITING_CLASSIFICATION"
    assert "not sure" in response.lower()


@pytest.mark.integration
def test_inbox_user_picks_bucket_then_confirms(client):
    with patch("app.routes.chat.classify_intent", return_value=_inbox_result()):
        _post(client, "hmm")  # → AWAITING_CLASSIFICATION

    with patch("app.routes.chat.classify_intent", return_value=_idea_result()):
        response = _post(client, "put it in ideas")
    assert _sessions["test-session-1"].state == "AWAITING_CONFIRMATION"
    assert "Ideas" in response


@pytest.mark.integration
def test_inbox_cancel_resets(client):
    with patch("app.routes.chat.classify_intent", return_value=_inbox_result()):
        _post(client, "hmm")

    response = _post(client, "cancel")
    assert _sessions["test-session-1"].state == "AWAITING_CAPTURE"
    assert "discarded" in response.lower()
