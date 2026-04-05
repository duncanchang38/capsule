"""
POST /organize — takes raw unstructured text, returns organized markdown.

This is a stateless, fire-once endpoint — no session, no DB storage.
The caller decides whether to keep or discard the result.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from app.agents.client import anthropic_client as client, HAIKU

router = APIRouter()

_SYSTEM = """You are a note organizer. The user will paste raw, messy text — stream-of-consciousness,
bullet dumps, mixed ideas, half-sentences, whatever.

Your job: return a clean, organized version of the SAME content. Rules:
- Do NOT add new ideas or content the user didn't write
- Do NOT remove any ideas — only restructure and clarify
- Use markdown: headers (##), bullet points, bold for key terms
- Group related ideas together
- If there are action items, collect them under an "## Actions" section
- If there are questions, collect them under "## Questions"
- Keep the user's voice — don't over-formalize
- Return ONLY the organized markdown, no preamble or explanation"""


class OrganizeRequest(BaseModel):
    text: str


class OrganizeResponse(BaseModel):
    organized: str


@router.post("/organize", response_model=OrganizeResponse)
async def organize(req: OrganizeRequest):
    if len(req.text) > 10000:
        return OrganizeResponse(organized="Text is too long (max 10,000 characters).")

    try:
        response = await client.messages.create(
            model=HAIKU,
            max_tokens=2048,
            system=_SYSTEM,
            messages=[{"role": "user", "content": req.text}],
        )
        return OrganizeResponse(organized=response.content[0].text.strip())
    except Exception as exc:
        return OrganizeResponse(organized=f"Couldn't organize right now. ({exc})")
