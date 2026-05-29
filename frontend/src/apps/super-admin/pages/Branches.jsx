import { useState, useCallback } from 'react'
import { branchAPI, departmentAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { StatCard, PageLoader, EmptyState, Modal, SectionHeader } from '../../../shared/components'
import { fmt } from '../../../shared/utils'
import {
  Building2, Plus, MapPin, Phone, Mail, Globe, CheckCircle,
  XCircle, ChevronDown, ChevronUp, Pencil, X, Save
} from 'lucide-react'

const EMPTY_BRANCH = { name: '', code: '', city: '', address: '', phone: '', email: '', is_active: true }

export default function BranchesPage() {
  const [expanded, setExpanded] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)   // branch obj when editing, null when creating
  const [form, setForm] = useState(EMPTY_BRANCH)
  const [saving, setSaving] = useState(false)

  const fetchBranches = useCallback(() => branchAPI.list(), [])
  const { data: branches, loading, execute: reload } = useAsync(fetchBranches)

  const fetchDepts = useCallback(
    () => expanded ? departmentAPI.list(expanded) : Promise.resolve({ data: [] }),
    [expanded]
  )
  const { data: depts, loading: deptsLoading } = useAsync(fetchDepts)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_BRANCH)
    setShowModal(true)
  }

  const openEdit = (branch) => {
    setEditing(branch)
    setForm({
      name: branch.name || '',
      code: branch.code || '',
      city: branch.city || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      is_active: branch.is_active ?? true,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await branchAPI.update(editing.id, form)
      } else {
        await branchAPI.create(form)
      }
      setShowModal(false)
      reload()
    } finally {
      setSaving(false)
    }
  }

  const activeBranches = branches?.filter(b => b.is_active).length || 0
  const inactiveBranches = (branches?.length || 0) - activeBranches

  if (loading) return <PageLoader />

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <SectionHeader
        title="Branches"
        subtitle="Manage all hospital branches across the chain"
        action={
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Add Branch
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Branches" value={branches?.length || 0} icon={Building2} accent="brand" />
        <StatCard label="Active" value={activeBranches} icon={CheckCircle} accent="green" />
        <StatCard label="Inactive" value={inactiveBranches} icon={XCircle} accent="red" />
      </div>

      {/* Branch cards */}
      {!branches?.length ? (
        <EmptyState icon={Building2} title="No branches yet" message="Add your first branch to get started" />
      ) : (
        <div className="space-y-3">
          {branches.map(branch => (
            <div key={branch.id} className="card p-0 overflow-hidden">
              {/* Branch row */}
              <div className="flex items-center gap-4 p-5">
                <div className="w-11 h-11 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} className="text-brand-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white">{branch.name}</p>
                    <span className="font-mono text-brand-400 text-xs bg-brand-500/10 px-2 py-0.5 rounded">
                      {branch.code}
                    </span>
                    <span className={`badge ${branch.is_active ? 'badge-green' : 'badge-red'}`}>
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    {branch.city && (
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <MapPin size={11} /> {branch.city}
                      </span>
                    )}
                    {branch.phone && (
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Phone size={11} /> {branch.phone}
                      </span>
                    )}
                    {branch.email && (
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Mail size={11} /> {branch.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(branch)} className="btn-ghost p-2">
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setExpanded(expanded === branch.id ? null : branch.id)}
                    className="btn-ghost p-2"
                  >
                    {expanded === branch.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {/* Expanded: departments */}
              {expanded === branch.id && (
                <div className="border-t border-surface-600 bg-surface-900/40 px-5 py-4">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                    Departments
                  </p>
                  {deptsLoading ? (
                    <p className="text-xs text-text-muted">Loading…</p>
                  ) : !depts?.length ? (
                    <p className="text-xs text-text-muted">No departments configured for this branch.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {depts.map(d => (
                        <span key={d.id} className="text-xs bg-surface-700 border border-surface-600 text-text-secondary px-3 py-1 rounded-lg">
                          {d.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit — ${editing.name}` : 'Add New Branch'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Branch Name *</label>
              <input
                className="input"
                placeholder="e.g. Nairobi Main Hospital"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Branch Code *</label>
              <input
                className="input uppercase"
                placeholder="e.g. NBI"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="label">City</label>
              <input
                className="input"
                placeholder="e.g. Nairobi"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input
                className="input"
                placeholder="Street address"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                placeholder="+254..."
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="branch@hospital.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input
                id="is_active"
                type="checkbox"
                className="w-4 h-4 accent-brand-500"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              />
              <label htmlFor="is_active" className="text-sm text-text-secondary cursor-pointer">
                Branch is active
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-ghost flex-1">
              <X size={15} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.code}
              className="btn-primary flex-1"
            >
              <Save size={15} /> {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Branch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
