import { useState, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { payrollAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { SectionHeader, PageLoader, EmptyState, Modal } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { CreditCard, Play, CheckCircle, FileText, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

export default function PayrollPage() {
  const { user } = useAuth()
  const branchId = user?.branch_id
  const [running, setRunning] = useState(false)
  const [runModal, setRunModal] = useState(false)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())

  const { data: runs, loading, execute: refetch } = useAsync(
    useCallback(() => branchId ? payrollAPI.listRuns(branchId) : Promise.resolve({ data: [] }), [branchId])
  )

  const handleRun = async () => {
    setRunning(true)
    try {
      const res = await payrollAPI.run(branchId, year, month)
      toast.success(`Payroll run complete — ${res.data.staff_processed} staff processed`)
      setRunModal(false)
      refetch()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payroll run failed')
    } finally {
      setRunning(false)
    }
  }

  const handleApprove = async (runId) => {
    try {
      await payrollAPI.approve(runId, { approved: true })
      toast.success('Payroll approved')
      refetch()
    } catch {
      toast.error('Approval failed')
    }
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Payroll"
        subtitle="Monthly payroll runs with Kenya statutory deductions"
        action={
          <button onClick={() => setRunModal(true)} className="btn-primary">
            <Play size={15} /> Run Payroll
          </button>
        }
      />

      {/* Summary cards from latest run */}
      {runs?.[0] && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Gross', value: fmt.currency(runs[0].total_gross), color: 'brand' },
            { label: 'Total Deductions', value: fmt.currency(runs[0].total_deductions), color: 'red' },
            { label: 'Total Net Pay', value: fmt.currency(runs[0].total_net), color: 'green' },
          ].map(s => (
            <div key={s.label} className="card-sm">
              <p className="text-xs text-text-secondary uppercase tracking-wide">{s.label}</p>
              <p className={`font-display text-xl font-bold mt-1 text-${s.color}-400`}>{s.value}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {months[runs[0].month - 1]} {runs[0].year}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Payroll runs table */}
      {loading ? <PageLoader /> : !runs?.length ? (
        <EmptyState icon={CreditCard} title="No payroll runs yet"
          message="Run your first payroll to get started"
          action={<button onClick={() => setRunModal(true)} className="btn-primary"><Play size={15} /> Run Payroll</button>} />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td className="font-medium text-white">{months[r.month - 1]} {r.year}</td>
                    <td className="text-brand-400 font-medium">{fmt.currency(r.total_gross)}</td>
                    <td className="text-red-400">{fmt.currency(r.total_deductions)}</td>
                    <td className="text-emerald-400 font-semibold">{fmt.currency(r.total_net)}</td>
                    <td><span className={`badge ${status.payroll(r.status)}`}>{r.status.replace(/_/g, ' ')}</span></td>
                    <td>
                      {r.status === 'pending_approval' ? (
                        <button onClick={() => handleApprove(r.id)} className="btn-primary py-1.5 text-xs">
                          <CheckCircle size={12} /> Approve
                        </button>
                      ) : (
                        <button className="btn-ghost py-1.5 text-xs">
                          <FileText size={12} /> View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Run modal */}
      <Modal open={runModal} onClose={() => setRunModal(false)} title="Run Monthly Payroll" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This will process payroll for all active permanent and contract staff in this branch,
            calculating PAYE, NHIF, and NSSF deductions automatically.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input">
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
                className="input" min={2020} max={2030} />
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-xs text-amber-400">
              ⚠ Payroll will be created as a draft. Finance must approve before disbursal.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setRunModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleRun} disabled={running} className="btn-primary">
              {running ? 'Processing...' : <><Play size={14} /> Run Payroll</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
