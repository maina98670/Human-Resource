#!/bin/bash
set -e

echo "Running database migration..."
python migrate.py

echo "Seeding database..."
python scripts/seed.py && echo "Seed complete." || echo "⚠️  Seed skipped or failed — check logs above."

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
