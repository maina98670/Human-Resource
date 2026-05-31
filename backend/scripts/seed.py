"""
Seed script — bootstraps the system with initial data.
Run via: python scripts/seed.py

Tables must already exist before this runs (start.sh handles that).
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.models.models import (
    User, Branch, Department, Staff,
    UserRole, StaffCategory, EmploymentType,
)
from app.utils.auth_utils import hash_password
from datetime import date


def get_async_url() -> str:
    """Build a valid asyncpg URL from whatever env vars are set."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL env var is not set")
    # Normalise to postgresql+asyncpg:// with ssl=require
    for prefix in ("postgresql://", "postgres://", "postgresql+asyncpg://"):
        if url.startswith(prefix):
            url = "postgresql+asyncpg://" + url[len(prefix):]
            break
    # Swap sslmode=require → ssl=require (asyncpg syntax)
    url = url.replace("sslmode=require", "ssl=require")
    return url


# ── Default password shared by all seeded accounts ──────────────────────────
DEFAULT_PASSWORD = "12345678"


async def seed():
    db_url = get_async_url()
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession,
                                      expire_on_commit=False, autoflush=False)

    async with SessionLocal() as db:
        # ── Check if already seeded ──────────────────────────────────────────
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none():
            print("✅ Database already seeded — skipping.")
            await engine.dispose()
            return

        print("🌱 Seeding database...")

        hashed_default = hash_password(DEFAULT_PASSWORD)

        # ── Super Admin — ngoyaisaac05@gmail.com ────────────────────────────
        super_admin = User(
            email="ngoyaisaac05@gmail.com",
            hashed_password=hashed_default,
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(super_admin)
        await db.flush()
        print(f"  ✅ Super Admin : ngoyaisaac05@gmail.com / {DEFAULT_PASSWORD}")

        # ── Main Branch ──────────────────────────────────────────────────────
        branch = Branch(
            name="Nairobi Main Hospital",
            code="NBI-001",
            address="P.O Box 1234, Nairobi",
            city="Nairobi",
            phone="+254200000001",
            email="nairobi@hospitalhr.com",
        )
        db.add(branch)
        await db.flush()
        print(f"  ✅ Branch: {branch.name} ({branch.code})")

        # ── Departments ──────────────────────────────────────────────────────
        departments_data = [
            ("Emergency & Casualty", "EMG", StaffCategory.CLINICAL,       4),
            ("ICU",                  "ICU", StaffCategory.CLINICAL,        3),
            ("Maternity",            "MAT", StaffCategory.CLINICAL,        3),
            ("Pharmacy",             "PHM", StaffCategory.CLINICAL,        2),
            ("Laboratory",           "LAB", StaffCategory.CLINICAL,        2),
            ("Radiology",            "RAD", StaffCategory.CLINICAL,        1),
            ("Administration",       "ADM", StaffCategory.ADMINISTRATIVE,  2),
            ("Medical Records",      "MRD", StaffCategory.ADMINISTRATIVE,  1),
            ("Housekeeping",         "HSK", StaffCategory.SUPPORT,         3),
            ("Security",             "SEC", StaffCategory.SUPPORT,         2),
        ]

        depts = {}
        for name, code, category, min_staff in departments_data:
            dept = Department(
                branch_id=branch.id,
                name=name,
                code=code,
                category=category,
                min_staff_per_shift=min_staff,
            )
            db.add(dept)
            depts[code] = dept

        await db.flush()
        print(f"  ✅ {len(departments_data)} departments created")

        # ── HR Admin — beryl9860@gmail.com ───────────────────────────────────
        hr_user = User(
            email="beryl9860@gmail.com",
            hashed_password=hashed_default,
            role=UserRole.HR_ADMIN,
            branch_id=branch.id,
            is_active=True,
            is_verified=True,
        )
        db.add(hr_user)
        await db.flush()

        hr_staff = Staff(
            user_id=hr_user.id,
            branch_id=branch.id,
            department_id=depts["ADM"].id,
            staff_number="NBI-00001",
            first_name="Beryl",
            last_name="",
            date_of_birth=date(1990, 1, 1),
            gender="Female",
            national_id="00000001",
            personal_phone="",
            category=StaffCategory.ADMINISTRATIVE,
            employment_type=EmploymentType.PERMANENT,
            job_title="HR Manager",
            hire_date=date(2024, 1, 1),
        )
        db.add(hr_staff)
        print(f"  ✅ HR Admin    : beryl9860@gmail.com / {DEFAULT_PASSWORD}")

        # ── Finance Admin — sheilawekesa75@gmail.com ─────────────────────────
        finance_user = User(
            email="sheilawekesa75@gmail.com",
            hashed_password=hashed_default,
            role=UserRole.FINANCE_ADMIN,
            branch_id=branch.id,
            is_active=True,
            is_verified=True,
        )
        db.add(finance_user)
        print(f"  ✅ Finance Admin: sheilawekesa75@gmail.com / {DEFAULT_PASSWORD}")

        # ── Commit everything ─────────────────────────────────────────────────
        await db.commit()
        print("\n🎉 Seed complete! System is ready.")
        print("\n📋 Login credentials:")
        print(f"   Super Admin  : ngoyaisaac05@gmail.com     / {DEFAULT_PASSWORD}")
        print(f"   HR Admin     : beryl9860@gmail.com        / {DEFAULT_PASSWORD}")
        print(f"   Finance Admin: sheilawekesa75@gmail.com   / {DEFAULT_PASSWORD}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
