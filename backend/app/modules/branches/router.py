import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from app.database import get_db
from app.models.models import Branch, Department, Staff, User
from app.utils.dependencies import get_current_user, SuperAdminOnly, HospitalAdminAndAbove

router = APIRouter(prefix="/branches", tags=["Branches"])


class BranchCreateRequest(BaseModel):
    name: str
    code: str
    address: str
    city: str
    phone: str
    email: str


class BranchUpdateRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


@router.post("/", summary="Create a new branch")
async def create_branch(
    payload: BranchCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(SuperAdminOnly),
):
    existing = await db.execute(select(Branch).where(Branch.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Branch code already exists")
    branch = Branch(**payload.model_dump())
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return {"message": "Branch created", "branch_id": str(branch.id), "code": branch.code}


@router.get("/", summary="List all branches")
async def list_branches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Branch).where(Branch.is_active == True))
    branches = result.scalars().all()
    return [
        {
            "id": str(b.id), "name": b.name, "code": b.code,
            "city": b.city, "phone": b.phone, "email": b.email,
            "is_active": b.is_active,
        }
        for b in branches
    ]


@router.get("/{branch_id}", summary="Get branch details with staff count")
async def get_branch(
    branch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HospitalAdminAndAbove),
):
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    staff_count = await db.execute(
        select(func.count(Staff.id)).where(Staff.branch_id == branch_id)
    )
    dept_count = await db.execute(
        select(func.count(Department.id)).where(Department.branch_id == branch_id)
    )
    return {
        "id": str(branch.id), "name": branch.name, "code": branch.code,
        "address": branch.address, "city": branch.city,
        "phone": branch.phone, "email": branch.email,
        "is_active": branch.is_active,
        "staff_count": staff_count.scalar(),
        "department_count": dept_count.scalar(),
        "created_at": str(branch.created_at),
    }


@router.patch("/{branch_id}", summary="Update branch details")
async def update_branch(
    branch_id: uuid.UUID,
    payload: BranchUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HospitalAdminAndAbove),
):
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(branch, field, value)
    await db.commit()
    return {"message": "Branch updated"}
