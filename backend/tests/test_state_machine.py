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


# ── AWAITING_CAPTURE transitions ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_capture_to_confirmation():
    classify = AsyncMock(return_value=_result("to_hit"))
    state = SessionState()
    new_state, reply, store = await advance(state, "Call dentist", classify)
    assert new_state.state == "AWAITING_CONFIRMATION"
    assert new_state.pending.capture_type == "to_hit"
    assert "Sound right?" in reply
    assert store is None


@pytest.mark.asyncio
@pytest.mark.parametrize("ctype", ["to_learn", "to_cook", "to_know", "calendar"])
async def test_capture_all_types_go_to_confirmation(ctype):
    classify = AsyncMock(return_value=_result(ctype))
    state = SessionState()
    new_state, reply, store = await advance(state, "some input", classify)
    assert new_state.state == "AWAITING_CONFIRMATION"
    assert new_state.pending.capture_type == ctype


@pytest.mark.asyncio
async def test_capture_inbox_type_goes_to_clarification():
    classify = AsyncMock(return_value=_inbox_result())
    state = SessionState()
    new_state, reply, store = await advance(state, "something vague", classify)
    assert new_state.state == "INBOX_CLARIFICATION"
    assert store is None
    assert "?" in reply


@pytest.mark.asyncio
async def test_capture_low_confidence_goes_to_clarification():
    classify = AsyncMock(return_value=_result("to_hit", confidence=0.3))
    state = SessionState()
    new_state, reply, store = await advance(state, "maybe a task", classify)
    assert new_state.state == "INBOX_CLARIFICATION"


# ── AWAITING_CONFIRMATION transitions ─────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("word", ["yes", "yeah", "yep", "ok", "sure", "confirm"])
async def test_confirmation_affirm_returns_store_signal(word):
    classify = AsyncMock()
    pending = _result("to_hit")
    state = SessionState(
        state="AWAITING_CONFIRMATION",
        pending=pending,
        original_text="Call dentist",
    )
    new_state, reply, store = await advance(state, word, classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is pending
    classify.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("word", ["no", "nope", "cancel", "discard"])
async def test_confirmation_cancel_resets(word):
    classify = AsyncMock()
    state = SessionState(
        state="AWAITING_CONFIRMATION",
        pending=_result(),
        original_text="some text",
    )
    new_state, reply, store = await advance(state, word, classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is None
    assert reply == "Discarded."
    classify.assert_not_called()


@pytest.mark.asyncio
async def test_confirmation_correction_reclassifies():
    reclassified = _result("to_learn", summary="Read Atomic Habits")
    classify = AsyncMock(return_value=reclassified)
    state = SessionState(
        state="AWAITING_CONFIRMATION",
        pending=_result("to_hit"),
        original_text="Read Atomic Habits",
        retries=0,
    )
    new_state, reply, store = await advance(state, "make it a book", classify)
    assert new_state.state == "AWAITING_CONFIRMATION"
    assert new_state.pending.capture_type == "to_learn"
    assert new_state.retries == 1
    assert store is None
    classify.assert_called_once_with("Read Atomic Habits", correction_hint="make it a book")


@pytest.mark.asyncio
async def test_confirmation_max_retries_resets():
    classify = AsyncMock(return_value=_result())
    state = SessionState(
        state="AWAITING_CONFIRMATION",
        pending=_result(),
        original_text="some text",
        retries=2,  # one more hit = 3 = MAX_RETRIES
    )
    new_state, reply, store = await advance(state, "still not right", classify)
    assert new_state.state == "AWAITING_CAPTURE"
    assert store is None
    assert "start over" in reply.lower()


# ── INBOX_CLARIFICATION transitions ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_inbox_clarification_reclassifies_to_confirmation():
    reclassified = _result("to_hit", summary="Call dentist")
    classify = AsyncMock(return_value=reclassified)
    state = SessionState(
        state="INBOX_CLARIFICATION",
        original_text="call dentist",
    )
    new_state, reply, store = await advance(state, "it's a task", classify)
    assert new_state.state == "AWAITING_CONFIRMATION"
    assert new_state.pending.capture_type == "to_hit"
    assert "Sound right?" in reply
    assert store is None
    classify.assert_called_once_with("call dentist", correction_hint="it's a task")


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
    # Should report error, stay in AWAITING_CAPTURE
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
    # Only 2 items — below threshold
    assert detect_bulk("- [ ] Item one\n- [ ] Item two\n") is False
