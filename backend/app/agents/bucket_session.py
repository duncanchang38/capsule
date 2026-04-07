import asyncio
import re
from app.agents.classifier import ClassificationResult
from app.storage import db

_URL_RE = re.compile(r'https?://\S+')

COMPLETION_MAP = {
    "to_hit":   "archive",
    "calendar": "archive",
    "to_learn": "absorb",
    "to_cook":  "persist",
    "to_know":  "answer",
    "query":    None,   # noop — never stored
}


class BucketSession:
    async def store(
        self,
        content: str,
        result: ClassificationResult,
        user_id: str = "default",
    ) -> int | None:
        """Store a capture and fire async enrichment tasks. Returns row_id or None."""
        completion_type = COMPLETION_MAP.get(result.capture_type)

        if completion_type is None:
            return None

        # Seed notes with original content if it contains URLs or is multi-line
        initial_notes: str | None = None
        if _URL_RE.search(content) or "\n" in content.strip():
            initial_notes = content.strip()

        row_id = db.save_capture(
            capture_type=result.capture_type,
            completion_type=completion_type,
            content=content,
            summary=result.summary,
            metadata=result.metadata,
            deadline=result.deadline,
            notes=initial_notes,
            user_id=user_id,
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

        # GraphRAG: extract entities for all stored captures except calendar
        if result.capture_type not in ("calendar", "inbox", "query"):
            from app.agents.entity_agent import extract_entities
            asyncio.create_task(extract_entities(row_id, result.summary, content))

        return row_id
