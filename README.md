# 🏥 Hospital HR System

Multi-branch, clinical-grade hospital human resource management system.
Full-stack monorepo — FastAPI backend + React frontend, deploy-ready for Render.

---

## Repository Structure

```
hospital-hr/
├── backend/          # FastAPI API, Celery workers, Alembic migrations
├── frontend/         # React + Vite + Tailwind CSS SPA
├── render.yaml       # One-click Render deployment config
└── .gitignore
```

---

## Stack

| Layer | Technology |
|---|---|
| API | FastAPI + Uvicorn |
| Database | PostgreSQL + SQLAlchemy (async) + Alembic |
| Queue | Redis + Celery + Celery Beat |
| Frontend | React 18 + Vite + Tailwind CSS |
| Charts | Recharts |
| AI | Gemini → OpenAI → Groq (fallback chain) |
| Notifications | Africa's Talking (SMS/WhatsApp) + SendGrid (Email) |
| File Storage | S3-compatible (Backblaze B2 / AWS S3) |
| Monitoring | Sentry |
| Deployment | Render (IaC via render.yaml) |

---

## Quick Start (Local)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env              # fill in your credentials
alembic upgrade head              # run migrations
python scripts/seed.py            # optional: seed demo data

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Set VITE_API_URL=http://localhost:8000/api/v1

npm run dev                       # runs on http://localhost:3000
```

### Celery (separate terminals)

```bash
# Worker
celery -A app.tasks.celery_tasks.celery_app worker --loglevel=info

# Scheduler
celery -A app.tasks.celery_tasks.celery_app beat --loglevel=info
```

---

## Deploy to Render

1. Push this repository to GitHub.
2. In Render dashboard → **New** → **Blueprint** → connect your repo.
3. Render reads `render.yaml` at the root and auto-creates:
   - `hospital-hr-api` — FastAPI web service (runs `alembic upgrade head` on every deploy)
   - `hospital-hr-worker` — Celery worker
   - `hospital-hr-beat` — Celery beat scheduler
   - `hospital-hr-frontend` — Static React site
   - `hospital-hr-db` — PostgreSQL database
   - `hospital-hr-redis` — Redis instance
4. Set the **manual secret** env vars (marked `sync: false`) in the Render dashboard:
   - `GEMINI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `AT_USERNAME` / `AT_API_KEY`
   - `SENDGRID_API_KEY`
   - `SENTRY_DSN` *(optional)*
5. Update `ALLOWED_ORIGINS` in `render.yaml` if your frontend URL differs from the default.

> **Note:** The frontend's `VITE_API_URL` is automatically wired to the backend host via
> Render's service-to-service `fromService` reference in `render.yaml`.

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

## API Modules

| Module | Key Endpoints |
|---|---|
| Auth | Login, Refresh, Logout, Change Password, Me |
| Branches | CRUD |
| Departments | CRUD |
| Staff | Onboard, List, Profile, Transfer, Offboard |
| Credentials | Add, Verify, Expiring Soon, Compliance Report |
| Leave | Apply, Approve (Dept/HR), Balance, Calendar |
| Scheduling | Shifts, Assign, Rota, Gaps, Swap, Attendance |
| Payroll | Run, Approve, Payslips, Allowances |
| Notifications | Inbox, Mark Read, Send, Broadcast |
| Analytics | Workforce, Turnover, Absenteeism, Cost, Compliance |
| AI Services | Schedule Suggest, CV Parse, Wellness Analyse, NL Leave |

---

## Kenya Statutory Deductions

| Deduction | Calculation |
|---|---|
| PAYE | Progressive bands: 10%/25%/30%/35%, less KES 2,400 relief |
| NHIF | Tiered by gross (KES 150–1,700/month) |
| NSSF | 6% Tier I + 6% Tier II |

---

## Background Jobs

| Task | Schedule | Purpose |
|---|---|---|
| `scan_expiring_credentials` | Daily 6 AM EAT | Alerts for credentials expiring in 30/60/90 days |
| `decay_fatigue_scores` | Daily midnight | Reduces fatigue for rested staff |
| `generate_payslip_pdf` | On demand | PDF generation + S3 upload after payroll approval |
| `send_notification_task` | On demand | SMS / Email / WhatsApp dispatch |
