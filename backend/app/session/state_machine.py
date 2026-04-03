"""
State machine for the capture/confirmation flow.

States:
  AWAITING_CAPTURE          → single item → classify → AWAITING_CONFIRMATION
                            → bulk list  → bulk_classify → AWAITING_BULK_CONFIRMATION
                            → query      → execute immediately (no storage)
                            → low confidence → INBOX_CLARIFICATION
  AWAITING_CONFIRMATION     → affirm → store signal returned
                            → cancel → reset to AWAITING_CAPTURE
                            → other  → re-classify (correction), stay
                            → 3 retries → reset
  AWAITING_BULK_CONFIRMATION → affirm → BulkClassificationResult returned
                             → cancel → reset
  INBOX_CLARIFICATION       → user clarifies → re-classify → AWAITING_CONFIRMATION

advance() is the only public function. Returns:
  (new_session, reply_text, capture_to_store | None)
  capture_to_store is ClassificationResult | BulkClassificationResult | None
"""
import time
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable

from app.agents.classifier import ClassificationResult, BulkClassificationResult

AFFIRM_WORDS = {
    "yes", "yeah", "yep", "yup", "correct", "right", "ok", "okay",
    "sure", "sounds good", "confirm", "go", "do it", "save it", "saved",
}
CANCEL_WORDS = {
    "no", "nope", "cancel", "discard", "nevermind", "never mind",
    "stop", "abort", "delete",
}
MAX_RETRIES = 3


_TYPE_LABELS = {
    "to_hit": "task", "to_learn": "item", "to_cook": "idea",
    "to_know": "question", "calendar": "event", "inbox": "item",
}


@dataclass
class SessionState:
    state: str = "AWAITING_CAPTURE"
    pending: Optional[ClassificationResult] = None
    pending_bulk: Optional[BulkClassificationResult] = None
    original_text: Optional[str] = None
    retries: int = 0
    last_active: float = field(default_factory=time.time)


def _is_affirm(text: str) -> bool:
    return text.strip().lower() in AFFIRM_WORDS


def _is_cancel(text: str) -> bool:
    return text.strip().lower() in CANCEL_WORDS


def _fresh() -> SessionState:
    return SessionState()


async def advance(
    session: SessionState,
    message: str,
    classify_fn: Optional[Callable[..., Awaitable[ClassificationResult]]] = None,
    bulk_classify_fn: Optional[Callable[..., Awaitable[BulkClassificationResult]]] = None,
) -> tuple[SessionState, str, ClassificationResult | BulkClassificationResult | None]:
    """
    Process one user message and return:
      (new_session_state, reply_text, capture_to_store | None)

    capture_to_store is ClassificationResult | BulkClassificationResult | None.
    classify_fn and bulk_classify_fn are injectable for testing.
    """
    if classify_fn is None:
        from app.agents.classifier import classify_intent as classify_fn  # type: ignore[assignment]
    if bulk_classify_fn is None:
        from app.agents.classifier import bulk_classify as bulk_classify_fn  # type: ignore[assignment]

    new_session = SessionState(
        state=session.state,
        pending=session.pending,
        pending_bulk=session.pending_bulk,
        original_text=session.original_text,
        retries=session.retries,
        last_active=time.time(),
    )

    # ── AWAITING_CAPTURE ─────────────────────────────────────────────────────
    if session.state == "AWAITING_CAPTURE":
        from app.agents.classifier import detect_bulk
        if detect_bulk(message):
            bulk_result = await bulk_classify_fn(message)
            if not bulk_result.items:
                return new_session, "Couldn't parse that list — try again.", None
            new_session.state = "AWAITING_BULK_CONFIRMATION"
            new_session.pending_bulk = bulk_result
            new_session.original_text = message

            # Build type breakdown summary
            counts: dict[str, int] = {}
            for item in bulk_result.items:
                label = _TYPE_LABELS.get(item.capture_type, "item")
                counts[label] = counts.get(label, 0) + 1
            breakdown = ", ".join(f"{v} {k}{'s' if v > 1 else ''}" for k, v in counts.items())
            total = len(bulk_result.items)
            return (
                new_session,
                f"Found {total} items ({breakdown}). Save all?",
                None,
            )

        result: ClassificationResult = await classify_fn(message)

        if result.capture_type == "query":
            # Queries don't go through confirmation — execute immediately.
            return new_session, "", result

        if result.capture_type == "inbox" or result.confidence < 0.4:
            new_session.state = "INBOX_CLARIFICATION"
            new_session.original_text = message
            return (
                new_session,
                "Is this something you need to do, something to explore, or a question you want answered?",
                None,
            )

        new_session.state = "AWAITING_CONFIRMATION"
        new_session.pending = result
        new_session.original_text = message
        new_session.retries = 0
        return new_session, f"Got it: {result.summary}. Sound right?", None

    # ── AWAITING_CONFIRMATION ────────────────────────────────────────────────
    if session.state == "AWAITING_CONFIRMATION":
        pending = session.pending

        if _is_affirm(message):
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending = None
            new_session.original_text = None
            return new_session, "", pending   # caller stores pending

        if _is_cancel(message):
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending = None
            new_session.original_text = None
            return new_session, "Discarded.", None

        # Correction path
        retries = session.retries + 1
        if retries >= MAX_RETRIES:
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending = None
            new_session.original_text = None
            return (
                new_session,
                "Let me start over — just re-type what you want to capture.",
                None,
            )

        result = await classify_fn(session.original_text, correction_hint=message)
        new_session.pending = result
        new_session.retries = retries
        return new_session, f"Got it: {result.summary}. Sound right?", None

    # ── AWAITING_BULK_CONFIRMATION ───────────────────────────────────────────
    if session.state == "AWAITING_BULK_CONFIRMATION":
        if _is_affirm(message):
            bulk = session.pending_bulk
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending_bulk = None
            new_session.original_text = None
            return new_session, "", bulk  # caller stores all items

        if _is_cancel(message):
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending_bulk = None
            new_session.original_text = None
            return new_session, "Discarded.", None

        # No correction path for bulk — all-or-nothing
        total = len(session.pending_bulk.items) if session.pending_bulk else 0
        return (
            new_session,
            f"Save all {total} items, or say cancel to discard.",
            None,
        )

    # ── INBOX_CLARIFICATION ──────────────────────────────────────────────────
    if session.state == "INBOX_CLARIFICATION":
        result = await classify_fn(session.original_text, correction_hint=message)
        new_session.state = "AWAITING_CONFIRMATION"
        new_session.pending = result
        new_session.retries = 0
        return new_session, f"Got it: {result.summary}. Sound right?", None

    # Unknown state — reset
    new_session.state = "AWAITING_CAPTURE"
    return new_session, "Let me start fresh.", None
