import { useState, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { useAsync } from '../../../shared/hooks'
import { leaveAPI, aiAPI, staffAPI } from '../../../shared/services/api'
import { PageLoader, Modal } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { CalendarDays, CreditCard, Shield, Activity, ChevronRight, Smile, Meh, Frown, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

function WellnessCheckin({ staffId }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ energy_level: 3, stress_level: 3, mood: 'good', free_text: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      await aiAPI.analyseWellness({ staff_id: staffId, ...form })
      setDone(true)
      toast.success('Wellness check-in submitted')
      setTimeout(() => { setOpen(false); setDone(false) }, 1500)
    } catch { toast.error('Submission failed') }
    finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full p-4 rounded-xl bg-gradient-to-r from-brand-600/20 to-brand-700/10 border border-brand-500/30 text-left hover:border-brand-500/50 transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Daily Wellness Check-in</p>
            <p className="text-xs text-text-secondary mt-0.5">How are you feeling today?</p>
          </div>
          <Activity size={20} className="text-brand-400" />
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Wellness Check-in" size="sm">
        {done ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
              <Smile size={28} className="text-emerald-400" />
            </div>
            <p className="font-semibold text-white">Thank you!</p>
            <p className="text-sm text-text-secondary mt-1">Your check-in has been recorded.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="label">Energy Level</label>
              <div className="flex gap-2 mt-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setForm(f => ({ ...f, energy_level: n }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      form.energy_level === n ? 'bg-brand-600 text-white' : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
                    }`}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Stress Level</label>
              <div className="flex gap-2 mt-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setForm(f => ({ ...f, stress_level: n }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      form.stress_level === n
                        ? n >= 4 ? 'bg-red-600 text-white' : 'bg-brand-600 text-white'
                        : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
                    }`}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Overall Mood</label>
              <div className="flex gap-2 mt-2">
                {[['good', <Smile size={18} />,'text-emerald-400'], ['neutral', <Meh size={18} />,'text-amber-400'], ['poor', <Frown size={18} />,'text-red-400']].map(([val, icon, col]) => (
                  <button key={val} onClick={() => setForm(f => ({ ...f, mood: val }))}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all capitalize ${
                      form.mood === val ? 'bg-surface-600 border border-brand-500 text-white' : 'bg-surface-700 text-text-secondary'
                    }`}>
                    <span className={col}>{icon}</span>{val}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Optional Note</label>
              <textarea value={form.free_text} onChange={e => setForm(f => ({ ...f, free_text: e.target.value }))}
                className="input resize-none" rows={2} placeholder="Anything you'd like to share anonymously..." />
            </div>
            <button onClick={submit} disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Submitting...' : <><Send size={14} /> Submit Check-in</>}
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}

export default function StaffHome() {
  const { user } = useAuth()
  const { data: requests, loading } = useAsync(useCallback(() => leaveAPI.myRequests(), []))
  const pending = requests?.filter(r => ['pending','approved_by_head'].includes(r.status)) || []
  const upcoming = requests?.filter(r => r.status === 'approved' && new Date(r.start_date) >= new Date()) || []

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      {/* Greeting */}
      <div className="pt-2">
        <h1 className="font-display text-2xl font-bold text-white">{greeting} 👋</h1>
        <p className="text-text-secondary text-sm mt-1">{fmt.date(today.toISOString())}</p>
      </div>

      {/* Wellness */}
      <WellnessCheckin staffId={user?.id} />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Apply Leave', icon: CalendarDays, to: '/staff/leave', color: 'brand' },
          { label: 'My Payslips', icon: CreditCard, to: '/staff/payslips', color: 'green' },
          { label: 'Credentials', icon: Shield, to: '/staff/credentials', color: 'amber' },
          { label: 'My Profile', icon: Activity, to: '/staff/profile', color: 'blue' },
        ].map(a => (
          <Link key={a.to} to={a.to}
            className="card-sm flex items-center gap-3 hover:border-brand-500/30 transition-colors">
            <div className={`w-9 h-9 rounded-xl bg-${a.color === 'brand' ? 'brand' : a.color}-500/10 flex items-center justify-center shrink-0`}>
              <a.icon size={17} className={`text-${a.color === 'brand' ? 'brand' : a.color}-400`} />
            </div>
            <span className="text-sm font-medium text-white">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Pending leave */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Pending Leave Requests</p>
          {pending.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-800 rounded-xl border border-surface-600">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <CalendarDays size={16} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white capitalize">{r.leave_type.replace('_',' ')} Leave</p>
                <p className="text-xs text-text-muted">{fmt.date(r.start_date)} – {fmt.date(r.end_date)}</p>
              </div>
              <span className="badge badge-amber text-xs">{r.status.replace(/_/g,' ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming approved leave */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Upcoming Approved Leave</p>
          {upcoming.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-800 rounded-xl border border-emerald-500/20">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CalendarDays size={16} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white capitalize">{r.leave_type.replace('_',' ')} Leave</p>
                <p className="text-xs text-text-muted">{fmt.date(r.start_date)} – {fmt.date(r.end_date)} · {r.days_requested} days</p>
              </div>
              <span className="badge badge-green text-xs">Approved</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
