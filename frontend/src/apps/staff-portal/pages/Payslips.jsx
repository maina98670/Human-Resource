import { useState, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { payrollAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { PageLoader } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { CreditCard, Download, ChevronDown, ChevronUp } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function PayslipCard({ staffId, year, month }) {
  const [expanded, setExpanded] = useState(false)
  const { data, loading, execute: load } = useAsync(
    useCallback(() => payrollAPI.payslip(staffId, year, month), [staffId, year, month]),
    false
  )

  const toggle = () => {
    setExpanded(e => !e)
    if (!data && !loading) load()
  }

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between p-4 hover:bg-surface-700/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <CreditCard size={18} className="text-brand-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{MONTHS[month - 1]} {year}</p>
            <p className="text-xs text-text-secondary">Monthly Payslip</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && <span className="text-sm font-semibold text-emerald-400">{fmt.currency(data.net_pay)}</span>}
          {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-surface-600 p-4 space-y-4 animate-fade-in">
          {loading ? <PageLoader /> : !data ? (
            <p className="text-center text-text-muted text-sm py-4">No payslip found for this period</p>
          ) : (
            <>
              {/* Earnings */}
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Earnings</p>
                <div className="space-y-1.5">
                  {[
                    ['Basic Salary', data.basic_salary],
                    ['Allowances', data.total_allowances],
                    ['Overtime', data.overtime_pay],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-text-secondary">{label}</span>
                      <span className="text-white">{fmt.currency(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t border-surface-600 pt-2 mt-2">
                    <span className="text-white">Gross Pay</span>
                    <span className="text-brand-400">{fmt.currency(data.gross_pay)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Deductions</p>
                <div className="space-y-1.5">
                  {[
                    ['PAYE Tax', data.paye],
                    ['NHIF', data.nhif],
                    ['NSSF', data.nssf],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-text-secondary">{label}</span>
                      <span className="text-red-400">-{fmt.currency(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t border-surface-600 pt-2 mt-2">
                    <span className="text-text-secondary">Total Deductions</span>
                    <span className="text-red-400">-{fmt.currency(data.total_deductions)}</span>
                  </div>
                </div>
              </div>

              {/* Net */}
              <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <span className="font-semibold text-white">Net Pay</span>
                <span className="font-display text-xl font-bold text-emerald-400">{fmt.currency(data.net_pay)}</span>
              </div>

              {data.pdf_url && (
                <a href={data.pdf_url} target="_blank" rel="noreferrer" className="btn-secondary w-full justify-center">
                  <Download size={15} /> Download PDF
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function StaffPayslipsPage() {
  const { user } = useAuth()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  // Show last 6 months
  const periods = Array.from({ length: 6 }, (_, i) => {
    let m = currentMonth - i
    let y = currentYear
    if (m <= 0) { m += 12; y -= 1 }
    return { year: y, month: m }
  })

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div>
        <h1 className="font-display text-xl font-bold text-white">Payslips</h1>
        <p className="text-text-secondary text-xs mt-0.5">Last 6 months · tap to expand</p>
      </div>
      <div className="space-y-3">
        {periods.map(p => (
          <PayslipCard key={`${p.year}-${p.month}`} staffId={user?.id} year={p.year} month={p.month} />
        ))}
      </div>
    </div>
  )
}
