import json
import re
import os
from typing import Optional
from pydantic import BaseModel
from app.agents.client import anthropic_client as client, HAIKU

_BARE_URL_RE = re.compile(r'^\s*https?://\S+\s*$')

SYSTEM_PROMPT = """You are a silent intent classifier for a personal capture app.

The user will type anything — a task, question, idea, event, or something unclear.
Your job: classify it into exactly one type, extract a clean summary, and populate type-specific metadata.

Types:
- to_hit: A task the user wants to complete. Has a natural deadline or urgency. Example: "Call dentist before Friday", "Submit tax return this week"
- to_learn: Content or a skill the user wants to consume or study. Example: "Read Atomic Habits", "Learn how Postgres indexing works", "Watch that 3Blue1Brown video"
- to_cook: An idea to develop or incubate. No deadline, no clear action. Example: "Build a habit tracker for my dog", "What if we made onboarding a game?", "Idea for a short story about a lighthouse keeper"
- to_know: A question seeking a specific answer. Example: "How does compound interest work?", "What's the capital of Bhutan?", "Why does salt lower the boiling point of water?"
- calendar: A single time-anchored event with a specific date/time. Example: "Dentist Thursday 3pm", "Team standup daily at 9am", "Dad's birthday March 15"
- project: A multi-day or multi-part endeavor the user is planning or tracking — a trip, a work initiative, a long-running goal. Has duration, location, or phases. Example: "Trip to Tokyo in May", "Q3 product launch plan", "Home renovation planning doc", "Research notes on X"
- query: The user is asking to see their existing captures (not adding something new). Example: "Show me my tasks", "What ideas do I have?", "List my reading list"

Rules:
- summary: a clean, concise restatement of what the user said (1 sentence, no filler)
- deadline: ISO date string (YYYY-MM-DD) if a specific date is present in the input, else null
- confidence: 0.0–1.0 — how sure you are
- CRITICAL: A URL (with or without surrounding text) is ALWAYS to_learn, never to_know. Do not invent a question just because you see a link you cannot read. Use the URL itself as the summary if there is no other text.
- CRITICAL: If the input contains multiple URLs or is a mixed reading/watching list, classify as to_learn. Summarize it as "Reading/watching list: <brief description of themes>".
- If you are uncertain, default to to_learn. Never leave something unclassified.

Metadata per type (include only the fields for the classified type):
- to_hit:   { "priority": "high"|"normal"|null, "tags": [str]|null }
- to_learn: { "resource_type": "article"|"video"|"book"|"course"|"quote"|"other"|null, "url": str|null, "topic": str|null, "tags": [str]|null, "author": str|null, "book_title": str|null, "page": str|null }
- to_cook:  { "domain": str|null, "tags": [str]|null }
- to_know:  { "question": str, "topic": str|null, "tags": [str]|null }
- calendar: { "event_name": str, "date": str|null, "time": str|null, "location": str|null, "tags": [str]|null }
- project:  { "status": "planning"|"active"|"completed"|null, "start_date": str|null, "end_date": str|null, "location": str|null, "tags": [str]|null }
- query:    { "raw": str }

For "tags": assign 1–3 short topic labels that describe the subject matter (e.g. ["Tokyo", "Travel", "2026"]). Use title case. Reuse consistent labels across related items. If the content has no clear topic, omit tags (null). For to_learn, "topic" is the single primary tag (first of tags) for backward compat — also populate it.

Respond ONLY with valid JSON. No explanation, no markdown.

Example outputs:
{"capture_type": "to_hit", "summary": "Call dentist before Friday", "deadline": "2026-04-04", "confidence": 0.95, "metadata": {"priority": "normal"}}
{"capture_type": "to_learn", "summary": "Read Atomic Habits", "deadline": null, "confidence": 0.97, "metadata": {"resource_type": "book", "url": null, "topic": "habits", "author": "James Clear", "book_title": "Atomic Habits", "page": null}}
{"capture_type": "to_learn", "summary": "Quote from The Almanack of Naval Ravikant p.42", "deadline": null, "confidence": 0.96, "metadata": {"resource_type": "quote", "url": null, "topic": "wealth", "author": "Naval Ravikant", "book_title": "The Almanack of Naval Ravikant", "page": "42"}}
{"capture_type": "calendar", "summary": "Dentist appointment Thursday 3pm", "deadline": "2026-04-03", "confidence": 0.98, "metadata": {"event_name": "Dentist", "date": "2026-04-03", "time": "15:00", "location": null}}
{"capture_type": "project", "summary": "Trip to Tokyo in May", "deadline": null, "confidence": 0.96, "metadata": {"status": "planning", "start_date": "2026-05-01", "end_date": "2026-05-10", "location": "Tokyo, Japan"}}
"""


