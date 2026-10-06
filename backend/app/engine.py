"""The attendance engine.

Turns raw heartbeat events for one person on one day into a clean summary:
first/last activity, present/active/idle/break time, in-office vs remote (by
Wi-Fi), productive/unproductive split (by app category), and a status derived
from the configurable policy. Cadence-independent: everything is computed from
timestamps, so it works whatever heartbeat interval the agent uses.
"""
import datetime as dt
import json

from sqlalchemy.orm import Session

from . import models

BREAK_GAP_MIN = 10   # a gap between heartbeats longer than this counts as a break


def get_policy(db: Session) -> dict:
    row = db.get(models.Setting, "policy")
    if row:
        return json.loads(row.value)
    return {
        "work_start": "10:00", "late_after": "10:15",
        "half_day_under_hours": 4, "full_day_hours": 8,
        "max_break_minutes": 60, "timezone": "Asia/Kolkata (IST)",
    }


def _mins(t: dt.datetime) -> int:
    return t.hour * 60 + t.minute


def _clock_to_min(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def recompute_day(db: Session, user_id: int, date: dt.date) -> models.AttendanceDay:
    """Recompute and upsert the cached AttendanceDay for one user/day."""
    start = dt.datetime.combine(date, dt.time.min)
    end = start + dt.timedelta(days=1)
    events = (db.query(models.ActivityEvent)
              .filter(models.ActivityEvent.user_id == user_id,
                      models.ActivityEvent.ts >= start,
                      models.ActivityEvent.ts < end,
                      models.ActivityEvent.event_type == "heartbeat")
              .order_by(models.ActivityEvent.ts).all())

    row = (db.query(models.AttendanceDay)
           .filter_by(user_id=user_id, date=date).first())
    if not row:
        row = models.AttendanceDay(user_id=user_id, date=date)
        db.add(row)

    policy = get_policy(db)
    office_ssids = {n.ssid for n in db.query(models.OfficeNetwork).all()}
    cat = {a.name: a.category for a in db.query(models.AppCategory).all()}
    is_weekend = date.weekday() >= 5

    if not events:
        row.status = "weekend" if is_weekend else "absent"
        for f in ("first_activity", "last_activity"):
            setattr(row, f, None)
        for f in ("present_min", "active_min", "idle_min", "break_min",
                  "in_office_min", "remote_min", "prod_min", "unprod_min", "neut_min"):
            setattr(row, f, 0)
        row.primary_loc = None
        db.flush()
        return row

    first, last = events[0].ts, events[-1].ts
    present = max(0, int((last - first).total_seconds() // 60))

    idle_min = break_min = in_office = remote = prod = unprod = neut = 0
    for i in range(len(events) - 1):
        gap = int((events[i + 1].ts - events[i].ts).total_seconds() // 60)
        if gap <= 0:
            continue
        if gap > BREAK_GAP_MIN:
            break_min += gap
            continue
        if events[i].idle:
            idle_min += gap
        # location for this interval, by the earlier heartbeat's network
        if events[i].ssid and events[i].ssid in office_ssids:
            in_office += gap
        else:
            remote += gap
        # productivity for this interval, by active app category
        c = cat.get(events[i].active_app or "", "neutral")
        if c == "productive":
            prod += gap
        elif c == "unproductive":
            unprod += gap
        else:
            neut += gap

    active = max(0, present - idle_min - break_min)

    # Status from policy.
    if _mins(first) > _clock_to_min(policy["late_after"]):
        status = "late"
    else:
        status = "present"
    if present / 60 < policy["half_day_under_hours"]:
        status = "half"

    row.first_activity = _mins(first)
    row.last_activity = _mins(last)
    row.present_min = present
    row.active_min = active
    row.idle_min = idle_min
    row.break_min = break_min
    row.in_office_min = in_office
    row.remote_min = remote
    row.prod_min = prod
    row.unprod_min = unprod
    row.neut_min = neut
    row.status = status
    row.primary_loc = "office" if in_office >= remote else "remote"
    db.flush()
    return row


def effective_status(row: models.AttendanceDay | None) -> str:
    if row is None:
        return "absent"
    return row.override_status or row.status
