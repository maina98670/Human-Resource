import { useState, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { leaveAPI, aiAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { PageLoader, Modal } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { CalendarDays, Zap, Plus, X, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const LEAVE_TYPES = ['annual','sick','maternity','paternity','compassionate','study','unpaid']

export default function StaffLeavePage() {
  const { user } = useAuth()
  const [applyModal, setApplyModal] = useState(false)
  const [nlInput, setNlInput] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })

  const { data: requests, loading: reqLoading, execute: refetch } = useAsync(
    useCallback(() => leaveAPI.myRequests(new Date().getFullYear()), [])
  )
  const { data: balances, loading: balLoading } = useAsync(
    useCallback(() => user?.id ? leaveAPI.balance(user.id, new Date().getFullYear()) : Promise.resolve({ data: [] }), [user?.id])
  )

  const parseWithAI = async () => {
    if (!nlInput.trim()) return
    setNlLoading(true)
    try {
      const { data } = await aiAPI.parseLeave(nlInput)
      if (data.parsed?.error) return toast.error('Could not parse dates — try being more specific')
      const p = data.parsed
      setForm(f => ({
        ...f,
        leave_type: p.leave_type || f.leave_type,
        start_date: p.start_date || f.start_date,
        end_date: p.end_date || f.end_date,
        reason: p.reason || f.reason,
      }))
      toast.success(`Parsed via ${data.provider}`)
    } catch { toast.error('AI parse failed') }
    finally { setNlLoading(false) }
  }

  const submit = async () => {
    if (!form.start_date || !form.end_date) return toast.error('Select start and end dates')
    setSubmitting(true)
    try {
      await leaveAPI.apply(form)
      toast.success('Leave request submitted!')
      setApplyModal(false)
      setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })
      setNlInput('')
      refetch()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed')
    } finally { setSubmitting(false) }
  }

  const cancelRequest = async (id) => {
    try {
      await leaveAPI.cancel(id)
      toast.success('Request cancelled')
      refetch()
    } catch { toast.error('Cancel failed') }
  }

  return (
    <div className="p-5 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Leave</h1>
          <p className="text-text-secondary text-xs mt-0.5">Manage your time off</p>
        </div>
        <button onClick={() => setApplyModal(true)} className="btn-primary py-2">
          <Plus size={15} /> Apply
        </button>
      </div>

      {/* Leave balances */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
          {new Date().getFullYear()} Balances
        </p>
        {balLoading ? <PageLoader /> : (
          <div className="grid grid-cols-2 gap-3">
            {(balances || []).map(b => (
              <div key={b.leave_type} className="card-sm">
                <p className="text-xs text-text-muted capitalize">{b.leave_type.replace('_',' ')} Leave</p>
                <div className="flex items-end justify-between mt-2">
                  <p className="font-display text-2xl font-bold text-white">{b.available_days}</p>
                  <p className="text-xs text-text-muted mb-0.5">of {b.entitled_days} days</p>
                </div>
                <div className="mt-2 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((b.entitled_days - b.available_days) / b.entitled_days) * 100)}%` }} />
                </div>
                <p className="text-xs text-text-muted mt-1">{b.used_days} used</p>
              </div>
            ))}
            {!balances?.length && (
              <div className="col-span-2 text-center py-6 text-text-muted text-sm">
                No leave balances set yet. Contact HR.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request history */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">My Requests</p>
        {reqLoading ? <PageLoader /> : !requests?.length ? (
          <div className="text-center py-8 text-text-muted text-sm">No requests yet this year</div>
        ) : (
          <div className="space-y-2.5">
            {requests.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-3.5 bg-surface-800 rounded-xl border border-surface-600">
                <div className="w-9 h-9 rounded-xl bg-surface-700 flex items-center justify-center shrink-0 mt-0.5">
                  <CalendarDays size={16} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white capitalize">
                      {r.leave_type.replace('_',' ')} Leave
                    </span>
                    <span className={`badge ${status.leave(r.status)}`}>
                      {r.status.replace(/_/g,' ')}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    {fmt.date(r.start_date)} – {fmt.date(r.end_date)} · {r.days_requested} days
                  </p>
                  {r.reason && <p className="text-xs text-text-muted mt-0.5 truncate">"{r.reason}"</p>}
                </div>
                {r.status === 'pending' && (
                  <button onClick={() => cancelRequest(r.id)}
                    className="text-text-muted hover:text-red-400 transition-colors mt-1">
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Apply modal */}
      <Modal open={applyModal} onClose={() => setApplyModal(false)} title="Apply for Leave" size="sm">
        <div className="space-y-4">
          {/* AI natural language input */}
          <div className="p-3 bg-brand-500/5 border border-brand-500/20 rounded-xl space-y-2">
            <p className="text-xs font-semibold text-brand-400 flex items-center gap-1.5">
              <Zap size={12} /> AI Quick Fill
            </p>
            <div className="flex gap-2">
              <input value={nlInput} onChange={e => setNlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && parseWithAI()}
                placeholder='e.g. "I need Monday and Tuesday next week off"'
                className="input flex-1 text-xs py-2" />
              <button onClick={parseWithAI} disabled={nlLoading || !nlInput}
                className="btn-primary py-2 px-3 text-xs">
                {nlLoading ? '...' : 'Parse'}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Leave Type</label>
            <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))} className="input">
              {LEAVE_TYPES.map(t => (
                <option key={t} value={t} className="capitalize">{t.replace('_',' ')} Leave</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="input resize-none" rows={2} placeholder="Brief reason for leave..." />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setApplyModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={submit} disabled={submitting} className="btn-primary flex-1 justify-center">
              {submitting ? 'Submitting...' : <><CheckCircle size={14} /> Submit</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
