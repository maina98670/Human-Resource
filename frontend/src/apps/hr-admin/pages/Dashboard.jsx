import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { useAsync } from '../../../shared/hooks'
import { analyticsAPI, credentialAPI } from '../../../shared/services/api'
import { StatCard, PageLoader, Badge } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { Users, CalendarDays, Shield, AlertTriangle, TrendingUp, Activity, ChevronRight, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

const TooltipStyle = {
  contentStyle: { background: '#0f1923', border: '1px solid #263548', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#7a92a8' }, itemStyle: { color: '#14adb5' },
}
const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#14adb5']

export default function HRAdminDashboard() {
  const { user } = useAuth()
  const branchId = user?.branch_id

  const { data: overview, loading: l1 } = useAsync(useCallback(() => analyticsAPI.workforceOverview(branchId), [branchId]))
  const { data: ratios, loading: l2 } = useAsync(useCallback(() => analyticsAPI.staffingRatios(branchId), [branchId]))
  const { data: expiring, loading: l3 } = useAsync(useCallback(() => credentialAPI.expiring(30, branchId), [branchId]))
  const { data: wellbeing } = useAsync(useCallback(() => analyticsAPI.wellbeing(branchId), [branchId]))

  if (l1) return <PageLoader />

  const categoryData = overview ? Object.entries(overview.by_category || {}).map(([k, v]) => ({ name: k, value: v })) : []
  const understaffed = ratios?.departments?.filter(d => d.is_understaffed) || []

  return (
    <div className="space-y-7 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">HR Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">{fmt.date(new Date().toISOString())} · Branch operations</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Staff" value={fmt.number(overview?.total_active_staff)} icon={Users} accent="brand" />
        <StatCard label="New Hires" value={overview?.new_hires_this_month || 0} icon={TrendingUp} accent="green" />
        <StatCard label="Expiring Credentials" value={expiring?.length || 0} icon={Shield} accent={expiring?.length > 0 ? 'red' : 'brand'} />
        <StatCard label="Active Locums" value={overview?.locum_count || 0} icon={Activity} accent="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category pie */}
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-4">Staff by Category</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                labelLine={false} fontSize={10}>
                {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...TooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Understaffed departments */}
        <div className="card lg:col-span-2">
          <h3 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" /> Understaffed Departments
          </h3>
          {l2 ? <PageLoader /> : understaffed.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-emerald-400 text-sm gap-2">
              <Shield size={16} /> All departments adequately staffed
            </div>
          ) : (
            <div className="space-y-2.5">
              {understaffed.slice(0, 5).map(d => (
                <div key={d.department_id} className="flex items-center justify-between p-3 bg-surface-700 rounded-lg border border-amber-500/20">
                  <div>
                    <p className="text-sm font-medium text-white">{d.department_name}</p>
                    <p className="text-xs text-text-secondary">{d.actual_active_staff} staff / {d.required_per_shift} required</p>
                  </div>
                  <span className="badge badge-red">-{d.shortfall} short</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expiring credentials */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-white flex items-center gap-2">
            <Clock size={16} className="text-amber-400" /> Credentials Expiring in 30 Days
          </h3>
          <Link to="/hr-admin/credentials" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            View all <ChevronRight size={12} />
          </Link>
        </div>
        {l3 ? <PageLoader /> : expiring?.length === 0 ? (
          <div className="text-center py-8 text-emerald-400 text-sm">No credentials expiring in 30 days</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Staff</th><th>Credential</th><th>Issuing Body</th><th>Expires</th><th>Days Left</th></tr></thead>
              <tbody>
                {expiring?.slice(0, 8).map((c, i) => (
                  <tr key={i}>
                    <td className="font-medium text-white">{c.staff_name}</td>
                    <td className="text-text-secondary">{c.credential_type}</td>
                    <td className="text-text-muted text-xs">{c.issuing_body || '—'}</td>
                    <td className="text-text-secondary">{fmt.date(c.expiry_date)}</td>
                    <td>
                      <span className={`badge ${c.days_until_expiry <= 7 ? 'badge-red' : c.days_until_expiry <= 14 ? 'badge-amber' : 'badge-blue'}`}>
                        {c.days_until_expiry}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wellbeing quick view */}
      {wellbeing && (
        <div className="card">
          <h3 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={16} className="text-brand-400" /> Staff Wellbeing Snapshot
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(wellbeing.burnout_risk_distribution || {}).map(([risk, count]) => (
              <div key={risk} className={`p-4 rounded-xl border ${
                risk === 'high' ? 'border-red-500/30 bg-red-500/10' :
                risk === 'medium' ? 'border-amber-500/30 bg-amber-500/10' :
                'border-emerald-500/30 bg-emerald-500/10'
              }`}>
                <p className={`text-2xl font-bold font-display ${
                  risk === 'high' ? 'text-red-400' : risk === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                }`}>{count}</p>
                <p className="text-xs text-text-secondary mt-1 capitalize">{risk} burnout risk</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
