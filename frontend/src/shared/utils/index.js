import { format, formatDistanceToNow, parseISO } from 'date-fns'

export const fmt = {
  date: (d) => d ? format(parseISO(d), 'dd MMM yyyy') : '—',
  dateShort: (d) => d ? format(parseISO(d), 'dd/MM/yy') : '—',
  datetime: (d) => d ? format(parseISO(d), 'dd MMM yyyy, HH:mm') : '—',
  ago: (d) => d ? formatDistanceToNow(parseISO(d), { addSuffix: true }) : '—',
  currency: (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
  percent: (n) => `${Number(n || 0).toFixed(1)}%`,
  number: (n) => Number(n || 0).toLocaleString(),
}

export const role = {
  label: (r) => ({
    super_admin: 'Super Admin',
    hospital_admin: 'Hospital Admin',
    hr_admin: 'HR Admin',
    finance_admin: 'Finance Admin',
    department_head: 'Dept Head',
    shift_supervisor: 'Supervisor',
    clinical_staff: 'Clinical Staff',
    admin_staff: 'Admin Staff',
    support_staff: 'Support Staff',
    locum: 'Locum',
    system_admin: 'System Admin',
  }[r] || r),
  color: (r) => ({
    super_admin: 'badge-blue',
    hospital_admin: 'badge-blue',
    hr_admin: 'badge-green',
    finance_admin: 'badge-amber',
    department_head: 'badge-green',
    locum: 'badge-gray',
  }[r] || 'badge-gray'),
}

export const status = {
  leave: (s) => ({
    pending: 'badge-amber',
    approved_by_head: 'badge-blue',
    approved: 'badge-green',
    rejected: 'badge-red',
    cancelled: 'badge-gray',
  }[s] || 'badge-gray'),
  staff: (s) => ({
    active: 'badge-green',
    on_leave: 'badge-amber',
    suspended: 'badge-red',
    terminated: 'badge-red',
    resigned: 'badge-gray',
  }[s] || 'badge-gray'),
  credential: (s) => ({
    active: 'badge-green',
    expiring_soon: 'badge-amber',
    expired: 'badge-red',
    pending_verification: 'badge-blue',
    revoked: 'badge-red',
  }[s] || 'badge-gray'),
  payroll: (s) => ({
    draft: 'badge-gray',
    pending_approval: 'badge-amber',
    approved: 'badge-green',
    disbursed: 'badge-blue',
  }[s] || 'badge-gray'),
}

export const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

export const clx = (...classes) => classes.filter(Boolean).join(' ')
