import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel

from app.database import get_db
from app.models.models import (
    PayrollRun, Payslip, Staff, StaffAllowance,
    User, UserRole, PayrollStatus, EmploymentType
)
from app.utils.dependencies import get_current_user, HRAdminAndAbove, FinanceAndAbove
from app.config import settings

router = APIRouter(prefix="/payroll", tags=["Payroll"])


# ─── Kenya PAYE Tax Bands (2024) ───────────────────────────

PAYE_BANDS = [
    (24000, 0.10),
    (8333, 0.25),
    (467667, 0.30),
    (float("inf"), 0.35),
]


def calculate_paye(gross: float) -> float:
    """Calculate Kenya PAYE tax from gross monthly salary."""
    tax = 0.0
    remaining = gross
    for band_limit, rate in PAYE_BANDS:
        if remaining <= 0:
            break
        taxable = min(remaining, band_limit)
        tax += taxable * rate
        remaining -= taxable
    # Apply personal relief
    tax = max(0, tax - settings.PAYE_PERSONAL_RELIEF)
    return round(tax, 2)


def calculate_nhif(gross: float) -> float:
    """NHIF contribution tiers (Kenya)."""
    tiers = [
        (5999, 150), (7999, 300), (11999, 400), (14999, 500),
        (19999, 600), (24999, 750), (29999, 850), (34999, 900),
        (39999, 950), (44999, 1000), (49999, 1100), (59999, 1200),
        (69999, 1300), (79999, 1400), (89999, 1500), (99999, 1600),
        (float("inf"), 1700),
    ]
    for limit, amount in tiers:
        if gross <= limit:
            return float(amount)
    return 1700.0


def calculate_nssf(gross: float) -> float:
    """NSSF Tier I + Tier II (Kenya new rates)."""
    tier1 = min(gross, 6000) * 0.06
    tier2 = min(max(gross - 6000, 0), 12000) * 0.06
    return round(tier1 + tier2, 2)


# ─── Schemas ───────────────────────────────────────────────

class AllowanceCreateRequest(BaseModel):
    allowance_name: str
    amount: float
    is_taxable: bool = False
    is_recurring: bool = True
    effective_from: str
    effective_to: Optional[str] = None


class PayrollApprovalRequest(BaseModel):
    approved: bool
    comment: Optional[str] = None


# ─── Endpoints ─────────────────────────────────────────────

