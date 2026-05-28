#!/usr/bin/env bash
set -e

# Render gives postgres:// or postgresql:// — SQLAlchemy async needs postgresql+asyncpg://
export DATABASE_URL=$(echo "$SYNC_DATABASE_URL" | sed 's|^postgres://|postgresql+asyncpg://|;s|^postgresql://|postgresql+asyncpg://|')

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 2
