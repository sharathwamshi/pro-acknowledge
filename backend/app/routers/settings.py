import datetime as dt
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_admin
from ..engine import recompute_day
from ..models import ActivityEvent, AppCategory, AttendanceDay, OfficeNetwork, Setting, User
from ..schemas import AppIn, NetworkIn, PasswordIn
from ..security import hash_password

router = APIRouter(prefix="/settings", tags=["settings"])

_DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")


def looks_like_website(name: str) -> bool:
    """A website name has a dot and no spaces (e.g. naukri.com); an app name
    does not (e.g. Excel)."""
    return "." in name and " " not in name


def normalize_name(name: str, kind: str) -> str:
    """Clean up input before storing: strip scheme/path/www and lowercase for
    websites; just trim for apps."""
    n = (name or "").strip()
    if kind == "website":
        n = re.sub(r"^https?://", "", n, flags=re.I)
        n = re.sub(r"^www\.", "", n, flags=re.I)
        n = n.split("/")[0].split("?")[0].strip().lower()
    return n


def _get_json(db, key, default):
    row = db.get(Setting, key)
    return json.loads(row.value) if row else default


def _set_json(db, key, value):
    row = db.get(Setting, key)
    if not row:
        row = Setting(key=key)
        db.add(row)
    row.value = json.dumps(value)


# ---------- policy ----------
@router.get("/policy")
def get_policy(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _get_json(db, "policy", {})


@router.put("/policy", dependencies=[Depends(require_admin)])
def put_policy(body: dict, db: Session = Depends(get_db)):
    _set_json(db, "policy", body)
    db.flush()
    # recompute everything so the grid reflects new rules immediately
    _recompute_all(db)
    db.commit()
    return {"ok": True}


def _recompute_all(db):
    today = dt.date.today()
    ids = [u.id for u in db.query(User).filter(User.role != "admin").all()]
    for uid in ids:
        for i in range(60):
            recompute_day(db, uid, today - dt.timedelta(days=i))


# ---------- networks ----------
@router.get("/networks")
def list_networks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": n.id, "label": n.label, "ssid": n.ssid, "bssid": n.bssid, "ip_range": n.ip_range}
            for n in db.query(OfficeNetwork).all()]


@router.post("/networks", dependencies=[Depends(require_admin)])
def add_network(body: NetworkIn, db: Session = Depends(get_db)):
    n = OfficeNetwork(**body.model_dump())
    db.add(n)
    db.flush()
    _recompute_all(db)
    db.commit()
    return {"id": n.id}


@router.delete("/networks/{nid}", dependencies=[Depends(require_admin)])
def del_network(nid: int, db: Session = Depends(get_db)):
    n = db.get(OfficeNetwork, nid)
    if n:
        db.delete(n)
        db.flush()
        _recompute_all(db)
        db.commit()
    return {"ok": True}


# ---------- app & website categories ----------
@router.get("/apps")
def list_apps(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": a.id, "name": a.name, "category": a.category, "kind": a.kind or "app"}
            for a in db.query(AppCategory).order_by(AppCategory.name).all()]


@router.get("/uncategorized")
def uncategorized(days: int = 14, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Apps/websites seen recently that haven't been categorized yet, so the
    admin can label them from real usage instead of guessing."""
    since = dt.datetime.now() - dt.timedelta(days=days)
    known = {a.name for a in db.query(AppCategory).all()}
    seen: dict[str, int] = {}
    rows = (db.query(ActivityEvent.active_app)
            .filter(ActivityEvent.ts >= since, ActivityEvent.active_app.isnot(None)).all())
    for (name,) in rows:
        if name and name not in known:
            seen[name] = seen.get(name, 0) + 1
    items = sorted(seen.items(), key=lambda x: -x[1])
    apps = [{"name": n, "hits": c} for n, c in items if not looks_like_website(n)][:50]
    sites = [{"name": n, "hits": c} for n, c in items if looks_like_website(n)][:50]
    return {"apps": apps, "websites": sites}


@router.post("/apps", dependencies=[Depends(require_admin)])
def add_app(body: AppIn, db: Session = Depends(get_db)):
    kind = body.kind if body.kind in ("app", "website") else ("website" if looks_like_website(body.name) else "app")
    name = normalize_name(body.name, kind)
    if not name:
        raise HTTPException(400, "Name can't be empty")
    if kind == "website" and not _DOMAIN_RE.match(name):
        raise HTTPException(400, f"'{name}' doesn't look like a valid domain (e.g. youtube.com)")
    if body.category not in ("productive", "unproductive", "neutral"):
        raise HTTPException(400, "Pick a category")
    existing = db.query(AppCategory).filter(AppCategory.name.ilike(name)).first()
    if existing:
        raise HTTPException(400, f"'{name}' is already listed as {existing.category}")
    db.add(AppCategory(name=name, category=body.category, kind=kind))
    db.flush()
    _recompute_all(db)
    db.commit()
    return {"ok": True, "name": name, "kind": kind}


@router.put("/apps/{aid}", dependencies=[Depends(require_admin)])
def recat_app(aid: int, body: AppIn, db: Session = Depends(get_db)):
    a = db.get(AppCategory, aid)
    if not a:
        raise HTTPException(404, "Not found")
    if body.category not in ("productive", "unproductive", "neutral"):
        raise HTTPException(400, "Pick a category")
    a.category = body.category
    db.flush()
    _recompute_all(db)
    db.commit()
    return {"ok": True}


@router.delete("/apps/{aid}", dependencies=[Depends(require_admin)])
def del_app(aid: int, db: Session = Depends(get_db)):
    a = db.get(AppCategory, aid)
    if a:
        db.delete(a)
        db.commit()
    return {"ok": True}


# ---------- admin password ----------
@router.put("/admin-password", dependencies=[Depends(require_admin)])
def change_admin_password(body: PasswordIn, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.role == "admin").first()
    admin.password_hash = hash_password(body.password)
    db.commit()
    return {"ok": True}


# ---------- agent settings ----------
@router.get("/agent")
def get_agent(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _get_json(db, "agent", {"heartbeat": 60, "idle_threshold": 5,
                                   "screenshot_interval": 10, "screenshots_enabled": False})


@router.put("/agent", dependencies=[Depends(require_admin)])
def put_agent(body: dict, db: Session = Depends(get_db)):
    _set_json(db, "agent", body)
    db.commit()
    return {"ok": True}
