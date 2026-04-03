"""
On-demand agent: generate concrete next steps from a to_cook idea.

Called when user clicks "Turn into tasks" on an idea card.
Stores 3-5 to_hit captures linked back to the source idea via
metadata.source_id and metadata.source_title.

Returns the count of tasks created.
"""
import json
import os
import logging
from anthropic import AsyncAnthropicBedrock
from app.storage import db

logger = logging.getLogger(__name__)

client = AsyncAnthropicBedrock(
    aws_region=os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2"),
)

_SYSTEM = """You are an execution assistant. The user has an idea they want to act on.

Given the idea summary and optional development threads, generate 3-5 concrete, specific
next steps they should take in the next 1-2 weeks. Each step should be a single actionable task.

Return ONLY valid JSON — a list of strings:
["Task 1", "Task 2", "Task 3"]

Good tasks: "Write a one-page problem statement for [idea]"
Bad tasks: "Think more about the idea" (not actionable)

No explanation, no markdown."""


async def generate_idea_tasks(source_id: int, content: str, metadata: dict) -> int:
    """Generate next-step tasks from an idea. Returns number of tasks created."""
    threads = metadata.get("threads", [])
    domain = metadata.get("domain", "")

    prompt_parts = [f"Idea: {content}"]
    if domain:
        prompt_parts.append(f"Domain: {domain}")
    if threads:
        prompt_parts.append("Development threads:\n" + "\n".join(f"- {t}" for t in threads[:3]))

    try:
        response = await client.messages.create(
            model="anthropic.claude-3-haiku-20240307-v1:0",
            max_tokens=512,
            system=_SYSTEM,
            messages=[{"role": "user", "content": "\n".join(prompt_parts)}],
        )
        raw = response.content[0].text.strip()
        tasks: list[str] = json.loads(raw)

        if not isinstance(tasks, list):
            return 0

        source_label = content[:40] + ("..." if len(content) > 40 else "")
        count = 0
        for task in tasks[:5]:
            if not isinstance(task, str) or not task.strip():
                continue
            db.save_capture(
                capture_type="to_hit",
                completion_type="archive",
                content=task,
                summary=task,
                metadata={
                    "source_id": source_id,
                    "source_title": source_label,
                    "priority": "normal",
                },
            )
            count += 1

        # Advance idea stage to "developing" now that it has tasks
        db.merge_metadata(source_id, {"stage": "developing"})
        return count

    except Exception as exc:
        logger.warning("idea_tasks_agent failed for capture %d: %s", source_id, exc)
        return 0
