#!/usr/bin/env bash
set -e

# Alembic needs plain postgresql:// with sslmode=require
export SYNC_DATABASE_URL=$(echo "$SYNC_DATABASE_URL" \
  | sed 's|^postgres://|postgresql://|;s|^postgresql+asyncpg://|postgresql://|' \
  | sed 's|ssl=require|sslmode=require|g')

# asyncpg needs postgresql+asyncpg:// with ssl=require
export DATABASE_URL=$(echo "$DATABASE_URL" \
  | sed 's|^postgres://|postgresql+asyncpg://|;s|^postgresql://|postgresql+asyncpg://|' \
  | sed 's|sslmode=require|ssl=require|g')

echo "DATABASE_URL=$DATABASE_URL"
echo "SYNC_DATABASE_URL=$SYNC_DATABASE_URL"

echo "Running migrations..."
alembic upgrade head

echo "Seeding database (skips if already seeded)..."
python scripts/seed.py || echo "Seed skipped or already done."

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
