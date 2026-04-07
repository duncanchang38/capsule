import json
import logging
from datetime import date, timedelta, datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.storage import db
from app.agents.client import anthropic_client as _anthropic, HAIKU
from app.auth.deps import CurrentUser

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_STAGES = {"seed", "brewing", "developing", "ready", "parked"}

_DEDUP_SYSTEM = """You are a topic normalizer for a personal knowledge capture app.
Given a list of topic names, group near-duplicates and return one canonical name per cluster.

Rules:
- Prefer formal over colloquial ("Business Management" over "biz")
- Title case
- Max 3 words per topic
- Return ONLY valid JSON: {"canonical": {"<original>": "<canonical>", ...}}
- Every input topic must appear as a key, even if it maps to itself.
"""

# In-memory cache: keyed on frozenset of (topic, count) tuples from the raw DB result.
# Invalidated automatically when the raw list changes (new capture, rename, etc.).
_dedup_cache: dict[frozenset, list[dict]] = {}


async def _dedup_topics(topics: list[dict]) -> list[dict]:
    """Haiku pass to normalize near-duplicate topic names. Falls back to raw list on error."""
    if len(topics) <= 1:
        return topics

    cache_key = frozenset((t["topic"], t["count"]) for t in topics)
    if cache_key in _dedup_cache:
        return _dedup_cache[cache_key]

    try:
        names = [t["topic"] for t in topics]
        response = await _anthropic.messages.create(
            model=HAIKU,
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
        result = [{"topic": k, "count": v} for k, v in sorted(merged.items(), key=lambda x: -x[1])]
        _dedup_cache[cache_key] = result
        return result
    except Exception as exc:
        logger.warning("topic dedup failed: %s", exc)
        return topics


@router.post("/captures/save")
async def save_capture_direct(body: dict, user_id: CurrentUser):
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
    row_id = await bucket.store(content, result, user_id=user_id)

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
async def get_topics(user_id: CurrentUser):
    """Return deduplicated topic list with counts."""
    raw = db.get_topics(limit=30, user_id=user_id)
    deduped = await _dedup_topics(raw)
    return deduped


@router.get("/captures/stats")
def get_capture_stats(user_id: CurrentUser, today: str = Query(...)):
    """Activity stats: streak + today's captured/completed/deferred counts."""
    return db.get_activity_stats(user_id, today)


@router.get("/captures/graph")
def get_capture_graph(user_id: CurrentUser):
    """Return entity graph: nodes (captures) + edges (shared entities)."""
    return db.get_entity_graph(user_id=user_id)


@router.patch("/captures/topics/rename")
def rename_topic(body: dict):
    """Rename a topic across all captures that share it."""
    old = (body.get("from") or "").strip()
    new = (body.get("to") or "").strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="from and to are required")
    count = db.rename_topic(old, new)
    return {"updated": count}


@router.get("/captures/tags")
def get_all_tags(user_id: CurrentUser):
    """Return all distinct tag values (from tags array + legacy topic field)."""
    return db.get_all_tags(user_id=user_id)


@router.patch("/captures/{capture_id}/tags")
def update_tags(capture_id: int, body: dict, user_id: CurrentUser):
    """Set the tags array for a capture."""
    tags = body.get("tags")
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="tags must be a list")
    tags = [str(t).strip() for t in tags if str(t).strip()]
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_capture_tags(capture_id, tags)
    return {"ok": True, "tags": tags}


@router.get("/captures/{capture_id}")
def get_capture_by_id(capture_id: int, user_id: CurrentUser):
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    return capture


@router.get("/captures")
def get_captures(
    user_id: CurrentUser,
    view: Optional[str] = Query(default=None),
    capture_type: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
):
    if topic is not None:
        return db.get_captures_by_tag(topic, user_id=user_id)
    if view is not None:
        return db.get_by_view(view, user_id=user_id)
    if capture_type is not None:
        return db.get_recent(capture_type=capture_type, limit=100, user_id=user_id)
    return db.get_recent(limit=100, user_id=user_id)


