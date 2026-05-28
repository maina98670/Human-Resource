#!/usr/bin/env bash
set -e

# Alembic needs plain postgresql:// (psycopg2)
export SYNC_DATABASE_URL=$(echo "$SYNC_DATABASE_URL" | sed 's|^postgres://|postgresql://|;s|^postgresql+asyncpg://|postgresql://|')

# FastAPI async engine needs postgresql+asyncpg://
export DATABASE_URL=$(echo "$SYNC_DATABASE_URL" | sed 's|^postgresql://|postgresql+asyncpg://|')

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 2
