"""
Query agent — answers questions about the user's captures.

Used when classify_intent returns capture_type="query":
  "show me my tasks", "what's on my calendar today", "what do I know about X"

Fetches the user's captures as context and asks Claude to answer.
Does NOT store anything.
"""
import os
import json
from datetime import date
from anthropic import AsyncAnthropic
from app.storage import db

client = AsyncAnthropic(
    ,
)

_SYSTEM = """You are a personal assistant for a knowledge capture app called Capsule.
The user stores tasks, questions, ideas, learning resources, and calendar events.

You will be given:
1. Today's date
2. The user's current captures (tasks, events, knowledge items, ideas)
3. Their question or request

Answer concisely and helpfully. Format lists with bullet points.
If they ask "what's today like" or similar, summarize their day from the calendar and active tasks.
If they ask "show me X", list the relevant items.
If they ask "what do I know about X", search through their captures for related items.
If the question is about general knowledge not in their captures, answer from your own knowledge and note that it's not from their captures.

Keep responses short — this is a chat interface, not a report."""


def _format_captures(captures: list[dict]) -> str:
    if not captures:
        return "(none)"
    lines = []
    for c in captures:
        line = f"- [{c['capture_type']}] {c['summary']}"
        if c.get("deadline"):
            line += f" (due: {c['deadline']})"
        if c.get("metadata"):
            meta = c["metadata"]
            if meta.get("answer"):
                line += f"\n  Answer: {meta['answer']}"
            if meta.get("url"):
                line += f"\n  URL: {meta['url']}"
        lines.append(line)
    return "\n".join(lines)


async def answer(query: str) -> str:
    """Answer a query using the user's captures as context."""
    today = date.today().isoformat()

    todos = db.get_by_view("todos")
    calendar = db.get_by_view("calendar")

    context = f"""Today: {today}

## Active To-Dos & Learning & Ideas
{_format_captures(todos)}

## Calendar & Upcoming Tasks
{_format_captures(calendar)}"""

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SYSTEM,
            messages=[
                {"role": "user", "content": f"{context}\n\n---\nUser query: {query}"},
            ],
        )
        return response.content[0].text.strip()
    except Exception as exc:
        return f"Couldn't look that up right now. ({exc})"
