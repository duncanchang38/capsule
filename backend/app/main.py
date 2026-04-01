import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.chat import router as chat_router
from app.storage import db

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if CLAUDE_PLUGIN_ROOT is missing — Agent SDK hooks error silently without it
    if not os.environ.get("CLAUDE_PLUGIN_ROOT"):
        raise RuntimeError(
            "CLAUDE_PLUGIN_ROOT is not set. "
            "Start the backend with: "
            "CLAUDE_PLUGIN_ROOT=~/.claude/plugins/cache/everything-claude-code/everything-claude-code/1.9.0 "
            ".venv/bin/uvicorn app.main:app --reload"
        )

    logger.info("Initializing database...")
    db.init()
    logger.info("Database ready. Session state is in-memory; pending confirmations are lost on restart.")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
