import { useState, useCallback } from 'react'
import { staffAPI, aiAPI, branchAPI, departmentAPI } from '../../../shared/services/api'
import { SectionHeader, Spinner, PageLoader } from '../../../shared/components'
import { Brain, UserPlus, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react'
import { useAsync } from '../../../shared/hooks'
import { useAuth } from '../../../shared/context/AuthContext'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const STEPS = ['AI Parse', 'Personal Info', 'Employment', 'Review & Submit']

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [cvText, setCvText] = useState('')
  const [parsing, setParseLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branch_id || '')
  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '', date_of_birth: '',
    gender: '', national_id: '', personal_phone: '', email: '', phone: '',
    temp_password: 'HospitalHR@2024!',
    branch_id: user?.branch_id || '', department_id: '', category: 'clinical',
    clinical_sub_role: '', employment_type: 'permanent',
    job_title: '', job_grade: '', hire_date: '',
    bank_name: '', bank_account_number: '', mpesa_number: '',
  })

  // Load branches
  const { data: branches, loading: branchesLoading } = useAsync(
    useCallback(() => branchAPI.list(), [])
  )

  // Load departments for selected branch
  const { data: departments, loading: deptsLoading } = useAsync(
    useCallback(
      () => selectedBranchId ? departmentAPI.list(selectedBranchId) : Promise.resolve({ data: [] }),
      [selectedBranchId]
    )
  )

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleBranchChange = (branchId) => {
    setSelectedBranchId(branchId)
    set('branch_id', branchId)
    set('department_id', '') // reset dept when branch changes
  }

  const parseCV = async () => {
    if (!cvText.trim()) return toast.error('Paste CV text first')
    setParseLoading(true)
    try {
      const { data } = await aiAPI.parseCV(cvText)
      const p = data.parsed
      setForm(f => ({
        ...f,
        first_name: p.first_name || f.first_name,
        last_name: p.last_name || f.last_name,
        email: p.email || f.email,
        phone: p.phone || f.phone,
        personal_phone: p.phone || f.personal_phone,
        job_title: p.job_title || f.job_title,
        clinical_sub_role: p.clinical_sub_role || f.clinical_sub_role,
      }))
      toast.success(`CV parsed via ${data.provider} — review and complete`)
      setStep(1)
    } catch { toast.error('CV parsing failed') }
    finally { setParseLoading(false) }
  }

  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      if (!form.first_name || !form.last_name || !form.date_of_birth ||
          !form.gender || !form.national_id || !form.personal_phone || !form.email) {
        toast.error('Please fill all required fields')
        return false
      }
    }
    if (currentStep === 2) {
      if (!form.branch_id || !form.department_id || !form.category ||
          !form.employment_type || !form.job_title || !form.hire_date) {
        toast.error('Please fill all required fields')
        return false
      }
    }
    return true
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      // Ensure phone is set (required by backend User model)
      const payload = {
        ...form,
        phone: form.phone || form.personal_phone,
      }
      const res = await staffAPI.create(payload)
      toast.success(`Staff onboarded! Staff No: ${res.data.staff_number}`)
      navigate('/hr-admin/staff')
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        toast.error(detail.map(d => d.msg).join(', '))
      } else {
        toast.error(detail || 'Submission failed')
      }
    } finally { setSubmitting(false) }
  }

  const InputField = ({ label, field, type = 'text', required = false }) => (
    <div>
      <label className="label">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={form[field]} onChange={e => set(field, e.target.value)}
        className="input" required={required} />
    </div>
  )

  const SelectField = ({ label, field, options, required = false }) => (
    <div>
      <label className="label">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <select value={form[field]} onChange={e => set(field, e.target.value)} className="input" required={required}>
        <option value="">Select...</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <SectionHeader title="Onboard New Staff" subtitle="AI-assisted onboarding with CV parsing" />

      {/* Steps */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              i < step ? 'bg-brand-600 border-brand-600 text-white' :
              i === step ? 'border-brand-500 text-brand-400 bg-brand-500/10' :
              'border-surface-500 text-text-muted'
            }`}>
              {i < step ? <CheckCircle size={14} /> : i + 1}
            </div>
            <div className="flex-1 flex flex-col items-start ml-2 mr-4">
              <span className={`text-xs font-medium ${i === step ? 'text-white' : 'text-text-muted'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-full mt-1 ${i < step ? 'bg-brand-600' : 'bg-surface-600'}`} />}
            </div>
          </div>
        ))}
      </div>

      <div className="card space-y-5">
        {/* Step 0: AI Parse */}
        {step === 0 && (
          <>
            <div className="flex items-center gap-2 text-brand-400">
              <Brain size={18} /> <p className="font-semibold text-white">AI CV Parser</p>
            </div>
            <p className="text-sm text-text-secondary">
              Paste the CV text below and let AI pre-fill the staff profile. You can skip this step and fill manually.
            </p>
            <textarea value={cvText} onChange={e => setCvText(e.target.value)}
              className="input resize-none" rows={8} placeholder="Paste full CV / resume text here..." />
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary">Skip — Fill Manually</button>
              <button onClick={parseCV} disabled={parsing || !cvText} className="btn-primary">
                {parsing ? <><Spinner size="sm" /> Parsing...</> : <><Brain size={15} /> Parse CV with AI</>}
              </button>
            </div>
          </>
        )}

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <>
            <p className="font-display font-semibold text-white">Personal Information</p>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="First Name" field="first_name" required />
              <InputField label="Middle Name" field="middle_name" />
              <InputField label="Last Name" field="last_name" required />
              <InputField label="Date of Birth" field="date_of_birth" type="date" required />
              <SelectField label="Gender" field="gender" required options={[['male','Male'],['female','Female'],['other','Other']]} />
              <InputField label="National ID" field="national_id" required />
              <InputField label="Personal Phone" field="personal_phone" required />
              <InputField label="Work Email" field="email" type="email" required />
            </div>
          </>
        )}

        {/* Step 2: Employment */}
        {step === 2 && (
          <>
            <p className="font-display font-semibold text-white">Employment Details</p>
            <div className="grid grid-cols-2 gap-4">
              {/* Branch dropdown */}
              <div>
                <label className="label">Branch <span className="text-red-400">*</span></label>
                {branchesLoading ? <div className="input flex items-center gap-2 text-text-muted"><Spinner size="sm" /> Loading...</div> : (
                  <select
                    value={form.branch_id}
                    onChange={e => handleBranchChange(e.target.value)}
                    className="input"
                    required
                  >
                    <option value="">Select branch...</option>
                    {(branches || []).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Department dropdown */}
              <div>
                <label className="label">Department <span className="text-red-400">*</span></label>
                {deptsLoading ? <div className="input flex items-center gap-2 text-text-muted"><Spinner size="sm" /> Loading...</div> : (
                  <select
                    value={form.department_id}
                    onChange={e => set('department_id', e.target.value)}
                    className="input"
                    required
                    disabled={!form.branch_id}
                  >
                    <option value="">{form.branch_id ? 'Select department...' : 'Select branch first'}</option>
                    {(departments || []).map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <SelectField label="Category" field="category" required options={[['clinical','Clinical'],['administrative','Administrative'],['support','Support']]} />
              <SelectField label="Clinical Sub-Role" field="clinical_sub_role" options={[
                ['doctor','Doctor'],['nurse','Nurse'],['pharmacist','Pharmacist'],
                ['lab_technician','Lab Technician'],['radiologist','Radiologist'],
                ['physiotherapist','Physiotherapist'],['other','Other'],
              ]} />
              <SelectField label="Employment Type" field="employment_type" required options={[
                ['permanent','Permanent'],['contract','Contract'],['locum','Locum'],
                ['agency','Agency'],['intern','Intern'],
              ]} />
              <InputField label="Job Title" field="job_title" required />
              <InputField label="Job Grade" field="job_grade" />
              <InputField label="Hire Date" field="hire_date" type="date" required />
              <InputField label="M-Pesa Number" field="mpesa_number" />
              <InputField label="Bank Name" field="bank_name" />
              <InputField label="Account Number" field="bank_account_number" />
              <div className="col-span-2">
                <label className="label">Temporary Password</label>
                <input type="text" value={form.temp_password} onChange={e => set('temp_password', e.target.value)} className="input font-mono" />
                <p className="text-xs text-text-muted mt-1">Staff will be asked to change on first login</p>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <>
            <p className="font-display font-semibold text-white">Review & Submit</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Full Name', `${form.first_name} ${form.last_name}`],
                ['Email', form.email],
                ['Phone', form.personal_phone],
                ['National ID', form.national_id],
                ['Job Title', form.job_title],
                ['Category', form.category],
                ['Employment Type', form.employment_type],
                ['Hire Date', form.hire_date],
              ].filter(([,v]) => v).map(([k, v]) => (
                <div key={k} className="p-3 bg-surface-700 rounded-lg">
                  <p className="text-xs text-text-muted">{k}</p>
                  <p className="text-white mt-0.5 capitalize">{v}</p>
                </div>
              ))}
            </div>
            <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl">
              <p className="text-xs text-brand-400">
                A user account will be created. Staff can log in immediately using the temporary password.
              </p>
            </div>
          </>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="btn-secondary">
            <ChevronLeft size={15} /> Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => {
                if (validateStep(step)) setStep(s => s + 1)
              }}
              className="btn-primary"
            >
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting...' : <><UserPlus size={15} /> Onboard Staff</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
