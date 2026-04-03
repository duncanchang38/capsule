from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.storage import db

router = APIRouter()

VALID_STAGES = {"seed", "brewing", "developing", "ready", "parked"}


@router.get("/captures")
def get_captures(
    view: Optional[str] = Query(default=None),
    capture_type: Optional[str] = Query(default=None),
):
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
