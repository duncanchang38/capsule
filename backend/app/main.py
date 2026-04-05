import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.chat import router as chat_router
from app.routes.captures import router as captures_router
from app.routes.organize import router as organize_router
from app.routes.auth import router as auth_router
from app.storage import db

# Load .env from backend/ if present (local dev only)
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    deleted = db.delete_old_deleted()
    if deleted:
        import logging
        logging.getLogger(__name__).info("Purged %d deleted capture(s) past TTL", deleted)
    yield


app = FastAPI(lifespan=lifespan)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(captures_router)
app.include_router(organize_router)
app.include_router(auth_router)
