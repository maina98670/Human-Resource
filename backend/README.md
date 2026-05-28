# 🏥 Hospital HR System — Backend

Multi-branch, clinical-grade hospital human resource management API built with FastAPI, PostgreSQL, Redis, and Celery.

---

## Stack
- **API**: FastAPI + Uvicorn
- **Database**: PostgreSQL + SQLAlchemy (async) + Alembic
- **Cache / Queue**: Redis + Celery + Celery Beat
- **AI**: Gemini (primary) → Claude/Anthropic (fallback)
- **Notifications**: Africa's Talking (SMS/WhatsApp) + SendGrid (Email)
- **File Storage**: S3-compatible (Backblaze B2)
- **Monitoring**: Sentry
- **Deployment**: Render

---

## Modules
| Module | Endpoints |
|---|---|
| Auth | Login, Refresh, Logout, Change Password, Me |
| Branches | Create, List, Get, Update |
| Departments | Create, List, Get, Update |
| Staff | Onboard, List, Profile, Update, Transfer, Offboard |
| Credentials | Add, Verify, Expiring Soon, Compliance Report |
| Leave | Apply, Approve (Dept/HR), Balance, Calendar |
| Scheduling | Shifts, Assign, Rota, Gaps, Swap, Attendance |
| Payroll | Run, Approve, Payslips, Allowances |
| Notifications | Inbox, Mark Read, Send, Broadcast |
| Analytics | Workforce, Turnover, Absenteeism, Cost, Compliance |
| AI Services | Scheduling Suggest, CV Parse, Wellness Analyse, NL Leave |

---

## Quick Start

### 1. Clone & install
```bash
git clone <repo>
cd hospital-hr-backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Database
```bash
# Run migrations
alembic upgrade head

# Seed initial data
python scripts/seed.py
```

### 4. Run locally
```bash
# API server
uvicorn app.main:app --reload --port 8000

# Celery worker (separate terminal)
celery -A app.tasks.celery_tasks.celery_app worker --loglevel=info

# Celery beat scheduler (separate terminal)
celery -A app.tasks.celery_tasks.celery_app beat --loglevel=info
```

### 5. API Docs
Visit: http://localhost:8000/docs

---

## Deploy to Render
```bash
# Push to GitHub, then connect repo to Render
# render.yaml handles all 3 services: API, Worker, Beat
```

---

## User Roles
| Role | Scope |
|---|---|
| `super_admin` | Full chain access |
| `hospital_admin` | Single branch full access |
| `hr_admin` | HR operations for branch |
| `finance_admin` | Payroll & cost analytics |
| `department_head` | Own department only |
| `shift_supervisor` | Active shift management |
| `clinical_staff` | Own profile, schedule, payslip |
| `admin_staff` | Own profile, schedule, payslip |
| `support_staff` | Own profile, schedule, payslip |
| `locum` | Assigned shifts, own credentials |

---

## Background Jobs (Celery)
| Task | Schedule | Purpose |
|---|---|---|
| `scan_expiring_credentials` | Daily 6AM EAT | Alerts for credentials expiring in 30/60/90 days |
| `decay_fatigue_scores` | Daily midnight | Reduces fatigue for staff who rested |
| `generate_payslip_pdf` | On demand | PDF generation + S3 upload after payroll approval |
| `send_notification_task` | On demand | SMS/Email/WhatsApp dispatch |

---

## Kenya Statutory Deductions
| Deduction | Calculation |
|---|---|
| PAYE | Progressive bands: 10%/25%/30%/35%, less KES 2,400 relief |
| NHIF | Tiered by gross (KES 150–1,700/month) |
| NSSF | 6% Tier I (up to KES 6,000) + 6% Tier II (up to KES 12,000) |
