from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import User
from ..schemas import LoginIn
from ..security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "team": u.team}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.username == body.username).first()
    if not u or u.disabled or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Wrong username or password, or no login access.")
    return {"token": create_token(u.id), "user": _user_out(u)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return _user_out(user)
