import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

// ─── Axios Instance ───────────────────────────────────────────────────────────
const api = axios.create({ baseURL: BASE_URL, timeout: 30000 })

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refresh_token')
        if (!refresh) throw new Error('No refresh token')
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: (refresh_token) => api.post('/auth/logout', { refresh_token }),
  me: () => api.get('/auth/me'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
}

// ─── Branches ─────────────────────────────────────────────────────────────────
export const branchAPI = {
  list: () => api.get('/branches'),
  get: (id) => api.get(`/branches/${id}`),
  create: (data) => api.post('/branches', data),
  update: (id, data) => api.patch(`/branches/${id}`, data),
}

// ─── Departments ──────────────────────────────────────────────────────────────
export const departmentAPI = {
  list: (branch_id) => api.get('/departments', { params: { branch_id } }),
  get: (id) => api.get(`/departments/${id}`),
  create: (data) => api.post('/departments', data),
  update: (id, data) => api.patch(`/departments/${id}`, data),
}

// ─── Staff ────────────────────────────────────────────────────────────────────
export const staffAPI = {
  list: (params) => api.get('/staff', { params }),
  get: (id) => api.get(`/staff/${id}`),
  create: (data) => api.post('/staff', data),
  update: (id, data) => api.patch(`/staff/${id}`, data),
  transfer: (id, data) => api.post(`/staff/${id}/transfer`, data),
  offboard: (id, data) => api.post(`/staff/${id}/offboard`, data),
  transferHistory: (id) => api.get(`/staff/${id}/transfer-history`),
}

// ─── Credentials ──────────────────────────────────────────────────────────────
export const credentialAPI = {
  list: (staff_id) => api.get(`/credentials/${staff_id}`),
  add: (staff_id, data) => api.post(`/credentials/${staff_id}`, data),
  verify: (id, data) => api.post(`/credentials/${id}/verify`, data),
  expiring: (days, branch_id) => api.get('/credentials/expiring/soon', { params: { days, branch_id } }),
  complianceReport: (branch_id) => api.get('/credentials/compliance/report', { params: { branch_id } }),
}

// ─── Leave ────────────────────────────────────────────────────────────────────
export const leaveAPI = {
  apply: (data) => api.post('/leave/apply', data),
  myRequests: (year) => api.get('/leave/my-requests', { params: { year } }),
  balance: (staff_id, year) => api.get(`/leave/balance/${staff_id}`, { params: { year } }),
  deptApprove: (id, data) => api.put(`/leave/${id}/dept-approve`, data),
  hrApprove: (id, data) => api.put(`/leave/${id}/hr-approve`, data),
  cancel: (id) => api.put(`/leave/${id}/cancel`),
  calendar: (dept_id, month, year) =>
    api.get(`/leave/calendar/${dept_id}`, { params: { month, year } }),
  setBalance: (staff_id, data) => api.post(`/leave/balance/set?staff_id=${staff_id}`, data),
}

// ─── Scheduling ───────────────────────────────────────────────────────────────
export const scheduleAPI = {
  createShift: (data) => api.post('/shifts', data),
  listShifts: (dept_id, from_date, to_date) =>
    api.get('/shifts', { params: { department_id: dept_id, from_date, to_date } }),
  rota: (dept_id, week_start) => api.get(`/shifts/rota/${dept_id}`, { params: { week_start } }),
  gaps: (dept_id, from_date, to_date) =>
    api.get(`/shifts/gaps/${dept_id}`, { params: { from_date, to_date } }),
  assign: (shift_id, staff_ids) => api.post(`/shifts/${shift_id}/assign`, { staff_ids }),
  requestSwap: (data) => api.post('/shifts/swap/request', data),
  approveSwap: (id, approved) => api.put(`/shifts/swap/${id}/approve`, null, { params: { approved } }),
  markAttendance: (data) => api.post('/shifts/attendance/mark', data),
}

// ─── Payroll ──────────────────────────────────────────────────────────────────
export const payrollAPI = {
  run: (branch_id, year, month) => api.post(`/payroll/run/${branch_id}/${year}/${month}`),
  approve: (run_id, data) => api.put(`/payroll/run/${run_id}/approve`, data),
  listRuns: (branch_id) => api.get(`/payroll/run/${branch_id}`),
  payslip: (staff_id, year, month) => api.get(`/payroll/payslip/${staff_id}/${year}/${month}`),
  addAllowance: (staff_id, data) => api.post(`/payroll/allowances/${staff_id}`, data),
  allowances: (staff_id) => api.get(`/payroll/allowances/${staff_id}`),
}

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationAPI = {
  list: (unread_only = false) => api.get('/notifications', { params: { unread_only } }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  send: (data) => api.post('/notifications/send', data),
  broadcast: (data) => api.post('/notifications/broadcast', data),
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsAPI = {
  workforceOverview: (branch_id) => api.get('/analytics/workforce/overview', { params: { branch_id } }),
  turnover: (branch_id, year) => api.get('/analytics/workforce/turnover', { params: { branch_id, year } }),
  absenteeism: (branch_id, month, year) =>
    api.get('/analytics/workforce/absenteeism', { params: { branch_id, month, year } }),
  payrollCost: (branch_id, year, month) =>
    api.get('/analytics/payroll/cost-summary', { params: { branch_id, year, month } }),
  complianceOverview: () => api.get('/analytics/compliance/overview'),
  staffingRatios: (branch_id) => api.get('/analytics/staffing/ratios', { params: { branch_id } }),
  wellbeing: (branch_id) => api.get('/analytics/wellbeing/overview', { params: { branch_id } }),
  mohReport: (branch_id, year, quarter) =>
    api.get('/analytics/reports/moh-staffing', { params: { branch_id, year, quarter } }),
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export const aiAPI = {
  providers: () => api.get('/ai/providers'),
  scheduleSuggest: (data) => api.post('/ai/scheduling/suggest', data),
  parseCV: (cv_text) => api.post('/ai/onboarding/parse-cv', { cv_text }),
  analyseWellness: (data) => api.post('/ai/wellness/analyse', data),
  parseLeave: (message) => api.post('/ai/leave/parse', { message }),
  test: (data) => api.post('/ai/test', data),
}

export default api
