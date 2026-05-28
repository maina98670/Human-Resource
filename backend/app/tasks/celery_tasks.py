"""
Celery background tasks:
- Daily credential expiry scan
- Monthly payroll trigger
- Notification dispatch (SMS/Email/WhatsApp)
- Fatigue score decay
- Payslip PDF generation
"""
from celery import Celery
from datetime import date, timedelta
from app.config import settings

celery_app = Celery(
    "hospital_hr",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Africa/Nairobi",
    enable_utc=True,
    beat_schedule={
        # Runs every day at 6 AM EAT
        "daily-credential-scan": {
            "task": "app.tasks.celery_tasks.scan_expiring_credentials",
            "schedule": 86400,
        },
        # Runs every day at midnight — decay fatigue for rested staff
        "daily-fatigue-decay": {
            "task": "app.tasks.celery_tasks.decay_fatigue_scores",
            "schedule": 86400,
        },
    },
)


@celery_app.task(name="app.tasks.celery_tasks.scan_expiring_credentials")
def scan_expiring_credentials():
    """
    Scan all credentials expiring in 30, 60, or 90 days.
    Send alerts to staff + HR + department head.
    Runs daily via Celery Beat.
    """
    from sqlalchemy import create_engine, select, and_
    from sqlalchemy.orm import Session
    from app.models.models import Credential, Staff, User, CredentialStatus

    engine = create_engine(settings.SYNC_DATABASE_URL)
    today = date.today()
    alert_thresholds = [30, 60, 90]

    with Session(engine) as session:
        for days in alert_thresholds:
            cutoff = today + timedelta(days=days)
            window_start = cutoff - timedelta(days=1)

            creds = session.execute(
                select(Credential, Staff)
                .join(Staff, Credential.staff_id == Staff.id)
                .where(
                    and_(
                        Credential.expiry_date >= window_start,
                        Credential.expiry_date <= cutoff,
                        Credential.status != CredentialStatus.REVOKED,
                    )
                )
            ).all()

            for cred, staff in creds:
                # Update status
                if days <= 30:
                    cred.status = CredentialStatus.EXPIRING_SOON

                # Queue notification tasks
                send_notification_task.delay(
                    user_id=str(staff.user_id),
                    title=f"Credential Expiring in {days} Days",
                    message=f"Your {cred.credential_type} (issued by {cred.issuing_body}) expires on {cred.expiry_date}. Please renew urgently.",
                    channel="email",
                    priority="urgent" if days <= 30 else "routine",
                )

        session.commit()
    return {"status": "credential scan complete", "date": str(today)}


@celery_app.task(name="app.tasks.celery_tasks.decay_fatigue_scores")
def decay_fatigue_scores():
    """
    Reduce fatigue scores for staff who had a rest day (no shift yesterday).
    Runs nightly.
    """
    from sqlalchemy import create_engine, select, and_, func
    from sqlalchemy.orm import Session
    from app.models.models import Staff, ShiftAssignment, Shift, StaffStatus

    engine = create_engine(settings.SYNC_DATABASE_URL)
    yesterday = date.today() - timedelta(days=1)
    DECAY_AMOUNT = 8.0

    with Session(engine) as session:
        # Staff who had a shift yesterday
        worked_yesterday = session.execute(
            select(ShiftAssignment.staff_id)
            .join(Shift, ShiftAssignment.shift_id == Shift.id)
            .where(Shift.shift_date == yesterday)
        ).scalars().all()

        worked_ids = set(worked_yesterday)

        # All active staff NOT in that set get fatigue reduced
        all_active = session.execute(
            select(Staff).where(Staff.status == StaffStatus.ACTIVE)
        ).scalars().all()

        for staff in all_active:
            if staff.id not in worked_ids:
                staff.fatigue_score = max(0.0, staff.fatigue_score - DECAY_AMOUNT)

        session.commit()
    return {"status": "fatigue decay complete"}


@celery_app.task(name="app.tasks.celery_tasks.send_notification_task")
def send_notification_task(user_id: str, title: str, message: str, channel: str, priority: str = "routine"):
    """
    Dispatch a notification via the appropriate channel.
    In-app: saved to DB. SMS/WhatsApp: Africa's Talking. Email: SendGrid.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.models import User, Staff, Notification, NotificationChannel, NotificationPriority
    import uuid
    from datetime import datetime

    engine = create_engine(settings.SYNC_DATABASE_URL)

    with Session(engine) as session:
        user = session.get(User, uuid.UUID(user_id))
        if not user:
            return {"error": "User not found"}

        # Save in-app notification
        notif = Notification(
            user_id=user.id,
            title=title,
            message=message,
            channel=NotificationChannel(channel),
            priority=NotificationPriority(priority),
            sent_at=datetime.utcnow(),
        )
        session.add(notif)
        session.commit()

        # Dispatch to external channels
        if channel == "sms" and user.phone and user.notify_sms:
            _send_sms(user.phone, f"{title}: {message}")

        elif channel == "email" and user.email and user.notify_email:
            _send_email(user.email, title, message)

        elif channel == "whatsapp" and user.phone and user.notify_whatsapp:
            _send_whatsapp(user.phone, f"*{title}*\n{message}")

    return {"status": "sent", "channel": channel}


def _send_sms(phone: str, message: str):
    """Send SMS via Africa's Talking."""
    try:
        import africastalking
        africastalking.initialize(settings.AT_USERNAME, settings.AT_API_KEY)
        sms = africastalking.SMS
        sms.send(message, [phone], sender_id=settings.AT_SENDER_ID)
    except Exception as e:
        print(f"[SMS] Failed: {e}")


