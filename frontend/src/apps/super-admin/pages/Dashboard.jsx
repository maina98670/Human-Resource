import { useCallback } from 'react'
import { useAsync } from '../../../shared/hooks'
import { analyticsAPI, branchAPI } from '../../../shared/services/api'
import { StatCard, PageLoader, EmptyState } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import { Users, Building2, ShieldCheck, TrendingDown, AlertTriangle, Activity } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'

const TooltipStyle = {
  contentStyle: { background: '#0f1923', border: '1px solid #263548', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#7a92a8' },
  itemStyle: { color: '#14adb5' },
}

export default function SuperAdminDashboard() {
  const { data: overview, loading: l1 } = useAsync(useCallback(() => analyticsAPI.workforceOverview(), []))
  const { data: branches, loading: l2 } = useAsync(useCallback(() => branchAPI.list(), []))
  const { data: compliance, loading: l3 } = useAsync(useCallback(() => analyticsAPI.complianceOverview(), []))
  const { data: turnover, loading: l4 } = useAsync(useCallback(() => analyticsAPI.turnover(), []))

  if (l1 || l2) return <PageLoader />

  const categoryData = overview ? Object.entries(overview.by_category || {}).map(([k, v]) => ({ name: k, count: v })) : []
  const monthlyExits = turnover ? Object.entries(turnover.monthly_exits || {}).map(([m, v]) => ({ month: `M${m}`, exits: v })) : []

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Chain Overview</h1>
        <p className="text-text-secondary text-sm mt-1">Live across all branches · {fmt.date(new Date().toISOString())}</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Active Staff" value={fmt.number(overview?.total_active_staff)} icon={Users} accent="brand" />
        <StatCard label="Branches" value={branches?.length || 0} icon={Building2} accent="green" />
        <StatCard label="New Hires This Month" value={overview?.new_hires_this_month || 0} icon={Activity} accent="amber" />
        <StatCard label="Active Locums" value={overview?.locum_count || 0} icon={TrendingDown} accent="red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff by category */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-5">Staff by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" />
              <XAxis dataKey="name" tick={{ fill: '#7a92a8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7a92a8', fontSize: 11 }} />
              <Tooltip {...TooltipStyle} />
              <Bar dataKey="count" fill="#14adb5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly exits */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-5">Monthly Staff Exits ({turnover?.year})</h3>
          {monthlyExits.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyExits}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" />
                <XAxis dataKey="month" tick={{ fill: '#7a92a8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7a92a8', fontSize: 11 }} />
                <Tooltip {...TooltipStyle} />
                <Line type="monotone" dataKey="exits" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No exit data this year</div>
          )}
        </div>
      </div>

      {/* Compliance by branch */}
      <div className="card">
        <h3 className="font-display font-semibold text-white mb-5 flex items-center gap-2">
          <ShieldCheck size={18} className="text-brand-400" /> Credential Compliance by Branch
        </h3>
        {l3 ? <PageLoader /> : (
          <div className="space-y-3">
            {compliance?.branches?.map(b => (
              <div key={b.branch} className="flex items-center gap-4">
                <span className="w-40 text-sm text-text-secondary truncate">{b.branch}</span>
                <div className="flex-1 bg-surface-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${b.compliance_percentage}%`,
                      background: b.compliance_percentage > 80 ? '#10b981' : b.compliance_percentage > 60 ? '#f59e0b' : '#ef4444'
                    }}
                  />
                </div>
                <span className={`text-sm font-semibold w-12 text-right ${
                  b.compliance_percentage > 80 ? 'text-emerald-400' : b.compliance_percentage > 60 ? 'text-amber-400' : 'text-red-400'
                }`}>{fmt.percent(b.compliance_percentage)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Branches table */}
      <div className="card">
        <h3 className="font-display font-semibold text-white mb-5 flex items-center gap-2">
          <Building2 size={18} className="text-brand-400" /> All Branches
        </h3>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Branch</th><th>Code</th><th>City</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {branches?.map(b => (
                <tr key={b.id}>
                  <td className="font-medium text-white">{b.name}</td>
                  <td><span className="font-mono text-brand-400 text-xs">{b.code}</span></td>
                  <td className="text-text-secondary">{b.city}</td>
                  <td><span className={`badge ${b.is_active ? 'badge-green' : 'badge-red'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
