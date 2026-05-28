import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel
from app.database import get_db
from app.models.models import Department, Staff, User, StaffCategory, StaffStatus
from app.utils.dependencies import get_current_user, HRAdminAndAbove, HospitalAdminAndAbove

router = APIRouter(prefix="/departments", tags=["Departments"])


class DepartmentCreateRequest(BaseModel):
    branch_id: uuid.UUID
    name: str
    code: str
    category: StaffCategory
    min_staff_per_shift: int = 1


class DepartmentUpdateRequest(BaseModel):
    name: Optional[str] = None
    min_staff_per_shift: Optional[int] = None
    is_active: Optional[bool] = None


@router.post("/", summary="Create a department")
async def create_department(
    payload: DepartmentCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HospitalAdminAndAbove),
):
    dept = Department(**payload.model_dump())
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return {"message": "Department created", "department_id": str(dept.id)}


@router.get("/", summary="List departments for a branch")
async def list_departments(
    branch_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scope = branch_id or current_user.branch_id
    conditions = [Department.is_active == True]
    if scope:
        conditions.append(Department.branch_id == scope)

    result = await db.execute(select(Department).where(and_(*conditions)))
    depts = result.scalars().all()
    return [
        {
            "id": str(d.id), "name": d.name, "code": d.code,
            "category": d.category.value, "branch_id": str(d.branch_id),
            "min_staff_per_shift": d.min_staff_per_shift, "is_active": d.is_active,
        }
        for d in depts
    ]


@router.get("/{department_id}", summary="Get department with staff count")
async def get_department(
    department_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Department).where(Department.id == department_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    active_staff = await db.execute(
        select(func.count(Staff.id)).where(
            and_(Staff.department_id == department_id, Staff.status == StaffStatus.ACTIVE)
        )
    )
    return {
        "id": str(dept.id), "name": dept.name, "code": dept.code,
        "category": dept.category.value, "branch_id": str(dept.branch_id),
        "min_staff_per_shift": dept.min_staff_per_shift,
        "active_staff_count": active_staff.scalar(),
        "is_active": dept.is_active,
    }


@router.patch("/{department_id}", summary="Update department")
async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(select(Department).where(Department.id == department_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(dept, field, value)
    await db.commit()
    return {"message": "Department updated"}
