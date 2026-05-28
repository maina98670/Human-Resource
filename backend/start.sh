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

echo "Resetting database schema..."
python -c "
import psycopg2, os
conn = psycopg2.connect(os.environ['SYNC_DATABASE_URL'])
conn.autocommit = True
cur = conn.cursor()
cur.execute('DROP SCHEMA public CASCADE;')
cur.execute('CREATE SCHEMA public;')
cur.execute('GRANT ALL ON SCHEMA public TO postgres;')
cur.execute('GRANT ALL ON SCHEMA public TO public;')
cur.close()
conn.close()
print('Schema reset complete.')
"

echo "Running migrations..."
alembic upgrade head

echo "Seeding database..."
python scripts/seed.py || echo "Seed skipped or already done."

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
