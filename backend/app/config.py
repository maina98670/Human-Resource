from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Hospital HR System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "default-secret-key-change-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Database
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
    GEMINI_MODEL: str = "gemini-1.5-flash"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama3-70b-8192"

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
    def allowed_origins_list(self) -> List[str]:
        """Parse comma-separated ALLOWED_ORIGINS into a list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
