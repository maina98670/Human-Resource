#!/usr/bin/env bash
set -e

# ── URL normalisation ────────────────────────────────────────────────────────
# psycopg2 / Alembic needs:  postgresql://   with sslmode=require
export SYNC_DATABASE_URL=$(echo "$DATABASE_URL" \
  | sed 's|^postgres://|postgresql://|;s|^postgresql+asyncpg://|postgresql://|' \
  | sed 's|ssl=require|sslmode=require|g')

# asyncpg needs: postgresql+asyncpg://  with ssl=require
export DATABASE_URL=$(echo "$DATABASE_URL" \
  | sed 's|^postgres://|postgresql+asyncpg://|;s|^postgresql://|postgresql+asyncpg://|' \
  | sed 's|sslmode=require|ssl=require|g')

# ── Drop & recreate public schema (wipes all tables) ────────────────────────
echo "🗑️  Dropping existing schema..."
python - <<'PYEOF'
import psycopg2, os
conn = psycopg2.connect(os.environ["SYNC_DATABASE_URL"])
conn.autocommit = True
cur = conn.cursor()
cur.execute("DROP SCHEMA public CASCADE;")
cur.execute("CREATE SCHEMA public;")
cur.execute("GRANT ALL ON SCHEMA public TO postgres;")
cur.execute("GRANT ALL ON SCHEMA public TO public;")
cur.close()
conn.close()
print("✅ Schema reset complete.")
PYEOF

# ── Create all tables from SQLAlchemy models ─────────────────────────────────
echo "🏗️  Creating tables from models..."
python - <<'PYEOF'
import os, sys
sys.path.insert(0, ".")

# Fix the URL for psycopg2 (sync)
sync_url = os.environ["SYNC_DATABASE_URL"]

from sqlalchemy import create_engine
from app.models.models import *   # registers all models on Base.metadata
from app.database import Base

engine = create_engine(sync_url)
Base.metadata.create_all(engine)
engine.dispose()
print("✅ All tables created successfully.")
PYEOF

# ── Seed initial data ─────────────────────────────────────────────────────────
echo "🌱 Seeding database..."
python scripts/seed.py || echo "⚠️  Seed skipped or failed — check logs above."

# ── Start server ──────────────────────────────────────────────────────────────
echo "🚀 Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
