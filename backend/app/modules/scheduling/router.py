import uuid
from datetime import date, datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel

from app.database import get_db
from app.models.models import (
    Shift, ShiftAssignment, ShiftSwapRequest, ShiftTemplate,
    Staff, User, UserRole, ShiftType, CredentialStatus
)
from app.utils.dependencies import get_current_user, DeptHeadAndAbove, HRAdminAndAbove

router = APIRouter(prefix="/shifts", tags=["Scheduling & Rota"])

MAX_CONSECUTIVE_NIGHTS = 3
MIN_REST_HOURS_BETWEEN_SHIFTS = 11
FATIGUE_NIGHT_WEIGHT = 1.5
FATIGUE_DECAY_PER_REST_DAY = 10.0


class ShiftCreateRequest(BaseModel):
    department_id: uuid.UUID
    shift_type: ShiftType
    shift_date: date
    start_time: str   # "07:00"
    end_time: str     # "15:00"
    min_staff: int = 1
    notes: Optional[str] = None


class ShiftAssignRequest(BaseModel):
    staff_ids: List[uuid.UUID]


class SwapRequest(BaseModel):
    target_staff_id: uuid.UUID
    my_shift_id: uuid.UUID
    their_shift_id: uuid.UUID
    reason: Optional[str] = None


class AttendanceMarkRequest(BaseModel):
    assignment_id: uuid.UUID
    status: str  # present / absent / late
    checked_in_at: Optional[datetime] = None
    checked_out_at: Optional[datetime] = None


@router.get("/", summary="List shifts for a department and date range")
async def list_shifts(
    department_id: uuid.UUID = Query(...),
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Shift.department_id == department_id]
    if from_date:
        conditions.append(Shift.shift_date >= from_date)
    if to_date:
        conditions.append(Shift.shift_date <= to_date)

    result = await db.execute(
        select(Shift).where(and_(*conditions)).order_by(Shift.shift_date, Shift.start_time)
    )
    shifts = result.scalars().all()

    out = []
    for shift in shifts:
        asgn_result = await db.execute(
            select(ShiftAssignment, Staff)
            .join(Staff, ShiftAssignment.staff_id == Staff.id)
            .where(ShiftAssignment.shift_id == shift.id)
        )
        asgn_rows = asgn_result.all()
        out.append({
            "shift_id": str(shift.id),
            "date": str(shift.shift_date),
            "shift_type": shift.shift_type.value,
            "start_time": shift.start_time,
            "end_time": shift.end_time,
            "min_staff": shift.min_staff,
            "notes": shift.notes,
            "assigned_count": len(asgn_rows),
            "is_understaffed": len(asgn_rows) < shift.min_staff,
            "staff": [
                {
                    "staff_id": str(row.Staff.id),
                    "name": f"{row.Staff.first_name} {row.Staff.last_name}",
                    "attendance": row.ShiftAssignment.attendance_status,
                }
                for row in asgn_rows
            ],
        })
    return {"shifts": out, "total": len(out)}


