"""Seed the database with an admin, two managers, recruiters, and ~5 weeks of
realistic heartbeat activity so every screen is populated immediately.

Run from the backend/ directory:  python seed.py
"""
import datetime as dt
import json
import random
import secrets

from app.database import Base, SessionLocal, engine
from app.engine import recompute_day
from app.models import (
    ActivityEvent, AppCategory, AttendanceDay, Device, OfficeNetwork, Setting, User,
)
from app.security import hash_password

DAYS_BACK = 35
HEARTBEAT_MIN = 5   # seed cadence: one heartbeat every 5 minutes

OFFICE = [
    ("HQ — Main Floor", "ACK-Office", "A4:2B:8C:11:09:FE", "103.21.44.0/24"),
    ("HQ — 5GHz", "ACK-Office-5G", "A4:2B:8C:11:0A:02", "103.21.44.0/24"),
]
HOME_SSIDS = ["JioFiber-7A2", "Airtel_Home", "ACT_Fibernet", "Home-WiFi", "TP-Link_5521"]

APPS = {
    "productive": ["Naukri RMS", "LinkedIn Recruiter", "Zoho Recruit (ATS)", "Outlook",
                   "Gmail", "MS Teams", "Zoom", "Excel", "Indeed", "Word"],
    "unproductive": ["YouTube", "Instagram", "WhatsApp Web", "Facebook", "Netflix", "Reddit"],
    "neutral": ["Chrome (misc)", "File Explorer", "Settings"],
}
RECRUITERS = ["Priya Sharma", "Arjun Mehta", "Neha Verma", "Rohan Gupta", "Ananya Iyer",
              "Karan Singh", "Divya Nair", "Vikram Reddy", "Sana Khan", "Aditya Joshi",
              "Meera Pillai", "Siddharth Rao", "Pooja Desai", "Rahul Kulkarni"]


def reset():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def run():
    reset()
    db = SessionLocal()

    # settings
    db.add(Setting(key="policy", value=json.dumps({
        "work_start": "10:00", "late_after": "10:15", "half_day_under_hours": 4,
        "full_day_hours": 8, "max_break_minutes": 60, "timezone": "Asia/Kolkata (IST)"})))
    db.add(Setting(key="agent", value=json.dumps({
        "heartbeat": 60, "idle_threshold": 5, "screenshot_interval": 10, "screenshots_enabled": False})))
    for label, ssid, bssid, ip in OFFICE:
        db.add(OfficeNetwork(label=label, ssid=ssid, bssid=bssid, ip_range=ip))
    for cat, names in APPS.items():
        for n in names:
            db.add(AppCategory(name=n, category=cat))

    admin = User(name="Operations Admin", email="admin@acknowledger.in", role="admin",
                 team="Management", username="admin", password_hash=hash_password("admin123"))
    m1 = User(name="Ravi Menon", email="ravi.menon@acknowledger.in", role="manager",
              team="Tech Hiring", username="ravi", password_hash=hash_password("ravi123"))
    m2 = User(name="Sneha Kapoor", email="sneha.kapoor@acknowledger.in", role="manager",
              team="Non-Tech Hiring", username="sneha", password_hash=hash_password("sneha123"))
    db.add_all([admin, m1, m2])
    db.flush()

    recruiters = []
    for i, nm in enumerate(RECRUITERS):
        mgr = m1 if i < 7 else m2
        email = nm.lower().replace(" ", ".") + "@acknowledger.in"
        u = User(name=nm, email=email, role="recruiter", team=mgr.team, manager_id=mgr.id)
        db.add(u)
        recruiters.append(u)
    db.flush()

    tracked = [m1, m2] + recruiters
    for u in tracked:
        db.add(Device(user_id=u.id, device_token=secrets.token_urlsafe(24),
                      machine_name=f"ACK-LT-{u.id:02d}", os="Windows 11",
                      last_seen=dt.datetime.now()))
    db.flush()

    today = dt.date.today()
    for idx, u in enumerate(tracked):
        punctual = random.random() < 0.6
        hybrid = random.random() < 0.4
        diligence = 0.55 + random.random() * 0.4
        for back in range(DAYS_BACK):
            d = today - dt.timedelta(days=back)
            if d.weekday() >= 5:
                continue
            if random.random() < 0.05:   # absent
                continue
            start = 600 + (random.randint(-8, 14) if punctual else random.randint(-5, 48))
            if random.random() < 0.12:
                start += random.randint(15, 40)
            start = max(510, start)
            dur = random.randint(450, 580)
            end = start + dur
            remote_today = hybrid and random.random() < 0.4
            home = HOME_SSIDS[idx % len(HOME_SSIDS)]

            def ssid_at(minute):
                if not remote_today:
                    return random.choice(OFFICE)[1]
                return home

            prod_share = min(0.92, max(0.3, diligence + (random.random() - 0.5) * 0.2))
            t = start
            while t < end:
                # lunch break around the middle
                in_break = (start + dur * 0.45) < t < (start + dur * 0.45 + random.randint(30, 60))
                if in_break:
                    t += HEARTBEAT_MIN
                    continue
                idle = random.random() < 0.12
                r = random.random()
                if r < prod_share:
                    app = random.choice(APPS["productive"])
                elif r < prod_share + (1 - prod_share) * 0.6:
                    app = random.choice(APPS["unproductive"])
                else:
                    app = random.choice(APPS["neutral"])
                ts = dt.datetime.combine(d, dt.time(t // 60, t % 60))
                db.add(ActivityEvent(user_id=u.id, ts=ts, event_type="heartbeat",
                                     active_app=app, window_title=app, idle=idle,
                                     ssid=ssid_at(t), bssid=OFFICE[0][2]))
                t += HEARTBEAT_MIN
    db.flush()

    # compute cached attendance for everyone
    for u in tracked:
        for back in range(DAYS_BACK):
            recompute_day(db, u.id, today - dt.timedelta(days=back))

    db.commit()
    db.close()
    print("Seeded: 1 admin, 2 managers, %d recruiters, ~%d days of activity."
          % (len(recruiters), DAYS_BACK))
    print("Logins — admin/admin123 · ravi/ravi123 · sneha/sneha123")


if __name__ == "__main__":
    run()
