from app.agents.classifier import ClassificationResult
from app.storage import db

COMPLETION_MAP = {
    "to_hit": "archive",
    "calendar": "archive",
    "to_learn": "absorb",
    "to_cook": "persist",
    "to_know": "answer",
    "inbox": "inbox",
}

ACK_MESSAGES = {
    "to_hit": "Added to your to-dos.",
    "calendar": "Added to your calendar.",
    "to_learn": "Added to your reading list.",
    "to_cook": "Idea saved.",
    "to_know": "Question captured.",
    "inbox": "Saved for later.",
}


class BucketSession:
    def store(self, content: str, result: ClassificationResult) -> str:
        completion_type = COMPLETION_MAP[result.capture_type]
        db.save_capture(
            capture_type=result.capture_type,
            completion_type=completion_type,
            content=content,
            summary=result.summary,
            metadata=result.metadata,
            deadline=result.deadline,
        )
        return ACK_MESSAGES[result.capture_type]