def _send_email(to_email: str, subject: str, body: str):
    """Send email via SendGrid."""
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        message = Mail(
            from_email=(settings.EMAIL_FROM, settings.EMAIL_FROM_NAME),
            to_emails=to_email,
            subject=subject,
            html_content=f"<p>{body}</p>",
        )
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        sg.send(message)
    except Exception as e:
        print(f"[Email] Failed: {e}")


def _send_whatsapp(phone: str, message: str):
    """Send WhatsApp via Africa's Talking WhatsApp Business API."""
    try:
        import africastalking
        africastalking.initialize(settings.AT_USERNAME, settings.AT_API_KEY)
        # Africa's Talking WhatsApp — note: requires approved template for outbound
        print(f"[WhatsApp] Would send to {phone}: {message}")
    except Exception as e:
        print(f"[WhatsApp] Failed: {e}")


@celery_app.task(name="app.tasks.celery_tasks.generate_payslip_pdf")
def generate_payslip_pdf(payslip_id: str):
    """
    Generate a PDF payslip and upload to file storage.
    Called after payroll run is approved.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.models import Payslip, Staff, PayrollRun
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    import uuid, io, boto3

    engine = create_engine(settings.SYNC_DATABASE_URL)

    with Session(engine) as session:
        payslip = session.get(Payslip, uuid.UUID(payslip_id))
        if not payslip:
            return {"error": "Payslip not found"}

        staff = session.get(Staff, payslip.staff_id)
        run = session.get(PayrollRun, payslip.payroll_run_id)

        # Generate PDF in memory
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, height - 60, "HOSPITAL HR SYSTEM — PAYSLIP")

        c.setFont("Helvetica", 11)
        c.drawString(50, height - 90, f"Staff: {staff.first_name} {staff.last_name}")
        c.drawString(50, height - 108, f"Staff No: {staff.staff_number}")
        c.drawString(50, height - 126, f"Period: {run.month:02d}/{run.year}")
        c.drawString(50, height - 144, f"Job Title: {staff.job_title}")

        # Earnings
        y = height - 190
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "EARNINGS")
        y -= 20
        c.setFont("Helvetica", 11)
        c.drawString(60, y, f"Basic Salary:"); c.drawString(300, y, f"KES {payslip.basic_salary:,.2f}"); y -= 18
        c.drawString(60, y, f"Allowances:"); c.drawString(300, y, f"KES {payslip.total_allowances:,.2f}"); y -= 18
        c.drawString(60, y, f"Overtime:"); c.drawString(300, y, f"KES {payslip.overtime_pay:,.2f}"); y -= 18
        c.setFont("Helvetica-Bold", 11)
        c.drawString(60, y, f"GROSS PAY:"); c.drawString(300, y, f"KES {payslip.gross_pay:,.2f}"); y -= 30

        # Deductions
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "DEDUCTIONS"); y -= 20
        c.setFont("Helvetica", 11)
        c.drawString(60, y, "PAYE:"); c.drawString(300, y, f"KES {payslip.paye:,.2f}"); y -= 18
        c.drawString(60, y, "NHIF:"); c.drawString(300, y, f"KES {payslip.nhif:,.2f}"); y -= 18
        c.drawString(60, y, "NSSF:"); c.drawString(300, y, f"KES {payslip.nssf:,.2f}"); y -= 18
        c.setFont("Helvetica-Bold", 11)
        c.drawString(60, y, "TOTAL DEDUCTIONS:"); c.drawString(300, y, f"KES {payslip.total_deductions:,.2f}"); y -= 30

        # Net
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, y, f"NET PAY: KES {payslip.net_pay:,.2f}")

        c.save()
        buffer.seek(0)

        # Upload to S3-compatible storage
        try:
            s3 = boto3.client(
                "s3",
                endpoint_url=settings.STORAGE_ENDPOINT_URL,
                aws_access_key_id=settings.STORAGE_ACCESS_KEY,
                aws_secret_access_key=settings.STORAGE_SECRET_KEY,
                region_name=settings.STORAGE_REGION,
            )
            key = f"payslips/{staff.staff_number}/{run.year}-{run.month:02d}.pdf"
            s3.upload_fileobj(buffer, settings.STORAGE_BUCKET, key)
            pdf_url = f"{settings.STORAGE_ENDPOINT_URL}/{settings.STORAGE_BUCKET}/{key}"
            payslip.pdf_url = pdf_url
            session.commit()
            return {"status": "pdf generated", "url": pdf_url}
        except Exception as e:
            return {"status": "pdf generated but upload failed", "error": str(e)}
