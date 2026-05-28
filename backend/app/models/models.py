"""
Hospital HR System — Database Models
All tables in one file for clarity; split by module as system grows.
"""

import uuid
from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    String, Boolean, Integer, Float, Date, DateTime, Text,
    ForeignKey, Enum, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.database import Base


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    HOSPITAL_ADMIN = "hospital_admin"
    HR_ADMIN = "hr_admin"
    FINANCE_ADMIN = "finance_admin"
    DEPARTMENT_HEAD = "department_head"
    SHIFT_SUPERVISOR = "shift_supervisor"
    CLINICAL_STAFF = "clinical_staff"
    ADMIN_STAFF = "admin_staff"
    SUPPORT_STAFF = "support_staff"
    LOCUM = "locum"
    SYSTEM_ADMIN = "system_admin"


class EmploymentType(str, enum.Enum):
    PERMANENT = "permanent"
    CONTRACT = "contract"
    LOCUM = "locum"
    AGENCY = "agency"
    INTERN = "intern"
    VOLUNTEER = "volunteer"


class StaffCategory(str, enum.Enum):
    CLINICAL = "clinical"
    ADMINISTRATIVE = "administrative"
    SUPPORT = "support"


class ClinicalSubRole(str, enum.Enum):
    DOCTOR = "doctor"
    NURSE = "nurse"
    PHARMACIST = "pharmacist"
    LAB_TECHNICIAN = "lab_technician"
    RADIOLOGIST = "radiologist"
    PHYSIOTHERAPIST = "physiotherapist"
    NUTRITIONIST = "nutritionist"
    OTHER = "other"


class ShiftType(str, enum.Enum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    NIGHT = "night"
    ON_CALL = "on_call"
    CUSTOM = "custom"


class LeaveType(str, enum.Enum):
    ANNUAL = "annual"
    SICK = "sick"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    COMPASSIONATE = "compassionate"
    STUDY = "study"
    UNPAID = "unpaid"


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED_BY_HEAD = "approved_by_head"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class CredentialStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"
    PENDING_VERIFICATION = "pending_verification"
    REVOKED = "revoked"


class StaffStatus(str, enum.Enum):
    ACTIVE = "active"
    ON_LEAVE = "on_leave"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"
    RESIGNED = "resigned"


class NotificationChannel(str, enum.Enum):
    IN_APP = "in_app"
    SMS = "sms"
    EMAIL = "email"
    WHATSAPP = "whatsapp"


class NotificationPriority(str, enum.Enum):
    ROUTINE = "routine"
    URGENT = "urgent"
    EMERGENCY = "emergency"


class PayrollStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    DISBURSED = "disbursed"


# ─────────────────────────────────────────────
# BRANCH & DEPARTMENT
# ─────────────────────────────────────────────

class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # e.g. NBI-001
    address: Mapped[str] = mapped_column(Text)
    city: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20))
    email: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    departments: Mapped[list["Department"]] = relationship("Department", back_populates="branch")
    staff: Mapped[list["Staff"]] = relationship("Staff", back_populates="branch")
    payroll_runs: Mapped[list["PayrollRun"]] = relationship("PayrollRun", back_populates="branch")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[StaffCategory] = mapped_column(Enum(StaffCategory), nullable=False)
    min_staff_per_shift: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    branch: Mapped["Branch"] = relationship("Branch", back_populates="departments")
    staff: Mapped[list["Staff"]] = relationship("Staff", back_populates="department")
    shifts: Mapped[list["Shift"]] = relationship("Shift", back_populates="department")

    __table_args__ = (UniqueConstraint("branch_id", "code", name="uq_dept_code_per_branch"),)


# ─────────────────────────────────────────────
# USERS & AUTH
# ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(300), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(500), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)

    # Scoping: null = chain-level access (super admin)
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Notification preferences
    notify_in_app: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_sms: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False)

    staff: Mapped[Optional["Staff"]] = relationship("Staff", back_populates="user", uselist=False)
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")


# ─────────────────────────────────────────────
# STAFF
# ─────────────────────────────────────────────

