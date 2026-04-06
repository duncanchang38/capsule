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
    """Create a new user account. handle is required."""
    import bcrypt
    from app.storage import db

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()
    handle = (body.get("handle") or "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not handle:
        raise HTTPException(status_code=400, detail="handle is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    try:
        user_id = db.create_user(
            email=email,
            password_hash=password_hash,
            name=name,
            handle=handle,
        )
        return {"ok": True, "id": user_id, "email": email, "handle": handle.strip().lower()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            if "handle" in str(exc).lower():
                raise HTTPException(status_code=409, detail="That handle is already taken.")
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

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name"),
        "handle": user.get("handle"),
    }


@router.patch("/auth/handle")
async def change_handle(body: dict):
    """Change the authenticated user's handle.

    Rate-limited: once every 14 days.
    Old handle is locked for 14 days before anyone else can claim it.
    """
    from app.storage import db

    user_id = (body.get("user_id") or "").strip()
    new_handle = (body.get("handle") or "").strip()

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if not new_handle:
        raise HTTPException(status_code=400, detail="handle is required")

    try:
        db.claim_handle(user_id, new_handle)
        return {"ok": True, "handle": new_handle.lower()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("handle change failed for user %s", user_id)
        raise HTTPException(status_code=500, detail="failed to update handle")


@router.get("/auth/check")
async def check_availability(email: str | None = None, handle: str | None = None):
    """Check whether an email or handle is available for registration.

    Returns {"available": true} or {"available": false, "reason": "..."}.
    Accepts one field per call.
    """
    from app.storage import db

    if email:
        email = email.strip().lower()
        existing = db.get_user_by_email(email)
        if existing:
            return {"available": False, "reason": "Email already registered."}
        return {"available": True}

    if handle:
        try:
            normalised = db._validate_handle(handle)
        except ValueError as exc:
            return {"available": False, "reason": str(exc)}
        existing = db.get_user_by_handle(normalised)
        if existing:
            return {"available": False, "reason": "Handle already taken."}
        # Also check the 14-day lock on recently released handles
        from datetime import datetime, timezone, timedelta
        import psycopg2.extras
        lock_cutoff = datetime.now(timezone.utc) - timedelta(days=db.HANDLE_LOCK_DAYS)
        with db._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM user_handle_history WHERE handle = %s AND released_at > %s",
                    (normalised, lock_cutoff),
                )
                if cur.fetchone():
                    return {"available": False, "reason": "Handle temporarily unavailable."}
        return {"available": True}

    raise HTTPException(status_code=400, detail="Provide email or handle to check.")


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
