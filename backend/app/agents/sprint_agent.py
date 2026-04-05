import json
from anthropic import AsyncAnthropicBedrock

_client = AsyncAnthropicBedrock()
_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"

_SYSTEM = """You break tasks into focused, meaningful work sessions.
Given a task summary and session count, return a JSON array of session names.
Each name should be specific and actionable. For books/articles, reference actual sections or chapters.
For courses, reference modules. For general tasks, use logical phases.
Respond ONLY with a JSON array of strings. No other text.
Example: ["Chapters 1-4: Setup", "Chapters 5-8: Core Loop", "Chapters 9-12: Advanced Patterns"]"""


async def generate_sprint_names(
    summary: str,
    capture_type: str,
    count: int,
) -> list[str]:
    """Generate AI session names for sprint planning. Falls back to mechanical names on error."""
    prompt = f"Task: {summary}\nType: {capture_type}\nSessions requested: {count}\n\nGenerate exactly {count} session names."

    try:
        resp = await _client.messages.create(
            model=_MODEL,
            max_tokens=512,
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        names: list = json.loads(text)
        if isinstance(names, list) and len(names) == count and all(isinstance(n, str) for n in names):
            return names
    except Exception:
        pass

    # Mechanical fallback
    return [f"Session {i + 1}" for i in range(count)]
