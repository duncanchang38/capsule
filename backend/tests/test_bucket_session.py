"""Unit tests for bucket_session.py."""
import pytest
from unittest.mock import patch, MagicMock

from app.agents.classifier import ClassificationResult
from app.agents.bucket_session import BucketSession


def _todo_result() -> ClassificationResult:
    return ClassificationResult.model_validate({
        "bucket": "todo",
        "confidence": 0.9,
        "summary": "Call dentist",
        "metadata": {"deadline": "Friday", "priority": "high"},
    })


@pytest.mark.unit
def test_store_returns_ack_with_count():
    with patch("app.agents.bucket_session.db") as mock_db:
        mock_db.save_capture.return_value = 1
        mock_db.get_recent.return_value = [{"id": 1}]  # 1 item total
        ack = BucketSession("todo").store(_todo_result(), "call dentist")
    assert "To Do" in ack
    assert "1 item" in ack


@pytest.mark.unit
def test_store_first_item_count_is_one():
    with patch("app.agents.bucket_session.db") as mock_db:
        mock_db.save_capture.return_value = 1
        mock_db.get_recent.return_value = [{"id": 1}]
        ack = BucketSession("todo").store(_todo_result(), "call dentist")
    assert "1 item total" in ack


@pytest.mark.unit
def test_store_db_failure_propagates():
    with patch("app.agents.bucket_session.db") as mock_db:
        mock_db.save_capture.side_effect = Exception("disk full")
        with pytest.raises(Exception, match="disk full"):
            BucketSession("todo").store(_todo_result(), "call dentist")
