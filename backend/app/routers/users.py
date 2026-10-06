import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import assert_can_see, current_user, require_admin, visible_user_ids
from ..engine import effective_status
from ..models import ActivityEvent, AppCategory, AttendanceDay, Device, User
from ..schemas import AddRecruiterIn, MakeManagerIn, TeamIn
from ..security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def _today_row(db, uid):
    return db.query(AttendanceDay).filter_by(user_id=uid, date=dt.date.today()).first()


@router.get("")
def list_users(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = visible_user_ids(user, db)
    out = []
    for u in db.query(User).filter(User.id.in_(ids)).order_by(User.name).all():
        row = _today_row(db, u.id)
        out.append({
            "id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "team": u.team, "disabled": u.disabled,
            "device": (u.devices[0].machine_name if u.devices else None),
            "status": effective_status(row),
            "location": (row.primary_loc if row and effective_status(row) not in ("absent", "weekend") else None),
        })
    return out


@router.post("", dependencies=[Depends(require_admin)])
def add_recruiter(body: AddRecruiterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "Email already exists")
    team = "Unassigned"
    if body.manager_id:
        mgr = db.get(User, body.manager_id)
        team = mgr.team if mgr else "Unassigned"
    u = User(name=body.name, email=body.email.lower(), role="recruiter",
             manager_id=body.manager_id, team=team)
    db.add(u)
    db.commit()
    return {"id": u.id}


@router.post("/{uid}/make-manager", dependencies=[Depends(require_admin)])
def make_manager(uid: int, body: MakeManagerIn, db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Not found")
    if db.query(User).filter(User.username == body.username, User.id != uid).first():
        raise HTTPException(400, "Username already taken")
    u.role = "manager"
    u.username = body.username
    u.password_hash = hash_password(body.password)
    for r in db.query(User).filter(User.id.in_(body.recruiter_ids)).all():
        r.manager_id = u.id
    db.commit()
    return {"ok": True}


@router.post("/{uid}/team", dependencies=[Depends(require_admin)])
def set_team(uid: int, body: TeamIn, db: Session = Depends(get_db)):
    for r in db.query(User).filter(User.role == "recruiter").all():
        if r.id in body.recruiter_ids:
            r.manager_id = uid
        elif r.manager_id == uid:
            r.manager_id = None
    db.commit()
    return {"ok": True}


@router.post("/{uid}/demote", dependencies=[Depends(require_admin)])
def demote(uid: int, db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Not found")
    u.role = "recruiter"
    u.username = None
    u.password_hash = None
    for r in db.query(User).filter(User.manager_id == uid).all():
        r.manager_id = None
    db.commit()
    return {"ok": True}


@router.delete("/{uid}", dependencies=[Depends(require_admin)])
def delete_user(uid: int, db: Session = Depends(get_db)):
    """Remove a person and all their data. Admin only. Any recruiters reporting
    to a deleted manager are unassigned."""
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Not found")
    if u.role == "admin":
        raise HTTPException(400, "The admin account can't be deleted")
    for r in db.query(User).filter(User.manager_id == uid).all():
        r.manager_id = None
    db.query(ActivityEvent).filter_by(user_id=uid).delete()
    db.query(AttendanceDay).filter_by(user_id=uid).delete()
    db.query(Device).filter_by(user_id=uid).delete()
    db.delete(u)
    db.commit()
    return {"ok": True}


@router.get("/{uid}")
def detail(uid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    assert_can_see(user, uid, db)
    u = db.get(User, uid)
    today = dt.date.today()

    present = late = half = absent = off_days = rem_days = 0
    start_sum = start_cnt = hours_sum = hours_cnt = 0
    for i in range(30):
        d = today - dt.timedelta(days=i)
        row = db.query(AttendanceDay).filter_by(user_id=uid, date=d).first()
        if d.weekday() >= 5:
            continue
        s = effective_status(row)
        if s == "present":
            present += 1
        elif s == "late":
            late += 1; present += 1
        elif s == "half":
            half += 1; present += 1
        elif s == "absent":
            absent += 1
        if row and s not in ("absent", "weekend"):
            if row.primary_loc == "office":
                off_days += 1
            else:
                rem_days += 1
            if row.first_activity is not None:
                start_sum += row.first_activity; start_cnt += 1
            hours_sum += row.present_min; hours_cnt += 1

    # top apps last 30 days
    cat = {a.name: a.category for a in db.query(AppCategory).all()}
    start = dt.datetime.combine(today - dt.timedelta(days=30), dt.time.min)
    rows = (db.query(ActivityEvent)
            .filter(ActivityEvent.user_id == uid, ActivityEvent.ts >= start,
                    ActivityEvent.event_type == "heartbeat").all())
    totals: dict[str, int] = {}
    for e in rows:
        if e.active_app:
            totals[e.active_app] = totals.get(e.active_app, 0) + 1  # 1 heartbeat unit
    top = sorted(totals.items(), key=lambda x: -x[1])[:7]
    top_apps = [{"name": a, "units": n, "category": cat.get(a, "neutral")} for a, n in top]

    trow = db.query(AttendanceDay).filter_by(user_id=uid, date=today).first()

    return {
        "id": u.id, "name": u.name, "email": u.email, "role": u.role, "team": u.team,
        "summary": {
            "present": present, "late": late, "half": half, "absent": absent,
            "avg_start_min": round(start_sum / start_cnt) if start_cnt else None,
            "avg_hours": round(hours_sum / hours_cnt / 60, 1) if hours_cnt else None,
            "office_days": off_days, "remote_days": rem_days,
        },
        "today": _day_payload(trow),
        "top_apps": top_apps,
    }


def _day_payload(row):
    if not row:
        return None
    return {
        "status": row.override_status or row.status,
        "first_activity": row.first_activity, "last_activity": row.last_activity,
        "present_min": row.present_min, "active_min": row.active_min, "idle_min": row.idle_min,
        "break_min": row.break_min, "in_office_min": row.in_office_min, "remote_min": row.remote_min,
        "prod_min": row.prod_min, "unprod_min": row.unprod_min, "primary_loc": row.primary_loc,
    }
