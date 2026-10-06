"""Application configuration.

Everything is driven by environment variables (see .env.example).
Defaults use SQLite so the project runs with zero setup; switch to
PostgreSQL in production by setting DATABASE_URL.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite by default. For PostgreSQL:
    #   postgresql+psycopg://user:pass@localhost:5432/acknowledger
    database_url: str = "sqlite:///./acknowledger.db"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 12

    # Comma-separated list of allowed frontend origins (CORS).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


settings = Settings()