@router.patch("/captures/{capture_id}/status")
def update_status(capture_id: int, body: dict, user_id: CurrentUser):
    status = body.get("status")
    if not status:
        return {"error": "status required"}

    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    db.update_status(capture_id, status)

    # Stamp deleted_at when moving to deletion bin; clear it on restore.
    # Done states (done, absorbed, answered) are permanent — no TTL timestamp.
    capture = db.get_capture(capture_id)
    if capture:
        meta = dict(capture.get("metadata") or {})
        if status == "active":
            meta.pop("deleted_at", None)
        elif status == "deleted":
            # Only stamp once so the 30-day clock isn't reset on re-delete
            if "deleted_at" not in meta:
                meta["deleted_at"] = datetime.now(timezone.utc).isoformat()
        db.update_metadata(capture_id, meta)

    return {"ok": True}


@router.patch("/captures/{capture_id}/stage")
def update_stage(capture_id: int, body: dict, user_id: CurrentUser):
    stage = body.get("stage")
    if not stage:
        return {"error": "stage required"}
    if stage not in VALID_STAGES:
        return {"error": f"stage must be one of {sorted(VALID_STAGES)}"}
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.merge_metadata(capture_id, {"stage": stage})
    return {"ok": True, "stage": stage}


@router.patch("/captures/{capture_id}/schedule")
def schedule_capture(capture_id: int, body: dict, user_id: CurrentUser):
    """Update a capture's calendar slot: deadline, time, and/or duration."""
    deadline = body.get("deadline")
    time = body.get("time")
    duration_mins = body.get("duration_mins")

    if deadline is None and time is None and duration_mins is None:
        return {"error": "at least one of deadline, time, or duration_mins required"}

    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    db.update_schedule(capture_id, deadline, time, duration_mins)
    return {"ok": True}


@router.post("/captures/{capture_id}/sprint-preview")
async def sprint_preview(capture_id: int, body: dict, user_id: CurrentUser):
    """Return AI-generated session names without creating captures."""
    count = max(2, min(8, int(body.get("count", 3))))
    capture = db.get_capture(capture_id, user_id=user_id)
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
    "project": "archive",
}


@router.post("/captures/{capture_id}/sprints")
async def create_sprints(capture_id: int, body: dict, user_id: CurrentUser):
    """Break a capture into N scheduled sprint sessions."""
    count = max(2, min(8, int(body.get("count", 3))))
    duration_mins = int(body.get("duration_mins", 60))
    start_time = body.get("start_time", "09:00")
    start_date_str = body.get("start_date")
    use_ai_names = bool(body.get("use_ai_names", True))
    # spacing: "daily" | "every_other" | "weekly" (default: daily on weekdays)
    spacing = body.get("spacing", "daily")

    capture = db.get_capture(capture_id, user_id=user_id)
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
def defer_capture(capture_id: int, body: dict, user_id: CurrentUser):
    """Defer a capture to a future date (default: tomorrow)."""
    from datetime import date, timedelta
    defer_to = body.get("defer_to") or (date.today() + timedelta(days=1)).isoformat()
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.merge_metadata(capture_id, {"deferred_to": defer_to})
    return {"ok": True, "deferred_to": defer_to}


VALID_TYPES = {"to_hit", "to_learn", "to_cook", "to_know", "calendar", "project", "inbox"}

@router.patch("/captures/{capture_id}/type")
def update_capture_type(capture_id: int, body: dict, user_id: CurrentUser):
    """Change the capture type (and derived completion_type) for a capture."""
    new_type = (body.get("capture_type") or "").strip()
    if new_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {VALID_TYPES}")
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_capture_type(capture_id, new_type)
    return {"ok": True, "capture_type": new_type}


