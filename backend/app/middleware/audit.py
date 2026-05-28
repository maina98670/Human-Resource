import uuid
import time
import json
from typing import Callable
from fastapi import Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models.models import AuditLog
from app.utils.auth_utils import decode_token


# Actions we always want audited
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json", "/auth/refresh"}


async def audit_log_middleware(request: Request, call_next: Callable) -> Response:
    """
    Middleware that logs every mutating request to the audit_logs table.
    Extracts user from JWT token if present, records action, resource, and IP.
    """
    start_time = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000)

    if request.method not in AUDITED_METHODS:
        return response
    if request.url.path in SKIP_PATHS:
        return response

    # Extract user from token if present
    user_id = None
    branch_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = decode_token(token)
            user_id = uuid.UUID(payload.get("sub")) if payload.get("sub") else None
        except Exception:
            pass

    # Build action string from method + path
    path_parts = request.url.path.strip("/").split("/")
    resource = path_parts[0] if path_parts else "unknown"
    resource_id = path_parts[1] if len(path_parts) > 1 else None
    action = f"{request.method}_{resource.upper()}"

    try:
        async with AsyncSessionLocal() as db:
            log = AuditLog(
                user_id=user_id,
                action=action,
                resource=resource,
                resource_id=resource_id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
            db.add(log)
            await db.commit()
    except Exception as e:
        # Never let audit logging crash the request
        print(f"[AuditLog] Failed to write: {e}")

    return response
