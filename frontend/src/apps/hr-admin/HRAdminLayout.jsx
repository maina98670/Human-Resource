import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/context/AuthContext'
import { Avatar } from '../../shared/components'
import {
  Activity, LayoutDashboard, Users, CalendarDays, CreditCard,
  Shield, Bell, BarChart3, LogOut, Brain, ChevronRight,
  UserPlus, ClipboardList, Menu, Building
} from 'lucide-react'

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/hr-admin' },
  { label: 'Staff', icon: Users, to: '/hr-admin/staff' },
  { label: 'Onboarding', icon: UserPlus, to: '/hr-admin/onboarding' },
  { label: 'Leave', icon: CalendarDays, to: '/hr-admin/leave' },
  { label: 'Scheduling', icon: ClipboardList, to: '/hr-admin/scheduling' },
  { label: 'Payroll', icon: CreditCard, to: '/hr-admin/payroll' },
  { label: 'Credentials', icon: Shield, to: '/hr-admin/credentials' },
  { label: 'Analytics', icon: BarChart3, to: '/hr-admin/analytics' },
  { label: 'AI Tools', icon: Brain, to: '/hr-admin/ai-tools' },
  { label: 'Notifications', icon: Bell, to: '/hr-admin/notifications' },
]

export default function HRAdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <div className="flex h-screen bg-surface-900 overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-surface-800 border-r border-surface-600 flex flex-col
        transition-transform duration-300 lg:translate-x-0 lg:static
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-600">
          <div className="w-9 h-9 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
            <Activity size={18} className="text-brand-400" />
          </div>
          <div>
            <p className="font-display font-bold text-white text-sm">Hospital HR</p>
            <p className="text-xs text-text-muted">HR Administration</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} end={to === '/hr-admin'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}>
              <Icon size={16} />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-surface-600">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-700">
            <Avatar name={user?.email || 'HR'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate capitalize">{user?.role?.replace('_', ' ')}</p>
              <p className="text-xs text-text-muted truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="text-text-muted hover:text-red-400 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-surface-600 bg-surface-800">
          <button onClick={() => setOpen(true)} className="lg:hidden btn-ghost p-1.5">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <span className="badge badge-green text-xs capitalize">{user?.role?.replace(/_/g, ' ')}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
