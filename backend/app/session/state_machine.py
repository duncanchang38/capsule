"""
State machine for the capture flow.

States:
  AWAITING_CAPTURE            → single item → classify → store immediately (return result)
                              → bulk list  → bulk_classify → AWAITING_BULK_CONFIRMATION
                              → query      → execute immediately (no storage)
  AWAITING_BULK_CONFIRMATION  → affirm → BulkClassificationResult returned
                              → cancel → reset

advance() is the only public function. Returns:
  (new_session, reply_text, capture_to_store | None)
  capture_to_store is ClassificationResult | BulkClassificationResult | None.
"""
import time
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable

from app.agents.classifier import ClassificationResult, BulkClassificationResult

CANCEL_WORDS = {
    "no", "nope", "cancel", "discard", "nevermind", "never mind",
    "stop", "abort", "delete",
}
AFFIRM_WORDS = {
    "yes", "yeah", "yep", "yup", "correct", "right", "ok", "okay",
    "sure", "sounds good", "confirm", "go", "do it", "save it", "saved",
}

_TYPE_LABELS = {
    "to_hit": "task", "to_learn": "item", "to_cook": "idea",
    "to_know": "question", "calendar": "event", "inbox": "item",
}


@dataclass
class SessionState:
    state: str = "AWAITING_CAPTURE"
    pending_bulk: Optional[BulkClassificationResult] = None
    original_text: Optional[str] = None
    last_active: float = field(default_factory=time.time)


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
        pending_bulk=session.pending_bulk,
        original_text=session.original_text,
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

        # Queries execute immediately, no storage
        if result.capture_type == "query":
            return new_session, "", result

        # All other types (including inbox/low-confidence) — store immediately
        new_session.state = "AWAITING_CAPTURE"
        new_session.original_text = message
        return new_session, "", result

    # ── AWAITING_BULK_CONFIRMATION ───────────────────────────────────────────
    if session.state == "AWAITING_BULK_CONFIRMATION":
        if message.strip().lower() in AFFIRM_WORDS:
            bulk = session.pending_bulk
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending_bulk = None
            new_session.original_text = None
            return new_session, "", bulk

        if message.strip().lower() in CANCEL_WORDS:
            new_session.state = "AWAITING_CAPTURE"
            new_session.pending_bulk = None
            new_session.original_text = None
            return new_session, "Discarded.", None

        total = len(session.pending_bulk.items) if session.pending_bulk else 0
        return (
            new_session,
            f"Save all {total} items, or say cancel to discard.",
            None,
        )

    # Unknown state — reset
    new_session.state = "AWAITING_CAPTURE"
    return new_session, "Let me start fresh.", None
