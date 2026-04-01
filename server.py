from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    content: str


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("index.html") as f:
        return f.read()


@app.post("/chat")
async def chat(message: Message):
    async def stream():
        # Placeholder — will wire up Claude Agent SDK here
        words = f"You said: {message.content}".split()
        for word in words:
            yield f"data: {json.dumps({'text': word + ' '})}\n\n"
            await asyncio.sleep(0.05)
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
