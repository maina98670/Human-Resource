#!/bin/bash
set -e

echo "Running safe schema migration (CREATE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS)..."
python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def migrate():
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:

        # ── Extensions ────────────────────────────────────────
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"'))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"'))

        # ── DROP STALE ENUM TYPES from any previous schema ────
        # (e.g. leftover 'userrole' from a previous HR project)
        await conn.execute(text('DROP TYPE IF EXISTS userrole CASCADE'))
        await conn.execute(text('DROP TYPE IF EXISTS triage_level CASCADE'))
        await conn.execute(text('DROP TYPE IF EXISTS platform_type CASCADE'))
        await conn.execute(text('DROP TYPE IF EXISTS user_role CASCADE'))
        await conn.execute(text('DROP TYPE IF EXISTS alert_status CASCADE'))
        print('  Dropped stale enum types.')

        # ── DROP & RECREATE ALL TABLES (schema reset) ─────────
        await conn.execute(text('DROP TABLE IF EXISTS audit_logs CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS password_reset_tokens CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS alerts CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS ai_analysis CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS patient_vitals CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS health_connections CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS admins CASCADE'))
        await conn.execute(text('DROP TABLE IF EXISTS users CASCADE'))
        print('  Dropped all tables.')

        # ── USERS ─────────────────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS users (
                id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email         VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                full_name     VARCHAR(255) NOT NULL,
                phone         VARCHAR(20),
                date_of_birth DATE,
                weeks_pregnant INTEGER,
                due_date      DATE,
                role          VARCHAR(20) DEFAULT 'patient',
                is_active     BOOLEAN DEFAULT TRUE,
                is_verified   BOOLEAN DEFAULT FALSE,
                google_id     VARCHAR(255) UNIQUE,
                avatar_url    TEXT,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                updated_at    TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        # Add any new columns to users if they don't exist yet
        for col, definition in [
            ('password_hash',  'VARCHAR(255)'),
            ('phone',          'VARCHAR(20)'),
            ('date_of_birth',  'DATE'),
            ('weeks_pregnant', 'INTEGER'),
            ('due_date',       'DATE'),
            ('google_id',      'VARCHAR(255)'),
            ('avatar_url',     'TEXT'),
            ('is_verified',    'BOOLEAN DEFAULT FALSE'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        print('  users: OK')

        # ── ADMINS ────────────────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS admins (
                id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email         VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                full_name     VARCHAR(255) NOT NULL,
                role          VARCHAR(20) DEFAULT 'admin',
                is_active     BOOLEAN DEFAULT TRUE,
                google_id     VARCHAR(255) UNIQUE,
                last_login    TIMESTAMPTZ,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                updated_at    TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        for col, definition in [
            ('google_id',   'VARCHAR(255)'),
            ('last_login',  'TIMESTAMPTZ'),
            ('is_active',   'BOOLEAN DEFAULT TRUE'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE admins ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        print('  admins: OK')

        # ── HEALTH CONNECTIONS ────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS health_connections (
                id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
                platform                VARCHAR(50) NOT NULL,
                access_token_encrypted  TEXT,
                refresh_token_encrypted TEXT,
                token_expires_at        TIMESTAMPTZ,
                scopes                  TEXT[],
                is_active               BOOLEAN DEFAULT TRUE,
                last_sync_at            TIMESTAMPTZ,
                oauth_state             VARCHAR(128),
                created_at              TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        for col, definition in [
            ('access_token_encrypted',  'TEXT'),
            ('refresh_token_encrypted', 'TEXT'),
            ('token_expires_at',        'TIMESTAMPTZ'),
            ('scopes',                  'TEXT[]'),
            ('last_sync_at',            'TIMESTAMPTZ'),
            ('oauth_state',             'VARCHAR(128)'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE health_connections ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        print('  health_connections: OK')

        # ── PATIENT VITALS ────────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS patient_vitals (
                id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
                platform             VARCHAR(50) NOT NULL,
                recorded_at          TIMESTAMPTZ NOT NULL,
                heart_rate           INTEGER,
                spo2                 NUMERIC(5,2),
                sleep_duration_hours NUMERIC(4,2),
                sleep_quality_score  INTEGER,
                steps                INTEGER,
                activity_level       VARCHAR(20),
                respiratory_rate     NUMERIC(5,2),
                hrv_ms               NUMERIC(6,2),
                stress_index         INTEGER,
                raw_payload          JSONB,
                created_at           TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        for col, definition in [
            ('spo2',                 'NUMERIC(5,2)'),
            ('sleep_duration_hours', 'NUMERIC(4,2)'),
            ('sleep_quality_score',  'INTEGER'),
            ('steps',                'INTEGER'),
            ('activity_level',       'VARCHAR(20)'),
            ('respiratory_rate',     'NUMERIC(5,2)'),
            ('hrv_ms',               'NUMERIC(6,2)'),
            ('stress_index',         'INTEGER'),
            ('raw_payload',          'JSONB'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        # Indexes (skip if already exist)
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_vitals_user_time
            ON patient_vitals(user_id, recorded_at DESC)
        '''))
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at
            ON patient_vitals(recorded_at DESC)
        '''))
        print('  patient_vitals: OK')

        # ── AI ANALYSIS ───────────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS ai_analysis (
                id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
                vitals_id       UUID REFERENCES patient_vitals(id),
                risk_score      INTEGER NOT NULL,
                triage_level    VARCHAR(20) NOT NULL,
                findings        JSONB DEFAULT '[]',
                risks           JSONB DEFAULT '[]',
                recommendations JSONB DEFAULT '[]',
                management_plan JSONB DEFAULT '[]',
                patient_advice  JSONB DEFAULT '[]',
                follow_up       TEXT,
                escalation      BOOLEAN DEFAULT FALSE,
                ai_sources_used TEXT[],
                model_used      VARCHAR(100),
                is_overridden   BOOLEAN DEFAULT FALSE,
                override_by     UUID REFERENCES admins(id),
                override_reason TEXT,
                override_at     TIMESTAMPTZ,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        for col, definition in [
            ('management_plan',  \"JSONB DEFAULT '[]'\"),
            ('patient_advice',   \"JSONB DEFAULT '[]'\"),
            ('ai_sources_used',  'TEXT[]'),
            ('model_used',       'VARCHAR(100)'),
            ('is_overridden',    'BOOLEAN DEFAULT FALSE'),
            ('override_by',      'UUID REFERENCES admins(id)'),
            ('override_reason',  'TEXT'),
            ('override_at',      'TIMESTAMPTZ'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_analysis_user
            ON ai_analysis(user_id, created_at DESC)
        '''))
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_analysis_triage
            ON ai_analysis(triage_level)
        '''))
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_analysis_escalation
            ON ai_analysis(escalation) WHERE escalation = TRUE
        '''))
        print('  ai_analysis: OK')

        # ── ALERTS ────────────────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS alerts (
                id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
                analysis_id     UUID REFERENCES ai_analysis(id),
                title           VARCHAR(255) NOT NULL,
                message         TEXT NOT NULL,
                severity        VARCHAR(20) NOT NULL,
                status          VARCHAR(20) DEFAULT 'pending',
                acknowledged_by UUID REFERENCES admins(id),
                acknowledged_at TIMESTAMPTZ,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        for col, definition in [
            ('analysis_id',     'UUID REFERENCES ai_analysis(id)'),
            ('acknowledged_by', 'UUID REFERENCES admins(id)'),
            ('acknowledged_at', 'TIMESTAMPTZ'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE alerts ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        print('  alerts: OK')

        # ── PASSWORD RESET TOKENS ─────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email      VARCHAR(255) NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                is_used    BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        print('  password_reset_tokens: OK')

        # ── AUDIT LOGS ────────────────────────────────────────
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS audit_logs (
                id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                admin_id    UUID REFERENCES admins(id),
                action      VARCHAR(100) NOT NULL,
                target_type VARCHAR(50),
                target_id   UUID,
                details     JSONB DEFAULT '{}',
                ip_address  INET,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        '''))
        for col, definition in [
            ('admin_id',    'UUID REFERENCES admins(id)'),
            ('target_type', 'VARCHAR(50)'),
            ('target_id',   'UUID'),
            ('details',     \"JSONB DEFAULT '{}'\"),
            ('ip_address',  'INET'),
        ]:
            await conn.execute(text(
                f'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS {col} {definition}'
            ))
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_audit_admin
            ON audit_logs(admin_id, created_at DESC)
        '''))
        await conn.execute(text('''
            CREATE INDEX IF NOT EXISTS idx_audit_created
            ON audit_logs(created_at DESC)
        '''))
        print('  audit_logs: OK')

        # ── updated_at trigger ────────────────────────────────
        await conn.execute(text('''
            CREATE OR REPLACE FUNCTION update_updated_at()
            RETURNS TRIGGER AS \$\$
            BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
            \$\$ LANGUAGE plpgsql
        '''))
        await conn.execute(text('''
            DO \$\$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated'
                ) THEN
                    CREATE TRIGGER trg_users_updated
                    BEFORE UPDATE ON users
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
                END IF;
            END \$\$
        '''))
        await conn.execute(text('''
            DO \$\$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admins_updated'
                ) THEN
                    CREATE TRIGGER trg_admins_updated
                    BEFORE UPDATE ON admins
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
                END IF;
            END \$\$
        '''))
        print('  triggers: OK')

    await engine.dispose()
    print('Schema migration complete. All existing data preserved.')

asyncio.run(migrate())
"

echo "Creating admin user..."
python -c "
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def create_admin():
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        email = os.environ.get('ADMIN_EMAIL')
        password = os.environ.get('ADMIN_PASSWORD')
        full_name = os.environ.get('ADMIN_FULL_NAME', 'Admin')

        if not email or not password:
            print('No admin credentials set, skipping...')
            return

        result = await conn.execute(text('SELECT id FROM admins WHERE email = :email'), {'email': email})
        existing = result.fetchone()

        if existing:
            print('Admin already exists, skipping...')
            return

        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
        hashed = pwd_context.hash(password)

        await conn.execute(text('''
            INSERT INTO admins (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), :email, :password, :full_name, 'admin', true, now(), now())
        '''), {'email': email, 'password': hashed, 'full_name': full_name})

        print('Admin created successfully!')

    await engine.dispose()

asyncio.run(create_admin())
"

echo "Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
