#!/bin/bash
set -e

echo "Running database migration..."
python -c "
import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath('.'))

from app.config import settings
from app.database import engine, Base
from app.models.models import *  # noqa — populate metadata

# All tables this HR schema owns, in safe drop order (dependents first)
HR_TABLES = [
    'audit_logs',
    'wellness_checkins',
    'notifications',
    'payslips',
    'payroll_runs',
    'staff_allowances',
    'leave_requests',
    'leave_balances',
    'shift_swap_requests',
    'shift_assignments',
    'shifts',
    'shift_templates',
    'credentials',
    'transfer_records',
    'staff',
    'refresh_tokens',
    'users',
    'departments',
    'branches',
]

# Stale tables that may exist from a previous project (e.g. MamaCare)
STALE_TABLES = [
    'alerts',
    'ai_analysis',
    'patient_vitals',
    'health_connections',
    'password_reset_tokens',
    'admins',
]

# Stale enum types from previous projects
STALE_TYPES = [
    'userrole',
    'triage_level',
    'platform_type',
    'user_role',
    'alert_status',
]

from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        # 1. Drop stale tables from previous projects
        for t in STALE_TABLES:
            await conn.execute(text(f'DROP TABLE IF EXISTS {t} CASCADE'))
        print('  Dropped stale tables.')

        # 2. Drop stale enum types
        for typ in STALE_TYPES:
            await conn.execute(text(f'DROP TYPE IF EXISTS {typ} CASCADE'))
        print('  Dropped stale enum types.')

        # 3. Check if users table has wrong schema (MamaCare leftover)
        result = await conn.execute(text(\"\"\"
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'hashed_password'
        \"\"\"))
        has_correct_col = result.fetchone()

        if not has_correct_col:
            # users table exists but has wrong schema — drop all HR tables and recreate
            print('  Detected stale HR table schema — dropping for fresh creation...')
            for t in HR_TABLES:
                await conn.execute(text(f'DROP TABLE IF EXISTS {t} CASCADE'))
            print('  Dropped all HR tables.')

        # 4. Create all HR tables from models (skips tables that already exist)
        await conn.run_sync(Base.metadata.create_all)
        print('  Schema migration complete.')

    await engine.dispose()

asyncio.run(migrate())
"

echo "Seeding database..."
python scripts/seed.py && echo "Seed complete." || echo "⚠️  Seed skipped or failed — check logs above."

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
