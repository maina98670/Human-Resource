import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from pydantic import BaseModel

from app.database import get_db
from app.models.models import Credential, Staff, User, UserRole, CredentialStatus
from app.utils.dependencies import get_current_user, HRAdminAndAbove, DeptHeadAndAbove

router = APIRouter(prefix="/credentials", tags=["Credentials & Compliance"])


class CredentialCreateRequest(BaseModel):
    credential_type: str
    issuing_body: str
    registration_number: str
    issue_date: date
    expiry_date: Optional[date] = None
    document_url: Optional[str] = None
    notes: Optional[str] = None


class CredentialVerifyRequest(BaseModel):
    notes: Optional[str] = None


@router.post("/{staff_id}", summary="Add a credential to a staff member")
async def add_credential(
    staff_id: uuid.UUID,
    payload: CredentialCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Staff can add their own credentials; HR can add for anyone
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.HR_ADMIN):
        result = await db.execute(select(Staff).where(Staff.user_id == current_user.id))
        own_staff = result.scalar_one_or_none()
        if not own_staff or own_staff.id != staff_id:
            raise HTTPException(status_code=403, detail="Access denied")

    credential = Credential(
        staff_id=staff_id,
        credential_type=payload.credential_type,
        issuing_body=payload.issuing_body,
        registration_number=payload.registration_number,
        issue_date=payload.issue_date,
        expiry_date=payload.expiry_date,
        document_url=payload.document_url,
        notes=payload.notes,
        status=CredentialStatus.PENDING_VERIFICATION,
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)
    return {"message": "Credential added, pending verification", "credential_id": str(credential.id)}


@router.get("/{staff_id}", summary="Get all credentials for a staff member")
async def get_credentials(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Credential).where(Credential.staff_id == staff_id)
    )
    creds = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "credential_type": c.credential_type,
            "issuing_body": c.issuing_body,
            "registration_number": c.registration_number,
            "issue_date": str(c.issue_date),
            "expiry_date": str(c.expiry_date) if c.expiry_date else None,
            "status": c.status.value,
            "document_url": c.document_url,
            "verified_at": str(c.verified_at) if c.verified_at else None,
        }
        for c in creds
    ]


@router.post("/{credential_id}/verify", summary="HR verifies a credential")
async def verify_credential(
    credential_id: uuid.UUID,
    payload: CredentialVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    today = date.today()
    if cred.expiry_date and cred.expiry_date < today:
        cred.status = CredentialStatus.EXPIRED
    else:
        cred.status = CredentialStatus.ACTIVE

    cred.verified_by_id = current_user.id
    cred.verified_at = datetime.utcnow()
    if payload.notes:
        cred.notes = payload.notes

    await db.commit()
    return {"message": "Credential verified", "status": cred.status.value}


@router.get("/expiring/soon", summary="Get credentials expiring within N days")
async def expiring_credentials(
    days: int = Query(30, ge=1, le=180),
    branch_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    from datetime import timedelta
    today = date.today()
    cutoff = today + timedelta(days=days)

    query = (
        select(Credential, Staff)
        .join(Staff, Credential.staff_id == Staff.id)
        .where(
            and_(
                Credential.expiry_date != None,
                Credential.expiry_date <= cutoff,
                Credential.expiry_date >= today,
                Credential.status != CredentialStatus.REVOKED,
            )
        )
    )

    if branch_id:
        query = query.where(Staff.branch_id == branch_id)
    elif current_user.role != UserRole.SUPER_ADMIN:
        query = query.where(Staff.branch_id == current_user.branch_id)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "staff_name": f"{row.Staff.first_name} {row.Staff.last_name}",
            "staff_id": str(row.Staff.id),
            "staff_number": row.Staff.staff_number,
            "credential_type": row.Credential.credential_type,
            "expiry_date": str(row.Credential.expiry_date),
            "days_until_expiry": (row.Credential.expiry_date - today).days,
            "status": row.Credential.status.value,
        }
        for row in rows
    ]


@router.get("/compliance/report", summary="Hospital-wide credential compliance report")
async def compliance_report(
    branch_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    scope_branch = branch_id or current_user.branch_id

    total_result = await db.execute(
        select(Credential, Staff)
        .join(Staff, Credential.staff_id == Staff.id)
        .where(Staff.branch_id == scope_branch)
    )
    all_creds = total_result.all()

    active = sum(1 for r in all_creds if r.Credential.status == CredentialStatus.ACTIVE)
    expired = sum(1 for r in all_creds if r.Credential.status == CredentialStatus.EXPIRED)
    expiring = sum(1 for r in all_creds if r.Credential.status == CredentialStatus.EXPIRING_SOON)
    pending = sum(1 for r in all_creds if r.Credential.status == CredentialStatus.PENDING_VERIFICATION)
    total = len(all_creds)

    compliance_pct = round((active / total * 100) if total > 0 else 0, 1)

    return {
        "branch_id": str(scope_branch),
        "total_credentials": total,
        "active": active,
        "expired": expired,
        "expiring_soon": expiring,
        "pending_verification": pending,
        "compliance_percentage": compliance_pct,
    }
