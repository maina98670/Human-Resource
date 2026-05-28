import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/context/AuthContext'
import { Spinner } from '../shared/components'
import toast from 'react-hot-toast'
import { Activity, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await login(form.email, form.password)
      // Route based on role
      const routes = {
        super_admin: '/super-admin',
        hospital_admin: '/hr-admin',
        hr_admin: '/hr-admin',
        finance_admin: '/hr-admin',
        department_head: '/hr-admin',
        shift_supervisor: '/hr-admin',
        clinical_staff: '/staff',
        admin_staff: '/staff',
        support_staff: '/staff',
        locum: '/staff',
      }
      navigate(routes[data.role] || '/staff')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'linear-gradient(rgba(20,173,181,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(20,173,181,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-4">
            <Activity size={28} className="text-brand-400" />
          </div>
          <h1 className="font-display text-3xl font-bold text-white">Hospital HR</h1>
          <p className="text-text-secondary text-sm mt-1">Clinical workforce management</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="font-display text-xl font-semibold text-white mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email" required autoFocus
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@hospital.com"
                className="input"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="input pr-10"
                />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
              {loading ? <Spinner size="sm" /> : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          Hospital HR System · Secure clinical workforce management
        </p>
      </div>
    </div>
  )
}
