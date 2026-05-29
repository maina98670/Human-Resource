import { useState, useCallback } from 'react'
import { staffAPI, branchAPI } from '../../../shared/services/api'
import { useAsync, useDebounce, usePagination } from '../../../shared/hooks'
import { PageLoader, EmptyState, Avatar, SectionHeader, Pagination } from '../../../shared/components'
import { fmt, status, role } from '../../../shared/utils'
import { Users, Search, Building2, ChevronRight, Download } from 'lucide-react'

const CATEGORIES = ['', 'clinical', 'administrative', 'support']
const EMP_TYPES = ['', 'permanent', 'contract', 'locum', 'agency', 'intern']
const STATUSES = ['', 'active', 'on_leave', 'suspended', 'terminated']

export default function AllStaffPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [empType, setEmpType] = useState('')
  const [staffStatus, setStaffStatus] = useState('active')
  const [branchId, setBranchId] = useState('')
  const { page, pageSize, setPage, reset } = usePagination()
  const debouncedSearch = useDebounce(search)

  const fetchBranches = useCallback(() => branchAPI.list(), [])
  const { data: branches } = useAsync(fetchBranches)

  const fetchStaff = useCallback(
    () => staffAPI.list({
      search: debouncedSearch || undefined,
      category: category || undefined,
      employment_type: empType || undefined,
      status: staffStatus || undefined,
      branch_id: branchId || undefined,
      page,
      page_size: pageSize,
    }),
    [debouncedSearch, category, empType, staffStatus, branchId, page, pageSize]
  )
  const { data, loading } = useAsync(fetchStaff)
  const staff = data?.results || []
  const total = data?.total || staff.length

  const handleFilterChange = (setter) => (e) => { setter(e.target.value); reset() }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="All Staff"
        subtitle={`${fmt.number(total)} staff across all branches`}
        action={
          <button className="btn-ghost">
            <Download size={15} /> Export
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); reset() }}
            placeholder="Search by name or staff no…"
            className="input pl-9"
          />
        </div>

        {/* Branch */}
        <select value={branchId} onChange={handleFilterChange(setBranchId)} className="input w-44">
          <option value="">All branches</option>
          {branches?.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* Category */}
        <select value={category} onChange={handleFilterChange(setCategory)} className="input w-40">
          <option value="">All categories</option>
          {CATEGORIES.filter(Boolean).map(c => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>

        {/* Employment type */}
        <select value={empType} onChange={handleFilterChange(setEmpType)} className="input w-36">
          <option value="">All types</option>
          {EMP_TYPES.filter(Boolean).map(t => (
            <option key={t} value={t} className="capitalize">{t}</option>
          ))}
        </select>

        {/* Status */}
        <select value={staffStatus} onChange={handleFilterChange(setStaffStatus)} className="input w-36">
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map(s => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <PageLoader />
      ) : !staff.length ? (
        <EmptyState icon={Users} title="No staff found" message="Try adjusting your filters" />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Staff No.</th>
                  <th>Branch</th>
                  <th>Job Title</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Hired</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} size="sm" />
                        <div>
                          <p className="font-medium text-white text-sm">{s.name}</p>
                          {s.email && (
                            <p className="text-xs text-text-muted">{s.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-brand-400 text-xs">{s.staff_number}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 text-text-secondary text-sm">
                        <Building2 size={12} className="text-text-muted" />
                        {s.branch_name || s.branch || '—'}
                      </span>
                    </td>
                    <td className="text-text-secondary text-sm">{s.job_title || '—'}</td>
                    <td>
                      <span className="badge badge-blue capitalize">{s.category}</span>
                    </td>
                    <td>
                      <span className="text-text-muted text-xs capitalize">{s.employment_type}</span>
                    </td>
                    <td>
                      <span className={`badge ${status.staff(s.status)}`}>{s.status}</span>
                    </td>
                    <td className="text-text-muted text-xs">{fmt.date(s.hire_date)}</td>
                    <td>
                      <button className="btn-ghost p-1.5">
                        <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 pb-4">
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
