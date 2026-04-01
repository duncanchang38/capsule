import json
import logging
import os
from typing import Literal, Union

import anthropic
from pydantic import BaseModel, model_validator

logger = logging.getLogger(__name__)

# ── Metadata models ────────────────────────────────────────────────────────────

class TodoMetadata(BaseModel):
    deadline: str | None = None
    priority: Literal["high", "normal"] | None = None


class ToKnowMetadata(BaseModel):
    question: str
    topic: str | None = None


class ToLearnMetadata(BaseModel):
    resource_type: Literal["article", "video", "book", "course", "other"] | None = None
    url: str | None = None
    topic: str | None = None


class IdeaMetadata(BaseModel):
    domain: Literal["business", "product", "creative", "technical"] | None = None


class CalendarMetadata(BaseModel):
    event_name: str
    date: str | None = None
    time: str | None = None
    location: str | None = None


class InboxMetadata(BaseModel):
    raw: str


# ── ClassificationResult ───────────────────────────────────────────────────────

BucketType = Literal["todo", "to_know", "to_learn", "idea", "calendar", "inbox"]

MetadataType = Union[
    TodoMetadata,
    ToKnowMetadata,
    ToLearnMetadata,
    IdeaMetadata,
    CalendarMetadata,
    InboxMetadata,
]


class ClassificationResult(BaseModel):
    bucket: BucketType
    confidence: float
    summary: str
    metadata: MetadataType

    @model_validator(mode="before")
    @classmethod
    def cast_metadata(cls, values: dict) -> dict:
        """Cast metadata dict to the correct typed model based on bucket."""
        bucket = values.get("bucket")
        metadata = values.get("metadata", {})
        if isinstance(metadata, dict):
            mapping = {
                "todo": TodoMetadata,
                "to_know": ToKnowMetadata,
                "to_learn": ToLearnMetadata,
                "idea": IdeaMetadata,
                "calendar": CalendarMetadata,
                "inbox": InboxMetadata,
            }
            model_cls = mapping.get(bucket)
            if model_cls:
                values["metadata"] = model_cls(**metadata)
        return values


# ── Classifier prompt ──────────────────────────────────────────────────────────

_BASE_PROMPT = """\
You are an intent classifier for a personal capture app. Classify the user's input into exactly one bucket.

Buckets:
- todo: A discrete action the user needs to take. Examples: "call dentist", "submit report", "reply to Sarah", "apply to YC"
- to_know: A question the user wants a discrete answer to. Examples: "how does compound interest work?", "what's the capital of Laos?", "why does sleep affect memory?"
- to_learn: Content or a skill the user wants to consume or develop over time. Examples: "read this article on AI agents: https://example.com", "learn React", "watch this talk on distributed systems", "interesting blog post: [url]"
- idea: An undeveloped thought, observation, or concept to revisit. Examples: "app idea: spotify for podcasts", "interesting: founders who pivoted succeed more", "business concept: subscription box for X"
- calendar: An event, meeting, or time-sensitive commitment. Examples: "dentist appointment Thursday 3pm", "team standup moved to 10am", "flight Friday 6pm"

If the input does not clearly fit any bucket, or your confidence is below 0.4, use:
- inbox: Anything genuinely ambiguous or unclassifiable.

Respond ONLY with valid JSON matching this schema:
{{
  "bucket": "<todo|to_know|to_learn|idea|calendar|inbox>",
  "confidence": <0.0-1.0>,
  "summary": "<one-line summary of the input, max 10 words>",
  "metadata": <bucket-specific object>
}}

Metadata by bucket:
- todo: {{"deadline": "<date string or null>", "priority": "<high|normal|null>"}}
- to_know: {{"question": "<the core question>", "topic": "<topic category or null>"}}
- to_learn: {{"resource_type": "<article|video|book|course|other|null>", "url": "<extract any URL from the input, or null>", "topic": "<topic or null>"}}
- idea: {{"domain": "<business|product|creative|technical|null>"}}
- calendar: {{"event_name": "<name>", "date": "<date or null>", "time": "<time or null>", "location": "<location or null>"}}
- inbox: {{"raw": "<original input text>"}}

User input: {text}"""

_CORRECTION_SUFFIX = """

The user previously said this was classified incorrectly. Correction hint: "{correction_hint}"
Re-classify with this context in mind."""


def classify_intent(
    text: str,
    correction_hint: str | None = None,
) -> ClassificationResult:
    """
    Classify user input into a bucket using the Anthropic SDK directly.
    Raises anthropic.APIError on API failure.
    Raises ValueError on malformed/unparseable JSON response.
    """
    prompt = _BASE_PROMPT.format(text=text)
    if correction_hint:
        prompt += _CORRECTION_SUFFIX.format(correction_hint=correction_hint)

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",  # haiku: cheap, fast, sufficient for classification
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Classifier returned non-JSON: %s", raw)
        raise ValueError(f"Classifier returned non-JSON response: {raw}") from e

    # Force inbox if confidence below threshold (model may not always self-select inbox)
    if data.get("confidence", 1.0) < 0.4 and data.get("bucket") != "inbox":
        data["bucket"] = "inbox"
        data["metadata"] = {"raw": text}

    return ClassificationResult.model_validate(data)
