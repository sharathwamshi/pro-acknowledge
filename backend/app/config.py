"""Application configuration.

Everything is driven by environment variables (see .env.example).
Defaults use SQLite so the project runs with zero setup; switch to
PostgreSQL in production by setting DATABASE_URL.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_VERSION = "01.00.01"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite by default. For PostgreSQL:
    #   postgresql+psycopg://user:pass@localhost:5432/acknowledger
    database_url: str = "sqlite:///./acknowledger.db"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 12

    # All attendance/activity times are computed in this timezone. The agent
    # sends local time and the extension sends UTC; both are normalized to this.
    app_timezone: str = "Asia/Kolkata"

    # Comma-separated list of allowed origins (CORS), or "*" for any.
    # The browser extension (chrome-extension://...) and the desktop agent are
    # cross-origin, so "*" is the simplest safe default — auth uses a bearer
    # token in a header, not cookies, so credentials aren't needed.
    cors_origins: str = "*"


settings = Settings()
