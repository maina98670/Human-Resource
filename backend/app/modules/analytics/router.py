import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, extract
from pydantic import BaseModel

from app.database import get_db
from app.models.models import (
    Staff, User, UserRole, Department, Branch,
    LeaveRequest, LeaveStatus, PayrollRun, Payslip,
    ShiftAssignment, Credential, CredentialStatus,
    WellnessCheckin, StaffStatus, EmploymentType
)
from app.utils.dependencies import get_current_user, HRAdminAndAbove, DeptHeadAndAbove, FinanceAndAbove

router = APIRouter(prefix="/analytics", tags=["Analytics & Reporting"])


# ─── Workforce Overview ─────────────────────────────────────────────────────

@router.get("/workforce/overview", summary="Workforce headcount summary by branch or chain")
async def workforce_overview(
    branch_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    # Scope
    scope_branch = None
    if current_user.role != UserRole.SUPER_ADMIN:
        scope_branch = current_user.branch_id
    elif branch_id:
        scope_branch = branch_id

    conditions = [Staff.status == StaffStatus.ACTIVE]
    if scope_branch:
        conditions.append(Staff.branch_id == scope_branch)

    # Total headcount
    total_result = await db.execute(
        select(func.count(Staff.id)).where(and_(*conditions))
    )
    total = total_result.scalar()

    # By category
    by_category = await db.execute(
        select(Staff.category, func.count(Staff.id))
        .where(and_(*conditions))
        .group_by(Staff.category)
    )
    category_breakdown = {row[0].value: row[1] for row in by_category.all()}

    # By employment type
    by_emp_type = await db.execute(
        select(Staff.employment_type, func.count(Staff.id))
        .where(and_(*conditions))
        .group_by(Staff.employment_type)
    )
    emp_type_breakdown = {row[0].value: row[1] for row in by_emp_type.all()}

    # Active vs On Leave vs Suspended
    status_result = await db.execute(
        select(Staff.status, func.count(Staff.id))
        .where(Staff.branch_id == scope_branch if scope_branch else True)
        .group_by(Staff.status)
    )
    status_breakdown = {row[0].value: row[1] for row in status_result.all()}

    # New hires this month
    today = date.today()
    new_hires_result = await db.execute(
        select(func.count(Staff.id)).where(
            and_(
                *(conditions),
                extract("year", Staff.hire_date) == today.year,
                extract("month", Staff.hire_date) == today.month,
            )
        )
    )
    new_hires = new_hires_result.scalar()

    # Locum count
    locum_result = await db.execute(
        select(func.count(Staff.id)).where(
            and_(
                Staff.employment_type.in_([EmploymentType.LOCUM, EmploymentType.AGENCY]),
                Staff.branch_id == scope_branch if scope_branch else True,
            )
        )
    )
    locum_count = locum_result.scalar()

    return {
        "total_active_staff": total,
        "new_hires_this_month": new_hires,
        "locum_count": locum_count,
        "by_category": category_breakdown,
        "by_employment_type": emp_type_breakdown,
        "by_status": status_breakdown,
        "as_of": str(today),
    }


# ─── Turnover Analytics ─────────────────────────────────────────────────────

@router.get("/workforce/turnover", summary="Staff turnover rate by branch and period")
async def turnover_analytics(
    branch_id: Optional[uuid.UUID] = Query(None),
    year: int = Query(default=datetime.utcnow().year),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    scope_branch = branch_id or (
        current_user.branch_id if current_user.role != UserRole.SUPER_ADMIN else None
    )

    # Staff who left this year
    left_conditions = [
        extract("year", Staff.exit_date) == year,
        Staff.status.in_([StaffStatus.TERMINATED, StaffStatus.RESIGNED]),
    ]
    if scope_branch:
        left_conditions.append(Staff.branch_id == scope_branch)

    left_result = await db.execute(
        select(func.count(Staff.id)).where(and_(*left_conditions))
    )
    staff_left = left_result.scalar()

    # Active + left = total workforce (denominator for turnover)
    total_conditions = []
    if scope_branch:
        total_conditions.append(Staff.branch_id == scope_branch)

    total_result = await db.execute(
        select(func.count(Staff.id)).where(and_(*total_conditions) if total_conditions else True)
    )
    total = total_result.scalar()

    turnover_rate = round((staff_left / total * 100) if total > 0 else 0, 2)

    # Monthly breakdown of exits
    monthly_exits = await db.execute(
        select(
            extract("month", Staff.exit_date).label("month"),
            func.count(Staff.id).label("exits"),
        )
        .where(and_(*left_conditions))
        .group_by("month")
        .order_by("month")
    )
    monthly = {int(row.month): row.exits for row in monthly_exits.all()}

    # By reason
    by_status = await db.execute(
        select(Staff.status, func.count(Staff.id))
        .where(and_(*left_conditions))
        .group_by(Staff.status)
    )
    exit_reasons = {row[0].value: row[1] for row in by_status.all()}

    return {
        "year": year,
        "branch_id": str(scope_branch) if scope_branch else "all",
        "total_workforce": total,
        "staff_exited": staff_left,
        "turnover_rate_percent": turnover_rate,
        "monthly_exits": monthly,
        "exit_by_status": exit_reasons,
    }


# ─── Absenteeism ────────────────────────────────────────────────────────────

@router.get("/workforce/absenteeism", summary="Absenteeism rate by department")
async def absenteeism_report(
    branch_id: Optional[uuid.UUID] = Query(None),
    month: int = Query(default=datetime.utcnow().month),
    year: int = Query(default=datetime.utcnow().year),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    scope_branch = branch_id or current_user.branch_id

    # Shift absences this month
    absent_result = await db.execute(
        select(
            Staff.department_id,
            func.count(ShiftAssignment.id).label("absences"),
        )
        .join(Staff, ShiftAssignment.staff_id == Staff.id)
        .where(
            and_(
                ShiftAssignment.attendance_status == "absent",
                Staff.branch_id == scope_branch,
            )
        )
        .group_by(Staff.department_id)
    )
    absences_by_dept = {str(row.department_id): row.absences for row in absent_result.all()}

    # Total assignments this month (denominator)
    total_result = await db.execute(
        select(
            Staff.department_id,
            func.count(ShiftAssignment.id).label("total"),
        )
        .join(Staff, ShiftAssignment.staff_id == Staff.id)
        .where(Staff.branch_id == scope_branch)
        .group_by(Staff.department_id)
    )
    totals_by_dept = {str(row.department_id): row.total for row in total_result.all()}

    # Merge
    departments = set(list(absences_by_dept.keys()) + list(totals_by_dept.keys()))
    report = []
    for dept_id in departments:
        absences = absences_by_dept.get(dept_id, 0)
        total = totals_by_dept.get(dept_id, 0)
        rate = round((absences / total * 100) if total > 0 else 0, 2)
        report.append({
            "department_id": dept_id,
            "total_assignments": total,
            "absences": absences,
            "absenteeism_rate_percent": rate,
        })

    report.sort(key=lambda x: x["absenteeism_rate_percent"], reverse=True)
    return {"month": month, "year": year, "branch_id": str(scope_branch), "departments": report}


# ─── Payroll Cost Analytics ──────────────────────────────────────────────────

@router.get("/payroll/cost-summary", summary="Payroll cost breakdown by department")
async def payroll_cost_summary(
    branch_id: Optional[uuid.UUID] = Query(None),
    year: int = Query(default=datetime.utcnow().year),
    month: int = Query(default=datetime.utcnow().month),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(FinanceAndAbove),
):
    scope_branch = branch_id or current_user.branch_id

    result = await db.execute(
        select(
            Staff.department_id,
            func.sum(Payslip.gross_pay).label("total_gross"),
            func.sum(Payslip.net_pay).label("total_net"),
            func.sum(Payslip.total_deductions).label("total_deductions"),
            func.count(Payslip.id).label("headcount"),
        )
        .join(Staff, Payslip.staff_id == Staff.id)
        .join(PayrollRun, Payslip.payroll_run_id == PayrollRun.id)
        .where(
            and_(
                Staff.branch_id == scope_branch,
                PayrollRun.month == month,
                PayrollRun.year == year,
            )
        )
        .group_by(Staff.department_id)
    )
    rows = result.all()

    total_gross = sum(r.total_gross or 0 for r in rows)
    return {
        "period": f"{year}-{month:02d}",
        "branch_id": str(scope_branch),
        "total_gross_payroll": round(total_gross, 2),
        "by_department": [
            {
                "department_id": str(row.department_id),
                "headcount": row.headcount,
                "total_gross": round(row.total_gross or 0, 2),
                "total_net": round(row.total_net or 0, 2),
                "total_deductions": round(row.total_deductions or 0, 2),
                "avg_gross_per_staff": round((row.total_gross or 0) / row.headcount, 2) if row.headcount else 0,
            }
            for row in rows
        ],
    }


# ─── Credential Compliance ───────────────────────────────────────────────────

@router.get("/compliance/overview", summary="Chain-wide credential compliance overview")
async def compliance_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    conditions = []
    if current_user.role != UserRole.SUPER_ADMIN:
        conditions.append(Staff.branch_id == current_user.branch_id)

    result = await db.execute(
        select(
            Branch.name,
            Credential.status,
            func.count(Credential.id).label("count"),
        )
        .join(Staff, Credential.staff_id == Staff.id)
        .join(Branch, Staff.branch_id == Branch.id)
        .where(and_(*conditions) if conditions else True)
        .group_by(Branch.name, Credential.status)
    )
    rows = result.all()

    # Aggregate by branch
    branches = {}
    for row in rows:
        if row.name not in branches:
            branches[row.name] = {"total": 0, "active": 0, "expired": 0, "pending": 0, "expiring_soon": 0}
        branches[row.name]["total"] += row.count
        status_key = row.status.value if hasattr(row.status, "value") else str(row.status)
        if status_key in branches[row.name]:
            branches[row.name][status_key] += row.count

    report = []
    for branch_name, data in branches.items():
        compliance_pct = round((data["active"] / data["total"] * 100) if data["total"] > 0 else 0, 1)
        report.append({
            "branch": branch_name,
            **data,
            "compliance_percentage": compliance_pct,
        })

    report.sort(key=lambda x: x["compliance_percentage"])
    return {"branches": report}


# ─── Staffing Ratio ──────────────────────────────────────────────────────────

@router.get("/staffing/ratios", summary="Current staffing ratio per department vs required minimum")
async def staffing_ratios(
    branch_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    scope_branch = branch_id or current_user.branch_id

    dept_result = await db.execute(
        select(Department).where(
            and_(Department.branch_id == scope_branch, Department.is_active == True)
        )
    )
    departments = dept_result.scalars().all()

    report = []
    for dept in departments:
        staff_count_result = await db.execute(
            select(func.count(Staff.id)).where(
                and_(
                    Staff.department_id == dept.id,
                    Staff.status == StaffStatus.ACTIVE,
                )
            )
        )
        actual = staff_count_result.scalar()
        required = dept.min_staff_per_shift

        report.append({
            "department_id": str(dept.id),
            "department_name": dept.name,
            "required_per_shift": required,
            "actual_active_staff": actual,
            "ratio": round(actual / required, 2) if required > 0 else None,
            "is_understaffed": actual < required,
        })

    report.sort(key=lambda x: x.get("ratio") or 0)
    return {"branch_id": str(scope_branch), "departments": report}


# ─── Wellbeing Dashboard ─────────────────────────────────────────────────────

@router.get("/wellbeing/overview", summary="Staff wellbeing and burnout risk overview")
async def wellbeing_overview(
    branch_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    scope_branch = branch_id or current_user.branch_id

    # Latest checkins per staff
    result = await db.execute(
        select(
            WellnessCheckin.burnout_risk,
            func.count(WellnessCheckin.id).label("count"),
        )
        .join(Staff, WellnessCheckin.staff_id == Staff.id)
        .where(Staff.branch_id == scope_branch)
        .group_by(WellnessCheckin.burnout_risk)
    )
    burnout_dist = {row.burnout_risk: row.count for row in result.all()}

    # High fatigue staff (score > 70)
    high_fatigue_result = await db.execute(
        select(
            Staff.first_name,
            Staff.last_name,
            Staff.fatigue_score,
            Staff.department_id,
        )
        .where(
            and_(
                Staff.branch_id == scope_branch,
                Staff.fatigue_score > 70,
                Staff.status == StaffStatus.ACTIVE,
            )
        )
        .order_by(Staff.fatigue_score.desc())
        .limit(10)
    )
    high_fatigue = [
        {
            "name": f"{row.first_name} {row.last_name}",
            "fatigue_score": row.fatigue_score,
            "department_id": str(row.department_id),
        }
        for row in high_fatigue_result.all()
    ]

    # Avg mood scores
    avg_result = await db.execute(
        select(
            func.avg(WellnessCheckin.energy_level).label("avg_energy"),
            func.avg(WellnessCheckin.stress_level).label("avg_stress"),
        )
        .join(Staff, WellnessCheckin.staff_id == Staff.id)
        .where(Staff.branch_id == scope_branch)
    )
    avgs = avg_result.one_or_none()

    return {
        "branch_id": str(scope_branch),
        "burnout_risk_distribution": burnout_dist,
        "high_fatigue_staff": high_fatigue,
        "avg_energy_level": round(avgs.avg_energy or 0, 2) if avgs else 0,
        "avg_stress_level": round(avgs.avg_stress or 0, 2) if avgs else 0,
    }


# ─── MoH Regulatory Report ───────────────────────────────────────────────────

@router.get("/reports/moh-staffing", summary="Kenya MoH staffing compliance report format")
async def moh_staffing_report(
    branch_id: Optional[uuid.UUID] = Query(None),
    year: int = Query(default=datetime.utcnow().year),
    quarter: int = Query(default=1, ge=1, le=4),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    scope_branch = branch_id or current_user.branch_id

    # Clinical staff by sub-role
    clinical_result = await db.execute(
        select(Staff.clinical_sub_role, func.count(Staff.id).label("count"))
        .where(
            and_(
                Staff.branch_id == scope_branch,
                Staff.category == "clinical",
                Staff.status == StaffStatus.ACTIVE,
            )
        )
        .group_by(Staff.clinical_sub_role)
    )
    clinical_by_role = {
        (row.clinical_sub_role.value if row.clinical_sub_role else "other"): row.count
        for row in clinical_result.all()
    }

    # Credential compliance
    cred_result = await db.execute(
        select(func.count(Credential.id))
        .join(Staff, Credential.staff_id == Staff.id)
        .where(
            and_(
                Staff.branch_id == scope_branch,
                Credential.status == CredentialStatus.ACTIVE,
            )
        )
    )
    active_credentials = cred_result.scalar()

    return {
        "report_type": "Kenya MoH Staffing Compliance",
        "branch_id": str(scope_branch),
        "year": year,
        "quarter": quarter,
        "generated_at": datetime.utcnow().isoformat(),
        "clinical_staff_by_cadre": clinical_by_role,
        "active_credentials": active_credentials,
        "note": "Submit to Kenya Ministry of Health via DHIS2 portal",
    }
