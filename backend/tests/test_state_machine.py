"""Tests for session/state_machine.py — classify_fn always mocked."""
import pytest
from unittest.mock import AsyncMock
from app.agents.classifier import ClassificationResult, BulkClassificationResult
from app.session.state_machine import SessionState, advance


def _result(capture_type="to_hit", confidence=0.9, summary="Do the thing", metadata=None):
    return ClassificationResult(
        capture_type=capture_type,
        summary=summary,
        deadline=None,
        confidence=confidence,
        metadata=metadata or {},
    )


def _inbox_result():
    return _result("inbox", confidence=0.2, summary="unclear", metadata={"raw": "unclear"})


# ── AWAITING_CAPTURE: single items store immediately ──────────────────────────

@pytest.mark.asyncio
async def test_capture_stores_immediately():
    """Single captures now store immediately — no confirmation step."""
    classify = AsyncMock(return_value=_result("to_hit"))
    state = SessionState()
    new_state, reply, store = await advance(state, "Call dentist", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is not None
    assert store.capture_type == "to_hit"
    assert reply == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("ctype", ["to_learn", "to_cook", "to_know", "calendar"])
async def test_all_types_store_immediately(ctype):
    classify = AsyncMock(return_value=_result(ctype))
    state = SessionState()
    new_state, reply, store = await advance(state, "some input", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is not None
    assert store.capture_type == ctype


@pytest.mark.asyncio
async def test_inbox_type_stores_immediately():
    """Low-confidence/inbox captures store immediately — no clarification step."""
    classify = AsyncMock(return_value=_inbox_result())
    state = SessionState()
    new_state, reply, store = await advance(state, "something vague", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is not None
    assert store.capture_type == "inbox"


@pytest.mark.asyncio
async def test_low_confidence_stores_immediately():
    classify = AsyncMock(return_value=_result("to_hit", confidence=0.3))
    state = SessionState()
    new_state, reply, store = await advance(state, "maybe a task", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is not None


@pytest.mark.asyncio
async def test_query_type_returns_immediately_no_store():
    classify = AsyncMock(return_value=_result("query", summary="Show my tasks"))
    state = SessionState()
    new_state, reply, store = await advance(state, "show my tasks", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is not None
    assert store.capture_type == "query"
    assert reply == ""


# ── AWAITING_BULK_CONFIRMATION transitions ────────────────────────────────────

BOOK_LIST = """Buffet munger book rec
- [ ] Atomic Habits (James Clear)
- [ ] The Selfish Gene (Richard Dawkins)
- [ ] The Wealth of Nations (Adam Smith)
"""


def _bulk_result():
    items = [
        _result("to_learn", summary="Atomic Habits", metadata={"resource_type": "book", "author": "James Clear"}),
        _result("to_learn", summary="The Selfish Gene", metadata={"resource_type": "book", "author": "Richard Dawkins"}),
        _result("to_learn", summary="The Wealth of Nations", metadata={"resource_type": "book", "author": "Adam Smith"}),
    ]
    return BulkClassificationResult(items=items)


@pytest.mark.asyncio
async def test_bulk_detect_routes_to_bulk_confirm():
    classify = AsyncMock()
    bulk_classify = AsyncMock(return_value=_bulk_result())
    state = SessionState()
    new_state, reply, store = await advance(state, BOOK_LIST, classify, bulk_classify)
    assert new_state.state == "AWAITING_BULK_CONFIRMATION"
    assert new_state.pending_bulk is not None
    assert len(new_state.pending_bulk.items) == 3
    assert "3 items" in reply
    assert store is None
    classify.assert_not_called()
    bulk_classify.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("word", ["yes", "yep", "sure", "ok"])
async def test_bulk_confirm_affirm_returns_bulk_result(word):
    classify = AsyncMock()
    state = SessionState(
        state="AWAITING_BULK_CONFIRMATION",
        pending_bulk=_bulk_result(),
        original_text=BOOK_LIST,
    )
    new_state, reply, store = await advance(state, word, classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert isinstance(store, BulkClassificationResult)
    assert len(store.items) == 3
    assert new_state.pending_bulk is None


@pytest.mark.asyncio
async def test_bulk_confirm_cancel_discards():
    classify = AsyncMock()
    state = SessionState(
        state="AWAITING_BULK_CONFIRMATION",
        pending_bulk=_bulk_result(),
        original_text=BOOK_LIST,
    )
    new_state, reply, store = await advance(state, "cancel", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is None
    assert reply == "Discarded."


@pytest.mark.asyncio
async def test_bulk_confirm_unrecognized_prompts_again():
    classify = AsyncMock()
    state = SessionState(
        state="AWAITING_BULK_CONFIRMATION",
        pending_bulk=_bulk_result(),
        original_text=BOOK_LIST,
    )
    new_state, reply, store = await advance(state, "only save the first two", classify)
    assert new_state.state == "AWAITING_BULK_CONFIRMATION"
    assert store is None
    assert "3 items" in reply or "cancel" in reply.lower()


@pytest.mark.asyncio
async def test_bulk_empty_result_does_not_enter_bulk_state():
    """If bulk_classify returns empty list, fall back gracefully."""
    classify = AsyncMock(return_value=_result("to_learn"))
    bulk_classify = AsyncMock(return_value=BulkClassificationResult(items=[]))
    state = SessionState()
    new_state, reply, store = await advance(state, BOOK_LIST, classify, bulk_classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is None


# ── detect_bulk ──────────────────────────────────────────────────────────────

def test_detect_bulk_checklist():
    from app.agents.classifier import detect_bulk
    text = "Book list:\n- [ ] Atomic Habits\n- [ ] Selfish Gene\n- [ ] Wealth of Nations\n"
    assert detect_bulk(text) is True


def test_detect_bulk_numbered():
    from app.agents.classifier import detect_bulk
    text = "1. Do laundry\n2. Call dentist\n3. Submit taxes\n"
    assert detect_bulk(text) is True


def test_detect_bulk_single_item_not_bulk():
    from app.agents.classifier import detect_bulk
    assert detect_bulk("Read Atomic Habits") is False


def test_detect_bulk_two_items_not_bulk():
    from app.agents.classifier import detect_bulk
    assert detect_bulk("- [ ] Item one\n- [ ] Item two\n") is False
