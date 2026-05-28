import { useState, useCallback } from 'react'
import { credentialAPI } from '../../../shared/services/api'
import { useAsync } from '../../../shared/hooks'
import { SectionHeader, PageLoader, EmptyState, Modal } from '../../../shared/components'
import { fmt, status } from '../../../shared/utils'
import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CredentialsPage() {
  const [days, setDays] = useState(30)
  const [verifyModal, setVerifyModal] = useState(null)
  const [notes, setNotes] = useState('')
  const [verifying, setVerifying] = useState(false)

  const { data: expiring, loading: expLoad, execute: refetchExpiring } = useAsync(
    useCallback(() => credentialAPI.expiring(days), [days])
  )
  const { data: report, loading: repLoad } = useAsync(
    useCallback(() => credentialAPI.complianceReport(), [])
  )

  const handleVerify = async () => {
    setVerifying(true)
    try {
      await credentialAPI.verify(verifyModal.credential_id, { notes })
      toast.success('Credential verified')
      setVerifyModal(null)
      setNotes('')
      refetchExpiring()
    } catch { toast.error('Verification failed') }
    finally { setVerifying(false) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader title="Credentials & Compliance" subtitle="Track, verify and monitor staff certifications" />

      {/* Compliance overview */}
      {!repLoad && report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active', value: report.active, color: 'emerald' },
            { label: 'Expiring Soon', value: report.expiring_soon, color: 'amber' },
            { label: 'Expired', value: report.expired, color: 'red' },
            { label: 'Pending Verification', value: report.pending_verification, color: 'brand' },
          ].map(s => (
            <div key={s.label} className="card-sm">
              <p className="text-xs text-text-secondary uppercase tracking-wide">{s.label}</p>
              <p className={`font-display text-2xl font-bold mt-1 text-${s.color}-400`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Compliance bar */}
      {report && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield size={15} className="text-brand-400" /> Overall Compliance
            </p>
            <span className={`font-display text-xl font-bold ${
              report.compliance_percentage >= 80 ? 'text-emerald-400' :
              report.compliance_percentage >= 60 ? 'text-amber-400' : 'text-red-400'
            }`}>{report.compliance_percentage}%</span>
          </div>
          <div className="h-3 bg-surface-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${report.compliance_percentage}%`,
                background: report.compliance_percentage >= 80 ? '#10b981' :
                  report.compliance_percentage >= 60 ? '#f59e0b' : '#ef4444'
              }} />
          </div>
        </div>
      )}

      {/* Expiring credentials */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-white flex items-center gap-2">
            <Clock size={16} className="text-amber-400" /> Expiring Credentials
          </h3>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input w-36 py-1.5 text-xs">
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
            <option value={90}>Next 90 days</option>
          </select>
        </div>

        {expLoad ? <PageLoader /> : !expiring?.length ? (
          <div className="flex items-center justify-center h-24 gap-2 text-emerald-400 text-sm">
            <CheckCircle size={16} /> No credentials expiring in {days} days
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Staff</th><th>Staff No.</th><th>Credential</th><th>Expires</th><th>Days Left</th><th></th></tr>
              </thead>
              <tbody>
                {expiring.map((c, i) => (
                  <tr key={i}>
                    <td className="font-medium text-white">{c.staff_name}</td>
                    <td><span className="font-mono text-brand-400 text-xs">{c.staff_number}</span></td>
                    <td className="text-text-secondary">{c.credential_type}</td>
                    <td className="text-text-secondary">{fmt.date(c.expiry_date)}</td>
                    <td>
                      <span className={`badge ${c.days_until_expiry <= 7 ? 'badge-red' : c.days_until_expiry <= 14 ? 'badge-amber' : 'badge-blue'}`}>
                        {c.days_until_expiry}d
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setVerifyModal(c)} className="btn-ghost py-1 text-xs">
                        Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verify modal */}
      <Modal open={!!verifyModal} onClose={() => setVerifyModal(null)} title="Verify Credential" size="sm">
        {verifyModal && (
          <div className="space-y-4">
            <div className="p-4 bg-surface-700 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Staff</span>
                <span className="text-white">{verifyModal.staff_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Credential</span>
                <span className="text-white">{verifyModal.credential_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Expires</span>
                <span className="text-white">{fmt.date(verifyModal.expiry_date)}</span>
              </div>
            </div>
            <div>
              <label className="label">Verification Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                className="input resize-none" rows={2} placeholder="e.g. Verified against original document" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setVerifyModal(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleVerify} disabled={verifying} className="btn-primary flex-1 justify-center">
                <CheckCircle size={14} /> {verifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
