import json
import time
from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.session.state_machine import SessionState, advance
from app.agents.bucket_session import BucketSession
from app.agents.classifier import BulkClassificationResult
from app.agents import query_agent

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


def _extract_topic(result) -> str | None:
    """Pull the best topic label from a classification result for the toast."""
    meta = result.metadata or {}
    return meta.get("topic") or meta.get("domain") or None


@router.post("/chat")
async def chat(req: ChatRequest, x_user_id: str = Header(default="default")):
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
                count = 0
                for item in capture_to_store.items:
                    await bucket.store(item.summary, item, user_id=x_user_id)
                    count += 1
                yield _sse("saved", {"type": "bulk", "count": count})

            elif capture_to_store.capture_type == "query":
                answer = await query_agent.answer(req.message)
                yield _sse("message", {"text": answer})

            else:
                content = new_state.original_text or req.message
                row_id = await bucket.store(content, capture_to_store, user_id=x_user_id)
                if row_id is not None:
                    yield _sse("saved", {
                        "type": "capture",
                        "id": row_id,
                        "capture_type": capture_to_store.capture_type,
                        "summary": capture_to_store.summary,
                        "topic": _extract_topic(capture_to_store),
                    })

        elif reply:
            yield _sse("message", {"text": reply})

        yield _sse("done", {})

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.delete("/captures/deleted")
def clear_deleted():
    """Permanently delete all captures in the deletion bin."""
    from app.storage import db
    db.clear_deleted()
    return {"ok": True}


@router.delete("/captures/{capture_id}")
async def delete_capture(capture_id: int):
    from app.storage import db
    capture = db.get_capture(capture_id)
    if not capture:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Capture not found")
    db.delete_capture(capture_id)
    return {"ok": True}
