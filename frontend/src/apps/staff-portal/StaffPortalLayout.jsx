import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/context/AuthContext'
import { LayoutDashboard, CalendarDays, CreditCard, Bell, User } from 'lucide-react'

const NAV = [
  { label: 'Home', icon: LayoutDashboard, to: '/staff' },
  { label: 'Leave', icon: CalendarDays, to: '/staff/leave' },
  { label: 'Payslips', icon: CreditCard, to: '/staff/payslips' },
  { label: 'Alerts', icon: Bell, to: '/staff/notifications' },
  { label: 'Profile', icon: User, to: '/staff/profile' },
]

export default function StaffPortalLayout() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col min-h-screen bg-surface-900 max-w-lg mx-auto">
      {/* Topbar */}
      <header className="px-5 py-4 border-b border-surface-600 bg-surface-800 flex items-center justify-between sticky top-0 z-30">
        <div>
          <p className="font-display font-bold text-white text-base">Hospital HR</p>
          <p className="text-xs text-text-muted capitalize">{user?.role?.replace(/_/g, ' ')}</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
          <User size={16} className="text-brand-400" />
        </div>
      </header>

      {/* Page */}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-surface-800 border-t border-surface-600 flex items-center justify-around px-2 py-2 z-30">
        {NAV.map(({ label, icon: Icon, to }) => (
          <NavLink key={to} to={to} end={to === '/staff'}
            className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
              isActive ? 'text-brand-400' : 'text-text-muted hover:text-white'
            }`}>
            {({ isActive }) => (
              <>
                <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-brand-600/20' : ''}`}>
                  <Icon size={18} />
                </div>
                <span className="text-xs font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
