import logging

from app.agents.classifier import ClassificationResult
from app.storage import db

logger = logging.getLogger(__name__)

BUCKET_LABELS = {
    "todo": "To Do",
    "to_know": "To Know",
    "to_learn": "To Learn",
    "idea": "Ideas",
    "calendar": "Calendar",
    "inbox": "Inbox",
}


class BucketSession:
    def __init__(self, bucket: str) -> None:
        self.bucket = bucket

    def store(self, result: ClassificationResult, original_text: str) -> str:
        """
        Persist the capture to SQLite and return an acknowledgment string.
        Raises on DB failure — caller handles it and resets state.
        """
        db.save_capture(result, original_text)
        recent = db.get_recent(self.bucket, limit=20)
        count = len(recent)
        label = BUCKET_LABELS.get(self.bucket, self.bucket.title())
        return f"Added to {label}. {count} item{'s' if count != 1 else ''} total."
