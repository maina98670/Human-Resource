"""
Seed script — run once to bootstrap the system.
Creates: Super Admin user, sample branch, departments, and a test HR admin.

Usage:
    python scripts/seed.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal, create_tables
from app.models.models import (
    User, Branch, Department, Staff,
    UserRole, StaffCategory, EmploymentType
)
from app.utils.auth_utils import hash_password
from datetime import date


async def seed():
    await create_tables()
    async with AsyncSessionLocal() as db:
        print("🌱 Seeding database...")

        # ── Super Admin ──────────────────────────────────────────
        super_admin = User(
            email="superadmin@hospitalhr.com",
            phone="+254700000001",
            hashed_password=hash_password("Admin@1234!"),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(super_admin)
        await db.flush()
        print(f"  ✅ Super Admin: superadmin@hospitalhr.com / Admin@1234!")

        # ── Main Branch ──────────────────────────────────────────
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

        # ── Departments ──────────────────────────────────────────
        departments_data = [
            ("Emergency & Casualty", "EMG", StaffCategory.CLINICAL, 4),
            ("ICU", "ICU", StaffCategory.CLINICAL, 3),
            ("Maternity", "MAT", StaffCategory.CLINICAL, 3),
            ("Pharmacy", "PHM", StaffCategory.CLINICAL, 2),
            ("Laboratory", "LAB", StaffCategory.CLINICAL, 2),
            ("Radiology", "RAD", StaffCategory.CLINICAL, 1),
            ("Administration", "ADM", StaffCategory.ADMINISTRATIVE, 2),
            ("Medical Records", "MRD", StaffCategory.ADMINISTRATIVE, 1),
            ("Housekeeping", "HSK", StaffCategory.SUPPORT, 3),
            ("Security", "SEC", StaffCategory.SUPPORT, 2),
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

        # ── HR Admin ─────────────────────────────────────────────
        hr_user = User(
            email="hr@hospitalhr.com",
            phone="+254700000002",
            hashed_password=hash_password("HRAdmin@1234!"),
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
            first_name="Grace",
            last_name="Wanjiku",
            date_of_birth=date(1985, 3, 14),
            gender="Female",
            national_id="12345678",
            personal_phone="+254700000002",
            category=StaffCategory.ADMINISTRATIVE,
            employment_type=EmploymentType.PERMANENT,
            job_title="HR Manager",
            hire_date=date(2020, 1, 15),
        )
        db.add(hr_staff)
        print(f"  ✅ HR Admin: hr@hospitalhr.com / HRAdmin@1234!")

        # ── Finance Admin ─────────────────────────────────────────
        finance_user = User(
            email="finance@hospitalhr.com",
            phone="+254700000003",
            hashed_password=hash_password("Finance@1234!"),
            role=UserRole.FINANCE_ADMIN,
            branch_id=branch.id,
            is_active=True,
            is_verified=True,
        )
        db.add(finance_user)
        print(f"  ✅ Finance Admin: finance@hospitalhr.com / Finance@1234!")

        await db.commit()
        print("\n🎉 Seed complete! System is ready.")
        print("\n📋 Login credentials:")
        print("   Super Admin : superadmin@hospitalhr.com / Admin@1234!")
        print("   HR Admin    : hr@hospitalhr.com         / HRAdmin@1234!")
        print("   Finance     : finance@hospitalhr.com    / Finance@1234!")


if __name__ == "__main__":
    asyncio.run(seed())
