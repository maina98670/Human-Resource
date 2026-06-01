#!/bin/bash
set -e

echo "Running database migration (create tables from models)..."
python -c "
import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath('.'))

from app.config import settings
from app.database import engine, Base

# Import all models so metadata is populated
from app.models.models import *  # noqa

async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print('  Schema migration complete.')

asyncio.run(migrate())
"

echo "Seeding database..."
python scripts/seed.py && echo "Seed complete." || echo "⚠️  Seed skipped or failed — check logs above."

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
