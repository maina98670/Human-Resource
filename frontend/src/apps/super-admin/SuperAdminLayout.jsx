import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/context/AuthContext'
import { Avatar } from '../../shared/components'
import {
  Activity, LayoutDashboard, Building2, Users, BarChart3,
  Bell, Settings, LogOut, ChevronDown, Globe, Shield, Menu, X
} from 'lucide-react'

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/super-admin' },
  { label: 'Branches', icon: Building2, to: '/super-admin/branches' },
  { label: 'All Staff', icon: Users, to: '/super-admin/staff' },
  { label: 'Analytics', icon: BarChart3, to: '/super-admin/analytics' },
  { label: 'Compliance', icon: Shield, to: '/super-admin/compliance' },
  { label: 'Notifications', icon: Bell, to: '/super-admin/notifications' },
]

export default function SuperAdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <div className="flex h-screen bg-surface-900 overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-surface-800 border-r border-surface-600 flex flex-col
        transition-transform duration-300 lg:translate-x-0 lg:static
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-600">
          <div className="w-9 h-9 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
            <Activity size={18} className="text-brand-400" />
          </div>
          <div>
            <p className="font-display font-bold text-white text-sm">Hospital HR</p>
            <p className="text-xs text-text-muted flex items-center gap-1">
              <Globe size={10} /> Chain Admin
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} end={to === '/super-admin'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-surface-600">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-700">
            <Avatar name="Super Admin" size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Super Admin</p>
              <p className="text-xs text-text-muted truncate">{user?.email || 'Chain Level'}</p>
            </div>
            <button onClick={handleLogout} className="text-text-muted hover:text-red-400 transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-surface-600 bg-surface-800">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden btn-ghost p-1.5">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="badge badge-blue text-xs">Super Admin</span>
            <span className="text-xs text-text-muted">Chain Level Access</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
