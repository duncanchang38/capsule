"""
AI organize agent — restructures a capture's notes into clean HTML for Tiptap.
Called on-demand when user taps ✦ in the capture editor.
"""
import logging
from anthropic import AsyncAnthropicBedrock

logger = logging.getLogger(__name__)

_client = AsyncAnthropicBedrock()
_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"

_HTML_RULES = (
    "Output ONLY valid HTML — no markdown, no code fences, no explanation. "
    "Use <h1> for the title (if the user provided one, use it exactly — do not generate a new title), "
    "<h2> for section headers, <p> for paragraphs, "
    "<ul><li> for bullet lists, "
    "<ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\"><p>task</p></li></ul> "
    "for checkboxes, and <blockquote><p>text</p></blockquote> for quotes. "
    "Preserve the user's own words exactly. Do not add commentary or preamble."
)

_SYSTEM_PROMPTS = {
    "to_hit": f"""You are organizing a task capture. The user needs to execute this — make it actionable.

Structure:
1. Keep the original <h1> title at the top (use the capture title provided).
2. <h2>Sub-tasks</h2> — extract every implied action as a checkbox item. If none, omit.
3. <h2>Context</h2> — background info, constraints, resources needed. If none, omit.
4. <h2>Blockers</h2> — anything that could stop progress. If none, omit.

{_HTML_RULES}""",

    "to_learn": f"""You are organizing notes from a book, article, video, or course.

Structure:
1. Keep the original <h1> title at the top (use the capture title provided).
2. <h2>Key Takeaways</h2> — the 3–5 most important ideas, each as a bullet.
3. <h2>Quotes</h2> — exact notable quotes the user wrote down, each in <blockquote><p>...</p></blockquote>.
4. <h2>Questions This Raises</h2> — genuine open questions the material surfaced. If none, omit.
5. <h2>Actions</h2> — anything the user should actually do because of this. If none, omit.

Preserve exact phrasing of quotes. Do not paraphrase.
{_HTML_RULES}""",

    "to_cook": f"""You are developing a raw idea into something sharper.

Structure:
1. Keep the original <h1> title at the top (use the capture title provided).
2. <h2>The Idea</h2> — one crisp paragraph: what it is and who it's for.
3. <h2>Why This / Why Now</h2> — the insight or timing that makes it interesting. If unclear, omit.
4. <h2>How It Works</h2> — the mechanism, rough form, key components. If unclear, omit.
5. <h2>Concerns</h2> — real risks, gaps, assumptions to validate. Be honest.
6. <h2>First 3 Actions</h2> — the smallest concrete next steps as checkboxes.

Push toward clarity. If the notes are vague, say so in Concerns.
{_HTML_RULES}""",

    "to_know": f"""You are synthesizing research notes into a clear answer.

Structure:
1. Keep the original <h1> question/title at the top (use the capture title provided).
2. <h2>Answer</h2> — direct answer first, 1–3 sentences. If the answer is unknown, say that.
3. <h2>Evidence</h2> — facts, sources, examples that support the answer as bullets.
4. <h2>Still Unknown</h2> — gaps, caveats, follow-up questions. If none, omit.

Lead with the answer. Don't bury it.
{_HTML_RULES}""",

    "calendar": f"""You are organizing planning notes for an event or trip.

Structure:
1. Keep the original <h1> event name at the top (use the capture title provided).
2. <h2>Details</h2> — date, time, location, attendees as bullets. Only what's known.
3. <h2>Plan</h2> — agenda, itinerary, schedule. If none, omit.
4. <h2>Prepare</h2> — things to bring, book, confirm, or do beforehand as checkboxes.
5. <h2>Open Questions</h2> — unresolved decisions or things to figure out. If none, omit.

{_HTML_RULES}""",
}

_DEFAULT_SYSTEM = f"""You are organizing personal notes into clean structure.

Structure:
1. Keep the original <h1> title at the top (use the capture title provided).
2. Add 2–4 <h2> sections that fit the content naturally.
3. Use bullet lists for items, checkboxes for actions, blockquotes for direct quotes.

{_HTML_RULES}"""


async def organize_capture(capture: dict) -> str:
    """Return AI-organized HTML for the capture's notes."""
    notes = (capture.get("notes") or "").strip()
    if not notes:
        return ""

    capture_type = capture.get("capture_type", "")
    summary = capture.get("summary", "")
    system = _SYSTEM_PROMPTS.get(capture_type, _DEFAULT_SYSTEM)

    import re

    # Extract user-written title from the first <h1> if present, fall back to AI summary
    h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", notes, re.IGNORECASE | re.DOTALL)
    user_title = re.sub(r"<[^>]+>", "", h1_match.group(1)).strip() if h1_match else summary

    # Strip HTML tags to give Claude clean text
    plain_notes = re.sub(r"<[^>]+>", " ", notes).strip()
    plain_notes = re.sub(r"\s{2,}", " ", plain_notes)

    try:
        response = await _client.messages.create(
            model=_MODEL,
            max_tokens=2048,
            system=system,
            messages=[{
                "role": "user",
                "content": f"Title (use this exactly): {user_title}\n\nNotes:\n{plain_notes}",
            }],
        )
        result = response.content[0].text.strip()
        # Strip accidental code fences if Claude wraps anyway
        if result.startswith("```"):
            result = re.sub(r"^```[a-z]*\n?", "", result)
            result = re.sub(r"\n?```$", "", result)
        return result
    except Exception as e:
        logger.error("organize_capture failed: %s", e)
        raise
