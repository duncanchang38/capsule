import logging
import os
from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "http://localhost:3000")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "Capsule <noreply@capsule.app>")


def _send_reset_email(to_email: str, token: str) -> None:
    import resend
    resend.api_key = os.environ["RESEND_API_KEY"]
    reset_url = f"{APP_URL}/reset-password?token={token}"
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": [to_email],
        "subject": "Reset your Capsule password",
        "html": f"""
        <p>Someone requested a password reset for your Capsule account.</p>
        <p><a href="{reset_url}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p style="color:#999;font-size:12px;">{reset_url}</p>
        """,
    })


@router.post("/auth/register")
async def register(body: dict):
    """Create a new user account."""
    import bcrypt
    from app.storage import db

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
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


@router.post("/auth/forgot-password")
async def forgot_password(body: dict):
    """Send a password reset email. Always returns 200 to prevent email enumeration."""
    from app.storage import db

    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    user = db.get_user_by_email(email)
    if user:
        token = db.create_reset_token(user["id"])
        try:
            _send_reset_email(email, token)
        except Exception:
            logger.exception("failed to send reset email to %s", email)

    return {"ok": True}


@router.post("/auth/reset-password")
async def reset_password(body: dict):
    """Consume a reset token and update the password."""
    import bcrypt
    from app.storage import db

    token = (body.get("token") or "").strip()
    password = body.get("password") or ""

    if not token:
        raise HTTPException(status_code=400, detail="token is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")

    user_id = db.consume_reset_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="invalid or expired reset link")

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    db.update_password(user_id, password_hash)
    return {"ok": True}
