from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

from app.agents.capsule import stream_response

router = APIRouter()


class Message(BaseModel):
    content: str


@router.post("/chat")
async def chat(message: Message):
    async def stream():
        async for word in stream_response(message.content):
            yield f"data: {json.dumps({'text': word})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
