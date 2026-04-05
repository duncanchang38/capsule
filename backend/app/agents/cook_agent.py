"""
Fire-and-forget enrichment agent for to_cook captures.

After an idea is confirmed and stored, this agent:
1. Expands the seed into 3-5 development threads (key questions to answer)
2. Refines the domain label
3. Sets metadata.stage = "seed" (starting stage in the idea lifecycle)

Metadata written back:
  threads: list[str]  — development directions
  domain:  str        — refined domain (e.g. "consumer product / health")
  stage:   str        — always "seed" on first expansion
"""
import json
import os
import logging
from anthropic import AsyncAnthropicBedrock
from app.storage import db

logger = logging.getLogger(__name__)

client = AsyncAnthropicBedrock()

_SYSTEM = """You are an idea development assistant.

The user has captured a seed idea. Your job: expand it into development threads — the 3-5
most important questions or directions they'd need to explore to develop this idea further.

Also provide a refined domain label (e.g. "consumer app / habit formation", "content / writing",
"business / B2B SaaS").

Return ONLY valid JSON:
{
  "threads": ["Question or direction 1", "Question or direction 2", ...],
  "domain": "category / subcategory"
}

Threads should be specific to THIS idea — not generic advice.
Good threads: "Who already does this and why isn't it working for them?"
Bad threads: "Think about your target audience" (too generic)

No explanation, no markdown."""


async def expand_idea(capture_id: int, content: str, metadata: dict) -> None:
    """Expand a to_cook idea with threads and domain. Updates metadata in-place."""
    try:
        response = await client.messages.create(
            model="anthropic.claude-3-haiku-20240307-v1:0",
            max_tokens=512,
            system=_SYSTEM,
            messages=[{"role": "user", "content": content}],
        )
        raw = response.content[0].text.strip()
        data = json.loads(raw)
        threads = data.get("threads", [])
        domain = data.get("domain") or metadata.get("domain")

        if not isinstance(threads, list):
            return

        db.merge_metadata(capture_id, {
            "threads": threads[:5],
            "domain": domain,
            "stage": "seed",
        })
    except Exception as exc:
        logger.warning("cook_agent failed for capture %d: %s", capture_id, exc)
