from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Hospital HR System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "default-secret-key-change-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Database — Render injects plain postgresql:// for both; we fix the scheme below
    DATABASE_URL: str = ""
    SYNC_DATABASE_URL: str = ""

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # JWT
    JWT_SECRET_KEY: str = "default-jwt-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI Providers — Gemini → OpenAI → Groq (fallback chain)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Order: comma-separated e.g. "gemini,openai,groq"
    AI_PROVIDER_CHAIN: str = "gemini,openai,groq"

    # Africa's Talking
    AT_USERNAME: str = ""
    AT_API_KEY: str = ""
    AT_SENDER_ID: str = "HOSPITAL_HR"
    AT_WHATSAPP_NUMBER: str = ""

    # SendGrid
    SENDGRID_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@hospitalhr.com"
    EMAIL_FROM_NAME: str = "Hospital HR System"

    # File Storage
    STORAGE_BUCKET: str = ""
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""
    STORAGE_ENDPOINT_URL: str = ""
    STORAGE_REGION: str = ""

    # Sentry
    SENTRY_DSN: str = ""

    # Kenya Payroll
    NHIF_RATE: float = 0.015
    NSSF_EMPLOYEE_RATE: float = 0.06
    NSSF_EMPLOYER_RATE: float = 0.06
    PAYE_PERSONAL_RELIEF: float = 2400.0

    @property
    def async_database_url(self) -> str:
        """Always returns an asyncpg URL for SQLAlchemy async engine."""
        url = self.DATABASE_URL or self.SYNC_DATABASE_URL
        # Replace any plain postgresql:// or postgres:// with the async driver
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+asyncpg://" + url[len(prefix):]
        return url  # already has +asyncpg or is empty

    @property
    def sync_database_url(self) -> str:
        """Always returns a plain psycopg2 URL for Alembic / Celery."""
        url = self.SYNC_DATABASE_URL or self.DATABASE_URL
        # Strip +asyncpg if someone set the async URL for both vars
        url = url.replace("postgresql+asyncpg://", "postgresql://")
        url = url.replace("postgres+asyncpg://", "postgresql://")
        # Normalise postgres:// → postgresql:// (psycopg2 needs the long form)
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse comma-separated ALLOWED_ORIGINS into a list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
