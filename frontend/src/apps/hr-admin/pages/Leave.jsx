import { useState, useCallback } from 'react'
import { leaveAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { SectionHeader, PageLoader, EmptyState, Modal, Badge } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { CalendarDays, CheckCircle, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LeavePage() {
  const [tab, setTab] = useState('pending')
  const [approvalModal, setApprovalModal] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // In real app, you'd fetch all requests for HR to review
  // Here we show a demo with my-requests for the logged-in HR
  const { data: requests, loading, execute: refetch } = useAsync(
    useCallback(() => leaveAPI.myRequests(), [])
  )

  const pending = requests?.filter(r => r.status === 'pending') || []
  const approved = requests?.filter(r => r.status === 'approved') || []
  const all = requests || []

  const filtered = tab === 'pending' ? pending : tab === 'approved' ? approved : all

  const handleApprove = async (approved) => {
    setSubmitting(true)
    try {
      await leaveAPI.hrApprove(approvalModal.id, { approved, comment })
      toast.success(approved ? 'Leave approved' : 'Leave rejected')
      setApprovalModal(null)
      setComment('')
      refetch()
    } catch {
      toast.error('Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Leave Management"
        subtitle="Review and approve staff leave requests"
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl w-fit border border-surface-600">
        {[
          { key: 'pending', label: 'Pending', count: pending.length },
          { key: 'approved', label: 'Approved', count: approved.length },
          { key: 'all', label: 'All Requests', count: all.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              tab === t.key ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-white'
            }`}>
            {t.label}
            {t.count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              tab === t.key ? 'bg-white/20' : 'bg-surface-600'
            }`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Review', value: pending.length, color: 'amber' },
          { label: 'Approved This Year', value: approved.length, color: 'green' },
          { label: 'Total Requests', value: all.length, color: 'brand' },
        ].map(s => (
          <div key={s.label} className="card-sm">
            <p className="text-xs text-text-secondary uppercase tracking-wide">{s.label}</p>
            <p className={`font-display text-2xl font-bold mt-1 text-${s.color}-400`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Requests list */}
      {loading ? <PageLoader /> : filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No requests" message="Nothing to show in this category" />
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="card-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center">
                <CalendarDays size={18} className="text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white capitalize">
                    {r.leave_type.replace('_', ' ')} Leave
                  </span>
                  <span className={`badge ${status.leave(r.status)}`}>{r.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">
                  {fmt.date(r.start_date)} → {fmt.date(r.end_date)} · {r.days_requested} days
                </p>
                {r.reason && <p className="text-xs text-text-muted mt-0.5 truncate">"{r.reason}"</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-text-muted">{fmt.ago(r.created_at)}</span>
                {r.status === 'approved_by_head' && (
                  <button onClick={() => setApprovalModal(r)} className="btn-primary py-1.5 text-xs">
                    Review
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval modal */}
      <Modal open={!!approvalModal} onClose={() => setApprovalModal(null)} title="Review Leave Request" size="sm">
        {approvalModal && (
          <div className="space-y-4">
            <div className="p-4 bg-surface-700 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Leave Type</span>
                <span className="text-white capitalize">{approvalModal.leave_type.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Dates</span>
                <span className="text-white">{fmt.date(approvalModal.start_date)} – {fmt.date(approvalModal.end_date)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Days</span>
                <span className="text-white">{approvalModal.days_requested}</span>
              </div>
              {approvalModal.reason && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Reason</span>
                  <span className="text-white text-right max-w-40">{approvalModal.reason}</span>
                </div>
              )}
            </div>
            <div>
              <label className="label">Comment (optional)</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                className="input resize-none" rows={2} placeholder="Add a comment..." />
            </div>
            <div className="flex gap-3">
              <button disabled={submitting} onClick={() => handleApprove(false)}
                className="btn-danger flex-1 justify-center">
                <XCircle size={15} /> Reject
              </button>
              <button disabled={submitting} onClick={() => handleApprove(true)}
                className="btn-primary flex-1 justify-center">
                <CheckCircle size={15} /> Approve
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
