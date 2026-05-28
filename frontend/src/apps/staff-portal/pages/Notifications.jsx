import { useCallback } from 'react'
import { notificationAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { PageLoader, EmptyState } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { Bell, CheckCheck, AlertTriangle, Info, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

const PRIORITY_ICONS = {
  emergency: <Zap size={14} className="text-red-400" />,
  urgent: <AlertTriangle size={14} className="text-amber-400" />,
  routine: <Info size={14} className="text-brand-400" />,
}
const PRIORITY_BORDERS = {
  emergency: 'border-red-500/30 bg-red-500/5',
  urgent: 'border-amber-500/30 bg-amber-500/5',
  routine: 'border-surface-600',
}

export default function StaffNotificationsPage() {
  const { data: notifications, loading, execute: refetch } = useAsync(
    useCallback(() => notificationAPI.list(), [])
  )

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllRead()
      toast.success('All marked as read')
      refetch()
    } catch { toast.error('Failed') }
  }

  const markRead = async (id) => {
    try {
      await notificationAPI.markRead(id)
      refetch()
    } catch {}
  }

  const unread = notifications?.filter(n => !n.is_read) || []

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Notifications</h1>
          {unread.length > 0 && (
            <p className="text-xs text-text-secondary mt-0.5">{unread.length} unread</p>
          )}
        </div>
        {unread.length > 0 && (
          <button onClick={markAllRead} className="btn-ghost py-1.5 text-xs">
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {loading ? <PageLoader /> : !notifications?.length ? (
        <EmptyState icon={Bell} title="All caught up" message="No notifications yet" />
      ) : (
        <div className="space-y-2.5">
          {notifications.map(n => (
            <div key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`flex gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${PRIORITY_BORDERS[n.priority]} ${!n.is_read ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-9 h-9 rounded-xl bg-surface-700 flex items-center justify-center shrink-0 mt-0.5">
                {PRIORITY_ICONS[n.priority]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${!n.is_read ? 'text-white' : 'text-text-secondary'}`}>
                    {n.title}
                  </p>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
                </div>
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-xs text-text-muted mt-1">{fmt.ago(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