@router.post("/run/{branch_id}/{year}/{month}", summary="Trigger monthly payroll run for a branch")
async def run_payroll(
    branch_id: uuid.UUID,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(FinanceAndAbove),
):
    # Check for duplicate run
    existing = await db.execute(
        select(PayrollRun).where(
            and_(
                PayrollRun.branch_id == branch_id,
                PayrollRun.year == year,
                PayrollRun.month == month,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Payroll run already exists for this branch and month")

    # Get all active permanent staff in branch
    staff_result = await db.execute(
        select(Staff).where(
            and_(
                Staff.branch_id == branch_id,
                Staff.status == "active",
                Staff.employment_type.in_([
                    EmploymentType.PERMANENT, EmploymentType.CONTRACT, EmploymentType.INTERN
                ]),
            )
        )
    )
    all_staff = staff_result.scalars().all()

    if not all_staff:
        raise HTTPException(status_code=400, detail="No eligible staff found for this branch")

    # Create payroll run record
    payroll_run = PayrollRun(
        branch_id=branch_id,
        month=month,
        year=year,
        status=PayrollStatus.DRAFT,
        run_by_id=current_user.id,
    )
    db.add(payroll_run)
    await db.flush()

    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0

    for staff in all_staff:
        basic_salary = await _get_basic_salary(staff, db)

        # Get active allowances
        allowance_result = await db.execute(
            select(StaffAllowance).where(
                and_(
                    StaffAllowance.staff_id == staff.id,
                    StaffAllowance.is_recurring == True,
                )
            )
        )
        allowances = allowance_result.scalars().all()
        total_allowances = sum(a.amount for a in allowances)
        allowances_breakdown = {a.allowance_name: a.amount for a in allowances}

        overtime_pay = 0.0
        gross_pay = basic_salary + total_allowances + overtime_pay

        # Deductions
        paye = calculate_paye(gross_pay)
        nhif = calculate_nhif(gross_pay)
        nssf = calculate_nssf(gross_pay)
        total_deductions_staff = paye + nhif + nssf
        net_pay = gross_pay - total_deductions_staff

        # Create payslip
        payslip = Payslip(
            staff_id=staff.id,
            payroll_run_id=payroll_run.id,
            basic_salary=basic_salary,
            total_allowances=total_allowances,
            overtime_pay=overtime_pay,
            gross_pay=gross_pay,
            paye=paye,
            nhif=nhif,
            nssf=nssf,
            total_deductions=total_deductions_staff,
            net_pay=net_pay,
            allowances_breakdown=allowances_breakdown,
            deductions_breakdown={"PAYE": paye, "NHIF": nhif, "NSSF": nssf},
        )
        db.add(payslip)

        total_gross += gross_pay
        total_deductions += total_deductions_staff
        total_net += net_pay

    # Update payroll run totals
    payroll_run.total_gross = round(total_gross, 2)
    payroll_run.total_deductions = round(total_deductions, 2)
    payroll_run.total_net = round(total_net, 2)
    payroll_run.status = PayrollStatus.PENDING_APPROVAL

    await db.commit()
    return {
        "message": "Payroll run completed",
        "payroll_run_id": str(payroll_run.id),
        "staff_processed": len(all_staff),
        "total_gross": total_gross,
        "total_deductions": total_deductions,
        "total_net": total_net,
        "status": "pending_approval",
    }


async def _get_basic_salary(staff: Staff, db: AsyncSession) -> float:
    grade_map = {
        "clinical": 80000.0,
        "administrative": 50000.0,
        "support": 30000.0,
    }
    return grade_map.get(staff.category.value, 40000.0)


@router.put("/run/{payroll_run_id}/approve", summary="Finance approves payroll run")
async def approve_payroll(
    payroll_run_id: uuid.UUID,
    payload: PayrollApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(FinanceAndAbove),
):
    result = await db.execute(select(PayrollRun).where(PayrollRun.id == payroll_run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    if run.status != PayrollStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Payroll run is not pending approval")

    run.approved_by_id = current_user.id
    run.approved_at = datetime.utcnow()
    run.status = PayrollStatus.APPROVED if payload.approved else PayrollStatus.DRAFT

    await db.commit()
    return {"message": f"Payroll {'approved' if payload.approved else 'sent back to draft'}"}


@router.get("/run/{branch_id}", summary="List payroll runs for a branch")
async def list_payroll_runs(
    branch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(FinanceAndAbove),
):
    result = await db.execute(
        select(PayrollRun).where(PayrollRun.branch_id == branch_id)
        .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
    )
    runs = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "month": r.month,
            "year": r.year,
            "total_gross": r.total_gross,
            "total_deductions": r.total_deductions,
            "total_net": r.total_net,
            "status": r.status.value,
            "created_at": str(r.created_at),
        }
        for r in runs
    ]


@router.get("/payslip/{staff_id}/{year}/{month}", summary="Get a staff member's payslip")
async def get_payslip(
    staff_id: uuid.UUID,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Staff can only access their own payslip
    if current_user.role in (UserRole.CLINICAL_STAFF, UserRole.ADMIN_STAFF, UserRole.SUPPORT_STAFF):
        result = await db.execute(select(Staff).where(Staff.user_id == current_user.id))
        own_staff = result.scalar_one_or_none()
        if not own_staff or own_staff.id != staff_id:
            raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(Payslip, PayrollRun)
        .join(PayrollRun, Payslip.payroll_run_id == PayrollRun.id)
        .where(
            and_(
                Payslip.staff_id == staff_id,
                PayrollRun.year == year,
                PayrollRun.month == month,
            )
        )
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Payslip not found")

    payslip = row.Payslip
    return {
        "staff_id": str(payslip.staff_id),
        "period": f"{year}-{month:02d}",
        "basic_salary": payslip.basic_salary,
        "allowances": payslip.allowances_breakdown,
        "total_allowances": payslip.total_allowances,
        "overtime_pay": payslip.overtime_pay,
        "gross_pay": payslip.gross_pay,
        "deductions": payslip.deductions_breakdown,
        "total_deductions": payslip.total_deductions,
        "net_pay": payslip.net_pay,
        "pdf_url": payslip.pdf_url,
    }


@router.post("/allowances/{staff_id}", summary="Add a clinical allowance to a staff member")
async def add_allowance(
    staff_id: uuid.UUID,
    payload: AllowanceCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    from datetime import date
    allowance = StaffAllowance(
        staff_id=staff_id,
        allowance_name=payload.allowance_name,
        amount=payload.amount,
        is_taxable=payload.is_taxable,
        is_recurring=payload.is_recurring,
        effective_from=date.fromisoformat(payload.effective_from),
        effective_to=date.fromisoformat(payload.effective_to) if payload.effective_to else None,
    )
    db.add(allowance)
    await db.commit()
    return {"message": "Allowance added successfully"}


@router.get("/allowances/{staff_id}", summary="Get all allowances for a staff member")
async def get_allowances(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(
        select(StaffAllowance).where(StaffAllowance.staff_id == staff_id)
    )
    allowances = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "name": a.allowance_name,
            "amount": a.amount,
            "is_taxable": a.is_taxable,
            "is_recurring": a.is_recurring,
            "effective_from": str(a.effective_from),
            "effective_to": str(a.effective_to) if a.effective_to else None,
        }
        for a in allowances
    ]
