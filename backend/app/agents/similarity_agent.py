"""
Merge suggestion agent.

Called after a capture is enriched with a topic. Checks whether any existing
captures cover the same subject, so the user can be prompted to merge.

Flow:
1. If topic is known → query DB for captures with the same topic (fast, free)
2. If no topic match (or no topic) → LLM similarity check against recent captures

Writes metadata.merge_suggestion = {
    "capture_id": int,
    "summary": str,
    "topic": str | None,
    "reason": "topic_match" | "llm_similarity",
} to the new capture, or does nothing if no match found.
"""
import json
import logging
from app.storage import db
from app.agents.client import anthropic_client as client, HAIKU

logger = logging.getLogger(__name__)

_SYSTEM = """You are a deduplication assistant for a personal capture app.

The user just added a new capture. Given its summary and a list of existing captures,
decide if any existing capture covers the same subject and should be merged.

Return ONLY valid JSON:
{
  "match_id": <integer id of the best match, or null if none>,
  "reason": "<one sentence explaining the match, or null>"
}

Rules:
- Match only if they clearly cover the same topic/project/event (high confidence).
- Do NOT match captures that are merely related or in the same domain.
- Return null if unsure.
"""


async def check_and_suggest_merge(
    capture_id: int,
    summary: str,
    topic: str | None,
    capture_type: str,
) -> None:
    try:
        existing_match = None

        # Step 1: entity overlap (GraphRAG — strongest signal, no LLM cost)
        entity_related = db.get_related_by_entities(capture_id, limit=3, min_score=0.6)
        if entity_related:
            best = entity_related[0]
            existing_match = {
                "capture_id": best["id"],
                "summary": best["summary"],
                "topic": best.get("metadata", {}).get("topic"),
                "reason": "entity_overlap",
            }

        # Step 2: topic match (fast DB query, free)
        if existing_match is None and topic:
            rows = db.get_by_topic(topic, limit=10)
            candidates = [r for r in rows if r["id"] != capture_id]
            if candidates:
                existing_match = {
                    "capture_id": candidates[0]["id"],
                    "summary": candidates[0]["summary"],
                    "topic": topic,
                    "reason": "topic_match",
                }

        # Step 3: FTS5 BM25 + LLM (fallback for captures with no entity/topic overlap)
        if existing_match is None:
            candidates = db.search_similar(summary, exclude_id=capture_id, limit=10)
            if candidates:
                candidates_text = "\n".join(
                    f"[{r['id']}] {r['summary']}" for r in candidates[:10]
                )
                user_msg = (
                    f"New capture: {summary}\n\n"
                    f"Existing captures:\n{candidates_text}"
                )
                response = await client.messages.create(
                    model=HAIKU,
                    max_tokens=128,
                    system=_SYSTEM,
                    messages=[{"role": "user", "content": user_msg}],
                )
                raw = response.content[0].text.strip()
                data = json.loads(raw)
                match_id = data.get("match_id")
                reason = data.get("reason")
                if match_id:
                    matched = next((r for r in candidates if r["id"] == match_id), None)
                    if matched:
                        existing_match = {
                            "capture_id": match_id,
                            "summary": matched["summary"],
                            "topic": matched.get("metadata", {}).get("topic"),
                            "reason": "llm_similarity",
                            "detail": reason,
                        }

        if existing_match:
            db.merge_metadata(capture_id, {"merge_suggestion": existing_match})

    except Exception as exc:
        logger.debug("similarity_agent failed for capture %d: %s", capture_id, exc)
