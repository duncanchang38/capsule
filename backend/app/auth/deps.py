"""
FastAPI dependency for authenticated user identity.

The Next.js middleware stamps every proxied API request with the
x-user-id header, extracted from the validated NextAuth session.
This dependency reads that header and raises 401 if it is absent
or contains the unsafe "default" fallback value.

Usage in route handlers:
    from app.auth.deps import CurrentUser

    @router.get("/captures")
    def get_captures(user_id: CurrentUser):
        return db.get_recent(user_id=user_id)
"""

from typing import Annotated
from fastapi import Depends, Header, HTTPException, status


def _require_user_id(x_user_id: str = Header(alias="x-user-id", default="")) -> str:
    """Extract x-user-id header and reject missing or unsafe values."""
    uid = x_user_id.strip()
    if not uid or uid == "default":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return uid


# Type alias — declare `user_id: CurrentUser` in any route signature.
CurrentUser = Annotated[str, Depends(_require_user_id)]
