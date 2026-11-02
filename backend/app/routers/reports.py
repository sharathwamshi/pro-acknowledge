"""Reports and Excel exports.

On-screen summary plus multi-sheet .xlsx downloads, all scoped to what the
caller is allowed to see (admin = everyone, manager = their team).
"""
import datetime as dt
import io

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, visible_user_ids
from ..engine import effective_status
from ..models import ActivityEvent, AppCategory, AttendanceDay, User

router = APIRouter(prefix="/reports", tags=["reports"])

HEARTBEAT_UNIT_MIN = 5   # each stored heartbeat ~ this many minutes of usage


def _parse(d: str | None, default: dt.date) -> dt.date:
    try:
        return dt.date.fromisoformat(d) if d else default
    except Exception:
        return default


def _range(start: str | None, end: str | None):
    today = dt.date.today()
    s = _parse(start, today - dt.timedelta(days=29))
    e = _parse(end, today)
    if s > e:
        s, e = e, s
    return s, e


def _collect(db: Session, ids: list[int], s: dt.date, e: dt.date):
    """Build the per-person rows and the top apps/websites once, reused by both
    the JSON summary and the Excel export."""
    cat = {a.name: (a.category, a.kind or "app") for a in db.query(AppCategory).all()}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}

    people = []
    for uid, u in users.items():
        rows = db.query(AttendanceDay).filter(
            AttendanceDay.user_id == uid, AttendanceDay.date >= s, AttendanceDay.date <= e).all()
        present = late = half = absent = 0
        prod = unprod = neut = present_min = office = remote = 0
        for r in rows:
            st = effective_status(r)
            if st == "present": present += 1
            elif st == "late": late += 1; present += 1
            elif st == "half": half += 1; present += 1
            elif st == "absent": absent += 1
            prod += r.prod_min; unprod += r.unprod_min; neut += r.neut_min
            present_min += r.present_min; office += r.in_office_min; remote += r.remote_min
        tot = prod + unprod + neut
        people.append({
            "id": uid, "name": u.name, "team": u.team,
            "present": present, "late": late, "half": half, "absent": absent,
            "present_hours": round(present_min / 60, 1),
            "productive_hours": round(prod / 60, 1),
            "unproductive_hours": round(unprod / 60, 1),
            "office_hours": round(office / 60, 1), "remote_hours": round(remote / 60, 1),
            "score": round(prod / tot, 2) if tot else 0,
        })
    people.sort(key=lambda x: -x["score"])

    start_dt = dt.datetime.combine(s, dt.time.min)
    end_dt = dt.datetime.combine(e + dt.timedelta(days=1), dt.time.min)
    ev = (db.query(ActivityEvent.active_app)
          .filter(ActivityEvent.user_id.in_(ids), ActivityEvent.ts >= start_dt,
                  ActivityEvent.ts < end_dt, ActivityEvent.active_app.isnot(None)).all())
    apps: dict[str, int] = {}
    sites: dict[str, int] = {}
    for (name,) in ev:
        _, kind = cat.get(name, ("neutral", "website" if ("." in name and " " not in name) else "app"))
        bucket = sites if kind == "website" else apps
        bucket[name] = bucket.get(name, 0) + 1

    def top(d):
        return [{"name": n, "hours": round(c * HEARTBEAT_UNIT_MIN / 60, 1),
                 "category": cat.get(n, ("neutral", ""))[0]}
                for n, c in sorted(d.items(), key=lambda x: -x[1])[:15]]

    return people, top(apps), top(sites)


@router.get("/summary")
def summary(start: str = None, end: str = None,
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, e = _range(start, end)
    ids = visible_user_ids(user, db)
    people, apps, sites = _collect(db, ids, s, e)
    team_prod = sum(p["productive_hours"] for p in people)
    team_present = sum(p["present_hours"] for p in people)
    avg_score = round(sum(p["score"] for p in people) / len(people), 2) if people else 0
    return {
        "start": s.isoformat(), "end": e.isoformat(), "people_count": len(people),
        "team_productive_hours": round(team_prod, 1),
        "team_present_hours": round(team_present, 1),
        "avg_score": avg_score,
        "people": people, "top_apps": apps, "top_websites": sites,
    }


@router.get("/export.xlsx")
def export_xlsx(start: str = None, end: str = None,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Full workbook: Summary, Attendance, Productivity, Applications, Websites."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    s, e = _range(start, end)
    ids = visible_user_ids(user, db)
    people, apps, sites = _collect(db, ids, s, e)

    wb = Workbook()
    head_fill = PatternFill("solid", fgColor="1D5B9E")
    head_font = Font(color="FFFFFF", bold=True)

    def sheet(title, headers, rows):
        ws = wb.create_sheet(title)
        ws.append(headers)
        for c in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=c)
            cell.fill = head_fill; cell.font = head_font
            cell.alignment = Alignment(horizontal="center")
        for r in rows:
            ws.append(r)
        for c in range(1, len(headers) + 1):
            width = max(len(str(headers[c - 1])), *(len(str(r[c - 1])) for r in rows)) if rows else len(str(headers[c - 1]))
            ws.column_dimensions[get_column_letter(c)].width = min(40, width + 3)
        ws.freeze_panes = "A2"
        return ws

    # Summary sheet (default sheet renamed)
    ws0 = wb.active
    ws0.title = "Summary"
    ws0["A1"] = "Acknowledger — Workforce Report"
    ws0["A1"].font = Font(size=14, bold=True)
    ws0["A2"] = f"Period: {s.isoformat()} to {e.isoformat()}"
    ws0["A3"] = f"People: {len(people)}"
    ws0["A4"] = f"Team productive hours: {round(sum(p['productive_hours'] for p in people),1)}"
    ws0["A5"] = f"Average productivity: {round(sum(p['score'] for p in people)/len(people)*100) if people else 0}%"

    sheet("Attendance",
          ["Name", "Team", "Present", "Late", "Half-days", "Absent", "Present hrs", "Office hrs", "Remote hrs"],
          [[p["name"], p["team"], p["present"], p["late"], p["half"], p["absent"],
            p["present_hours"], p["office_hours"], p["remote_hours"]] for p in people])

    sheet("Productivity",
          ["Name", "Team", "Productivity %", "Productive hrs", "Unproductive hrs"],
          [[p["name"], p["team"], round(p["score"] * 100), p["productive_hours"], p["unproductive_hours"]]
           for p in people])

    sheet("Applications", ["Application", "Category", "Hours"],
          [[a["name"], a["category"], a["hours"]] for a in apps])
    sheet("Websites", ["Website", "Category", "Hours"],
          [[w["name"], w["category"], w["hours"]] for w in sites])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"acknowledger-report-{s.isoformat()}_to_{e.isoformat()}.xlsx"
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
