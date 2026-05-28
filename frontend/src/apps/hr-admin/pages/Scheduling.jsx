import { useState, useCallback } from 'react'
import { scheduleAPI, departmentAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { useAuth } from '../../../shared/context/AuthContext'
import { SectionHeader, PageLoader, EmptyState, Modal } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { CalendarDays, AlertTriangle, Plus, Users, Clock } from 'lucide-react'
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
  const [form, setForm] = useState({ department_id: '', shift_type: 'morning', shift_date: '', start_time: '07:00', end_time: '15:00', min_staff: 2 })
  const [creating, setCreating] = useState(false)

  const { data: departments } = useAsync(
    useCallback(() => departmentAPI.list(user?.branch_id), [user?.branch_id])
  )

  const [selectedDept, setSelectedDept] = useState('')
  const deptId = selectedDept || departments?.[0]?.id

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const { data: rota, loading: rotaLoad, execute: refetchRota } = useAsync(
    useCallback(() => deptId ? scheduleAPI.rota(deptId, weekStartStr) : Promise.resolve({ data: null }), [deptId, weekStartStr])
  )
  const { data: gaps, loading: gapLoad } = useAsync(
    useCallback(() => deptId ? scheduleAPI.gaps(deptId, weekStartStr, format(addDays(weekStart, 6), 'yyyy-MM-dd')) : Promise.resolve({ data: null }), [deptId, weekStartStr])
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
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed')
    } finally { setCreating(false) }
  }

  const prevWeek = () => setWeekStart(d => addDays(d, -7))
  const nextWeek = () => setWeekStart(d => addDays(d, 7))

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

      {/* Rota grid */}
      {!deptId ? (
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
      )}

      {/* Create shift modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Shift" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Department</label>
            <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} className="input">
              <option value="">Select department</option>
              {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Shift Type</label>
              <select value={form.shift_type} onChange={e => setForm(f => ({ ...f, shift_type: e.target.value }))} className="input">
                {SHIFT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
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
