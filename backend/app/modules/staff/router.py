import uuid
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.models import (
    Staff, User, UserRole, StaffCategory, ClinicalSubRole,
    EmploymentType, StaffStatus, TransferRecord,
    LeaveBalance, LeaveType
)
from app.utils.auth_utils import hash_password
from app.utils.dependencies import get_current_user, HRAdminAndAbove, DeptHeadAndAbove

router = APIRouter(prefix="/staff", tags=["Staff Management"])


# ─── Schemas ───────────────────────────────────────────────

class StaffCreateRequest(BaseModel):
    # Auth
    email: EmailStr
    phone: str
    temp_password: str = "12345678"

    # Identity
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    date_of_birth: date
    gender: str
    national_id: str
    kra_pin: Optional[str] = None

    # Contact
    personal_phone: str
    personal_email: Optional[str] = None
    address: Optional[str] = None

    # Emergency
    emergency_name: Optional[str] = None
    emergency_phone: Optional[str] = None
    emergency_relationship: Optional[str] = None

    # Employment
    branch_id: uuid.UUID
    department_id: uuid.UUID
    category: StaffCategory
    clinical_sub_role: Optional[ClinicalSubRole] = None
    employment_type: EmploymentType
    job_title: str
    job_grade: Optional[str] = None
    hire_date: date
    contract_end_date: Optional[date] = None

    # Payroll
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch: Optional[str] = None
    mpesa_number: Optional[str] = None


class StaffUpdateRequest(BaseModel):
    job_title: Optional[str] = None
    job_grade: Optional[str] = None
    address: Optional[str] = None
    emergency_name: Optional[str] = None
    emergency_phone: Optional[str] = None
    emergency_relationship: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch: Optional[str] = None
    mpesa_number: Optional[str] = None


class TransferRequest(BaseModel):
    to_branch_id: uuid.UUID
    to_department_id: uuid.UUID
    effective_date: date
    reason: Optional[str] = None


class OffboardRequest(BaseModel):
    exit_date: date
    exit_reason: str
    status: StaffStatus  # terminated / resigned


# ─── Helper ────────────────────────────────────────────────

async def generate_staff_number(db: AsyncSession, branch_code: str) -> str:
    result = await db.execute(select(func.count(Staff.id)))
    count = result.scalar() + 1
    return f"{branch_code}-{count:05d}"


# ─── Endpoints ─────────────────────────────────────────────

