# 🏥 Hospital HR System — Frontend

Three React apps in one codebase, sharing components, hooks, and services.

## Apps

| App | URL | Users |
|---|---|---|
| **Super Admin** | `/super-admin` | Chain CEO, Group HR Director |
| **HR Admin** | `/hr-admin` | HR Manager, Finance, Dept Heads, Supervisors |
| **Staff Portal** | `/staff` | Nurses, Doctors, Support, Locums |

## Stack
- React 18 + React Router 6
- Tailwind CSS — custom dark design system
- Recharts — analytics charts
- Axios — API client with auto token refresh
- React Hot Toast — notifications
- Lucide React — icons
- Google Fonts: Syne (display) + DM Sans (body)

## Quick Start

```bash
npm install
cp .env.example .env
# set VITE_API_URL to your backend URL
npm run dev
```

Visit `http://localhost:3000`

## Login → Auto Route
The login page reads the `role` from the JWT response and routes automatically:
- `super_admin` → `/super-admin`
- `hr_admin`, `finance_admin`, `department_head` → `/hr-admin`
- `clinical_staff`, `support_staff`, `locum` → `/staff`

## Design System
All design tokens are in `src/index.css` as Tailwind classes + CSS variables.
Colors: deep teal-slate primary, warm amber accent, dark surface backgrounds.
Fonts: Syne for headings, DM Sans for body, JetBrains Mono for code/numbers.

## Folder Structure
```
src/
├── apps/
│   ├── LoginPage.jsx
│   ├── super-admin/       — Chain-level admin portal
│   ├── hr-admin/          — Branch HR operations portal
│   └── staff-portal/      — Mobile-first employee self-service
└── shared/
    ├── components/        — Modal, StatCard, Avatar, Table, etc.
    ├── context/           — AuthContext (JWT + role state)
    ├── hooks/             — useAsync, useDebounce, usePagination
    ├── services/          — api.js (all API calls)
    └── utils/             — fmt, status, role helpers
```

## Deploy to Render
```bash
# Static site
Build Command: npm install && npm run build
Publish Directory: dist
Environment: VITE_API_URL=https://your-backend.onrender.com/api/v1
```
