import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ToggleLeft,
  Trash2,
  UserPlus,
  Users2,
  X,
} from 'lucide-react'
import { api } from '../utils/api'
import { useTheme } from '../shared/context/ThemeProvider'

const USER_STATUSES = ['Active', 'Inactive', 'Suspended']
const PAGE_SIZES = [10, 25, 50, 100]

const EMPTY_USER_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  status: 'Active',
  role: '',
  permissions: [],
}

const EMPTY_ROLE_FORM = {
  name: '',
}

function formatDateLabel(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function statusTone(status, isDark) {
  if (status === 'Active') {
    return isDark ? 'bg-emerald-500/14 text-emerald-300 border-emerald-400/20' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
  if (status === 'Suspended') {
    return isDark ? 'bg-amber-500/14 text-amber-300 border-amber-400/20' : 'bg-amber-100 text-amber-700 border-amber-200'
  }
  return isDark ? 'bg-slate-700/70 text-slate-300 border-slate-600/70' : 'bg-slate-100 text-slate-600 border-slate-200'
}

function gradientTone(index, isDark) {
  const tones = [
    isDark ? 'from-blue-500/16 via-blue-500/6 to-transparent border-blue-500/18' : 'from-blue-100/90 via-blue-50/80 to-white border-blue-200/70',
    isDark ? 'from-violet-500/16 via-violet-500/6 to-transparent border-violet-500/18' : 'from-violet-100/90 via-violet-50/80 to-white border-violet-200/70',
    isDark ? 'from-emerald-500/16 via-emerald-500/6 to-transparent border-emerald-500/18' : 'from-emerald-100/90 via-emerald-50/80 to-white border-emerald-200/70',
    isDark ? 'from-amber-500/16 via-amber-500/6 to-transparent border-amber-500/18' : 'from-amber-100/90 via-amber-50/80 to-white border-amber-200/70',
  ]
  return tones[index % tones.length]
}

function groupPermissions(permissionOptions = []) {
  return permissionOptions.reduce((acc, permission) => {
    const groupKey = permission.group || 'general'
    if (!acc[groupKey]) {
      acc[groupKey] = []
    }
    acc[groupKey].push(permission)
    return acc
  }, {})
}

const DASHBOARD_BASE_PERMISSION = 'system.dashboard.view'
const DASHBOARD_SECTION_PERMISSIONS = [
  'system.dashboard.kpis',
  'system.dashboard.health',
  'system.dashboard.growth',
  'system.dashboard.plan_distribution',
  'system.dashboard.status_breakdown',
  'system.dashboard.recent_tenants',
  'system.dashboard.expiring_soon',
]

const DASHBOARD_PERMISSION_FALLBACKS = [
  { name: 'system.dashboard.view', group: 'dashboard', label: 'Dashboard / View' },
  { name: 'system.dashboard.kpis', group: 'dashboard', label: 'Dashboard / KPI Cards' },
  { name: 'system.dashboard.health', group: 'dashboard', label: 'Dashboard / Platform Health' },
  { name: 'system.dashboard.growth', group: 'dashboard', label: 'Dashboard / Growth Chart' },
  { name: 'system.dashboard.plan_distribution', group: 'dashboard', label: 'Dashboard / Plan Distribution' },
  { name: 'system.dashboard.status_breakdown', group: 'dashboard', label: 'Dashboard / Status Breakdown' },
  { name: 'system.dashboard.recent_tenants', group: 'dashboard', label: 'Dashboard / Recent Tenants' },
  { name: 'system.dashboard.expiring_soon', group: 'dashboard', label: 'Dashboard / Expiring Soon' },
]

const PERMISSION_PRIORITY = {
  [DASHBOARD_BASE_PERMISSION]: 1,
  'system.dashboard.kpis': 2,
  'system.dashboard.health': 3,
  'system.dashboard.growth': 4,
  'system.dashboard.plan_distribution': 5,
  'system.dashboard.status_breakdown': 6,
  'system.dashboard.recent_tenants': 7,
  'system.dashboard.expiring_soon': 8,
}

function sortPermissions(permissionList = []) {
  return [...permissionList].sort((left, right) => {
    const leftPriority = PERMISSION_PRIORITY[left?.name] ?? 100
    const rightPriority = PERMISSION_PRIORITY[right?.name] ?? 100

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    return String(left?.label || left?.name || '').localeCompare(String(right?.label || right?.name || ''))
  })
}

function ensureDashboardPermissionOptions(permissionList = []) {
  const existingByName = new Map(
    (Array.isArray(permissionList) ? permissionList : []).map((permission, index) => [
      permission?.name,
      {
        id: permission?.id ?? permission?.name ?? `permission-${index}`,
        ...permission,
      },
    ])
  )

  DASHBOARD_PERMISSION_FALLBACKS.forEach((permission, index) => {
    if (!existingByName.has(permission.name)) {
      existingByName.set(permission.name, {
        id: permission.name || `dashboard-permission-${index}`,
        ...permission,
      })
    }
  })

  return Array.from(existingByName.values())
}

const ROLE_PRIORITY = {
  'Platform Owner': 1,
  'system admin': 2,
  'Platform Admin': 3,
  'Operations Admin': 4,
  'Audit Manager': 5,
  'Support Admin': 6,
}

function sortRolesByPriority(roleList = []) {
  return [...roleList].sort((left, right) => {
    const leftPriority = ROLE_PRIORITY[left?.name] ?? 100
    const rightPriority = ROLE_PRIORITY[right?.name] ?? 100

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    const permissionsCountDiff = (right?.permissions_count || 0) - (left?.permissions_count || 0)
    if (permissionsCountDiff !== 0) {
      return permissionsCountDiff
    }

    return String(left?.name || '').localeCompare(String(right?.name || ''))
  })
}

function isDashboardSectionPermission(permissionName) {
  return DASHBOARD_SECTION_PERMISSIONS.includes(permissionName)
}

function getCompactPermissionLabel(permission) {
  const compactLabels = {
    'system.dashboard.view': 'View',
    'system.dashboard.kpis': 'KPIs',
    'system.dashboard.health': 'Health',
    'system.dashboard.growth': 'Growth',
    'system.dashboard.plan_distribution': 'Plans',
    'system.dashboard.status_breakdown': 'Status',
    'system.dashboard.recent_tenants': 'Recent',
    'system.dashboard.expiring_soon': 'Expiring',
  }

  return compactLabels[permission?.name] || permission?.label || permission?.name || ''
}

function getSimplePermissionLabel(permission) {
  const compactLabel = getCompactPermissionLabel(permission)
  if (compactLabel && compactLabel !== permission?.label && compactLabel !== permission?.name) {
    return compactLabel
  }

  const label = String(permission?.label || permission?.name || '')
  if (!label.includes('/')) {
    return label
  }

  return label
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(-1)[0] || label
}

function getRolePermissionNames(roles = [], roleName = '') {
  const selectedRole = roles.find((role) => role.name === roleName)
  return Array.isArray(selectedRole?.permissions) ? selectedRole.permissions : []
}

function UserModal({
  isOpen,
  mode,
  form,
  roles,
  permissionOptions,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
  isDark,
  t,
}) {
  const [activeTab, setActiveTab] = useState('details')
  const [showPassword, setShowPassword] = useState(false)
  const effectivePermissionSet = new Set(form.permissions)

  useEffect(() => {
    if (isOpen) {
      setActiveTab('details')
      setShowPassword(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const inputClass = `h-11 w-full rounded-2xl border px-4 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
  }`

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border shadow-[0_30px_90px_rgba(0,0,0,0.35)] ${
        isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}>
        <div className={`flex items-start justify-between border-b px-4 py-2.5 ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        }`}>
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('Super Admin Access')}
            </p>
            <h2 className="mt-1 text-base font-bold md:text-lg">
              {mode === 'create' ? t('Add Super Admin User') : t('Edit Super Admin User')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl p-1.5 transition ${
              isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <div className={`flex gap-2 border-b px-4 py-2 ${
          isDark ? 'border-slate-800 bg-slate-900/85' : 'border-slate-200 bg-slate-50/80'
        }`}>
          {[
            { key: 'details', label: 'Details' },
            { key: 'permissions', label: 'Permissions' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)]'
                  : isDark
                    ? 'text-slate-300 hover:bg-slate-800'
                    : 'text-slate-600 hover:bg-white'
              }`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {activeTab === 'details' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Name')}
              </label>
              <input
                value={form.name}
                onChange={(event) => onChange('name', event.target.value)}
                placeholder={t('Platform Admin')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Email')}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => onChange('email', event.target.value)}
                placeholder={t('admin@example.com')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Phone')}
              </label>
              <input
                value={form.phone}
                onChange={(event) => onChange('phone', event.target.value)}
                placeholder={t('+20 10 0000 0000')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Role')}
              </label>
              <select
                value={form.role}
                onChange={(event) => onChange('role', event.target.value)}
                className={inputClass}
              >
                <option value="">{t('Select role')}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {mode === 'create' ? t('Password') : t('New Password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => onChange('password', event.target.value)}
                  placeholder={mode === 'create' ? t('Minimum 8 characters') : t('Leave blank to keep current password')}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${
                    isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'
                  }`}
                  aria-label={showPassword ? t('Hide password') : t('Show password')}
                  title={showPassword ? t('Hide password') : t('Show password')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Status')}
              </label>
              <select
                value={form.status}
                onChange={(event) => onChange('status', event.target.value)}
                className={inputClass}
              >
                {USER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-2xl border px-4 py-3 text-[13px] ${
                isDark ? 'border-slate-800 bg-slate-950/55 text-slate-400' : 'border-slate-200 bg-slate-50/80 text-slate-500'
              }`}>
                {t('Role permissions start active by default. You can turn off any permission here, or enable extra ones for this super admin user.')}
              </div>

              {Object.entries(groupPermissions(permissionOptions)).length === 0 ? (
                <div className={`rounded-2xl border border-dashed px-4 py-10 text-center text-sm ${
                  isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'
                }`}>
                  {t('No permissions available yet.')}
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {Object.entries(groupPermissions(permissionOptions)).map(([groupName, rawGroupItems]) => {
                    const sortedGroupItems = sortPermissions(rawGroupItems)
                    const dashboardBasePermission = sortedGroupItems.find((item) => item.name === DASHBOARD_BASE_PERMISSION) || null
                    const dashboardSectionItems = sortedGroupItems.filter((item) => isDashboardSectionPermission(item.name))
                    const nonDashboardItems = sortedGroupItems.filter((item) => item.name !== DASHBOARD_BASE_PERMISSION && !isDashboardSectionPermission(item.name))
                    const dashboardEnabled = effectivePermissionSet.has(DASHBOARD_BASE_PERMISSION)
                    const visibleGroupItems = groupName === 'dashboard'
                      ? [
                          ...nonDashboardItems,
                          ...(dashboardBasePermission ? [dashboardBasePermission] : []),
                          ...(dashboardEnabled ? dashboardSectionItems : []),
                        ]
                      : sortedGroupItems

                    const visibleGroupNames = visibleGroupItems.map((item) => item.name)
                    return (
                      <div
                        key={groupName}
                        className={`rounded-[22px] border p-4 ${
                          isDark ? 'border-slate-800 bg-slate-950/55' : 'border-slate-200 bg-slate-50/80'
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-xs uppercase tracking-[0.24em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {t('Module')}
                            </p>
                            <h3 className={`mt-1 text-[13px] font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                              {t(groupName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()))}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const hasAll = visibleGroupNames.every((name) => effectivePermissionSet.has(name))
                              onChange(
                                'permissions',
                                hasAll
                                  ? form.permissions.filter((name) => !visibleGroupNames.includes(name))
                                  : Array.from(new Set([...form.permissions, ...visibleGroupNames]))
                              )
                            }}
                            className={`rounded-xl px-3 py-1.5 text-[11px] font-medium transition ${
                              isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                            aria-label={t('Toggle all')}
                            title={t('Toggle all')}
                          >
                            <ToggleLeft size={16} />
                          </button>
                        </div>

                        <div className={`${
                          groupName === 'dashboard' && dashboardEnabled
                            ? 'flex flex-wrap gap-3'
                            : 'space-y-2'
                        }`}>
                          {visibleGroupItems.map((permission) => {
                            const checked = effectivePermissionSet.has(permission.name)
                            const isDashboardChild = groupName === 'dashboard' && isDashboardSectionPermission(permission.name)
                            return (
                              <button
                              key={permission.id}
                              type="button"
                              onClick={() => {
                                  if (checked) {
                                    const namesToRemove = permission.name === DASHBOARD_BASE_PERMISSION
                                      ? [permission.name, ...DASHBOARD_SECTION_PERMISSIONS]
                                      : [permission.name]

                                    onChange(
                                      'permissions',
                                      form.permissions.filter((name) => !namesToRemove.includes(name))
                                    )
                                    return
                                  }

                                  onChange(
                                    'permissions',
                                    Array.from(new Set([
                                      ...form.permissions,
                                      ...(isDashboardChild ? [DASHBOARD_BASE_PERMISSION] : []),
                                      permission.name,
                                    ]))
                                  )
                                }}
                                className={`${
                                  isDashboardChild
                                    ? `inline-flex min-h-[58px] w-[calc(33.333%-0.5rem)] items-center gap-2 rounded-xl border px-3 py-2 text-left ${
                                        checked
                                          ? 'border-blue-500/40 bg-blue-600/10'
                                          : isDark
                                            ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-900'
                                            : 'border-slate-200 bg-white hover:bg-slate-50'
                                      }`
                                    : `flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left ${
                                        checked
                                          ? 'border-blue-500/40 bg-blue-600/10'
                                          : isDark
                                            ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-900'
                                            : 'border-slate-200 bg-white hover:bg-slate-50'
                                      }`
                                } transition`}
                              >
                                {isDashboardChild ? (
                                  <>
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                                      checked
                                        ? 'border-blue-500 bg-blue-600 text-white'
                                        : isDark
                                          ? 'border-slate-600 text-transparent'
                                          : 'border-slate-300 text-transparent'
                                    }`}>
                                      <Check size={12} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className={`truncate text-[12px] font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                        {t(getSimplePermissionLabel(permission))}
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                                      checked
                                        ? 'border-blue-500 bg-blue-600 text-white'
                                        : isDark
                                          ? 'border-slate-600 text-transparent'
                                          : 'border-slate-300 text-transparent'
                                    }`}>
                                      <Check size={12} />
                                    </span>
                                    <div className="min-w-0">
                                      <div className={`flex items-center gap-2 text-[13px] font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                        <span>{t(getSimplePermissionLabel(permission))}</span>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </button>
                            )
                          })}

                          {groupName === 'dashboard' && !dashboardEnabled ? (
                            <div className={`rounded-2xl border border-dashed px-3 py-3 text-[12px] ${
                              isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'
                            }`}>
                              {t('Select Dashboard / View first to choose which dashboard sections should appear.')}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {error ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              isDark ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {error}
            </div>
          ) : null}
        </div>

        <div className={`flex items-center justify-end gap-2.5 border-t px-4 py-2.5 ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
              isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t('Saving...') : mode === 'create' ? t('Create User') : t('Save Changes')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function RoleModal({
  isOpen,
  mode,
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
  isDark,
  t,
}) {
  if (!isOpen) return null

  const inputClass = `h-11 w-full rounded-2xl border px-4 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
  }`

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-[28px] border shadow-[0_30px_90px_rgba(0,0,0,0.35)] ${
        isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}>
        <div className={`flex items-start justify-between border-b px-5 py-4 ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        }`}>
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('System Roles')}
            </p>
            <h2 className="mt-2 text-xl font-bold md:text-2xl">
              {mode === 'create' ? t('Add Role') : t('Edit Role')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl p-2 transition ${
              isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {t('Role Name')}
            </label>
            <input
              value={form.name}
              onChange={(event) => onChange('name', event.target.value)}
              placeholder={t('Operations Admin')}
              className={inputClass}
            />
          </div>

          {error ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              isDark ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {error}
            </div>
          ) : null}
        </div>

        <div className={`flex items-center justify-end gap-3 border-t px-5 py-4 ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
              isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t('Saving...') : mode === 'create' ? t('Create Role') : t('Save Changes')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function ConfirmModal({ isOpen, title, message, actionLabel, danger, busy, onClose, onConfirm, isDark, t }) {
  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[175] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-slate-950/78 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative z-10 w-full max-w-md rounded-[28px] border p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] ${
        isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{message}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
              isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {busy ? t('Please wait...') : actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function SystemAdminUsers() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [permissionOptions, setPermissionOptions] = useState([])
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, roles: 0 })
  const [filters, setFilters] = useState({ search: '', status: 'all', role: 'all' })
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [savingUser, setSavingUser] = useState(false)
  const [savingRole, setSavingRole] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [userModalMode, setUserModalMode] = useState('create')
  const [roleModalMode, setRoleModalMode] = useState('create')
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM)
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM)
  const [userError, setUserError] = useState('')
  const [roleError, setRoleError] = useState('')
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingRoleId, setEditingRoleId] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    from: 0,
    to: 0,
  })

  const glassShell = isDark
    ? 'relative overflow-hidden rounded-[30px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] shadow-[0_24px_80px_rgba(2,6,23,0.55)]'
    : 'relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] shadow-[0_24px_80px_rgba(15,23,42,0.08)]'

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`

  const inputClass = `h-10 w-full rounded-xl border px-3 text-xs outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-900/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/80 text-slate-700 placeholder:text-slate-400'
  }`
  const fieldClass = isDark
    ? 'h-10 w-full rounded-2xl border border-slate-700 bg-slate-900 text-xs text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
    : 'h-10 w-full rounded-2xl border border-slate-300 bg-white text-xs text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100'
  const labelClass = isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-900'

  const headingClass = isDark ? 'text-white' : 'text-slate-950'
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500'

  const pageTabs = [
    { key: 'users', label: 'Users', count: summary.total, icon: Users2 },
    { key: 'roles', label: 'Roles', count: roles.length, icon: UserPlus },
  ]

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search)
      setPage(1)
    }, 350)

    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    Promise.all([loadRoles(), loadPermissions()])
  }, [])

  useEffect(() => {
    loadUsers()
  }, [page, perPage, debouncedSearch, filters.status, filters.role])

  const loadUsers = async () => {
    try {
      setLoadingUsers(true)
      const response = await api.get('/super-admin/admin-users', {
        params: {
          page,
          per_page: perPage,
          search: debouncedSearch,
          status: filters.status,
          role: filters.role,
        },
      })

      const payload = response.data?.users
      setUsers(payload?.data || [])
      setSummary(response.data?.summary || { total: 0, active: 0, inactive: 0, roles: 0 })
      setPagination({
        current_page: payload?.current_page || 1,
        last_page: payload?.last_page || 1,
        total: payload?.total || 0,
        from: payload?.from || 0,
        to: payload?.to || 0,
      })
    } catch (error) {
      console.error('Failed to load super admin users:', error)
      toast.error(error?.response?.data?.message || t('Failed to load super admin users'))
    } finally {
      setLoadingUsers(false)
    }
  }

  const loadRoles = async () => {
    try {
      setLoadingRoles(true)
      const response = await api.get('/super-admin/admin-roles')
      setRoles(sortRolesByPriority(response.data?.roles || []))
    } catch (error) {
      console.error('Failed to load system roles:', error)
      toast.error(error?.response?.data?.message || t('Failed to load system roles'))
    } finally {
      setLoadingRoles(false)
    }
  }

  const loadPermissions = async () => {
    try {
      const response = await api.get('/super-admin/admin-permissions')
      setPermissionOptions(ensureDashboardPermissionOptions(response.data?.permissions || []))
    } catch (error) {
      console.error('Failed to load system permissions:', error)
      toast.error(error?.response?.data?.message || t('Failed to load system permissions'))
    }
  }

  const resetUserModal = () => {
    setUserForm(EMPTY_USER_FORM)
    setUserError('')
    setEditingUserId(null)
    setUserModalMode('create')
    setUserModalOpen(false)
  }

  const resetRoleModal = () => {
    setRoleForm(EMPTY_ROLE_FORM)
    setRoleError('')
    setEditingRoleId(null)
    setRoleModalMode('create')
    setRoleModalOpen(false)
  }

  const openCreateUser = () => {
    const defaultRole = roles[0]?.name || ''
    setUserModalMode('create')
    setEditingUserId(null)
    setUserForm({
      ...EMPTY_USER_FORM,
      role: defaultRole,
      permissions: getRolePermissionNames(roles, defaultRole),
    })
    setUserError('')
    setUserModalOpen(true)
  }

  const openEditUser = (user) => {
    setUserModalMode('edit')
    setEditingUserId(user.id)
    setUserForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      status: user.status || 'Active',
      role: user.role || '',
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    })
    setUserError('')
    setUserModalOpen(true)
  }

  const openCreateRole = () => {
    setRoleModalMode('create')
    setEditingRoleId(null)
    setRoleForm(EMPTY_ROLE_FORM)
    setRoleError('')
    setRoleModalOpen(true)
  }

  const openEditRole = (role) => {
    setRoleModalMode('edit')
    setEditingRoleId(role.id)
    setRoleForm({ name: role.name || '' })
    setRoleError('')
    setRoleModalOpen(true)
  }

  const handleSaveUser = async () => {
    const payload = {
      name: userForm.name.trim(),
      email: userForm.email.trim(),
      phone: userForm.phone.trim(),
      status: userForm.status,
      role: userForm.role,
      permissions: userForm.permissions,
    }

    if (!payload.name || !payload.email || !payload.role) {
      setUserError(t('Name, email, and role are required.'))
      return
    }

    if (userModalMode === 'create' && userForm.password.trim().length < 8) {
      setUserError(t('Password must be at least 8 characters.'))
      return
    }

    if (userForm.password.trim()) {
      payload.password = userForm.password.trim()
    }

    try {
      setSavingUser(true)
      setUserError('')

      if (userModalMode === 'create') {
        await api.post('/super-admin/admin-users', payload)
        toast.success(t('Super admin user created'))
      } else {
        await api.put(`/super-admin/admin-users/${editingUserId}`, payload)
        toast.success(t('Super admin user updated'))
      }

      resetUserModal()
      await Promise.all([loadUsers(), loadRoles()])
    } catch (error) {
      console.error('Failed to save super admin user:', error)
      setUserError(error?.response?.data?.message || t('Failed to save super admin user'))
    } finally {
      setSavingUser(false)
    }
  }

  const handleSaveRole = async () => {
    const payload = { name: roleForm.name.trim() }

    if (!payload.name) {
      setRoleError(t('Role name is required.'))
      return
    }

    try {
      setSavingRole(true)
      setRoleError('')

      if (roleModalMode === 'create') {
        await api.post('/super-admin/admin-roles', payload)
        toast.success(t('System role created'))
      } else {
        await api.put(`/super-admin/admin-roles/${editingRoleId}`, payload)
        toast.success(t('System role updated'))
      }

      resetRoleModal()
      await Promise.all([loadRoles(), loadUsers()])
    } catch (error) {
      console.error('Failed to save role:', error)
      setRoleError(error?.response?.data?.message || t('Failed to save role'))
    } finally {
      setSavingRole(false)
    }
  }

  const askDeleteUser = (user) => {
    setConfirmState({
      type: 'user',
      id: user.id,
      title: t('Delete Super Admin User'),
      message: t('This will permanently remove {{name}} from the super admin workspace.', { name: user.name }),
      actionLabel: t('Delete User'),
    })
  }

  const askDeleteRole = (role) => {
    setConfirmState({
      type: 'role',
      id: role.id,
      title: t('Delete Role'),
      message: t('This role will be removed if it is not assigned to any super admin users.'),
      actionLabel: t('Delete Role'),
    })
  }

  const handleConfirmDelete = async () => {
    if (!confirmState) return

    try {
      setDeleteBusy(true)

      if (confirmState.type === 'user') {
        await api.delete(`/super-admin/admin-users/${confirmState.id}`)
        toast.success(t('Super admin user deleted'))
        await loadUsers()
      } else {
        await api.delete(`/super-admin/admin-roles/${confirmState.id}`)
        toast.success(t('System role deleted'))
        await Promise.all([loadRoles(), loadUsers()])
      }

      setConfirmState(null)
    } catch (error) {
      console.error('Failed to delete item:', error)
      toast.error(error?.response?.data?.message || t('Delete failed'))
    } finally {
      setDeleteBusy(false)
    }
  }

  const filteredRoleStats = useMemo(() => {
    return roles.reduce(
      (acc, role) => {
        acc.totalUsers += Number(role.users_count || 0)
        return acc
      },
      { totalUsers: 0 }
    )
  }, [roles])

  const resetUserFilters = () => {
    setFilters({ search: '', status: 'all', role: 'all' })
    setPage(1)
  }

  return (
    <>
      <div className={`${glassShell} p-5 md:p-7`}>
        <div className="absolute inset-0 pointer-events-none opacity-70">
          <div className="absolute -left-20 top-10 h-44 w-44 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex  gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className={`text-[11px] uppercase tracking-[0.34em] ${mutedTextClass}`}>{t('System Admin')}</p>
              <h1 className={`mt-2 text-xl font-bold md:text-2xl ${headingClass}`}>{t('Super Admin Users')}</h1>
              <p className={`mt-2 max-w-2xl text-xs md:text-sm ${mutedTextClass}`}>
                {t('Manage super admin accounts and their platform-only roles without touching tenant user management.')}
              </p>
            </div>

            <div className="flex  items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  loadUsers()
                  loadRoles()
                  loadPermissions()
                }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-medium transition ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/85 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-200 bg-white/85 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <RefreshCw size={14} />
                {t('Refresh')}
              </button>

              <button
                type="button"
                onClick={tab === 'users' ? openCreateUser : openCreateRole}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={14} />
                {tab === 'users' ? t('Add User') : t('Add Role')}
              </button>
            </div>
          </div>

          <div className={`mt-5 flex flex-wrap gap-2 rounded-[18px] border p-1.5 ${
            isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200/80 bg-white/55'
          }`}>
            {pageTabs.map((item) => {
              const Icon = item.icon
              const isActive = tab === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)]'
                      : isDark
                        ? 'text-slate-300 hover:bg-slate-900'
                        : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} />
                  <span>{t(item.label)}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : isDark
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.count}
                  </span>
                </button>
              )
            })}
          </div>

          {tab === 'users' ? (
            <div className={`${glassCard} mt-5 overflow-hidden`}>
              <div className="border-b border-slate-800/60 px-4 py-4">
                <div className="space-y-4">
                  <div className="flex  gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className={`text-base font-semibold ${headingClass}`}>{t('filters')}</h2>
                    <button
                      type="button"
                      onClick={resetUserFilters}
                      className={`inline-flex items-center justify-center self-start rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:self-auto ${isDark ? 'text-slate-200 hover:text-white' : 'text-slate-950 hover:text-slate-600'}`}
                    >
                      {t('Reset')}
                    </button>
                  </div>

                  <div className="w-full">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-2">
                        <label className={`flex items-center gap-2 ${labelClass}`}>
                          <Search className="h-4 w-4 text-blue-500" />
                          {t('Search')}
                        </label>
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            value={filters.search}
                            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                            placeholder={t('Search name, email, or phone')}
                            className={`${fieldClass} pl-10 pr-3`}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className={`block ${labelClass}`}>
                          {t('Status')}
                        </label>
                        <select
                          value={filters.status}
                          onChange={(event) => {
                            setFilters((current) => ({ ...current, status: event.target.value }))
                            setPage(1)
                          }}
                          className={`${fieldClass} px-3`}
                        >
                          <option value="all">{t('All statuses')}</option>
                          {USER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {t(status)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className={`block ${labelClass}`}>
                          {t('Role')}
                        </label>
                        <select
                          value={filters.role}
                          onChange={(event) => {
                            setFilters((current) => ({ ...current, role: event.target.value }))
                            setPage(1)
                          }}
                          className={`${fieldClass} px-3`}
                        >
                          <option value="all">{t('All roles')}</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.name}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                {loadingUsers ? (
                  <div className={`rounded-[24px] border border-dashed px-5 py-16 text-center text-sm ${mutedTextClass}`}>
                    {t('Loading super admin users...')}
                  </div>
                ) : users.length === 0 ? (
                  <div className={`rounded-[24px] border border-dashed px-5 py-16 text-center text-sm ${mutedTextClass}`}>
                    {t('No super admin users found for the current filters.')}
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {users.map((user, index) => (
                      <div key={user.id} className={`rounded-[20px] border bg-gradient-to-br p-4 ${gradientTone(index, isDark)}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className={`truncate text-base font-semibold ${headingClass}`}>{user.name}</h3>
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(user.status, isDark)}`}>
                                {t(user.status)}
                              </span>
                            </div>
                            <p className={`mt-1 text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>{user.role || t('No role')}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditUser(user)}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => askDeleteUser(user)}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                isDark ? 'border-rose-500/20 text-rose-300 hover:bg-rose-500/10' : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2.5 md:grid-cols-2">
                          <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                            isDark ? 'border-slate-800 bg-slate-950/55 text-slate-300' : 'border-slate-200 bg-white/70 text-slate-600'
                          }`}>
                            <Mail size={16} />
                            <span className="truncate text-xs">{user.email}</span>
                          </div>

                          <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                            isDark ? 'border-slate-800 bg-slate-950/55 text-slate-300' : 'border-slate-200 bg-white/70 text-slate-600'
                          }`}>
                            <Phone size={16} />
                            <span className="truncate text-xs">{user.phone || t('No phone')}</span>
                          </div>
                        </div>

                        <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] ${mutedTextClass}`}>
                          <span>{t('Created')} {formatDateLabel(user.created_at)}</span>
                          <span>{t('Updated')} {formatDateLabel(user.updated_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`flex flex-wrap gap-4 border-t px-4 py-3 md:flex-row md:items-center md:justify-between ${
                isDark ? 'border-slate-800 bg-slate-950/30' : 'border-slate-200 bg-slate-50/60'
              }`}>
                <div className={`whitespace-nowrap text-sm ${mutedTextClass}`}>
                  {t('Showing {{from}}-{{to}} of {{total}}', {
                    from: pagination.total === 0 ? 0 : pagination.from,
                    to: pagination.total === 0 ? 0 : pagination.to,
                    total: pagination.total,
                  })}
                </div>

                <div className="flex items-center gap-2.5 md:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={loadingUsers || pagination.current_page === 1}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <span className={`whitespace-nowrap text-xs font-medium ${headingClass}`}>
                    {t('Page {{page}} of {{pages}}', {
                      page: Math.max(1, pagination.current_page),
                      pages: Math.max(1, pagination.last_page),
                    })}
                  </span>

                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pagination.last_page, current + 1))}
                    disabled={loadingUsers || pagination.current_page === pagination.last_page || pagination.total === 0}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ChevronRight size={18} />
                  </button>

                  <span className={`whitespace-nowrap text-xs ${mutedTextClass}`}>{t('Per page:')}</span>
                  <select
                    value={perPage}
                    onChange={(event) => {
                      setPerPage(Number(event.target.value))
                      setPage(1)
                    }}
                    className={`${inputClass} h-9 min-w-[88px] px-3 text-xs`}
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : tab === 'roles' ? (
            <div className={`${glassCard} mt-5 overflow-hidden`}>
              <div className="border-b border-slate-800/60 px-4 py-4">

              </div>

              <div className="px-4 py-4">
                {loadingRoles ? (
                  <div className={`rounded-[24px] border border-dashed px-5 py-16 text-center text-sm ${mutedTextClass}`}>
                    {t('Loading system roles...')}
                  </div>
                ) : roles.length === 0 ? (
                  <div className={`rounded-[24px] border border-dashed px-5 py-16 text-center text-sm ${mutedTextClass}`}>
                    {t('No system roles available yet.')}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {roles.map((role, index) => (
                      <div key={role.id} className={`rounded-[20px] border bg-gradient-to-br p-4 ${gradientTone(index, isDark)}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`text-xs uppercase tracking-[0.28em] ${mutedTextClass}`}>{t('System Role')}</p>
                            <h3 className={`mt-2 text-base font-semibold ${headingClass}`}>{role.name}</h3>
                          </div>
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                            isDark ? 'border-white/10 bg-white/5 text-slate-200' : 'border-slate-200/80 bg-white/80 text-slate-700'
                          }`}>
                            <ShieldCheck size={18} />
                          </div>
                        </div>

                        <div className={`mt-4 rounded-[18px] border px-3 py-3 ${
                          isDark ? 'border-slate-800 bg-slate-950/55' : 'border-slate-200 bg-white/70'
                        }`}>
                          <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>{t('Assigned Users')}</p>
                          <div className={`mt-2 text-2xl font-bold ${headingClass}`}>{role.users_count || 0}</div>
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditRole(role)}
                            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                              isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Pencil size={16} />
                            {t('Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => askDeleteRole(role)}
                            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                              isDark ? 'border-rose-500/20 text-rose-300 hover:bg-rose-500/10' : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <Trash2 size={16} />
                            {t('Delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <UserModal
        isOpen={userModalOpen}
        mode={userModalMode}
        form={userForm}
        roles={roles}
        permissionOptions={permissionOptions}
        saving={savingUser}
        error={userError}
        onClose={resetUserModal}
        onChange={(key, value) => setUserForm((current) => {
          if (key === 'role') {
            const rolePermissions = getRolePermissionNames(roles, value)
            return {
              ...current,
              role: value,
              permissions: rolePermissions,
            }
          }

          return { ...current, [key]: value }
        })}
        onSubmit={handleSaveUser}
        isDark={isDark}
        t={t}
      />

      <RoleModal
        isOpen={roleModalOpen}
        mode={roleModalMode}
        form={roleForm}
        saving={savingRole}
        error={roleError}
        onClose={resetRoleModal}
        onChange={(key, value) => setRoleForm((current) => ({ ...current, [key]: value }))}
        onSubmit={handleSaveRole}
        isDark={isDark}
        t={t}
      />

      <ConfirmModal
        isOpen={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        actionLabel={confirmState?.actionLabel || t('Delete')}
        danger
        busy={deleteBusy}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirmDelete}
        isDark={isDark}
        t={t}
      />
    </>
  )
}
