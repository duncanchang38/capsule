"""
Fire-and-forget research agent for to_know captures.

After a question is confirmed and stored, this agent asks Claude for a concise answer
and writes it back to metadata.answer. The Todos UI surfaces it under the question.
"""
import json
import os
import logging
from app.storage import db
from app.agents.client import anthropic_client as client, HAIKU

logger = logging.getLogger(__name__)

_SYSTEM = """You are a research assistant. The user has captured a question they want answered.

Return ONLY valid JSON with two fields:
{
  "answer": "<concise answer — 2-5 sentences for simple questions, short structured breakdown for complex ones. Use bullet points only if the answer has genuinely distinct parts. Do not pad. End with the most important takeaway if relevant.>",
  "search_queries": ["<query 1>", "<query 2>", "<query 3>"]
}

search_queries: 3 specific Google search queries the user could run to go deeper.
- Make them concrete and search-ready, not generic ("Japan visa requirements 2025" not "Japan visa")
- Vary the angle: one factual, one comparative or how-to, one recent/news if relevant
- No explanation, no markdown outside the JSON."""


async def research_to_know(capture_id: int, question: str, metadata: dict) -> None:
    """Research the answer and generate search queries. One LLM call, stored in metadata."""
    try:
        response = await client.messages.create(
            model=HAIKU,
            max_tokens=600,
            system=_SYSTEM,
            messages=[{"role": "user", "content": question}],
        )
        raw = response.content[0].text.strip()
        data = json.loads(raw)
        answer = data.get("answer", "").strip()
        search_queries = data.get("search_queries", [])
        if isinstance(search_queries, list):
            search_queries = [q for q in search_queries if isinstance(q, str)][:4]
        else:
            search_queries = []
        merged = {**metadata, "answer": answer, "search_queries": search_queries}
        db.update_metadata(capture_id, merged)
    except Exception as exc:
        logger.warning("to_know research failed for capture %d: %s", capture_id, exc)
