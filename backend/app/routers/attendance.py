import calendar
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import assert_can_see, current_user, visible_user_ids
from ..engine import effective_status, recompute_day
from ..models import ActivityEvent, AttendanceDay, OfficeNetwork, User
from ..schemas import OverrideIn

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("/grid")
def grid(year: int, month: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = visible_user_ids(user, db)
    ndays = calendar.monthrange(year, month)[1]
    dates = [dt.date(year, month, d) for d in range(1, ndays + 1)]
    people = db.query(User).filter(User.id.in_(ids)).order_by(User.name).all()

    rows = []
    for u in people:
        day_rows = {r.date: r for r in db.query(AttendanceDay)
                    .filter(AttendanceDay.user_id == u.id,
                            AttendanceDay.date >= dates[0],
                            AttendanceDay.date <= dates[-1]).all()}
        cells = []
        for d in dates:
            if d > dt.date.today():
                cells.append({"date": d.isoformat(), "status": None, "loc": None})
                continue
            r = day_rows.get(d)
            s = effective_status(r) if r else ("weekend" if d.weekday() >= 5 else "absent")
            cells.append({"date": d.isoformat(), "status": s,
                          "loc": (r.primary_loc if r and s not in ("absent", "weekend") else None)})
        rows.append({"id": u.id, "name": u.name, "team": u.team, "cells": cells})

    return {"year": year, "month": month, "days": [d.day for d in dates],
            "weekend": [d.weekday() >= 5 for d in dates], "rows": rows}


@router.get("/day")
def day(user_id: int, date: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    assert_can_see(user, user_id, db)
    d = dt.date.fromisoformat(date)
    row = db.query(AttendanceDay).filter_by(user_id=user_id, date=d).first()
    office = {n.ssid for n in db.query(OfficeNetwork).all()}

    # network segments for the timeline
    start = dt.datetime.combine(d, dt.time.min)
    events = (db.query(ActivityEvent)
              .filter(ActivityEvent.user_id == user_id, ActivityEvent.ts >= start,
                      ActivityEvent.ts < start + dt.timedelta(days=1),
                      ActivityEvent.event_type == "heartbeat")
              .order_by(ActivityEvent.ts).all())
    segs = []
    for e in events:
        m = e.ts.hour * 60 + e.ts.minute
        ss = e.ssid or "Unknown"
        if segs and segs[-1]["ssid"] == ss and m - segs[-1]["end"] <= 10:
            segs[-1]["end"] = m
        else:
            segs.append({"ssid": ss, "start": m, "end": m, "office": ss in office})

    u = db.get(User, user_id)
    return {
        "user": {"id": u.id, "name": u.name, "team": u.team},
        "date": date, "weekday": d.weekday(),
        "status": effective_status(row) if row else ("weekend" if d.weekday() >= 5 else "absent"),
        "detail": None if not row else {
            "first_activity": row.first_activity, "last_activity": row.last_activity,
            "present_min": row.present_min, "active_min": row.active_min, "idle_min": row.idle_min,
            "break_min": row.break_min, "in_office_min": row.in_office_min, "remote_min": row.remote_min,
            "prod_min": row.prod_min, "unprod_min": row.unprod_min,
            "override_status": row.override_status, "override_note": row.override_note,
        },
        "segments": segs,
    }


@router.post("/override")
def override(body: OverrideIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in ("admin", "manager"):
        raise HTTPException(403, "Not allowed")
    assert_can_see(user, body.user_id, db)
    if not body.note.strip():
        raise HTTPException(400, "A reason is required")
    d = dt.date.fromisoformat(body.date)
    row = db.query(AttendanceDay).filter_by(user_id=body.user_id, date=d).first()
    if not row:
        row = AttendanceDay(user_id=body.user_id, date=d, status="absent")
        db.add(row)
    row.override_status = body.status
    row.override_note = body.note.strip()
    db.commit()
    return {"ok": True}


@router.delete("/override")
def clear_override(user_id: int, date: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in ("admin", "manager"):
        raise HTTPException(403, "Not allowed")
    assert_can_see(user, user_id, db)
    d = dt.date.fromisoformat(date)
    row = db.query(AttendanceDay).filter_by(user_id=user_id, date=d).first()
    if row:
        row.override_status = None
        row.override_note = None
        db.commit()
    return {"ok": True}
