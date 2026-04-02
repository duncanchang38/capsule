import json
import os
from anthropic import AnthropicBedrock
from pydantic import BaseModel

client = AnthropicBedrock(
    api_key=os.environ.get("BEDROCK_API_KEY"),
    aws_region=os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2"),
)

SYSTEM_PROMPT = """You are a silent intent classifier for a personal capture app.

The user will type anything — a task, question, idea, event, or something unclear.
Your job: classify it into exactly one type and extract a clean summary.

Types:
- to_hit: A task the user wants to complete. Has a natural deadline or urgency. Example: "Call dentist before Friday", "Submit tax return this week"
- to_learn: Content or a skill the user wants to consume or study. Example: "Read Atomic Habits", "Learn how Postgres indexing works", "Watch that 3Blue1Brown video"
- to_cook: An idea to develop or incubate. No deadline, no clear action. Example: "Build a habit tracker for my dog", "What if we made onboarding a game?", "Idea for a short story about a lighthouse keeper"
- to_know: A question seeking a specific answer. Example: "How does compound interest work?", "What's the capital of Bhutan?", "Why does salt lower the boiling point of water?"
- calendar: A time-anchored event with a specific date/time. Example: "Dentist Thursday 3pm", "Team standup daily at 9am", "Dad's birthday March 15"
- inbox: You are not confident enough to classify (confidence < 0.4). Use this sparingly — only when truly ambiguous.

Rules:
- summary: a clean, concise restatement of what the user said (1 sentence, no filler)
- deadline: ISO date string (YYYY-MM-DD) if present in the input, else null
- confidence: 0.0–1.0 — how sure you are

Respond ONLY with valid JSON. No explanation, no markdown.

Example output:
{"capture_type": "to_hit", "summary": "Call dentist before Friday", "deadline": "2026-04-04", "confidence": 0.95, "metadata": {}}
"""


class ClassificationResult(BaseModel):
    capture_type: str
    summary: str
    deadline: str | None
    confidence: float
    metadata: dict


def classify_intent(text: str, correction_hint: str | None = None) -> ClassificationResult:
    user_content = text
    if correction_hint:
        user_content = f"{text}\n\n[Correction hint: {correction_hint}]"

    response = client.messages.create(
        model="anthropic.claude-3-haiku-20240307-v1:0",
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    raw = response.content[0].text.strip()
    data = json.loads(raw)
    return ClassificationResult(**data)