@router.patch("/captures/{capture_id}/topic")
def update_topic(capture_id: int, body: dict, user_id: CurrentUser):
    """Update the topic for a capture."""
    topic = (body.get("topic") or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="topic required")
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_capture_topic(capture_id, topic)
    return {"ok": True, "topic": topic}


_SUGGEST_TITLE_SYSTEM = """You are a title editor for a personal knowledge base.
Given a document's content, suggest a single clear, descriptive title for it.

Rules:
- The title should be concise (2-8 words) and describe what the document IS or COVERS
- Prefer specific over generic: "Tokyo Trip Planning — May 2026" beats "Trip Notes"
- Use title case
- Return ONLY the title text — no quotes, no punctuation at end, no explanation
"""


@router.post("/captures/{capture_id}/suggest-title")
async def suggest_title(capture_id: int, user_id: CurrentUser):
    """Use AI to suggest a better document title based on its content."""
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    current_title = capture.get("summary", "")
    content_preview = (capture.get("notes") or capture.get("content") or "")[:1500]

    prompt = f"Current title: {current_title}\n\nDocument content:\n{content_preview}"

    response = await _anthropic.messages.create(
        model=HAIKU,
        max_tokens=40,
        system=_SUGGEST_TITLE_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    suggested = response.content[0].text.strip().strip('"').strip("'")
    return {"suggested": suggested, "current": current_title}


@router.patch("/captures/{capture_id}/notes")
def update_notes(capture_id: int, body: dict, user_id: CurrentUser):
    """Save the free-form notes for a capture."""
    notes = body.get("notes", "")
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_notes(capture_id, notes)
    return {"ok": True}


@router.patch("/captures/{capture_id}/summary")
def update_summary(capture_id: int, body: dict, user_id: CurrentUser):
    """Update the display summary for a capture (synced from editor H1)."""
    summary = (body.get("summary") or "").strip()
    if not summary:
        return {"error": "summary required"}
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_summary(capture_id, summary)
    return {"ok": True}


@router.get("/captures/{capture_id}/related")
def get_related(capture_id: int, user_id: CurrentUser, limit: int = 5):
    """Return captures related by entity overlap (GraphRAG). Excludes self."""
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    related = db.get_related_by_entities(capture_id, limit=limit, min_score=0.3)
    return {"related": related}


@router.get("/captures/{capture_id}/backlinks")
def get_backlinks(capture_id: int, user_id: CurrentUser, limit: int = 10):
    """Return captures that share at least one tag with this capture (structural backlinks)."""
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    backlinks = db.get_backlinks(capture_id, user_id=user_id, limit=limit)
    return {"backlinks": backlinks}


@router.post("/captures/{capture_id}/organize")
async def organize_notes(capture_id: int, user_id: CurrentUser):
    """
    AI-organize the capture's notes.
    If the capture belongs to an entity cluster, synthesize the whole cluster.
    Falls back to single-capture organize when no cluster is found.
    Also checks for merge candidates (user-triggered, so no auto-background cost).
    """
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    if not capture.get("notes", "").strip():
        raise HTTPException(status_code=400, detail="No notes to organize")

    cluster = db.get_entity_cluster(capture_id, min_score=0.4, limit=6)

    if cluster and len(cluster) > 1:
        from app.agents.organize_agent import synthesize_cluster
        organized = await synthesize_cluster(cluster)
        mode = "cluster"
        cluster_size = len(cluster)
    else:
        from app.agents.organize_agent import organize_capture
        organized = await organize_capture(capture)
        mode = "single"
        cluster_size = 1

    db.update_notes(capture_id, organized)

    # Merge suggestion — only run when user explicitly clicks Organize (not on save)
    # Uses entity overlap + topic match (free) first, LLM fallback only if no match
    merge_suggestion = None
    if capture.get("capture_type") not in ("calendar", "inbox", "query"):
        try:
            from app.agents.similarity_agent import check_and_suggest_merge
            topic = (capture.get("metadata") or {}).get("topic")
            await check_and_suggest_merge(
                capture_id, capture["summary"], topic, capture["capture_type"]
            )
            # Read back the updated capture to get the stored merge_suggestion (if any)
            updated = db.get_capture(capture_id)
            if updated:
                merge_suggestion = (updated.get("metadata") or {}).get("merge_suggestion")
        except Exception as exc:
            logger.warning("merge check failed for capture %d: %s", capture_id, exc)

    return {"ok": True, "notes": organized, "mode": mode, "cluster_size": cluster_size,
            "merge_suggestion": merge_suggestion}


@router.patch("/captures/{capture_id}/dismiss-merge")
def dismiss_merge_suggestion(capture_id: int, user_id: CurrentUser):
    """Remove the merge_suggestion from a capture's metadata."""
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    meta = dict(capture.get("metadata") or {})
    meta.pop("merge_suggestion", None)
    db.update_metadata(capture_id, meta)
    return {"ok": True}


@router.post("/captures/{capture_id}/merge-into/{target_id}")
def merge_capture(capture_id: int, target_id: int, user_id: CurrentUser):
    """
    Merge capture_id into target_id:
    - Append capture_id's notes to target_id's notes (if any)
    - Archive capture_id
    - Remove merge_suggestion from both
    """
    try:
        source = db.get_capture(capture_id, user_id=user_id)
        target = db.get_capture(target_id, user_id=user_id)
        if not source or not target:
            raise HTTPException(status_code=404, detail="Capture not found")

        # Append source notes to target notes
        source_notes = (source.get("notes") or "").strip()
        if source_notes:
            existing = (target.get("notes") or "").strip()
            separator = "\n\n---\n\n" if existing else ""
            db.update_notes(target_id, existing + separator + source_notes)

        # Archive the source
        db.update_status(capture_id, "archived")

        # Clean up merge_suggestion from both
        for cid, cap in [(capture_id, source), (target_id, target)]:
            meta = dict(cap.get("metadata") or {})
            meta.pop("merge_suggestion", None)
            db.update_metadata(cid, meta)

        return {"ok": True, "merged_into": target_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("merge_capture failed: capture_id=%d target_id=%d", capture_id, target_id)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/captures/{capture_id}/re-enrich")
async def re_enrich(capture_id: int, user_id: CurrentUser):
    """Re-run enrichment for a capture (useful when title/topic was wrong on first pass)."""
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    import asyncio
    if capture["capture_type"] == "to_learn":
        from app.agents.to_learn_agent import enrich_to_learn
        asyncio.create_task(enrich_to_learn(capture_id, capture["content"], capture.get("metadata") or {}))
    elif capture["capture_type"] == "to_know":
        from app.agents.to_know_agent import research_to_know
        asyncio.create_task(research_to_know(capture_id, capture["content"], capture.get("metadata") or {}))
    else:
        return {"ok": False, "detail": "re-enrich not supported for this type"}
    return {"ok": True}


@router.patch("/captures/{capture_id}/restore")
def restore_capture(capture_id: int, user_id: CurrentUser):
    """Restore an archived capture back to active status."""
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    db.update_status(capture_id, "active")
    meta = dict(capture.get("metadata") or {})
    meta.pop("archived_at", None)
    db.update_metadata(capture_id, meta)
    return {"ok": True}


@router.post("/captures/{capture_id}/tasks")
async def generate_tasks(capture_id: int, user_id: CurrentUser):
    capture = db.get_capture(capture_id, user_id=user_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    if capture["capture_type"] != "to_cook":
        return {"error": "tasks can only be generated from to_cook captures"}
    from app.agents.idea_tasks_agent import generate_idea_tasks
    count = await generate_idea_tasks(capture_id, capture["content"], capture["metadata"])
    return {"ok": True, "count": count}
