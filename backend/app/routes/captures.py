import json
import logging
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from anthropic import AsyncAnthropic
from app.storage import db

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_STAGES = {"seed", "brewing", "developing", "ready", "parked"}

_anthropic = AsyncAnthropic()

_DEDUP_SYSTEM = """You are a topic normalizer for a personal knowledge capture app.
Given a list of topic names, group near-duplicates and return one canonical name per cluster.

Rules:
- Prefer formal over colloquial ("Business Management" over "biz")
- Title case
- Max 3 words per topic
- Return ONLY valid JSON: {"canonical": {"<original>": "<canonical>", ...}}
- Every input topic must appear as a key, even if it maps to itself.
"""


async def _dedup_topics(topics: list[dict]) -> list[dict]:
    """Haiku pass to normalize near-duplicate topic names. Falls back to raw list on error."""
    if len(topics) <= 1:
        return topics
    try:
        names = [t["topic"] for t in topics]
        response = await _anthropic.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_DEDUP_SYSTEM,
            messages=[{"role": "user", "content": json.dumps(names)}],
        )
        mapping: dict = json.loads(response.content[0].text.strip()).get("canonical", {})

        # Merge counts under canonical names
        merged: dict[str, int] = {}
        for t in topics:
            canonical = mapping.get(t["topic"], t["topic"])
            merged[canonical] = merged.get(canonical, 0) + t["count"]
        return [{"topic": k, "count": v} for k, v in sorted(merged.items(), key=lambda x: -x[1])]
    except Exception as exc:
        logger.warning("topic dedup failed: %s", exc)
        return topics


@router.post("/captures/save")
async def save_capture_direct(body: dict):
    """Classify and save a capture directly, bypassing the chat state machine."""
    content = (body.get("content") or "").strip()
    notes = body.get("notes")  # optional HTML from rich text editor

    if not content:
        raise HTTPException(status_code=400, detail="content required")

    from app.agents.classifier import classify_intent
    from app.agents.bucket_session import BucketSession

    result = await classify_intent(content)

    if result.capture_type == "query":
        return {"ok": True, "capture_type": "query", "summary": result.summary, "id": None}

    bucket = BucketSession()
    row_id = await bucket.store(content, result)

    if row_id and notes:
        db.update_notes(row_id, notes)

    return {
        "ok": True,
        "id": row_id,
        "capture_type": result.capture_type,
        "summary": result.summary,
        "deadline": result.deadline,
    }


@router.get("/captures/topics")
async def get_topics():
    """Return deduplicated topic list with counts."""
    raw = db.get_topics(limit=30)
    deduped = await _dedup_topics(raw)
    return deduped


@router.get("/captures/{capture_id}")
def get_capture_by_id(capture_id: int):
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    return capture


@router.get("/captures")
def get_captures(
    view: Optional[str] = Query(default=None),
    capture_type: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
):
    if topic is not None:
        return db.get_by_topic(topic)
    if view is not None:
        return db.get_by_view(view)
    if capture_type is not None:
        return db.get_recent(capture_type=capture_type, limit=100)
    return db.get_recent(limit=100)


@router.patch("/captures/{capture_id}/status")
def update_status(capture_id: int, body: dict):
    status = body.get("status")
    if not status:
        return {"error": "status required"}
    db.update_status(capture_id, status)
    return {"ok": True}


@router.patch("/captures/{capture_id}/stage")
def update_stage(capture_id: int, body: dict):
    stage = body.get("stage")
    if not stage:
        return {"error": "stage required"}
    if stage not in VALID_STAGES:
        return {"error": f"stage must be one of {sorted(VALID_STAGES)}"}
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.merge_metadata(capture_id, {"stage": stage})
    return {"ok": True, "stage": stage}


@router.patch("/captures/{capture_id}/schedule")
def schedule_capture(capture_id: int, body: dict):
    """Update a capture's calendar slot: deadline, time, and/or duration."""
    deadline = body.get("deadline")
    time = body.get("time")
    duration_mins = body.get("duration_mins")

    if deadline is None and time is None and duration_mins is None:
        return {"error": "at least one of deadline, time, or duration_mins required"}

    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    db.update_schedule(capture_id, deadline, time, duration_mins)
    return {"ok": True}