class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)

    # Identity
    staff_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[Optional[str]] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(String(20))
    national_id: Mapped[str] = mapped_column(String(50), unique=True)
    kra_pin: Mapped[Optional[str]] = mapped_column(String(20))
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))

    # Contact
    personal_phone: Mapped[str] = mapped_column(String(20))
    personal_email: Mapped[Optional[str]] = mapped_column(String(200))
    address: Mapped[Optional[str]] = mapped_column(Text)

    # Emergency contact
    emergency_name: Mapped[Optional[str]] = mapped_column(String(200))
    emergency_phone: Mapped[Optional[str]] = mapped_column(String(20))
    emergency_relationship: Mapped[Optional[str]] = mapped_column(String(100))

    # Employment
    category: Mapped[StaffCategory] = mapped_column(Enum(StaffCategory), nullable=False)
    clinical_sub_role: Mapped[Optional[ClinicalSubRole]] = mapped_column(Enum(ClinicalSubRole))
    employment_type: Mapped[EmploymentType] = mapped_column(Enum(EmploymentType), nullable=False)
    job_title: Mapped[str] = mapped_column(String(200), nullable=False)
    job_grade: Mapped[Optional[str]] = mapped_column(String(50))
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    contract_end_date: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[StaffStatus] = mapped_column(Enum(StaffStatus), default=StaffStatus.ACTIVE)
    exit_date: Mapped[Optional[date]] = mapped_column(Date)
    exit_reason: Mapped[Optional[str]] = mapped_column(Text)

    # Bank details for payroll
    bank_name: Mapped[Optional[str]] = mapped_column(String(100))
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(50))
    bank_branch: Mapped[Optional[str]] = mapped_column(String(100))
    mpesa_number: Mapped[Optional[str]] = mapped_column(String(20))

    # Fatigue tracking
    fatigue_score: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="staff")
    branch: Mapped["Branch"] = relationship("Branch", back_populates="staff")
    department: Mapped["Department"] = relationship("Department", back_populates="staff")
    credentials: Mapped[list["Credential"]] = relationship("Credential", back_populates="staff")
    leave_requests: Mapped[list["LeaveRequest"]] = relationship("LeaveRequest", back_populates="staff")
    leave_balances: Mapped[list["LeaveBalance"]] = relationship("LeaveBalance", back_populates="staff")
    shift_assignments: Mapped[list["ShiftAssignment"]] = relationship("ShiftAssignment", back_populates="staff")
    payslips: Mapped[list["Payslip"]] = relationship("Payslip", back_populates="staff")
    allowances: Mapped[list["StaffAllowance"]] = relationship("StaffAllowance", back_populates="staff")
    transfer_history: Mapped[list["TransferRecord"]] = relationship("TransferRecord", back_populates="staff")
    wellness_checkins: Mapped[list["WellnessCheckin"]] = relationship("WellnessCheckin", back_populates="staff")

    __table_args__ = (Index("ix_staff_branch_dept", "branch_id", "department_id"),)


class TransferRecord(Base):
    __tablename__ = "transfer_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    from_branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    to_branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    from_department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    to_department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    approved_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="transfer_history")


# ─────────────────────────────────────────────
# CREDENTIALS
# ─────────────────────────────────────────────

class Credential(Base):
    __tablename__ = "credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    credential_type: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "Medical License", "BLS"
    issuing_body: Mapped[str] = mapped_column(String(200))                     # e.g. "Kenya Medical Board"
    registration_number: Mapped[str] = mapped_column(String(100))
    issue_date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)                  # null = no expiry
    document_url: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[CredentialStatus] = mapped_column(Enum(CredentialStatus), default=CredentialStatus.PENDING_VERIFICATION)
    verified_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="credentials")


# ─────────────────────────────────────────────
# SCHEDULING
# ─────────────────────────────────────────────

class ShiftTemplate(Base):
    __tablename__ = "shift_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    shift_type: Mapped[ShiftType] = mapped_column(Enum(ShiftType), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)   # "07:00"
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)     # "15:00"
    min_staff: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("shift_templates.id"))
    shift_type: Mapped[ShiftType] = mapped_column(Enum(ShiftType), nullable=False)
    shift_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    min_staff: Mapped[int] = mapped_column(Integer, default=1)
    is_emergency: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped["Department"] = relationship("Department", back_populates="shifts")
    assignments: Mapped[list["ShiftAssignment"]] = relationship("ShiftAssignment", back_populates="shift")

    __table_args__ = (Index("ix_shift_dept_date", "department_id", "shift_date"),)


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shift_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    checked_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    attendance_status: Mapped[str] = mapped_column(String(20), default="scheduled")  # present/absent/late
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    shift: Mapped["Shift"] = relationship("Shift", back_populates="assignments")
    staff: Mapped["Staff"] = relationship("Staff", back_populates="shift_assignments")

    __table_args__ = (UniqueConstraint("shift_id", "staff_id", name="uq_shift_staff"),)


class ShiftSwapRequest(Base):
    __tablename__ = "shift_swap_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    requester_shift_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False)
    target_shift_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/accepted/rejected/approved
    reason: Mapped[Optional[str]] = mapped_column(Text)
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# LEAVE
# ─────────────────────────────────────────────

