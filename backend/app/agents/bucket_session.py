import asyncio
from app.agents.classifier import ClassificationResult
from app.storage import db

COMPLETION_MAP = {
    "to_hit":   "archive",
    "calendar": "archive",
    "to_learn": "absorb",
    "to_cook":  "persist",
    "to_know":  "answer",
    "inbox":    "inbox",
    "query":    None,   # noop — never stored
}

ACK_MESSAGES = {
    "to_hit":   "Added to your to-dos.",
    "calendar": "Added to your calendar.",
    "to_learn": "Added to your reading list.",
    "to_cook":  "Idea saved.",
    "to_know":  "Question captured.",
    "inbox":    "Saved for later.",
}


class BucketSession:
    async def store(self, content: str, result: ClassificationResult) -> str:
        completion_type = COMPLETION_MAP.get(result.capture_type)

        if completion_type is None:
            # query type or unknown — no storage
            return "Got it."

        row_id = db.save_capture(
            capture_type=result.capture_type,
            completion_type=completion_type,
            content=content,
            summary=result.summary,
            metadata=result.metadata,
            deadline=result.deadline,
        )

        if result.capture_type == "to_learn":
            from app.agents.to_learn_agent import enrich_to_learn
            asyncio.create_task(enrich_to_learn(row_id, content, result.metadata))
            if result.metadata.get("resource_type") == "book":
                from app.agents.book_action_agent import generate_book_actions
                asyncio.create_task(generate_book_actions(row_id, content, result.metadata))

        if result.capture_type == "to_know":
            from app.agents.to_know_agent import research_to_know
            asyncio.create_task(research_to_know(row_id, content, result.metadata))

        if result.capture_type == "to_cook":
            from app.agents.cook_agent import expand_idea
            asyncio.create_task(expand_idea(row_id, content, result.metadata))

        return ACK_MESSAGES.get(result.capture_type, "Saved.")
