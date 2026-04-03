"""
Fire-and-forget enrichment agent for to_learn captures.

Extracts: topic, resource_type, url, author, book_title, page
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

_SYSTEM = """You are an enrichment assistant for a personal knowledge capture app.
Given the raw text of a to-learn capture, extract metadata as JSON.

Return ONLY valid JSON with these fields:
{
  "topic": "<high-level subject, e.g. 'machine learning', 'cooking', 'finance'>",
  "resource_type": "<article | video | book | course | quote | other>",
  "url": "<url string or null>",
  "author": "<author name or null>",
  "book_title": "<full book title or null>",
  "page": "<page number or null>"
}

Rules:
- resource_type is "quote" if the text looks like a quoted passage or excerpt.
- resource_type defaults to "other" if unclear.
- url is null unless a URL appears in the text.
- topic should be concise (1-4 words).
- author/book_title/page are null unless clearly present in the text.
"""


async def enrich_to_learn(capture_id: int, content: str, metadata: dict) -> None:
    """Extract enrichment fields from a to_learn capture and persist."""
    try:
        response = await client.messages.create(
            model="anthropic.claude-3-haiku-20240307-v1:0",
            max_tokens=256,
            system=_SYSTEM,
            messages=[{"role": "user", "content": content}],
        )
        raw = response.content[0].text.strip()
        enriched = json.loads(raw)

        merged = {**metadata, **{
            "topic":         enriched.get("topic")         or metadata.get("topic"),
            "resource_type": enriched.get("resource_type") or metadata.get("resource_type") or "other",
            "url":           enriched.get("url")           or metadata.get("url"),
            "author":        enriched.get("author")        or metadata.get("author"),
            "book_title":    enriched.get("book_title")    or metadata.get("book_title"),
            "page":          enriched.get("page")          or metadata.get("page"),
        }}
        db.update_metadata(capture_id, merged)
    except Exception as exc:
        logger.warning("to_learn enrichment failed for capture %d: %s", capture_id, exc)
