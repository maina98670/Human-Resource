import { useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '../../../shared/hooks'
import { staffAPI, credentialAPI } from '../../../shared/services/api'
import { PageLoader, Avatar, Badge } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { LogOut, Shield, Phone, Mail, MapPin, Briefcase, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StaffProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Get staff linked to current user — in real app you'd have /staff/me
  const { data: credentials, loading: credLoad } = useAsync(
    useCallback(() => user?.id ? credentialAPI.list(user.id) : Promise.resolve({ data: [] }), [user?.id])
  )

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const INFO = [
    { icon: Mail, label: 'Email', value: user?.email },
    { icon: Briefcase, label: 'Role', value: user?.role?.replace(/_/g, ' ') },
  ]

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      {/* Profile header */}
      <div className="flex flex-col items-center py-4 gap-3">
        <Avatar name={user?.email || 'Staff'} size="lg" />
        <div className="text-center">
          <p className="font-display text-lg font-bold text-white capitalize">
            {user?.role?.replace(/_/g, ' ')}
          </p>
          <p className="text-text-secondary text-sm">{user?.email}</p>
        </div>
        <span className="badge badge-blue capitalize">{user?.role?.replace(/_/g, ' ')}</span>
      </div>

      {/* Info */}
      <div className="card space-y-4">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Account Info</p>
        {INFO.map(({ icon: Icon, label, value }) => value && (
          <div key={label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center shrink-0">
              <Icon size={14} className="text-brand-400" />
            </div>
            <div>
              <p className="text-xs text-text-muted">{label}</p>
              <p className="text-sm text-white capitalize">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Credentials */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
            <Shield size={12} /> My Credentials
          </p>
        </div>
        {credLoad ? <PageLoader /> : !credentials?.length ? (
          <p className="text-sm text-text-muted text-center py-3">No credentials on file</p>
        ) : (
          <div className="space-y-2.5">
            {credentials.map(c => (
              <div key={c.id} className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                  <Shield size={13} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">{c.credential_type}</p>
                    <span className={`badge ${status.credential(c.status)}`}>{c.status.replace(/_/g,' ')}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{c.issuing_body}</p>
                  {c.expiry_date && (
                    <p className="text-xs text-text-muted mt-0.5">Expires {fmt.date(c.expiry_date)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors">
          <LogOut size={17} />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  )
}
