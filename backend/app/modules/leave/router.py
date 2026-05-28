import uuid
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel

from app.database import get_db
from app.models.models import (
    LeaveRequest, LeaveBalance, Staff, User, UserRole,
    LeaveType, LeaveStatus, EmploymentType
)
from app.utils.dependencies import get_current_user, HRAdminAndAbove, DeptHeadAndAbove

router = APIRouter(prefix="/leave", tags=["Leave Management"])


# ─── Schemas ───────────────────────────────────────────────

class LeaveApplyRequest(BaseModel):
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: Optional[str] = None
    handover_notes: Optional[str] = None


class LeaveApprovalRequest(BaseModel):
    approved: bool
    comment: Optional[str] = None


class LeaveBalanceSetRequest(BaseModel):
    leave_type: LeaveType
    entitled_days: float
    year: int


# ─── Helpers ───────────────────────────────────────────────

def count_working_days(start: date, end: date) -> float:
    """Count Mon–Fri working days between two dates (inclusive)."""
    from datetime import timedelta
    days = 0
    current = start
    while current <= end:
        if current.weekday() < 5:  # 0=Mon, 4=Fri
            days += 1
        current += timedelta(days=1)
    return float(days)


async def get_staff_from_user(db: AsyncSession, user: User) -> Staff:
    result = await db.execute(select(Staff).where(Staff.user_id == user.id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff profile not found for this user")
    return staff


# ─── Endpoints ─────────────────────────────────────────────

@router.post("/apply", summary="Apply for leave")
async def apply_leave(
    payload: LeaveApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Locums cannot apply for leave
    if current_user.role == UserRole.LOCUM:
        raise HTTPException(status_code=403, detail="Locum staff are not eligible for leave")

    staff = await get_staff_from_user(db, current_user)

    if payload.start_date > payload.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    days_requested = count_working_days(payload.start_date, payload.end_date)

    # Check leave balance for non-sick and non-unpaid
    if payload.leave_type not in (LeaveType.SICK, LeaveType.UNPAID):
        result = await db.execute(
            select(LeaveBalance).where(
                and_(
                    LeaveBalance.staff_id == staff.id,
                    LeaveBalance.leave_type == payload.leave_type,
                    LeaveBalance.year == payload.start_date.year,
                )
            )
        )
        balance = result.scalar_one_or_none()
        if not balance:
            raise HTTPException(status_code=400, detail="No leave balance found for this leave type")

        available = balance.entitled_days + balance.carried_over - balance.used_days
        if days_requested > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient leave balance. Available: {available} days, Requested: {days_requested} days",
            )

    # Check for overlapping leave
    overlap_result = await db.execute(
        select(LeaveRequest).where(
            and_(
                LeaveRequest.staff_id == staff.id,
                LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED_BY_HEAD, LeaveStatus.APPROVED]),
                LeaveRequest.start_date <= payload.end_date,
                LeaveRequest.end_date >= payload.start_date,
            )
        )
    )
    if overlap_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You already have a leave request overlapping these dates")

    leave_request = LeaveRequest(
        staff_id=staff.id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=days_requested,
        reason=payload.reason,
        handover_notes=payload.handover_notes,
    )
    db.add(leave_request)
    await db.commit()
    await db.refresh(leave_request)

    return {
        "message": "Leave request submitted successfully",
        "request_id": str(leave_request.id),
        "days_requested": days_requested,
        "status": leave_request.status.value,
    }


@router.get("/my-requests", summary="Get my leave requests")
async def my_leave_requests(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    staff = await get_staff_from_user(db, current_user)

    conditions = [LeaveRequest.staff_id == staff.id]
    if year:
        from sqlalchemy import extract
        conditions.append(extract("year", LeaveRequest.start_date) == year)

    result = await db.execute(select(LeaveRequest).where(and_(*conditions)))
    requests = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "leave_type": r.leave_type.value,
            "start_date": str(r.start_date),
            "end_date": str(r.end_date),
            "days_requested": r.days_requested,
            "status": r.status.value,
            "reason": r.reason,
            "created_at": str(r.created_at),
        }
        for r in requests
    ]


@router.get("/balance/{staff_id}", summary="Get leave balance for a staff member")
async def get_leave_balance(
    staff_id: uuid.UUID,
    year: int = Query(default=datetime.utcnow().year),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Staff can only view their own balance
    if current_user.role in (UserRole.CLINICAL_STAFF, UserRole.ADMIN_STAFF, UserRole.SUPPORT_STAFF):
        result = await db.execute(select(Staff).where(Staff.user_id == current_user.id))
        own_staff = result.scalar_one_or_none()
        if not own_staff or own_staff.id != staff_id:
            raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(LeaveBalance).where(
            and_(LeaveBalance.staff_id == staff_id, LeaveBalance.year == year)
        )
    )
    balances = result.scalars().all()

    return [
        {
            "leave_type": b.leave_type.value,
            "entitled_days": b.entitled_days,
            "used_days": b.used_days,
            "carried_over": b.carried_over,
            "available_days": b.entitled_days + b.carried_over - b.used_days,
            "year": b.year,
        }
        for b in balances
    ]


