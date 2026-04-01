import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

import anthropic
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.agents.classifier import ClassificationResult, classify_intent
from app.agents.bucket_session import BucketSession

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Session state ──────────────────────────────────────────────────────────────

SESSION_TTL = timedelta(hours=1)
MAX_RETRIES = 3

ABANDON_WORDS = {"cancel", "forget it", "nevermind", "never mind", "discard", "stop"}
CONFIRM_WORDS = {"yes", "yep", "yeah", "sure", "ok", "okay", "correct", "right", "sounds good", "yup"}

BUCKET_DISPLAY = {
    "todo": "To Do",
    "to_know": "To Know",
    "to_learn": "To Learn",
    "idea": "Ideas",
    "calendar": "Calendar",
    "inbox": "Inbox",
}


@dataclass
class ConversationState:
    state: str = "AWAITING_CAPTURE"           # AWAITING_CAPTURE | AWAITING_CONFIRMATION | AWAITING_CLASSIFICATION
    pending: ClassificationResult | None = None
    retries: int = 0
    last_active: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_sessions: dict[str, ConversationState] = {}


def _get_session(session_id: str) -> ConversationState:
    """Return existing session or create a new one. Prunes stale sessions."""
    now = datetime.now(timezone.utc)
    stale = [sid for sid, s in _sessions.items() if now - s.last_active > SESSION_TTL]
    for sid in stale:
        del _sessions[sid]
        logger.info("Session %s pruned (TTL expired)", sid)

    if session_id not in _sessions:
        _sessions[session_id] = ConversationState()
        logger.info("Session %s created", session_id)

    session = _sessions[session_id]
    session.last_active = now
    return session


def _reset(session: ConversationState) -> None:
    session.state = "AWAITING_CAPTURE"
    session.pending = None
    session.retries = 0


# ── Request model ──────────────────────────────────────────────────────────────

class Message(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def check_length(cls, v: str) -> str:
        if len(v) > 2000:
            raise ValueError("Input must be 2000 characters or fewer.")
        return v.strip()


# ── SSE helper ────────────────────────────────────────────────────────────────

async def _sse_text(text: str) -> AsyncGenerator[str, None]:
    """Yield a complete text response as SSE events (word by word)."""
    for word in text.split(" "):
        yield f"data: {json.dumps({'text': word + ' '})}\n\n"
    yield "data: [DONE]\n\n"


def _confirmation_message(result: ClassificationResult) -> str:
    label = BUCKET_DISPLAY.get(result.bucket, result.bucket)
    return f'Got it — adding to {label}. "{result.summary}" — Sound right?'


# ── Main handler ───────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(
    message: Message,
    x_session_id: str = Header(default="anonymous"),
):
    session = _get_session(x_session_id)
    text = message.content
    text_lower = text.lower().strip()

    async def respond(reply: str) -> StreamingResponse:
        return StreamingResponse(_sse_text(reply), media_type="text/event-stream")

    # Abandon signal — works in any state
    if any(w in text_lower for w in ABANDON_WORDS):
        _reset(session)
        return await respond("OK, discarded.")

    # ── AWAITING_CAPTURE ──────────────────────────────────────────────────────
    if session.state == "AWAITING_CAPTURE":
        try:
            result = classify_intent(text)
        except (anthropic.APIError, ValueError) as e:
            logger.error("Classifier failed: %s", e)
            _reset(session)
            return await respond("Something went wrong classifying that. Try again?")

        session.pending = result

        if result.bucket == "inbox":
            session.state = "AWAITING_CLASSIFICATION"
            return await respond(
                "I'm not sure where this belongs. Could it be a task, a question to look up, "
                "something to read/learn, or an idea? (todo / to_know / to_learn / idea / calendar)"
            )

        session.state = "AWAITING_CONFIRMATION"
        return await respond(_confirmation_message(result))

    # ── AWAITING_CLASSIFICATION (inbox disambiguation) ─────────────────────────
    if session.state == "AWAITING_CLASSIFICATION":
        bucket_keywords = {
            "todo": "todo", "task": "todo",
            "to_know": "to_know", "know": "to_know", "question": "to_know",
            "to_learn": "to_learn", "learn": "to_learn", "read": "to_learn", "article": "to_learn",
            "idea": "idea", "ideas": "idea",
            "calendar": "calendar", "event": "calendar",
        }
        chosen_bucket = next((v for k, v in bucket_keywords.items() if k in text_lower), None)

        if not chosen_bucket:
            return await respond(
                "Pick one: todo / to_know / to_learn / idea / calendar — or type \"cancel\" to discard."
            )

        original_text = session.pending.metadata.raw if session.pending else text
        try:
            result = classify_intent(original_text, correction_hint=f"Put this in {chosen_bucket}")
            result = ClassificationResult.model_validate({
                **result.model_dump(),
                "bucket": chosen_bucket,
            })
        except (anthropic.APIError, ValueError) as e:
            logger.error("Re-classifier failed: %s", e)
            _reset(session)
            return await respond("Something went wrong. Try again?")

        session.pending = result
        session.state = "AWAITING_CONFIRMATION"
        return await respond(_confirmation_message(result))

    # ── AWAITING_CONFIRMATION ─────────────────────────────────────────────────
    if session.state == "AWAITING_CONFIRMATION":
        result = session.pending

        # Affirmative → store
        if any(w in text_lower for w in CONFIRM_WORDS):
            try:
                ack = BucketSession(result.bucket).store(result, result.summary)
            except Exception as e:
                logger.error("Storage failed: %s", e)
                _reset(session)
                return await respond("Filed, but storage might have an issue — check the logs.")
            _reset(session)
            return await respond(ack)

        # Retry limit hit → ask for explicit bucket
        if session.retries >= MAX_RETRIES:
            _reset(session)
            return await respond(
                "I keep getting confused — want to just pick a bucket? "
                "(todo / to_know / to_learn / idea / calendar)"
            )

        # Correction → re-classify with hint
        session.retries += 1
        try:
            new_result = classify_intent(result.summary, correction_hint=text)
        except (anthropic.APIError, ValueError) as e:
            logger.error("Re-classifier failed: %s", e)
            _reset(session)
            return await respond("Something went wrong. Try again?")

        session.pending = new_result
        return await respond(_confirmation_message(new_result))

    # Should never reach here
    _reset(session)
    return await respond("Something went wrong — let's start over.")
