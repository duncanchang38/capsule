"""
AI organize agent — restructures a capture's notes into clean markdown.
Called on-demand when user taps "AI Organize" in the card editor.
"""
import os
import logging
from anthropic import AsyncAnthropicBedrock

logger = logging.getLogger(__name__)

_client = AsyncAnthropicBedrock(
    aws_region=os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2"),
)

_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"

_SYSTEM_PROMPTS = {
    "to_learn": (
        "You are organizing reading notes for a personal knowledge app. "
        "Structure the provided notes into clean markdown with these sections:\n"
        "## Key Ideas\n## Quotes\n## Questions This Raises\n\n"
        "Keep the user's own words. Don't summarize away detail. "
        "If a section has nothing, omit it. Output only the markdown."
    ),
    "to_cook": (
        "You are helping develop a business or product idea. "
        "Structure the provided notes into:\n"
        "## Core Insight\n## The Opportunity\n## Concerns & Open Questions\n## Next 3 Actions\n\n"
        "Be concrete. Pull out anything that reads like a next step into Actions. "
        "Output only the markdown."
    ),
    "to_hit": (
        "You are organizing task notes. Extract and structure into:\n"
        "## Sub-tasks\n- [ ] ...\n## Context & Notes\n\n"
        "Pull out any implied sub-tasks from the writing as checkboxes. "
        "Output only the markdown."
    ),
    "to_know": (
        "You are synthesizing research notes into a clear answer. Structure into:\n"
        "## Answer\n## Evidence & Sources\n## Follow-up Questions\n\n"
        "Write the answer first. Be direct. Output only the markdown."
    ),
}

_DEFAULT_SYSTEM = (
    "Organize these notes into well-structured markdown with clear sections. "
    "Keep all the content — just add structure. Output only the markdown."
)


async def organize_capture(capture: dict) -> str:
    """Return AI-organized markdown for the capture's notes."""
    notes = (capture.get("notes") or "").strip()
    if not notes:
        return ""

    capture_type = capture.get("capture_type", "")
    summary = capture.get("summary", "")
    system = _SYSTEM_PROMPTS.get(capture_type, _DEFAULT_SYSTEM)

    try:
        response = await _client.messages.create(
            model=_MODEL,
            max_tokens=2048,
            system=system,
            messages=[{
                "role": "user",
                "content": f"Capture: {summary}\n\nNotes to organize:\n{notes}",
            }],
        )
        return response.content[0].text
    except Exception as e:
        logger.error("organize_capture failed: %s", e)
        raise
