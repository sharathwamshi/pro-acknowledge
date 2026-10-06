"""Auth dependencies and the role-scoping rule (enforced server-side)."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .security import decode_token


def current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    uid = decode_token(authorization.split(" ", 1)[1])
    user = db.get(User, uid) if uid else None
    if not user or user.disabled:
        raise HTTPException(401, "Invalid or disabled account")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    return user


def visible_user_ids(viewer: User, db: Session) -> list[int]:
    """The core scoping rule. Admin sees all tracked people; a manager sees
    only their assigned team and NEVER themselves."""
    if viewer.role == "admin":
        return [u.id for u in db.query(User).filter(User.role != "admin").all()]
    return [u.id for u in db.query(User).filter(
        User.manager_id == viewer.id, User.id != viewer.id).all()]


def assert_can_see(viewer: User, target_id: int, db: Session):
    if target_id not in visible_user_ids(viewer, db):
        raise HTTPException(403, "Not in your scope")
