"""
Fire-and-forget entity extraction agent (GraphRAG layer).

Extracts named entities from each new capture and stores them in capture_entities.
These entities power:
- RelatedSection: captures connected by shared entities
- Organize cluster: multi-capture synthesis via ✦
- Merge suggestions: entity overlap as primary dedup signal
"""
import json
import logging
from app.storage import db
from app.agents.client import anthropic_client as client, HAIKU

logger = logging.getLogger(__name__)

_SYSTEM = """You are an entity extractor for a personal knowledge capture app.

Given a capture's text, extract the named entities most useful for linking related captures.

Return ONLY valid JSON:
{
  "entities": [
    {"entity": "<normalized name, lowercase>", "type": "<project|person|place|event|concept|product>"},
    ...
  ]
}

Rules:
- Normalize to lowercase: "japan trip 2026" not "Japan Trip 2026"
- Be specific: "japan trip 2026" not just "japan"
- Max 8 entities per capture
- Skip generic words: "idea", "work", "meeting", "notes", "todo", "task"
- Extract: project names, people, specific places, products, events, recurring topics
- Type "project" for named initiatives or plans (e.g. "japan trip 2026", "capsule app")
- Type "concept" for abstract topics (e.g. "machine learning", "stoicism")
- Type "product" for tools, apps, books (e.g. "notion", "atomic habits")
"""


async def extract_entities(capture_id: int, summary: str, content: str) -> None:
    """Extract entities and upsert into capture_entities. Fire-and-forget."""
    try:
        text = f"{summary}\n{content}".strip()[:2000]
        response = await client.messages.create(
            model=HAIKU,
            max_tokens=256,
            system=_SYSTEM,
            messages=[{"role": "user", "content": text}],
        )
        raw = response.content[0].text.strip()
        data = json.loads(raw)
        entities = data.get("entities", [])
        if isinstance(entities, list) and entities:
            db.save_entities(capture_id, entities)
    except Exception as exc:
        logger.debug("entity_agent failed for capture %d: %s", capture_id, exc)
