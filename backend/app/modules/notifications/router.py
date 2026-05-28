import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from pydantic import BaseModel

from app.database import get_db
from app.models.models import Notification, User, UserRole, NotificationChannel, NotificationPriority
from app.utils.dependencies import get_current_user, HRAdminAndAbove

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationSendRequest(BaseModel):
    user_id: uuid.UUID
    title: str
    message: str
    channel: NotificationChannel
    priority: NotificationPriority = NotificationPriority.ROUTINE
    meta: Optional[dict] = None


class BroadcastRequest(BaseModel):
    branch_id: Optional[uuid.UUID] = None   # None = all branches
    title: str
    message: str
    channel: NotificationChannel
    priority: NotificationPriority = NotificationPriority.EMERGENCY


@router.get("/", summary="Get my notifications")
async def get_my_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Notification.user_id == current_user.id]
    if unread_only:
        conditions.append(Notification.is_read == False)

    offset = (page - 1) * page_size
    result = await db.execute(
        select(Notification)
        .where(and_(*conditions))
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    notifications = result.scalars().all()

    return [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "channel": n.channel.value,
            "priority": n.priority.value,
            "is_read": n.is_read,
            "created_at": str(n.created_at),
            "meta": n.meta,
        }
        for n in notifications
    ]


@router.put("/{notification_id}/read", summary="Mark a notification as read")
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
            )
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    notif.read_at = datetime.utcnow()
    await db.commit()
    return {"message": "Marked as read"}


@router.put("/read-all", summary="Mark all notifications as read")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(
            and_(
                Notification.user_id == current_user.id,
                Notification.is_read == False,
            )
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/send", summary="Send a targeted notification to a user")
async def send_notification(
    payload: NotificationSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    notif = Notification(
        user_id=payload.user_id,
        title=payload.title,
        message=payload.message,
        channel=payload.channel,
        priority=payload.priority,
        meta=payload.meta,
        sent_at=datetime.utcnow(),
    )
    db.add(notif)
    await db.commit()

    # TODO: dispatch to Africa's Talking / SendGrid based on channel
    # This will be handled by Celery tasks in production

    return {"message": "Notification sent", "notification_id": str(notif.id)}


@router.post("/broadcast", summary="Send emergency broadcast to entire branch or chain")
async def broadcast(
    payload: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(HRAdminAndAbove),
):
    # Get all active users in scope
    conditions = [User.is_active == True]
    if payload.branch_id:
        conditions.append(User.branch_id == payload.branch_id)
    elif current_user.role != UserRole.SUPER_ADMIN:
        conditions.append(User.branch_id == current_user.branch_id)

    result = await db.execute(select(User).where(and_(*conditions)))
    users = result.scalars().all()

    notifications = [
        Notification(
            user_id=user.id,
            title=payload.title,
            message=payload.message,
            channel=payload.channel,
            priority=payload.priority,
            sent_at=datetime.utcnow(),
        )
        for user in users
    ]

    db.add_all(notifications)
    await db.commit()

    # TODO: Queue Celery task to dispatch via SMS/WhatsApp for emergency
    return {
        "message": "Broadcast sent",
        "recipients": len(users),
        "priority": payload.priority.value,
    }
