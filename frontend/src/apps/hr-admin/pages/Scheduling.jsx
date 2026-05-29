import { useState, useCallback } from 'react'
import { scheduleAPI, departmentAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { useAuth } from '../../../shared/context/AuthContext'
import { SectionHeader, PageLoader, EmptyState, Modal } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { CalendarDays, AlertTriangle, Plus, Users, Clock, List } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfWeek, addDays } from 'date-fns'

const SHIFT_TYPES = ['morning','afternoon','night','on_call']
const SHIFT_COLORS = {
  morning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  afternoon: 'bg-brand-500/10 border-brand-500/30 text-brand-300',
  night: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
  on_call: 'bg-red-500/10 border-red-500/30 text-red-300',
}

export default function SchedulingPage() {
  const { user } = useAuth()
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [createModal, setCreateModal] = useState(false)
  const [form, setForm] = useState({ department_id: '', shift_type: 'morning', shift_date: format(new Date(), 'yyyy-MM-dd'), start_time: '07:00', end_time: '15:00', min_staff: 2 })
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState('rota') // 'rota' | 'list'

  const { data: departments } = useAsync(
    useCallback(() => departmentAPI.list(user?.branch_id), [user?.branch_id])
  )

  const [selectedDept, setSelectedDept] = useState('')
  const deptId = selectedDept || departments?.[0]?.id

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd')

  const { data: rota, loading: rotaLoad, execute: refetchRota } = useAsync(
    useCallback(
      () => deptId ? scheduleAPI.rota(deptId, weekStartStr) : Promise.resolve({ data: null }),
      [deptId, weekStartStr]
    )
  )

  // List all shifts for this dept/week — used in the List tab
  const { data: shiftList, loading: listLoad, execute: refetchList } = useAsync(
    useCallback(
      () => deptId
        ? scheduleAPI.listShifts(deptId, weekStartStr, weekEndStr)
        : Promise.resolve({ data: null }),
      [deptId, weekStartStr, weekEndStr]
    )
  )

  const { data: gaps } = useAsync(
    useCallback(
      () => deptId ? scheduleAPI.gaps(deptId, weekStartStr, weekEndStr) : Promise.resolve({ data: null }),
      [deptId, weekStartStr, weekEndStr]
    )
  )

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const handleCreate = async () => {
    if (!form.department_id || !form.shift_date) return toast.error('Fill all required fields')
    setCreating(true)
    try {
      await scheduleAPI.createShift(form)
      toast.success('Shift created')
      setCreateModal(false)
      refetchRota()
      refetchList()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create shift')
    } finally { setCreating(false) }
  }

  const prevWeek = () => setWeekStart(d => addDays(d, -7))
  const nextWeek = () => setWeekStart(d => addDays(d, 7))

  const SHIFT_TYPE_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night', on_call: 'On-Call' }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Scheduling"
        subtitle="Weekly rota, gaps and shift management"
        action={
          <button onClick={() => setCreateModal(true)} className="btn-primary">
            <Plus size={15} /> Create Shift
          </button>
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="input w-52">
          <option value="">Select department</option>
          {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('rota')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'rota' ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-white'}`}
          >
            <CalendarDays size={12} className="inline mr-1" /> Rota View
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${activeTab === 'list' ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-white'}`}
          >
            <List size={12} className="inline mr-1" /> Shifts List
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={prevWeek} className="btn-secondary py-2 px-3">←</button>
          <span className="text-sm text-text-secondary">
            {format(weekStart, 'dd MMM')} – {format(addDays(weekStart, 6), 'dd MMM yyyy')}
          </span>
          <button onClick={nextWeek} className="btn-secondary py-2 px-3">→</button>
        </div>
      </div>

      {/* Gaps alert */}
      {gaps?.total_gaps > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <AlertTriangle size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <span className="font-semibold">{gaps.total_gaps} understaffed shift{gaps.total_gaps > 1 ? 's' : ''}</span> this week — immediate action needed
          </p>
        </div>
      )}

      {/* ── ROTA TAB ── */}
      {activeTab === 'rota' && (
        !deptId ? (
          <EmptyState icon={CalendarDays} title="Select a department" message="Choose a department to view its rota" />
        ) : rotaLoad ? <PageLoader /> : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-surface-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-text-secondary uppercase tracking-wide w-28">Day</th>
                    {['Morning','Afternoon','Night','On-Call'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-text-secondary uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekDays.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd')
                    const dayShifts = rota?.shifts?.filter(s => s.date === dayStr) || []
                    const byType = Object.fromEntries(SHIFT_TYPES.map(t => [t, dayShifts.find(s => s.shift_type === t)]))
                    return (
                      <tr key={dayStr} className="border-t border-surface-700 hover:bg-surface-700/30">
                        <td className="px-4 py-3">
                          <p className="font-medium text-white text-xs">{format(day, 'EEE')}</p>
                          <p className="text-text-muted text-xs">{format(day, 'dd MMM')}</p>
                        </td>
                        {SHIFT_TYPES.map(type => {
                          const shift = byType[type]
                          return (
                            <td key={type} className="px-3 py-3">
                              {shift ? (
                                <div className={`p-2 rounded-lg border text-xs ${SHIFT_COLORS[type]} ${shift.is_understaffed ? 'ring-1 ring-red-500' : ''}`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono">{shift.start_time}–{shift.end_time}</span>
                                    {shift.is_understaffed && <AlertTriangle size={10} className="text-red-400" />}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Users size={10} />
                                    <span>{shift.assigned_count}/{shift.min_staff}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-text-muted text-xs text-center">—</div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── LIST TAB ── */}
      {activeTab === 'list' && (
        !deptId ? (
          <EmptyState icon={List} title="Select a department" message="Choose a department to view its shifts" />
        ) : listLoad ? <PageLoader /> : !shiftList?.shifts?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="No shifts this week"
            message="Create a shift to get started"
            action={<button onClick={() => setCreateModal(true)} className="btn-primary"><Plus size={14} /> Create Shift</button>}
          />
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Time</th>
                    <th>Min Staff</th>
                    <th>Assigned</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftList.shifts.map(s => (
                    <tr key={s.shift_id}>
                      <td className="font-medium text-white">{s.date}</td>
                      <td>
                        <span className={`badge text-xs px-2 py-0.5 rounded-full ${SHIFT_COLORS[s.shift_type] || 'badge-gray'}`}>
                          {SHIFT_TYPE_LABELS[s.shift_type] || s.shift_type}
                        </span>
                      </td>
                      <td className="font-mono text-sm">{s.start_time} – {s.end_time}</td>
                      <td className="text-center">{s.min_staff}</td>
                      <td className="text-center">
                        <span className={s.assigned_count < s.min_staff ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
                          {s.assigned_count}
                        </span>
                      </td>
                      <td>
                        {s.is_understaffed
                          ? <span className="badge bg-red-500/10 text-red-400 border-red-500/30 text-xs">Understaffed</span>
                          : <span className="badge bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">OK</span>
                        }
                      </td>
                      <td className="text-text-muted text-xs">{s.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Create shift modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Shift" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Department <span className="text-red-400">*</span></label>
            <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} className="input">
              <option value="">Select department</option>
              {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Shift Type</label>
              <select value={form.shift_type} onChange={e => setForm(f => ({ ...f, shift_type: e.target.value }))} className="input">
                {SHIFT_TYPES.map(t => <option key={t} value={t} className="capitalize">{SHIFT_TYPE_LABELS[t] || t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date <span className="text-red-400">*</span></label>
              <input type="date" value={form.shift_date} onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Start Time</label>
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">End Time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Min Staff Required</label>
            <input type="number" min={1} value={form.min_staff} onChange={e => setForm(f => ({ ...f, min_staff: Number(e.target.value) }))} className="input" />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button onClick={() => setCreateModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : <><Plus size={14} /> Create Shift</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
