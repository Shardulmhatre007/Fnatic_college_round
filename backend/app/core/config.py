"""
Application settings loaded from environment variables.

Provide a `.env` file locally (see `.env.example`). In CI and production,
set environment variables directly; never commit secrets.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration class. All fields come from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    debug: bool = False
    secret_key: str = "change-me-in-production"
    database_url: str = "sqlite+aiosqlite:///./handsfree.db"
    cors_origins: list[str] = ["chrome-extension://*"]

    # JWT settings
    jwt_algorithm: str = "HS256"
    # Access token lifetime in minutes.
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # Rate limiting (requests per minute) for expensive routes.
    llm_rate_limit: int = 10
    stt_rate_limit: int = 20


settings = Settings()
