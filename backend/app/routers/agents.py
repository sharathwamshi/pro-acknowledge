"""Agent-facing endpoints: one-time signup and heartbeat ingestion.

Signup is open (the agent's first run). Ingestion is authenticated by the
device token issued at signup, sent in the X-Device-Token header.
"""
import datetime as dt
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..engine import recompute_day
from ..models import ActivityEvent, Device, User
from ..schemas import IngestIn, SignupIn

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/signup")
def signup(body: SignupIn, db: Session = Depends(get_db)):
    """First-run identification. Email is the unique key: a known email just
    gets a new device linked (handles reinstalls) instead of a duplicate user."""
    email = body.email.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(name=body.name.strip(), email=email, role="recruiter", team="Unassigned")
        db.add(user)
        db.flush()

    token = secrets.token_urlsafe(24)
    device = Device(user_id=user.id, device_token=token,
                    machine_name=body.machine_name, os=body.os, last_seen=dt.datetime.now(dt.timezone.utc))
    db.add(device)
    db.commit()
    return {"device_token": token, "user_id": user.id, "name": user.name}


def _device(db: Session, x_device_token: str | None) -> Device:
    if not x_device_token:
        raise HTTPException(401, "Missing device token")
    device = db.query(Device).filter(Device.device_token == x_device_token).first()
    if not device:
        raise HTTPException(401, "Unknown device")
    return device


@router.post("/ingest")
def ingest(body: IngestIn, x_device_token: str = Header(None), db: Session = Depends(get_db)):
    device = _device(db, x_device_token)
    device.last_seen = dt.datetime.now(dt.timezone.utc)

    affected: set[dt.date] = set()
    for e in body.events:
        ts = dt.datetime.fromisoformat(e.ts.replace("Z", "+00:00")).replace(tzinfo=None)
        db.add(ActivityEvent(
            user_id=device.user_id, device_id=device.id, ts=ts, event_type="heartbeat",
            active_app=e.active_app, window_title=e.window_title, url=e.url,
            idle=e.idle, ssid=e.ssid, bssid=e.bssid,
        ))
        affected.add(ts.date())

    db.flush()
    for d in affected:
        recompute_day(db, device.user_id, d)
    db.commit()
    return {"accepted": len(body.events), "recomputed_days": len(affected)}
