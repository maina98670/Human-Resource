import { useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { analyticsAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { SectionHeader, PageLoader } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

const TT = {
  contentStyle: { background: '#0f1923', border: '1px solid #263548', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#7a92a8' }, itemStyle: { color: '#14adb5' },
}
const COLORS = ['#14adb5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const { user } = useAuth()
  const branchId = user?.branch_id
  const now = new Date()

  const { data: overview } = useAsync(useCallback(() => analyticsAPI.workforceOverview(branchId), [branchId]))
  const { data: turnover } = useAsync(useCallback(() => analyticsAPI.turnover(branchId, now.getFullYear()), [branchId]))
  const { data: absenteeism } = useAsync(useCallback(() => analyticsAPI.absenteeism(branchId, now.getMonth() + 1, now.getFullYear()), [branchId]))
  const { data: payrollCost } = useAsync(useCallback(() => analyticsAPI.payrollCost(branchId, now.getFullYear(), now.getMonth() + 1), [branchId]))
  const { data: ratios } = useAsync(useCallback(() => analyticsAPI.staffingRatios(branchId), [branchId]))

  const categoryData = overview ? Object.entries(overview.by_category || {}).map(([k,v]) => ({ name: k, value: v })) : []
  const monthlyExits = turnover ? Object.entries(turnover.monthly_exits || {}).map(([m,v]) => ({ month: `M${m}`, exits: v })) : []
  const absentData = (absenteeism?.departments || []).slice(0, 8).map(d => ({
    name: d.department_id.slice(0, 8), rate: d.absenteeism_rate_percent,
  }))
  const deptCostData = (payrollCost?.by_department || []).slice(0, 6).map(d => ({
    name: d.department_id.slice(0, 8),
    gross: Math.round(d.total_gross / 1000),
    net: Math.round(d.total_net / 1000),
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader title="Analytics" subtitle="Workforce intelligence and reporting" />

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Active', value: fmt.number(overview?.total_active_staff), color: 'brand-400' },
          { label: 'Turnover Rate', value: fmt.percent(turnover?.turnover_rate_percent), color: 'amber-400' },
          { label: 'Staff Exited', value: turnover?.staff_exited || 0, color: 'red-400' },
          { label: 'Monthly Payroll', value: fmt.currency(payrollCost?.total_gross_payroll), color: 'emerald-400' },
        ].map(s => (
          <div key={s.label} className="card-sm">
            <p className="text-xs text-text-secondary uppercase tracking-wide">{s.label}</p>
            <p className={`font-display text-xl font-bold mt-1 text-${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff by category */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-4">Staff by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip {...TT} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly exits */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-4">Monthly Exits {turnover?.year}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyExits}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" />
              <XAxis dataKey="month" tick={{ fill: '#7a92a8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7a92a8', fontSize: 11 }} />
              <Tooltip {...TT} />
              <Line type="monotone" dataKey="exits" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Absenteeism */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-4">Absenteeism by Dept (%)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={absentData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" />
              <XAxis type="number" tick={{ fill: '#7a92a8', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#7a92a8', fontSize: 10 }} width={70} />
              <Tooltip {...TT} />
              <Bar dataKey="rate" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payroll cost */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-4">Payroll Cost by Dept (KES '000)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptCostData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" />
              <XAxis dataKey="name" tick={{ fill: '#7a92a8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#7a92a8', fontSize: 10 }} />
              <Tooltip {...TT} />
              <Bar dataKey="gross" fill="#14adb5" radius={[4,4,0,0]} name="Gross" />
              <Bar dataKey="net" fill="#10b981" radius={[4,4,0,0]} name="Net" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Staffing ratios */}
      {ratios?.departments?.length > 0 && (
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-5">Staffing Ratios</h3>
          <div className="space-y-3">
            {ratios.departments.map(d => (
              <div key={d.department_id} className="flex items-center gap-4">
                <span className="w-36 text-sm text-text-secondary truncate">{d.department_name}</span>
                <div className="flex-1 bg-surface-700 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (d.actual_active_staff / (d.required_per_shift || 1)) * 100)}%`,
                      background: d.is_understaffed ? '#ef4444' : '#10b981',
                    }} />
                </div>
                <span className={`text-xs font-semibold w-20 text-right ${d.is_understaffed ? 'text-red-400' : 'text-emerald-400'}`}>
                  {d.actual_active_staff}/{d.required_per_shift} {d.is_understaffed ? '⚠' : '✓'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
