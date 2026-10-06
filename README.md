# Acknowledger — Workforce & Attendance System

A self-hosted workforce analytics tool for an internal team: a desktop agent on
each recruiter's machine reports activity to a server, and you and your managers
watch attendance, productivity, and in-office/remote status from a web console.

Built in your stack — **Python (FastAPI)** backend + **React** frontend, with a
**Python** agent and a **Chrome** extension.

```
acknowledger/
├── backend/      FastAPI + SQLAlchemy API, attendance engine, seed data
├── frontend/     React (Vite) admin console
├── agent/        Python desktop agent (Windows/macOS/Linux)
└── extension/    Chrome extension for accurate URL capture
```

## Architecture

```
  Recruiter PC                         Your server                 You / managers
 ┌───────────────┐   HTTPS batches   ┌──────────────┐   REST    ┌──────────────┐
 │ Python agent  │ ────────────────► │  FastAPI     │ ◄──────── │ React console│
 │ + Chrome ext  │   /agent/ingest   │  + Postgres  │   JWT     │  (browser)   │
 └───────────────┘                   │  attendance  │           └──────────────┘
   active app,                       │  engine      │
   idle, Wi-Fi SSID                  └──────────────┘
```

- The agent sends heartbeats (active app, idle, SSID). The **attendance engine**
  derives first/last activity, present/active/idle/break time, in-office vs
  remote (Wi-Fi matched to your office networks), and productive/unproductive
  split (apps matched to your categories), then a status from your **policy**.
- Roles: **admin** sees everyone + settings; **manager** sees only their
  assigned team (never themselves); **recruiter** is tracked, no login. Scoping
  is enforced server-side on every request.

## 1. Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                     # edit JWT_SECRET for production
python seed.py                                           # creates demo data (optional)
uvicorn app.main:app --reload
```

- API: http://localhost:8000  ·  interactive docs: http://localhost:8000/docs
- Default DB is SQLite (zero setup). For PostgreSQL, set `DATABASE_URL` in `.env`
  and `pip install "psycopg[binary]"`.
- Demo logins after seeding: `admin/admin123`, `ravi/ravi123`, `sneha/sneha123`.

## 2. Run the frontend

```bash
cd frontend
npm install
cp .env.example .env            # VITE_API_URL=http://localhost:8000
npm run dev                      # http://localhost:5173
```

Build for production with `npm run build` (outputs `dist/`, serve behind any
static host or reverse-proxy alongside the API).

## 3. Install the agent on a recruiter PC

```bash
cd agent
pip install -r requirements.txt
cp agent_config.example.json agent_config.json          # set server_url
python agent.py                                          # first run asks name + email once
```

Package it into a single `.exe` with PyInstaller and roll it out via Group
Policy / Intune — see `agent/README.md`.

## 4. (Optional) Chrome extension for exact URLs

Load `extension/` as an unpacked extension (chrome://extensions → Developer
mode → Load unpacked), open its options page, and paste the same device token
the agent created (in `agent/agent_config.json`). The desktop agent alone sees
window titles; the extension adds the active tab's domain.

## What each screen does

- **Dashboard** — present/late/absent, in-office vs remote, active now, 7-day
  productive-hours trend.
- **Live view** — every person's current status, app, and location, searchable.
- **Users** — searchable list; admin can add recruiters, promote to manager
  (set username + password + assign a team), edit teams, demote.
- **Attendance** — colour-coded monthly grid; click a day for the Wi-Fi location
  timeline and a manual correction (with a logged reason); export CSV.
- **Productivity** — per-person scores and team tool usage over 7/14/30 days.
- **Settings** (admin) — attendance policy, office Wi-Fi networks, app
  categories, manager/role management, agent settings. Changing policy, networks
  or categories recomputes attendance immediately.

## Compliance note

This is consent-first by design: recruiters self-identify once, status comes from
activity (not keystroke logging), and screenshots are off by default. Give your
team written notice of what's monitored — India's DPDP Act expects it, and it
keeps the data usable in reviews. There is deliberately no anti-tamper layer
since you control these machines; add code signing + a watchdog only if you ever
distribute beyond them.

## Tested

The backend ships with verified behaviour: role scoping (a manager sees their
team and not themselves; cross-team access returns 403), the attendance engine
(policy changes recompute the grid), and the agent signup→ingest round trip.
The React app builds clean and every screen is wired to a live endpoint.
