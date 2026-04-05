"""
Fire-and-forget research agent for to_know captures.

After a question is confirmed and stored, this agent asks Claude for a concise answer
and writes it back to metadata.answer. The Todos UI surfaces it under the question.
"""
import json
import os
import logging
from anthropic import AsyncAnthropicBedrock
from app.storage import db

logger = logging.getLogger(__name__)

client = AsyncAnthropicBedrock()

_SYSTEM = """You are a research assistant. The user has captured a question they want answered.
Provide a clear, concise answer — 2-5 sentences for simple questions, a short structured breakdown
for complex ones. Use bullet points only if the answer genuinely has distinct parts.
Do not pad the response. End with the most important takeaway if relevant."""


async def research_to_know(capture_id: int, question: str, metadata: dict) -> None:
    """Research the answer to a captured question and store it in metadata.answer."""
    try:
        response = await client.messages.create(
            model="anthropic.claude-3-haiku-20240307-v1:0",
            max_tokens=512,
            system=_SYSTEM,
            messages=[{"role": "user", "content": question}],
        )
        answer = response.content[0].text.strip()
        merged = {**metadata, "answer": answer}
        db.update_metadata(capture_id, merged)
    except Exception as exc:
        logger.warning("to_know research failed for capture %d: %s", capture_id, exc)
