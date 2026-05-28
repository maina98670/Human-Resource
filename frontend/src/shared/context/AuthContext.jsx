import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    if (!token) { setLoading(false); return }
    try {
      const { data } = await authAPI.me()
      setUser(data)
    } catch {
      localStorage.clear()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  const login = async (email, password) => {
    const { data } = await authAPI.login(email, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setUser({ id: data.user_id, role: data.role, branch_id: data.branch_id })
    return data
  }

  const logout = async () => {
    try { await authAPI.logout(localStorage.getItem('refresh_token')) } catch {}
    localStorage.clear()
    setUser(null)
  }

  const isSuperAdmin = user?.role === 'super_admin'
  const isHRAdmin = ['super_admin','hospital_admin','hr_admin'].includes(user?.role)
  const isFinance = ['super_admin','hospital_admin','hr_admin','finance_admin'].includes(user?.role)
  const isDeptHead = ['super_admin','hospital_admin','hr_admin','department_head'].includes(user?.role)

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isSuperAdmin, isHRAdmin, isFinance, isDeptHead }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
