import { useCallback, useState } from 'react'
import { notificationAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { SectionHeader, PageLoader, EmptyState, Modal } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { Bell, Zap, CheckCheck, Send, AlertTriangle, Info } from 'lucide-react'
import toast from 'react-hot-toast'

const PRIORITY_STYLE = {
  emergency: 'border-red-500/30 bg-red-500/5',
  urgent: 'border-amber-500/30 bg-amber-500/5',
  routine: 'border-surface-600',
}
const PRIORITY_ICON = {
  emergency: <Zap size={14} className="text-red-400" />,
  urgent: <AlertTriangle size={14} className="text-amber-400" />,
  routine: <Info size={14} className="text-brand-400" />,
}

export default function HRNotificationsPage() {
  const [broadcastModal, setBroadcastModal] = useState(false)
  const [bForm, setBForm] = useState({ title: '', message: '', channel: 'in_app', priority: 'routine' })
  const [sending, setSending] = useState(false)

  const { data: notifications, loading, execute: refetch } = useAsync(
    useCallback(() => notificationAPI.list(), [])
  )

  const unread = notifications?.filter(n => !n.is_read) || []

  const markAllRead = async () => {
    try { await notificationAPI.markAllRead(); refetch(); toast.success('All marked as read') }
    catch { toast.error('Failed') }
  }

  const markRead = async (id) => {
    try { await notificationAPI.markRead(id); refetch() } catch {}
  }

  const sendBroadcast = async () => {
    if (!bForm.title || !bForm.message) return toast.error('Title and message required')
    setSending(true)
    try {
      const res = await notificationAPI.broadcast(bForm)
      toast.success(`Broadcast sent to ${res.data.recipients} staff`)
      setBroadcastModal(false)
      setBForm({ title: '', message: '', channel: 'in_app', priority: 'routine' })
    } catch { toast.error('Broadcast failed') }
    finally { setSending(false) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Notifications"
        subtitle={`${unread.length} unread`}
        action={
          <div className="flex gap-2">
            {unread.length > 0 && (
              <button onClick={markAllRead} className="btn-secondary">
                <CheckCheck size={15} /> Mark all read
              </button>
            )}
            <button onClick={() => setBroadcastModal(true)} className="btn-primary">
              <Send size={15} /> Broadcast
            </button>
          </div>
        }
      />

      {loading ? <PageLoader /> : !notifications?.length ? (
        <EmptyState icon={Bell} title="No notifications" message="Nothing to show yet" />
      ) : (
        <div className="space-y-2.5">
          {notifications.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              className={`flex gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-surface-700/40 ${PRIORITY_STYLE[n.priority]} ${!n.is_read ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-9 h-9 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
                {PRIORITY_ICON[n.priority]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 justify-between">
                  <p className={`text-sm font-semibold ${!n.is_read ? 'text-white' : 'text-text-secondary'}`}>{n.title}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                    <span className="text-xs text-text-muted">{fmt.ago(n.created_at)}</span>
                  </div>
                </div>
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="badge badge-gray">{n.channel}</span>
                  <span className={`badge ${n.priority === 'emergency' ? 'badge-red' : n.priority === 'urgent' ? 'badge-amber' : 'badge-gray'}`}>
                    {n.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast modal */}
      <Modal open={broadcastModal} onClose={() => setBroadcastModal(false)} title="Send Broadcast" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p className="text-xs text-amber-400">⚠ This will be sent to all active staff in your branch.</p>
          </div>
          <div>
            <label className="label">Title</label>
            <input value={bForm.title} onChange={e => setBForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. System Maintenance Tonight" className="input" />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea value={bForm.message} onChange={e => setBForm(f => ({ ...f, message: e.target.value }))}
              className="input resize-none" rows={3} placeholder="Write your message..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Channel</label>
              <select value={bForm.channel} onChange={e => setBForm(f => ({ ...f, channel: e.target.value }))} className="input">
                <option value="in_app">In-App</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select value={bForm.priority} onChange={e => setBForm(f => ({ ...f, priority: e.target.value }))} className="input">
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button onClick={() => setBroadcastModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={sendBroadcast} disabled={sending} className={`${bForm.priority === 'emergency' ? 'btn-danger' : 'btn-primary'}`}>
              {sending ? 'Sending...' : <><Send size={14} /> Send Broadcast</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