class ClassificationResult(BaseModel):
    capture_type: str
    summary: str
    deadline: Optional[str]
    confidence: float
    metadata: dict


class BulkClassificationResult(BaseModel):
    items: list[ClassificationResult]


# ── Bulk detection ───────────────────────────────────────────────────────────

_BULK_PATTERNS = [
    re.compile(r"^- \[.?\]", re.MULTILINE),  # markdown checklist
    re.compile(r"^\d+[\.\)]", re.MULTILINE),  # numbered list
    re.compile(r"^[-*] \S", re.MULTILINE),    # bullet list
]
_BULK_THRESHOLD = 3


def detect_bulk(text: str) -> bool:
    """Return True if text looks like a multi-item list (3+ matching lines)."""
    for pattern in _BULK_PATTERNS:
        if len(pattern.findall(text)) >= _BULK_THRESHOLD:
            return True
    return False


# ── Bulk system prompt ────────────────────────────────────────────────────────

BULK_SYSTEM_PROMPT = """You are a bulk intent classifier for a personal capture app.

The user has pasted a list of items. Extract EACH item as a separate classification.

Types available:
- to_hit: task to complete
- to_learn: content/skill to consume (book, article, video, course, quote)
- to_cook: idea to develop
- to_know: question seeking an answer
- calendar: single time-anchored event
- project: multi-day or multi-part endeavor (trip, initiative, planning doc)

For each item return:
  capture_type, summary (1-sentence clean restatement), deadline (ISO YYYY-MM-DD or null), confidence (0.0-1.0)
  metadata: type-specific fields same as single classification schema:
    to_learn: { resource_type, url, topic, author, book_title, page }
    to_hit:   { priority }
    to_cook:  { domain }
    to_know:  { question, topic }
    calendar: { event_name, date, time, location }
    project:  { status, start_date, end_date, location }

Rules:
- Never merge items. Every list entry becomes its own classification.
- If context above the list provides the type (e.g. "book recs"), use it.
- Classify each item independently. Mixed types are fine.

Respond ONLY with valid JSON: {"items": [...]}
No explanation, no markdown.
"""


async def bulk_classify(text: str) -> BulkClassificationResult:
    response = await client.messages.create(
        model=HAIKU,
        max_tokens=8192,
        system=BULK_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
    )
    raw = response.content[0].text.strip()
    try:
        data = json.loads(raw)
        return BulkClassificationResult(**data)
    except Exception:
        return BulkClassificationResult(items=[])


async def classify_intent(text: str, correction_hint: str | None = None) -> ClassificationResult:
    # Bare URL with no context: skip AI entirely to prevent hallucination.
    # The model cannot read the URL content and will invent summaries and types.
    # Enrichment agent handles further enrichment after storage.
    if _BARE_URL_RE.match(text) and not correction_hint:
        url = text.strip()
        return ClassificationResult(
            capture_type="to_learn",
            summary=url,
            deadline=None,
            confidence=0.95,
            metadata={"resource_type": "other", "url": url, "topic": None,
                      "author": None, "book_title": None, "page": None},
        )

    user_content = text
    if correction_hint:
        user_content = f"{text}\n\n[Correction hint: {correction_hint}]"

    response = await client.messages.create(
        model=HAIKU,
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    raw = response.content[0].text.strip()
    try:
        data = json.loads(raw)
        return ClassificationResult(**data)
    except (json.JSONDecodeError, Exception):
        return ClassificationResult(
            capture_type="to_learn",
            summary=text[:200],
            deadline=None,
            confidence=0.0,
            metadata={"resource_type": "other", "url": None, "topic": None,
                      "author": None, "book_title": None, "page": None},
        )
