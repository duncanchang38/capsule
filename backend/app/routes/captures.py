from fastapi import APIRouter
from app.storage import db

router = APIRouter()


@router.get("/captures")
def get_captures():
    return db.get_recent(limit=100)


@router.patch("/captures/{capture_id}/status")
def update_status(capture_id: int, body: dict):
    status = body.get("status")
    if not status:
        return {"error": "status required"}
    db.update_status(capture_id, status)
    return {"ok": True}
