import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './shared/context/AuthContext'

// Login
import LoginPage from './apps/LoginPage'

// Super Admin
import SuperAdminLayout from './apps/super-admin/SuperAdminLayout'
import SuperAdminDashboard from './apps/super-admin/pages/Dashboard'

// HR Admin
import HRAdminLayout from './apps/hr-admin/HRAdminLayout'
import HRAdminDashboard from './apps/hr-admin/pages/Dashboard'
import StaffPage from './apps/hr-admin/pages/Staff'
import OnboardingPage from './apps/hr-admin/pages/Onboarding'
import LeavePage from './apps/hr-admin/pages/Leave'
import SchedulingPage from './apps/hr-admin/pages/Scheduling'
import PayrollPage from './apps/hr-admin/pages/Payroll'
import CredentialsPage from './apps/hr-admin/pages/Credentials'
import AnalyticsPage from './apps/hr-admin/pages/Analytics'
import AIToolsPage from './apps/hr-admin/pages/AITools'
import HRNotificationsPage from './apps/hr-admin/pages/Notifications'

// Staff Portal
import StaffPortalLayout from './apps/staff-portal/StaffPortalLayout'
import StaffHome from './apps/staff-portal/pages/Home'
import StaffLeavePage from './apps/staff-portal/pages/Leave'
import StaffPayslipsPage from './apps/staff-portal/pages/Payslips'
import StaffNotificationsPage from './apps/staff-portal/pages/Notifications'
import StaffProfilePage from './apps/staff-portal/pages/Profile'

import { PageLoader } from './shared/components'

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function RequireAuth({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to correct portal
    const portals = {
      super_admin: '/super-admin',
      hospital_admin: '/hr-admin',
      hr_admin: '/hr-admin',
      finance_admin: '/hr-admin',
      department_head: '/hr-admin',
      shift_supervisor: '/hr-admin',
      clinical_staff: '/staff',
      admin_staff: '/staff',
      support_staff: '/staff',
      locum: '/staff',
    }
    return <Navigate to={portals[user.role] || '/staff'} replace />
  }
  return children
}

const SUPER_ADMIN_ROLES = ['super_admin']
const HR_ROLES = ['super_admin','hospital_admin','hr_admin','finance_admin','department_head','shift_supervisor']
const STAFF_ROLES = ['clinical_staff','admin_staff','support_staff','locum']

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Root redirect */}
      <Route path="/" element={
        user ? <Navigate to={
          user.role === 'super_admin' ? '/super-admin' :
          STAFF_ROLES.includes(user.role) ? '/staff' : '/hr-admin'
        } replace /> : <Navigate to="/login" replace />
      } />

      {/* Super Admin */}
      <Route path="/super-admin" element={
        <RequireAuth allowedRoles={SUPER_ADMIN_ROLES}>
          <SuperAdminLayout />
        </RequireAuth>
      }>
        <Route index element={<SuperAdminDashboard />} />
        <Route path="branches" element={<div className="text-white p-4">Branches management — coming soon</div>} />
        <Route path="staff" element={<div className="text-white p-4">All staff view — coming soon</div>} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="compliance" element={<CredentialsPage />} />
        <Route path="notifications" element={<HRNotificationsPage />} />
      </Route>

      {/* HR Admin */}
      <Route path="/hr-admin" element={
        <RequireAuth allowedRoles={HR_ROLES}>
          <HRAdminLayout />
        </RequireAuth>
      }>
        <Route index element={<HRAdminDashboard />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="scheduling" element={<SchedulingPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="credentials" element={<CredentialsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="ai-tools" element={<AIToolsPage />} />
        <Route path="notifications" element={<HRNotificationsPage />} />
      </Route>

      {/* Staff Portal */}
      <Route path="/staff" element={
        <RequireAuth allowedRoles={[...STAFF_ROLES, ...HR_ROLES, 'super_admin']}>
          <StaffPortalLayout />
        </RequireAuth>
      }>
        <Route index element={<StaffHome />} />
        <Route path="leave" element={<StaffLeavePage />} />
        <Route path="payslips" element={<StaffPayslipsPage />} />
        <Route path="notifications" element={<StaffNotificationsPage />} />
        <Route path="profile" element={<StaffProfilePage />} />
        <Route path="credentials" element={<StaffProfilePage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0f1923',
              color: '#e8edf2',
              border: '1px solid #263548',
              borderRadius: '10px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#0f1923' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#0f1923' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
