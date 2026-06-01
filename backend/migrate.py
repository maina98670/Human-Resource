"""
Standalone migration script — drop everything and recreate from models.
Run from the backend/ directory: python migrate.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath("."))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.config import settings
from app.database import Base
from app.models.models import *  # noqa — register all models on Base.metadata

DROP_TABLES = [
    "audit_logs",
    "wellness_checkins",
    "notifications",
    "payslips",
    "payroll_runs",
    "staff_allowances",
    "leave_requests",
    "leave_balances",
    "shift_swap_requests",
    "shift_assignments",
    "shifts",
    "shift_templates",
    "credentials",
    "transfer_records",
    "staff",
    "refresh_tokens",
    "users",
    "departments",
    "branches",
    # Stale tables from other projects
    "alerts",
    "ai_analysis",
    "patient_vitals",
    "health_connections",
    "password_reset_tokens",
    "admins",
]

DROP_TYPES = [
    "userrole",
    "employmenttype",
    "staffcategory",
    "clinicalsubrole",
    "leavestatus",
    "leavetype",
    "shifttype",
    "swapstatus",
    "alertstatus",
    "triage_level",
    "platform_type",
    "user_role",
    "alert_status",
]


async def migrate():
    # Build a fresh engine directly — never reuse the module-level pool
    url = settings.async_database_url
    engine = create_async_engine(url, echo=False, pool_pre_ping=True)

    # Step 1: drop tables and types inside a transaction
    async with engine.begin() as conn:
        for t in DROP_TABLES:
            await conn.execute(text(f'DROP TABLE IF EXISTS "{t}" CASCADE'))
        print("  Dropped all tables.")

        for typ in DROP_TYPES:
            await conn.execute(text(f"DROP TYPE IF EXISTS {typ} CASCADE"))
        print("  Dropped all enum types.")

    # Step 2: create_all OUTSIDE a transaction (required by asyncpg for DDL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("  Schema created successfully.")

    await engine.dispose()
    print("Migration complete.")


asyncio.run(migrate())
