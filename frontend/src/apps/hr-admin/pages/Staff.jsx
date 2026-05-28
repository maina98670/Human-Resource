import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { staffAPI } from '../../../shared/services/api'
import { useAsync, useDebounce, usePagination } from '../../../shared/hooks'
import { SectionHeader, PageLoader, EmptyState, Pagination, Avatar, Badge } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { Users, Search, Filter, UserPlus, ChevronRight } from 'lucide-react'

const CATEGORIES = ['', 'clinical', 'administrative', 'support']
const EMP_TYPES = ['', 'permanent', 'contract', 'locum', 'agency', 'intern']
const STATUSES = ['', 'active', 'on_leave', 'suspended', 'terminated']

export default function StaffPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [empType, setEmpType] = useState('')
  const [staffStatus, setStaffStatus] = useState('active')
  const { page, pageSize, setPage } = usePagination()
  const debouncedSearch = useDebounce(search)

  const fetchStaff = useCallback(() =>
    staffAPI.list({ search: debouncedSearch || undefined, category: category || undefined,
      employment_type: empType || undefined, status: staffStatus || undefined, page, page_size: pageSize }),
    [debouncedSearch, category, empType, staffStatus, page, pageSize])

  const { data, loading } = useAsync(fetchStaff)
  const staff = data?.results || []

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Staff Directory"
        subtitle={`${fmt.number(data?.results?.length || 0)} staff members`}
        action={
          <Link to="/hr-admin/onboarding" className="btn-primary">
            <UserPlus size={16} /> Onboard Staff
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..." className="input pl-9" />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input w-40">
          <option value="">All categories</option>
          {CATEGORIES.filter(Boolean).map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>
        <select value={empType} onChange={e => setEmpType(e.target.value)} className="input w-40">
          <option value="">All types</option>
          {EMP_TYPES.filter(Boolean).map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
        </select>
        <select value={staffStatus} onChange={e => setStaffStatus(e.target.value)} className="input w-36">
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? <PageLoader /> : staff.length === 0 ? (
        <EmptyState icon={Users} title="No staff found" message="Try adjusting your filters" />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th><th>Staff No.</th><th>Job Title</th>
                  <th>Category</th><th>Type</th><th>Status</th><th>Hired</th><th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} size="sm" />
                        <span className="font-medium text-white text-sm">{s.name}</span>
                      </div>
                    </td>
                    <td><span className="font-mono text-brand-400 text-xs">{s.staff_number}</span></td>
                    <td className="text-text-secondary text-sm">{s.job_title}</td>
                    <td><span className="badge badge-blue capitalize">{s.category}</span></td>
                    <td><span className="text-text-muted text-xs capitalize">{s.employment_type}</span></td>
                    <td><span className={`badge ${status.staff(s.status)}`}>{s.status}</span></td>
                    <td className="text-text-muted text-xs">{fmt.date(s.hire_date)}</td>
                    <td>
                      <Link to={`/hr-admin/staff/${s.id}`} className="btn-ghost p-1.5">
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} pageSize={pageSize} total={staff.length * 3} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