@router.post("/captures/{capture_id}/sprint-preview")
async def sprint_preview(capture_id: int, body: dict):
    """Return AI-generated session names without creating captures."""
    count = max(2, min(8, int(body.get("count", 3))))
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    from app.agents.sprint_agent import generate_sprint_names
    names = await generate_sprint_names(capture["summary"], capture["capture_type"], count)
    return {"names": names}


_COMPLETION_MAP = {
    "to_hit": "archive",
    "to_learn": "absorb",
    "to_cook": "persist",
    "to_know": "answer",
    "calendar": "archive",
}


@router.post("/captures/{capture_id}/sprints")
async def create_sprints(capture_id: int, body: dict):
    """Break a capture into N scheduled sprint sessions."""
    count = max(2, min(8, int(body.get("count", 3))))
    duration_mins = int(body.get("duration_mins", 60))
    start_time = body.get("start_time", "09:00")
    start_date_str = body.get("start_date")
    use_ai_names = bool(body.get("use_ai_names", True))
    # spacing: "daily" | "every_other" | "weekly" (default: daily on weekdays)
    spacing = body.get("spacing", "daily")

    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    # AI session names (or mechanical fallback)
    from app.agents.sprint_agent import generate_sprint_names
    names = (
        await generate_sprint_names(capture["summary"], capture["capture_type"], count)
        if use_ai_names
        else [f"Session {i + 1}" for i in range(count)]
    )

    # Scheduled dates based on spacing
    start = (
        date.fromisoformat(start_date_str)
        if start_date_str
        else date.today() + timedelta(days=1)
    )
    step = {"daily": 1, "every_other": 2, "weekly": 7}.get(spacing, 1)
    dates: list[date] = []
    cursor = start
    while len(dates) < count:
        if spacing == "weekly" or cursor.weekday() < 5:  # weekends skipped unless weekly
            dates.append(cursor)
        cursor += timedelta(days=step)

    completion = _COMPLETION_MAP.get(capture["capture_type"], "archive")
    sprint_ids: list[int] = []

    for i, (name, d) in enumerate(zip(names, dates)):
        meta = {
            "source_id": capture_id,
            "source_title": capture["summary"],
            "sprint_index": i + 1,
            "sprint_total": count,
            "duration_mins": duration_mins,
            "time": start_time,
        }
        row_id = db.save_capture(
            capture_type=capture["capture_type"],
            completion_type=completion,
            content=f"{capture['content']} — {name}",
            summary=name,
            metadata=meta,
            deadline=d.isoformat(),
        )
        sprint_ids.append(row_id)

    db.merge_metadata(capture_id, {"sprint_count": count, "sprint_ids": sprint_ids})
    return {"ok": True, "sprint_ids": sprint_ids, "count": count}


@router.patch("/captures/{capture_id}/defer")
def defer_capture(capture_id: int, body: dict):
    """Defer a capture to a future date (default: tomorrow)."""
    from datetime import date, timedelta
    defer_to = body.get("defer_to") or (date.today() + timedelta(days=1)).isoformat()
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.merge_metadata(capture_id, {"deferred_to": defer_to})
    return {"ok": True, "deferred_to": defer_to}


@router.patch("/captures/{capture_id}/notes")
def update_notes(capture_id: int, body: dict):
    """Save the free-form notes for a capture."""
    notes = body.get("notes", "")
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_notes(capture_id, notes)
    return {"ok": True}


@router.post("/captures/{capture_id}/organize")
async def organize_notes(capture_id: int):
    """AI-organize the capture's existing notes into structured markdown."""
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    if not capture.get("notes", "").strip():
        raise HTTPException(status_code=400, detail="No notes to organize")
    from app.agents.organize_agent import organize_capture
    organized = await organize_capture(capture)
    db.update_notes(capture_id, organized)
    return {"ok": True, "notes": organized}


@router.post("/captures/{capture_id}/tasks")
async def generate_tasks(capture_id: int):
    capture = db.get_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    if capture["capture_type"] != "to_cook":
        return {"error": "tasks can only be generated from to_cook captures"}
    from app.agents.idea_tasks_agent import generate_idea_tasks
    count = await generate_idea_tasks(capture_id, capture["content"], capture["metadata"])
    return {"ok": True, "count": count}
