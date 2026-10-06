"""Request/response schemas."""
from pydantic import BaseModel, EmailStr


# ---- auth ----
class LoginIn(BaseModel):
    username: str
    password: str


# ---- agent ----
class SignupIn(BaseModel):
    name: str
    email: EmailStr
    machine_name: str | None = None
    os: str | None = None


class EventIn(BaseModel):
    ts: str                      # ISO timestamp
    active_app: str | None = None
    window_title: str | None = None
    url: str | None = None
    idle: bool = False
    ssid: str | None = None
    bssid: str | None = None


class IngestIn(BaseModel):
    events: list[EventIn]


# ---- users ----
class AddRecruiterIn(BaseModel):
    name: str
    email: EmailStr
    manager_id: int | None = None


class MakeManagerIn(BaseModel):
    username: str
    password: str
    recruiter_ids: list[int] = []


class TeamIn(BaseModel):
    recruiter_ids: list[int] = []


# ---- attendance ----
class OverrideIn(BaseModel):
    user_id: int
    date: str
    status: str
    note: str


# ---- settings ----
class NetworkIn(BaseModel):
    label: str
    ssid: str
    bssid: str | None = None
    ip_range: str | None = None


class AppIn(BaseModel):
    name: str
    category: str


class PasswordIn(BaseModel):
    password: str
