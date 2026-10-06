import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, visible_user_ids
from ..engine import effective_status
from ..models import ActivityEvent, AppCategory, AttendanceDay, Device, OfficeNetwork, User

router = APIRouter(prefix="/analytics", tags=["analytics"])

LIVE_WINDOW_MIN = 5   # a device seen within this window is considered online


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = visible_user_ids(user, db)
    today = dt.date.today()
    present = late = absent = in_off = remote = 0
    for uid in ids:
        row = db.query(AttendanceDay).filter_by(user_id=uid, date=today).first()
        s = effective_status(row) if row else "absent"
        if s == "present":
            present += 1
        elif s == "late":
            present += 1; late += 1
        elif s == "half":
            present += 1
        elif s == "absent":
            absent += 1
        if row and s not in ("absent", "weekend"):
            if row.primary_loc == "office":
                in_off += 1
            else:
                remote += 1

    active, idle, offline = _live_counts(db, ids)

    # 7-day avg productive hours
    trend = []
    for i in range(6, -1, -1):
        d = today - dt.timedelta(days=i)
        rows = db.query(AttendanceDay).filter(
            AttendanceDay.user_id.in_(ids), AttendanceDay.date == d,
            AttendanceDay.status != "absent", AttendanceDay.status != "weekend").all()
        avg = round(sum(r.prod_min for r in rows) / len(rows) / 60, 1) if rows else 0
        trend.append({"label": d.strftime("%a"), "value": avg})

    return {"total": len(ids), "present": present, "late": late, "absent": absent,
            "in_office": in_off, "remote": remote,
            "active": active, "idle": idle, "offline": offline, "trend": trend}


def _live_counts(db, ids):
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    cutoff = now - dt.timedelta(minutes=LIVE_WINDOW_MIN)
    active = idle = offline = 0
    for uid in ids:
        dev = (db.query(Device).filter(Device.user_id == uid)
               .order_by(Device.last_seen.desc()).first())
        if not dev or dev.last_seen < cutoff:
            offline += 1
            continue
        last = (db.query(ActivityEvent).filter(ActivityEvent.user_id == uid)
                .order_by(ActivityEvent.ts.desc()).first())
        if last and last.idle:
            idle += 1
        else:
            active += 1
    return active, idle, offline


@router.get("/live")
def live(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = visible_user_ids(user, db)
    office = {n.ssid for n in db.query(OfficeNetwork).all()}
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    cutoff = now - dt.timedelta(minutes=LIVE_WINDOW_MIN)
    out = []
    for u in db.query(User).filter(User.id.in_(ids)).all():
        dev = (db.query(Device).filter(Device.user_id == u.id)
               .order_by(Device.last_seen.desc()).first())
        last = (db.query(ActivityEvent).filter(ActivityEvent.user_id == u.id)
                .order_by(ActivityEvent.ts.desc()).first())
        if not dev or dev.last_seen < cutoff:
            status, app, ssid = "offline", None, None
        else:
            status = "idle" if (last and last.idle) else "active"
            app = last.active_app if last else None
            ssid = last.ssid if last else None
        out.append({"id": u.id, "name": u.name, "team": u.team, "status": status,
                    "app": app, "ssid": ssid, "in_office": bool(ssid and ssid in office)})
    order = {"offline": 0, "idle": 1, "active": 2}
    out.sort(key=lambda x: order.get(x["status"], 3))
    return out


@router.get("/productivity")
def productivity(days: int = 7, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = visible_user_ids(user, db)
    today = dt.date.today()
    start = today - dt.timedelta(days=days - 1)

    per_user = []
    for u in db.query(User).filter(User.id.in_(ids)).all():
        rows = db.query(AttendanceDay).filter(
            AttendanceDay.user_id == u.id, AttendanceDay.date >= start,
            AttendanceDay.date <= today).all()
        prod = sum(r.prod_min for r in rows)
        tot = sum(r.prod_min + r.unprod_min + r.neut_min for r in rows)
        per_user.append({"id": u.id, "name": u.name, "prod": prod, "total": tot,
                         "score": round(prod / tot, 2) if tot else 0})
    per_user.sort(key=lambda x: -x["score"])

    cat = {a.name: a.category for a in db.query(AppCategory).all()}
    start_dt = dt.datetime.combine(start, dt.time.min)
    rows = (db.query(ActivityEvent)
            .filter(ActivityEvent.user_id.in_(ids), ActivityEvent.ts >= start_dt,
                    ActivityEvent.event_type == "heartbeat").all())
    totals: dict[str, int] = {}
    for e in rows:
        if e.active_app:
            totals[e.active_app] = totals.get(e.active_app, 0) + 1
    top = sorted(totals.items(), key=lambda x: -x[1])[:8]
    top_apps = [{"name": a, "units": n, "category": cat.get(a, "neutral")} for a, n in top]

    team_prod = sum(x["prod"] for x in per_user)
    team_tot = sum(x["total"] for x in per_user)
    return {"team_score": round(team_prod / team_tot, 2) if team_tot else 0,
            "team_prod_hours": round(team_prod / 60), "people": len(ids),
            "per_user": per_user, "top_apps": top_apps}
