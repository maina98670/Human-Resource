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

from sqlalchemy import text

# Drop order: dependents first, then parents
DROP_TABLES = [
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
    # Stale tables from other projects (MamaCare etc.)
    'alerts',
    'ai_analysis',
    'patient_vitals',
    'health_connections',
    'password_reset_tokens',
    'admins',
]

# All enum type names to drop (own + stale from other projects)
DROP_TYPES = [
    'userrole',
    'employmenttype',
    'staffcategory',
    'clinicalsubrole',
    'leavestatus',
    'leavetype',
    'shifttype',
    'swapstatus',
    'alertstatus',
    'triage_level',
    'platform_type',
    'user_role',
    'alert_status',
]

async def migrate():
    async with engine.begin() as conn:

        # 1. Drop all tables (CASCADE handles FK constraints)
        for t in DROP_TABLES:
            await conn.execute(text(f'DROP TABLE IF EXISTS \"{t}\" CASCADE'))
        print('  Dropped all tables.')

        # 2. Drop all enum types
        for typ in DROP_TYPES:
            await conn.execute(text(f'DROP TYPE IF EXISTS {typ} CASCADE'))
        print('  Dropped all enum types.')

        # 3. Recreate everything cleanly from models
        await conn.run_sync(Base.metadata.create_all)
        print('  Schema created successfully.')

    await engine.dispose()

asyncio.run(migrate())
"

echo "Seeding database..."
python scripts/seed.py && echo "Seed complete." || echo "⚠️  Seed skipped or failed — check logs above."

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
