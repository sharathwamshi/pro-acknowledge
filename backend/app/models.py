"""Data model.

One `users` table holds everyone; `role` + `manager_id` express the
hierarchy (admin -> manager -> recruiter). Only admins and managers have
a username/password; recruiters identify themselves once via the agent.
"""
import datetime as dt

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import relationship

from .database import Base


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False, default="recruiter")   # admin | manager | recruiter
    team = Column(String, default="Unassigned")
    disabled = Column(Boolean, default=False)

    # Only set for admin + managers (dashboard login).
    username = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=True)

    # Who this person reports to (null for admin and for unassigned recruiters).
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=now_utc)

    reports = relationship("User", backref="manager", remote_side=[id])
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    device_token = Column(String, unique=True, nullable=False, index=True)
    machine_name = Column(String)
    os = Column(String)
    last_seen = Column(DateTime, default=now_utc)

    user = relationship("User", back_populates="devices")


class ActivityEvent(Base):
    """Raw signal from an agent heartbeat. Attendance is derived from these."""
    __tablename__ = "activity_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    ts = Column(DateTime, nullable=False, index=True)
    event_type = Column(String, default="heartbeat")   # heartbeat | start | stop
    active_app = Column(String)
    window_title = Column(String)
    url = Column(String)
    idle = Column(Boolean, default=False)
    # Location signals (SSID used by default; bssid/ip kept for a hardened match).
    ssid = Column(String)
    bssid = Column(String)
    source_ip = Column(String)


class AttendanceDay(Base):
    """Computed, cached per-user-per-day summary. Fast to read for grids."""
    __tablename__ = "attendance_days"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)

    first_activity = Column(Integer)    # minutes since midnight
    last_activity = Column(Integer)
    present_min = Column(Integer, default=0)
    active_min = Column(Integer, default=0)
    idle_min = Column(Integer, default=0)
    break_min = Column(Integer, default=0)
    in_office_min = Column(Integer, default=0)
    remote_min = Column(Integer, default=0)
    prod_min = Column(Integer, default=0)
    unprod_min = Column(Integer, default=0)
    neut_min = Column(Integer, default=0)

    status = Column(String, default="absent")       # present|late|half|absent|weekend
    primary_loc = Column(String)                     # office|remote|None

    # Manual correction (kept separate so the computed value is never lost).
    override_status = Column(String, nullable=True)
    override_note = Column(Text, nullable=True)


class OfficeNetwork(Base):
    __tablename__ = "office_networks"
    id = Column(Integer, primary_key=True)
    label = Column(String, nullable=False)
    ssid = Column(String, nullable=False)
    bssid = Column(String)
    ip_range = Column(String)


class AppCategory(Base):
    __tablename__ = "app_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    category = Column(String, default="neutral")     # productive|unproductive|neutral


class Setting(Base):
    """Key/value store for the two singletons: policy and agent settings (JSON)."""
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(Text)   # JSON-encoded
