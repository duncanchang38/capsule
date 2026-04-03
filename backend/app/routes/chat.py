import json
import time
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.session.state_machine import SessionState, advance
from app.agents.bucket_session import BucketSession
from app.agents.classifier import BulkClassificationResult
from app.agents import query_agent
from app.storage import db

router = APIRouter()

_sessions: dict[str, SessionState] = {}
SESSION_TTL = 3600  # 1 hour


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _prune_sessions():
    now = time.time()
    stale = [sid for sid, s in _sessions.items() if now - s.last_active > SESSION_TTL]
    for sid in stale:
        del _sessions[sid]


def _get_session(session_id: str) -> SessionState:
    _prune_sessions()
    if session_id not in _sessions:
        _sessions[session_id] = SessionState()
    return _sessions[session_id]


def _conflict_note(deadline: str) -> str:
    """Return a conflict warning string if other items exist on the same date."""
    conflicts = [c for c in db.get_by_view("calendar") if c["deadline"] == deadline]
    if not conflicts:
        return ""
    names = ", ".join(c["summary"] for c in conflicts[:3])
    return f" Heads up: you already have {names} that day."


@router.post("/chat")
async def chat(req: ChatRequest):
    if len(req.message) > 10000:
        async def too_long():
            yield _sse("message", {"text": "That's too long — keep it under 10,000 characters."})
            yield _sse("done", {})
        return StreamingResponse(too_long(), media_type="text/event-stream")

    session = _get_session(req.session_id)
    bucket = BucketSession()

    async def stream():
        try:
            new_state, reply, capture_to_store = await advance(session, req.message)
        except Exception as e:
            yield _sse("message", {"text": f"Something went wrong — try again. ({e})"})
            yield _sse("done", {})
            return

        _sessions[req.session_id] = new_state

        if capture_to_store is not None:
            if isinstance(capture_to_store, BulkClassificationResult):
                # Bulk save — store each item separately, fire enrichment per item
                count = 0
                for item in capture_to_store.items:
                    await bucket.store(item.summary, item)
                    count += 1
                yield _sse("message", {"text": f"Saved {count} items."})
            elif capture_to_store.capture_type == "query":
                # Queries bypass storage — answer immediately from captures context
                answer = await query_agent.answer(req.message)
                yield _sse("message", {"text": answer})
            else:
                content = session.original_text if session.original_text else req.message
                ack = await bucket.store(content, capture_to_store)
                yield _sse("message", {"text": ack})

        elif reply:
            # Entering AWAITING_CONFIRMATION — check for calendar conflicts
            if (
                new_state.state == "AWAITING_CONFIRMATION"
                and new_state.pending is not None
                and new_state.pending.capture_type == "calendar"
                and new_state.pending.deadline
            ):
                note = _conflict_note(new_state.pending.deadline)
                yield _sse("message", {"text": reply + note})
            else:
                yield _sse("message", {"text": reply})

        yield _sse("done", {})

    return StreamingResponse(stream(), media_type="text/event-stream")
