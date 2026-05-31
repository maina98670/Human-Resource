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

# ── Safe migrate: create tables/columns that don't exist, alter existing ─────
# Never drops anything — safe to run on a live database with existing data.
echo "🏗️  Running safe migrations (create if not exists, alter if not exists)..."
python - <<'PYEOF'
import os, sys
sys.path.insert(0, ".")

from sqlalchemy import create_engine, inspect, text
from app.models.models import *   # registers all models on Base.metadata
from app.database import Base

sync_url = os.environ["SYNC_DATABASE_URL"]
engine = create_engine(sync_url)

with engine.begin() as conn:
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())

    for table_name, table in Base.metadata.tables.items():

        if table_name not in existing_tables:
            # ── Table does not exist at all — create it ──────────────────────
            table.create(bind=conn)
            print(f"  ✅ Created table: {table_name}")

        else:
            # ── Table exists — add any missing columns via ALTER TABLE ────────
            existing_cols = {col["name"] for col in inspector.get_columns(table_name)}

            for col in table.columns:
                if col.name in existing_cols:
                    continue  # column already there — skip

                # Build the column definition for ALTER TABLE
                col_type = col.type.compile(dialect=engine.dialect)

                nullable_clause = "NULL" if col.nullable else "NOT NULL"

                # Use the column default as the literal DEFAULT if it's a
                # simple scalar (ColumnDefault with a non-callable arg), so
                # that NOT NULL columns can be added to tables with existing rows.
                default_clause = ""
                if col.default is not None and not col.default.is_callable and not col.default.is_clause_element:
                    raw = col.default.arg
                    if isinstance(raw, bool):
                        default_clause = f"DEFAULT {'true' if raw else 'false'}"
                    elif isinstance(raw, (int, float)):
                        default_clause = f"DEFAULT {raw}"
                    elif isinstance(raw, str):
                        escaped = raw.replace("'", "''")
                        default_clause = f"DEFAULT '{escaped}'"
                elif col.server_default is not None:
                    default_clause = f"DEFAULT {col.server_default.arg}"
                elif not col.nullable:
                    # NOT NULL column with no default — add as NULL first,
                    # then tighten the constraint so existing rows aren't blocked.
                    nullable_clause = "NULL"

                ddl = (
                    f'ALTER TABLE "{table_name}" '
                    f'ADD COLUMN IF NOT EXISTS "{col.name}" {col_type} '
                    f'{default_clause} {nullable_clause};'
                )
                conn.execute(text(ddl))
                print(f"  ✅ Added column: {table_name}.{col.name} ({col_type})")

engine.dispose()
print("✅ Safe migration complete — no data was dropped.")
PYEOF

# ── Seed initial data ─────────────────────────────────────────────────────────
echo "🌱 Seeding database..."
python scripts/seed.py || echo "⚠️  Seed skipped or failed — check logs above."

# ── Start server ──────────────────────────────────────────────────────────────
echo "🚀 Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
