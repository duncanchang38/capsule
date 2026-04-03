"""
Fire-and-forget agent that generates actionable to_hit captures from a book capture.

When a book is confirmed (to_learn, resource_type=book), this agent asks Claude to
extract 3-5 concrete action items and stores each as a to_hit capture, linked back
to the source via metadata.source_id and metadata.source_title.
"""
import json
import os
import logging
import asyncio
from anthropic import AsyncAnthropicBedrock
from app.storage import db

logger = logging.getLogger(__name__)

client = AsyncAnthropicBedrock(
    aws_region=os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2"),
)

_SYSTEM = """You are an assistant that extracts concrete, actionable tasks from books.

Given a book title and optional topic/author, generate 3-5 specific, actionable items
the reader should do after reading this book. Each item should be a single concrete action —
not vague advice.

Return ONLY valid JSON — a list of strings:
["Action item 1", "Action item 2", "Action item 3"]

Examples for "Atomic Habits" by James Clear:
["Identify one habit to build this month using the habit stack method",
 "Track daily habits with a paper habit tracker for 30 days",
 "Design your environment to make good habits obvious (e.g. put book on nightstand)",
 "Find an accountability partner for the habit you want to build",
 "Write down your 'identity statement' (e.g. I am someone who exercises daily)"]
"""


async def generate_book_actions(
    source_id: int,
    content: str,
    metadata: dict,
) -> None:
    """Generate action items from a book and store each as a to_hit capture."""
    book_title = metadata.get("book_title") or metadata.get("topic") or content
    author = metadata.get("author")
    topic = metadata.get("topic")

    prompt_parts = [f"Book: {book_title}"]
    if author:
        prompt_parts.append(f"Author: {author}")
    if topic:
        prompt_parts.append(f"Topic: {topic}")

    try:
        response = await client.messages.create(
            model="anthropic.claude-3-haiku-20240307-v1:0",
            max_tokens=512,
            system=_SYSTEM,
            messages=[{"role": "user", "content": "\n".join(prompt_parts)}],
        )
        raw = response.content[0].text.strip()
        actions: list[str] = json.loads(raw)

        if not isinstance(actions, list):
            return

        source_label = book_title if len(book_title) <= 40 else book_title[:37] + "..."

        for action in actions[:5]:
            if not isinstance(action, str) or not action.strip():
                continue
            db.save_capture(
                capture_type="to_hit",
                completion_type="archive",
                content=action,
                summary=action,
                metadata={
                    "source_id": source_id,
                    "source_title": source_label,
                    "priority": "normal",
                },
            )
    except Exception as exc:
        logger.warning("book_action_agent failed for capture %d: %s", source_id, exc)
