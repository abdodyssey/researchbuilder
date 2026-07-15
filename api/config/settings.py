"""
Configuration settings managed by Pydantic Settings.
Loads configuration from system environment variables with fallback to a .env file.
"""

import secrets
import warnings
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Core app configs
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = ""

    # DB Config
    DATABASE_URL: str

    # APIs
    GROQ_API_KEY: str = "missing_api_key_on_vercel"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    SEMANTIC_SCHOLAR_API_KEY: str | None = None

    # Mayar
    MAYAR_API_KEY: str | None = None

    # Mailer (Resend)
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "ResearchBuilder <noreply@rafanovation.cloud>"
    APP_BASE_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=(
            str(Path(__file__).parent.parent.parent / ".env"),
            str(Path(__file__).parent.parent / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Validation & Dev fallback
if not settings.SECRET_KEY:
    if settings.ENVIRONMENT.lower() == "production":
        raise RuntimeError(
            "SECRET_KEY environment variable wajib di-set di produksi. "
            'Generate dengan: python -c "import secrets; print(secrets.token_hex(32))"'
        )
    warnings.warn(
        "SECRET_KEY tidak di-set — menggunakan key acak sementara (dev only). "
        "JWT akan hangus setiap restart server. Set SECRET_KEY di .env untuk menghindari ini.",
        stacklevel=2,
    )
    settings.SECRET_KEY = secrets.token_hex(32)
