"""Acknowledger backend — FastAPI entrypoint.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import agents, analytics, attendance, auth, settings as settings_router, users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Acknowledger — Workforce API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(users.router)
app.include_router(attendance.router)
app.include_router(analytics.router)
app.include_router(settings_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
