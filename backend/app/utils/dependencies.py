from typing import Optional
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import User, UserRole
from app.utils.auth_utils import decode_token

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return user


def require_roles(*roles: UserRole):
    """Role guard factory — use as a dependency."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}",
            )
        return current_user
    return role_checker


def require_branch_access(branch_id: uuid.UUID):
    """Ensure non-super-admins can only access their own branch."""
    async def branch_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        if current_user.branch_id != branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this branch",
            )
        return current_user
    return branch_checker


# Convenience role dependencies
SuperAdminOnly = require_roles(UserRole.SUPER_ADMIN)
HospitalAdminAndAbove = require_roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
HRAdminAndAbove = require_roles(
    UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.HR_ADMIN
)
FinanceAndAbove = require_roles(
    UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.HR_ADMIN, UserRole.FINANCE_ADMIN
)
DeptHeadAndAbove = require_roles(
    UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.HR_ADMIN, UserRole.DEPARTMENT_HEAD
)
AnyAuthenticatedUser = Depends(get_current_user)