@router.post("/", summary="Onboard a new staff member")
async def create_staff(
    payload: StaffCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Map staff category to user role
    role_map = {
        StaffCategory.CLINICAL: UserRole.CLINICAL_STAFF,
        StaffCategory.ADMINISTRATIVE: UserRole.ADMIN_STAFF,
        StaffCategory.SUPPORT: UserRole.SUPPORT_STAFF,
    }
    if payload.employment_type in (EmploymentType.LOCUM, EmploymentType.AGENCY):
        user_role = UserRole.LOCUM
    else:
        user_role = role_map[payload.category]

    # Create user account
    user = User(
        email=payload.email,
        phone=payload.phone,
        hashed_password=hash_password(payload.temp_password),
        role=user_role,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
    )
    db.add(user)
    await db.flush()  # get user.id before creating staff

    # Generate staff number
    staff_number = await generate_staff_number(db, "NBI")  # TODO: use branch code

    # Create staff profile
    staff = Staff(
        user_id=user.id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        staff_number=staff_number,
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        national_id=payload.national_id,
        kra_pin=payload.kra_pin,
        personal_phone=payload.personal_phone,
        personal_email=payload.personal_email,
        address=payload.address,
        emergency_name=payload.emergency_name,
        emergency_phone=payload.emergency_phone,
        emergency_relationship=payload.emergency_relationship,
        category=payload.category,
        clinical_sub_role=payload.clinical_sub_role,
        employment_type=payload.employment_type,
        job_title=payload.job_title,
        job_grade=payload.job_grade,
        hire_date=payload.hire_date,
        contract_end_date=payload.contract_end_date,
        bank_name=payload.bank_name,
        bank_account_number=payload.bank_account_number,
        bank_branch=payload.bank_branch,
        mpesa_number=payload.mpesa_number,
    )
    db.add(staff)
    await db.flush()  # get staff.id before committing

    # ── Seed default leave balances for the new staff member ──────────────────
    # Locum/Agency staff are not entitled to leave balances.
    if payload.employment_type not in (EmploymentType.LOCUM, EmploymentType.AGENCY):
        current_year = date.today().year
        DEFAULT_ENTITLEMENTS = {
            LeaveType.ANNUAL:        21.0,
            LeaveType.MATERNITY:     90.0,
            LeaveType.PATERNITY:     14.0,
            LeaveType.COMPASSIONATE:  3.0,
            LeaveType.STUDY:          5.0,
        }
        for leave_type, entitled_days in DEFAULT_ENTITLEMENTS.items():
            db.add(LeaveBalance(
                staff_id=staff.id,
                leave_type=leave_type,
                entitled_days=entitled_days,
                used_days=0.0,
                carried_over=0.0,
                year=current_year,
            ))

    await db.commit()
    await db.refresh(staff)

    return {"message": "Staff created successfully", "staff_id": str(staff.id), "staff_number": staff_number}


@router.get("/", summary="List all staff (filtered by branch/department)")
async def list_staff(
    branch_id: Optional[uuid.UUID] = Query(None),
    department_id: Optional[uuid.UUID] = Query(None),
    category: Optional[StaffCategory] = Query(None),
    employment_type: Optional[EmploymentType] = Query(None),
    status: Optional[StaffStatus] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Staff)
    conditions = []

    # Scope: non-super-admins only see their branch
    if current_user.role != UserRole.SUPER_ADMIN:
        conditions.append(Staff.branch_id == current_user.branch_id)

    # Dept heads only see their department
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        conditions.append(Staff.department_id == current_user.department_id)

    if branch_id:
        conditions.append(Staff.branch_id == branch_id)
    if department_id:
        conditions.append(Staff.department_id == department_id)
    if category:
        conditions.append(Staff.category == category)
    if employment_type:
        conditions.append(Staff.employment_type == employment_type)
    if status:
        conditions.append(Staff.status == status)
    if search:
        conditions.append(
            (Staff.first_name + " " + Staff.last_name).ilike(f"%{search}%")
        )

    if conditions:
        query = query.where(and_(*conditions))

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    staff_list = result.scalars().all()

    return {
        "page": page,
        "page_size": page_size,
        "results": [
            {
                "id": str(s.id),
                "staff_number": s.staff_number,
                "name": f"{s.first_name} {s.last_name}",
                "job_title": s.job_title,
                "category": s.category.value,
                "employment_type": s.employment_type.value,
                "status": s.status.value,
                "department_id": str(s.department_id),
                "branch_id": str(s.branch_id),
                "hire_date": str(s.hire_date),
                "fatigue_score": s.fatigue_score,
            }
            for s in staff_list
        ],
    }


@router.get("/{staff_id}", summary="Get full staff profile")
async def get_staff(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()

    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Access control: staff can only view their own profile
    if current_user.role in (UserRole.CLINICAL_STAFF, UserRole.ADMIN_STAFF, UserRole.SUPPORT_STAFF, UserRole.LOCUM):
        if staff.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": str(staff.id),
        "staff_number": staff.staff_number,
        "first_name": staff.first_name,
        "middle_name": staff.middle_name,
        "last_name": staff.last_name,
        "date_of_birth": str(staff.date_of_birth),
        "gender": staff.gender,
        "national_id": staff.national_id,
        "kra_pin": staff.kra_pin,
        "personal_phone": staff.personal_phone,
        "personal_email": staff.personal_email,
        "address": staff.address,
        "emergency_name": staff.emergency_name,
        "emergency_phone": staff.emergency_phone,
        "category": staff.category.value,
        "clinical_sub_role": staff.clinical_sub_role.value if staff.clinical_sub_role else None,
        "employment_type": staff.employment_type.value,
        "job_title": staff.job_title,
        "job_grade": staff.job_grade,
        "hire_date": str(staff.hire_date),
        "contract_end_date": str(staff.contract_end_date) if staff.contract_end_date else None,
        "status": staff.status.value,
        "fatigue_score": staff.fatigue_score,
        "branch_id": str(staff.branch_id),
        "department_id": str(staff.department_id),
    }


@router.patch("/{staff_id}", summary="Update staff details")
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(staff, field, value)

    staff.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Staff updated successfully"}


@router.post("/{staff_id}/transfer", summary="Transfer staff to another branch/department")
async def transfer_staff(
    staff_id: uuid.UUID,
    payload: TransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Record transfer history
    transfer = TransferRecord(
        staff_id=staff.id,
        from_branch_id=staff.branch_id,
        to_branch_id=payload.to_branch_id,
        from_department_id=staff.department_id,
        to_department_id=payload.to_department_id,
        effective_date=payload.effective_date,
        reason=payload.reason,
        approved_by_id=current_user.id,
    )
    db.add(transfer)

    # Update staff
    staff.branch_id = payload.to_branch_id
    staff.department_id = payload.to_department_id
    staff.updated_at = datetime.utcnow()

    # Update user scoping
    result2 = await db.execute(select(User).where(User.id == staff.user_id))
    user = result2.scalar_one_or_none()
    if user:
        user.branch_id = payload.to_branch_id
        user.department_id = payload.to_department_id

    await db.commit()
    return {"message": "Transfer recorded successfully"}


@router.post("/{staff_id}/offboard", summary="Offboard (terminate or resign) a staff member")
async def offboard_staff(
    staff_id: uuid.UUID,
    payload: OffboardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    staff.status = payload.status
    staff.exit_date = payload.exit_date
    staff.exit_reason = payload.exit_reason
    staff.updated_at = datetime.utcnow()

    # Deactivate user account
    result2 = await db.execute(select(User).where(User.id == staff.user_id))
    user = result2.scalar_one_or_none()
    if user:
        user.is_active = False

    await db.commit()
    return {"message": f"Staff offboarded as {payload.status.value}"}


@router.get("/{staff_id}/transfer-history", summary="Get transfer history for a staff member")
async def get_transfer_history(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    result = await db.execute(
        select(TransferRecord).where(TransferRecord.staff_id == staff_id)
    )
    records = result.scalars().all()
    return [
        {
            "from_branch": str(r.from_branch_id),
            "to_branch": str(r.to_branch_id),
            "from_dept": str(r.from_department_id),
            "to_dept": str(r.to_department_id),
            "effective_date": str(r.effective_date),
            "reason": r.reason,
        }
        for r in records
    ]