@router.put("/{request_id}/dept-approve", summary="Department head approves/rejects leave")
async def dept_head_approve(
    request_id: uuid.UUID,
    payload: LeaveApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    leave = result.scalar_one_or_none()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=400, detail="Leave request is not in pending state")

    leave.dept_head_id = current_user.id
    leave.dept_head_approved_at = datetime.utcnow()
    leave.dept_head_comment = payload.comment
    leave.status = LeaveStatus.APPROVED_BY_HEAD if payload.approved else LeaveStatus.REJECTED
    leave.updated_at = datetime.utcnow()

    await db.commit()
    return {"message": f"Leave {'approved by department' if payload.approved else 'rejected'}"}


@router.put("/{request_id}/hr-approve", summary="HR Admin final approval of leave")
async def hr_approve(
    request_id: uuid.UUID,
    payload: LeaveApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    leave = result.scalar_one_or_none()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if leave.status != LeaveStatus.APPROVED_BY_HEAD:
        raise HTTPException(status_code=400, detail="Leave must be approved by department head first")

    leave.hr_admin_id = current_user.id
    leave.hr_approved_at = datetime.utcnow()
    leave.hr_comment = payload.comment
    leave.updated_at = datetime.utcnow()

    if payload.approved:
        leave.status = LeaveStatus.APPROVED
        # Deduct from leave balance
        result2 = await db.execute(
            select(LeaveBalance).where(
                and_(
                    LeaveBalance.staff_id == leave.staff_id,
                    LeaveBalance.leave_type == leave.leave_type,
                    LeaveBalance.year == leave.start_date.year,
                )
            )
        )
        balance = result2.scalar_one_or_none()
        if balance:
            balance.used_days += leave.days_requested
    else:
        leave.status = LeaveStatus.REJECTED

    await db.commit()
    return {"message": f"Leave {'fully approved' if payload.approved else 'rejected by HR'}"}


@router.put("/{request_id}/cancel", summary="Staff cancels their pending leave request")
async def cancel_leave(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    staff = await get_staff_from_user(db, current_user)
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.id == request_id))
    leave = result.scalar_one_or_none()

    if not leave or leave.staff_id != staff.id:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if leave.status not in (LeaveStatus.PENDING, LeaveStatus.APPROVED_BY_HEAD):
        raise HTTPException(status_code=400, detail="Can only cancel pending requests")

    leave.status = LeaveStatus.CANCELLED
    leave.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Leave request cancelled"}


@router.get("/calendar/{department_id}", summary="Department leave calendar")
async def dept_leave_calendar(
    department_id: uuid.UUID,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(default=datetime.utcnow().year),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    from sqlalchemy import extract

    result = await db.execute(
        select(LeaveRequest, Staff)
        .join(Staff, LeaveRequest.staff_id == Staff.id)
        .where(
            and_(
                Staff.department_id == department_id,
                LeaveRequest.status == LeaveStatus.APPROVED,
                extract("year", LeaveRequest.start_date) == year,
                extract("month", LeaveRequest.start_date) == month,
            )
        )
    )
    rows = result.all()

    return [
        {
            "staff_name": f"{row.Staff.first_name} {row.Staff.last_name}",
            "staff_id": str(row.Staff.id),
            "leave_type": row.LeaveRequest.leave_type.value,
            "start_date": str(row.LeaveRequest.start_date),
            "end_date": str(row.LeaveRequest.end_date),
            "days": row.LeaveRequest.days_requested,
        }
        for row in rows
    ]


@router.post("/balance/set", summary="HR sets leave entitlement for a staff member")
async def set_leave_balance(
    staff_id: uuid.UUID,
    payload: LeaveBalanceSetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(
        select(LeaveBalance).where(
            and_(
                LeaveBalance.staff_id == staff_id,
                LeaveBalance.leave_type == payload.leave_type,
                LeaveBalance.year == payload.year,
            )
        )
    )
    balance = result.scalar_one_or_none()

    if balance:
        balance.entitled_days = payload.entitled_days
    else:
        balance = LeaveBalance(
            staff_id=staff_id,
            leave_type=payload.leave_type,
            entitled_days=payload.entitled_days,
            year=payload.year,
        )
        db.add(balance)

    await db.commit()
    return {"message": "Leave balance updated"}