class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    leave_type: Mapped[LeaveType] = mapped_column(Enum(LeaveType), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    entitled_days: Mapped[float] = mapped_column(Float, default=0.0)
    used_days: Mapped[float] = mapped_column(Float, default=0.0)
    carried_over: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="leave_balances")

    __table_args__ = (UniqueConstraint("staff_id", "leave_type", "year", name="uq_leave_balance"),)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    leave_type: Mapped[LeaveType] = mapped_column(Enum(LeaveType), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_requested: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    supporting_document_url: Mapped[Optional[str]] = mapped_column(String(500))
    handover_notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[LeaveStatus] = mapped_column(Enum(LeaveStatus), default=LeaveStatus.PENDING)

    # Approval chain
    dept_head_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    dept_head_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    dept_head_comment: Mapped[Optional[str]] = mapped_column(Text)

    hr_admin_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    hr_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    hr_comment: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="leave_requests")


# ─────────────────────────────────────────────
# PAYROLL
# ─────────────────────────────────────────────

class StaffAllowance(Base):
    __tablename__ = "staff_allowances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    allowance_name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "Night Allowance"
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    is_taxable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=True)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="allowances")


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    total_gross: Mapped[float] = mapped_column(Float, default=0.0)
    total_deductions: Mapped[float] = mapped_column(Float, default=0.0)
    total_net: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[PayrollStatus] = mapped_column(Enum(PayrollStatus), default=PayrollStatus.DRAFT)
    run_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    disbursed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    branch: Mapped["Branch"] = relationship("Branch", back_populates="payroll_runs")
    payslips: Mapped[list["Payslip"]] = relationship("Payslip", back_populates="payroll_run")

    __table_args__ = (UniqueConstraint("branch_id", "month", "year", name="uq_payroll_run"),)


class Payslip(Base):
    __tablename__ = "payslips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=False)

    basic_salary: Mapped[float] = mapped_column(Float, default=0.0)
    total_allowances: Mapped[float] = mapped_column(Float, default=0.0)
    overtime_pay: Mapped[float] = mapped_column(Float, default=0.0)
    gross_pay: Mapped[float] = mapped_column(Float, default=0.0)

    # Kenya statutory deductions
    paye: Mapped[float] = mapped_column(Float, default=0.0)
    nhif: Mapped[float] = mapped_column(Float, default=0.0)
    nssf: Mapped[float] = mapped_column(Float, default=0.0)
    other_deductions: Mapped[float] = mapped_column(Float, default=0.0)
    total_deductions: Mapped[float] = mapped_column(Float, default=0.0)

    net_pay: Mapped[float] = mapped_column(Float, default=0.0)

    # Detailed breakdown stored as JSON
    allowances_breakdown: Mapped[Optional[dict]] = mapped_column(JSON)
    deductions_breakdown: Mapped[Optional[dict]] = mapped_column(JSON)

    pdf_url: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="payslips")
    payroll_run: Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="payslips")


# ─────────────────────────────────────────────
# NOTIFICATIONS
# ─────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[NotificationChannel] = mapped_column(Enum(NotificationChannel), nullable=False)
    priority: Mapped[NotificationPriority] = mapped_column(Enum(NotificationPriority), default=NotificationPriority.ROUTINE)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    meta: Mapped[Optional[dict]] = mapped_column(JSON)  # extra context e.g. leave_request_id
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="notifications")

    __table_args__ = (Index("ix_notification_user_read", "user_id", "is_read"),)


# ─────────────────────────────────────────────
# WELLNESS
# ─────────────────────────────────────────────

class WellnessCheckin(Base):
    __tablename__ = "wellness_checkins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id"), nullable=False)
    energy_level: Mapped[int] = mapped_column(Integer)        # 1–5
    stress_level: Mapped[int] = mapped_column(Integer)        # 1–5
    mood: Mapped[str] = mapped_column(String(50))             # good/neutral/poor
    free_text: Mapped[Optional[str]] = mapped_column(Text)    # anonymous optional note
    ai_sentiment_score: Mapped[Optional[float]] = mapped_column(Float)
    burnout_risk: Mapped[str] = mapped_column(String(20), default="low")  # low/medium/high
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="wellness_checkins")


# ─────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(200), nullable=False)   # e.g. "LEAVE_APPROVED"
    resource: Mapped[str] = mapped_column(String(100))                 # e.g. "leave_request"
    resource_id: Mapped[Optional[str]] = mapped_column(String(100))
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    ip_address: Mapped[Optional[str]] = mapped_column(String(50))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    before_state: Mapped[Optional[dict]] = mapped_column(JSON)
    after_state: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")

    __table_args__ = (Index("ix_audit_user_action", "user_id", "action"),)
