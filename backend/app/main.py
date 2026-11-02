"""Acknowledger backend — FastAPI entrypoint.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .config import APP_VERSION, settings
from .database import Base, engine
from .routers import (
    agents, analytics, attendance, auth, reports,
    settings as settings_router, users,
)

Base.metadata.create_all(bind=engine)


def _ensure_columns():
    """Tiny, safe migration: add columns introduced after first release so an
    existing database keeps working without a full migration tool."""
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("app_categories")}
    if "kind" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE app_categories ADD COLUMN kind VARCHAR DEFAULT 'app'"))
            # Backfill: anything that looks like a domain becomes a website.
            conn.execute(text(
                "UPDATE app_categories SET kind='website' "
                "WHERE name LIKE '%.%' AND name NOT LIKE '% %'"))


_ensure_columns()

app = FastAPI(title="Acknowledger — Workforce API", version=APP_VERSION)

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
_allow_all = "*" in _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins,
    # Browsers forbid credentials with wildcard origins; we use bearer tokens,
    # not cookies, so credentials are off when allowing all origins.
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(users.router)
app.include_router(attendance.router)
app.include_router(analytics.router)
app.include_router(settings_router.router)
app.include_router(reports.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/version")
def version():
    return {"version": APP_VERSION}
