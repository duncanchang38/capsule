import logging
from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/auth/register")
async def register(body: dict):
    """Create a new user account."""
    import bcrypt
    from app.storage import db

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip() or None

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    try:
        user_id = db.create_user(email=email, password_hash=password_hash, name=name)
        return {"ok": True, "id": user_id, "email": email}
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="email already registered")
        logger.exception("register failed")
        raise HTTPException(status_code=500, detail="registration failed")


@router.post("/auth/login")
async def login(body: dict):
    """Verify credentials. Returns user info on success, 401 on failure."""
    import bcrypt
    from app.storage import db

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")

    valid = bcrypt.checkpw(password.encode(), user["password_hash"].encode())
    if not valid:
        raise HTTPException(status_code=401, detail="invalid credentials")

    return {"id": user["id"], "email": user["email"], "name": user.get("name")}