@router.post("/", summary="Create a shift")
async def create_shift(
    payload: ShiftCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    shift = Shift(
        department_id=payload.department_id,
        shift_type=payload.shift_type,
        shift_date=payload.shift_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        min_staff=payload.min_staff,
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return {"message": "Shift created", "shift_id": str(shift.id)}


@router.post("/{shift_id}/assign", summary="Assign staff to a shift")
async def assign_staff(
    shift_id: uuid.UUID,
    payload: ShiftAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    assigned = []
    warnings = []

    for staff_id in payload.staff_ids:
        staff_result = await db.execute(select(Staff).where(Staff.id == staff_id))
        staff = staff_result.scalar_one_or_none()
        if not staff:
            warnings.append(f"Staff {staff_id} not found, skipped")
            continue

        # Fatigue check
        if staff.fatigue_score > 70:
            warnings.append(f"{staff.first_name} {staff.last_name} has high fatigue score ({staff.fatigue_score})")

        # Check for duplicate assignment
        dup_check = await db.execute(
            select(ShiftAssignment).where(
                and_(
                    ShiftAssignment.shift_id == shift_id,
                    ShiftAssignment.staff_id == staff_id,
                )
            )
        )
        if dup_check.scalar_one_or_none():
            warnings.append(f"{staff.first_name} already assigned to this shift")
            continue

        assignment = ShiftAssignment(
            shift_id=shift_id,
            staff_id=staff_id,
            is_confirmed=True,
        )
        db.add(assignment)

        # Update fatigue score
        fatigue_increment = FATIGUE_NIGHT_WEIGHT if shift.shift_type == ShiftType.NIGHT else 1.0
        staff.fatigue_score = min(100.0, staff.fatigue_score + fatigue_increment * 10)

        assigned.append(str(staff_id))

    await db.commit()
    return {"assigned": assigned, "warnings": warnings}


@router.get("/rota/{department_id}", summary="Weekly rota for a department")
async def get_rota(
    department_id: uuid.UUID,
    week_start: date = Query(...),  # YYYY-MM-DD of Monday
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    week_end = week_start + timedelta(days=6)

    result = await db.execute(
        select(Shift).where(
            and_(
                Shift.department_id == department_id,
                Shift.shift_date >= week_start,
                Shift.shift_date <= week_end,
            )
        ).order_by(Shift.shift_date, Shift.start_time)
    )
    shifts = result.scalars().all()

    rota = []
    for shift in shifts:
        asgn_result = await db.execute(
            select(ShiftAssignment, Staff)
            .join(Staff, ShiftAssignment.staff_id == Staff.id)
            .where(ShiftAssignment.shift_id == shift.id)
        )
        asgn_rows = asgn_result.all()

        rota.append({
            "shift_id": str(shift.id),
            "date": str(shift.shift_date),
            "shift_type": shift.shift_type.value,
            "start_time": shift.start_time,
            "end_time": shift.end_time,
            "min_staff": shift.min_staff,
            "assigned_count": len(asgn_rows),
            "is_understaffed": len(asgn_rows) < shift.min_staff,
            "staff": [
                {
                    "staff_id": str(row.Staff.id),
                    "name": f"{row.Staff.first_name} {row.Staff.last_name}",
                    "attendance": row.ShiftAssignment.attendance_status,
                }
                for row in asgn_rows
            ],
        })

    return {"week_start": str(week_start), "week_end": str(week_end), "shifts": rota}


@router.get("/gaps/{department_id}", summary="Detect understaffed shifts in a department")
async def get_gaps(
    department_id: uuid.UUID,
    from_date: date = Query(default=date.today()),
    to_date: date = Query(default=date.today() + timedelta(days=7)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    result = await db.execute(
        select(Shift).where(
            and_(
                Shift.department_id == department_id,
                Shift.shift_date >= from_date,
                Shift.shift_date <= to_date,
            )
        )
    )
    shifts = result.scalars().all()

    gaps = []
    for shift in shifts:
        count_result = await db.execute(
            select(func.count(ShiftAssignment.id)).where(
                ShiftAssignment.shift_id == shift.id
            )
        )
        assigned_count = count_result.scalar()
        if assigned_count < shift.min_staff:
            gaps.append({
                "shift_id": str(shift.id),
                "date": str(shift.shift_date),
                "shift_type": shift.shift_type.value,
                "required": shift.min_staff,
                "assigned": assigned_count,
                "shortfall": shift.min_staff - assigned_count,
            })

    return {"gaps": gaps, "total_gaps": len(gaps)}


@router.post("/swap/request", summary="Request a shift swap with another staff member")
async def request_swap(
    payload: SwapRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    staff_result = await db.execute(select(Staff).where(Staff.user_id == current_user.id))
    requester = staff_result.scalar_one_or_none()
    if not requester:
        raise HTTPException(status_code=404, detail="Staff profile not found")

    swap = ShiftSwapRequest(
        requester_id=requester.id,
        target_id=payload.target_staff_id,
        requester_shift_id=payload.my_shift_id,
        target_shift_id=payload.their_shift_id,
        reason=payload.reason,
        status="pending",
    )
    db.add(swap)
    await db.commit()
    return {"message": "Swap request submitted", "swap_id": str(swap.id)}


@router.put("/swap/{swap_id}/approve", summary="Supervisor approves a shift swap")
async def approve_swap(
    swap_id: uuid.UUID,
    approved: bool,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    result = await db.execute(select(ShiftSwapRequest).where(ShiftSwapRequest.id == swap_id))
    swap = result.scalar_one_or_none()
    if not swap:
        raise HTTPException(status_code=404, detail="Swap request not found")

    if approved:
        swap.status = "approved"
        swap.approved_by_id = current_user.id

        req_asgn = await db.execute(
            select(ShiftAssignment).where(
                and_(
                    ShiftAssignment.shift_id == swap.requester_shift_id,
                    ShiftAssignment.staff_id == swap.requester_id,
                )
            )
        )
        target_asgn = await db.execute(
            select(ShiftAssignment).where(
                and_(
                    ShiftAssignment.shift_id == swap.target_shift_id,
                    ShiftAssignment.staff_id == swap.target_id,
                )
            )
        )
        req_row = req_asgn.scalar_one_or_none()
        tgt_row = target_asgn.scalar_one_or_none()

        if req_row and tgt_row:
            req_row.staff_id, tgt_row.staff_id = tgt_row.staff_id, req_row.staff_id
    else:
        swap.status = "rejected"

    await db.commit()
    return {"message": f"Swap {'approved and executed' if approved else 'rejected'}"}


@router.post("/attendance/mark", summary="Mark attendance for a shift assignment")
async def mark_attendance(
    payload: AttendanceMarkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    result = await db.execute(
        select(ShiftAssignment).where(ShiftAssignment.id == payload.assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment.attendance_status = payload.status
    if payload.checked_in_at:
        assignment.checked_in_at = payload.checked_in_at
    if payload.checked_out_at:
        assignment.checked_out_at = payload.checked_out_at

    await db.commit()
    return {"message": "Attendance marked"}
