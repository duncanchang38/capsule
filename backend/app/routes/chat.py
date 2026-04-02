import json
import time
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.agents.classifier import classify_intent, ClassificationResult
from app.agents.bucket_session import BucketSession

router = APIRouter()

# In-memory session store: session_id → state dict
_sessions: dict[str, dict] = {}
SESSION_TTL = 3600  # 1 hour

AFFIRM_WORDS = {"yes", "yeah", "yep", "yup", "correct", "right", "ok", "okay", "sure", "sounds good", "confirm", "go", "do it", "save it", "saved"}
CANCEL_WORDS = {"no", "nope", "cancel", "discard", "nevermind", "never mind", "stop", "abort", "delete"}


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


def _is_affirm(text: str) -> bool:
    return text.strip().lower() in AFFIRM_WORDS


def _is_cancel(text: str) -> bool:
    return text.strip().lower() in CANCEL_WORDS


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _prune_sessions():
    now = time.time()
    stale = [sid for sid, s in _sessions.items() if now - s.get("last_active", 0) > SESSION_TTL]
    for sid in stale:
        del _sessions[sid]


def _get_session(session_id: str) -> dict:
    _prune_sessions()
    if session_id not in _sessions:
        _sessions[session_id] = {
            "state": "AWAITING_CAPTURE",
            "pending": None,   # ClassificationResult
            "original_text": None,
            "retries": 0,
            "last_active": time.time(),
        }
    _sessions[session_id]["last_active"] = time.time()
    return _sessions[session_id]


@router.post("/chat")
async def chat(req: ChatRequest):
    if len(req.message) > 2000:
        async def too_long():
            yield _sse("message", {"text": "That's a bit long — keep it under 2000 characters."})
            yield _sse("done", {})
        return StreamingResponse(too_long(), media_type="text/event-stream")

    session = _get_session(req.session_id)
    bucket = BucketSession()

    async def stream():
        state = session["state"]

        # ── AWAITING_CAPTURE ──────────────────────────────────────────────────
        if state == "AWAITING_CAPTURE":
            try:
                result: ClassificationResult = classify_intent(req.message)
            except Exception as e:
                yield _sse("message", {"text": f"Couldn't classify that — try again. ({e})"})
                yield _sse("done", {})
                return

            if result.capture_type == "inbox" or result.confidence < 0.4:
                session["state"] = "INBOX_CLARIFICATION"
                session["original_text"] = req.message
                yield _sse("message", {"text": "Is this something you need to do, something to explore, or a question you want answered?"})
                yield _sse("done", {})
                return

            session["state"] = "AWAITING_CONFIRMATION"
            session["pending"] = result
            session["original_text"] = req.message
            session["retries"] = 0

            yield _sse("message", {"text": f"Got it: {result.summary}. Sound right?"})
            yield _sse("done", {})

        # ── AWAITING_CONFIRMATION ─────────────────────────────────────────────
        elif state == "AWAITING_CONFIRMATION":
            pending: ClassificationResult = session["pending"]

            if _is_affirm(req.message):
                ack = bucket.store(session["original_text"], pending)
                session["state"] = "AWAITING_CAPTURE"
                session["pending"] = None
                session["original_text"] = None
                yield _sse("message", {"text": ack})
                yield _sse("done", {})

            elif _is_cancel(req.message):
                session["state"] = "AWAITING_CAPTURE"
                session["pending"] = None
                session["original_text"] = None
                yield _sse("message", {"text": "Discarded."})
                yield _sse("done", {})

            else:
                # Treat as a correction
                retries = session["retries"] + 1
                session["retries"] = retries

                if retries >= 3:
                    session["state"] = "AWAITING_CAPTURE"
                    session["pending"] = None
                    session["original_text"] = None
                    yield _sse("message", {"text": "Let me start over — just re-type what you want to capture."})
                    yield _sse("done", {})
                    return

                try:
                    result = classify_intent(session["original_text"], correction_hint=req.message)
                except Exception as e:
                    yield _sse("message", {"text": f"Couldn't re-classify — try again. ({e})"})
                    yield _sse("done", {})
                    return

                session["pending"] = result
                yield _sse("message", {"text": f"Got it: {result.summary}. Sound right?"})
                yield _sse("done", {})

        # ── INBOX_CLARIFICATION ───────────────────────────────────────────────
        elif state == "INBOX_CLARIFICATION":
            try:
                result = classify_intent(
                    session["original_text"],
                    correction_hint=req.message,
                )
            except Exception as e:
                yield _sse("message", {"text": f"Couldn't classify — try again. ({e})"})
                yield _sse("done", {})
                return

            session["state"] = "AWAITING_CONFIRMATION"
            session["pending"] = result
            session["retries"] = 0

            yield _sse("message", {"text": f"Got it: {result.summary}. Sound right?"})
            yield _sse("done", {})

    return StreamingResponse(stream(), media_type="text/event-stream")
