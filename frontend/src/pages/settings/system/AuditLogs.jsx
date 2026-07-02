import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Filter,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../../../utils/api'

const DEFAULT_FILTERS = {
  search: '',
  tenant_id: '',
  user_id: '',
  log_name: '',
  subject_type: '',
  event: '',
  date_from: '',
  date_to: '',
}

const EVENT_OPTIONS = ['created', 'updated', 'deleted', 'restored']

const prettySubjectType = (value = '') => {
  const subject = String(value || '')
  if (!subject) return '-'
  const lastPart = subject.split('\\').pop() || subject
  return lastPart.replace(/([a-z])([A-Z])/g, '$1 $2')
}

const prettyLogName = (value = '') => {
  if (!value) return '-'
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const formatDescriptionDetails = (details = '') =>
  String(details || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const stringifyJsonBlock = (value) => {
  try {
    return JSON.stringify(value || {}, null, 2)
  } catch {
    return '{}'
  }
}

const collectPaginatedItems = async (requestPage, key) => {
  const items = []
  let page = 1
  let lastPage = 1

  do {
    const response = await requestPage(page)
    const payload = response?.data?.[key]
    const pageItems = payload?.data || []

    items.push(...pageItems)
    lastPage = payload?.last_page || 1
    page += 1
  } while (page <= lastPage)

  return items
}

export default function AuditLogs() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 10,
    total: 0,
    from: 0,
    to: 0,
  })
  const [tenantOptions, setTenantOptions] = useState([])
  const [userOptions, setUserOptions] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`
  const inputClass = `h-10 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-900/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/80 text-slate-700 placeholder:text-slate-400'
  }`
  const labelClass = isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-900'
  const headingClass = isDark ? 'text-white' : 'text-slate-950'
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const filterIconClass = isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600'
  const filterBtnClass = isDark
    ? 'bg-blue-950/40 text-blue-300 hover:bg-blue-950/60'
    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'

  const userLookup = useMemo(() => {
    return userOptions.reduce((acc, user) => {
      acc[user.id] = user
      return acc
    }, {})
  }, [userOptions])

  const tenantLookup = useMemo(() => {
    return tenantOptions.reduce((acc, tenant) => {
      acc[tenant.id] = tenant
      return acc
    }, {})
  }, [tenantOptions])

  const stats = useMemo(() => {
    const tenantIds = new Set(logs.map((item) => item.tenant_id).filter(Boolean))
    const userIds = new Set(logs.map((item) => item.causer_id).filter(Boolean))
    const criticalEvents = logs.filter((item) => ['deleted'].includes(String(item.event || '').toLowerCase())).length

    return {
      total: pagination.total || 0,
      currentPage: logs.length,
      tenants: tenantIds.size,
      users: userIds.size,
      criticalEvents,
    }
  }, [logs, pagination.total])

  const statCards = [
    {
      key: 'total',
      label: 'Total Results',
      value: stats.total,
      icon: FileText,
      tone: isDark
        ? 'from-blue-500/16 via-blue-500/6 to-transparent border-blue-500/18'
        : 'from-blue-100/90 via-blue-50/80 to-white border-blue-200/70',
      iconTone: isDark ? 'bg-blue-500/14 text-blue-300 border-blue-400/20' : 'bg-blue-100 text-blue-700 border-blue-200/80',
    },
    {
      key: 'currentPage',
      label: 'Current Page',
      value: stats.currentPage,
      icon: Waypoints,
      tone: isDark
        ? 'from-violet-500/16 via-violet-500/6 to-transparent border-violet-500/18'
        : 'from-violet-100/90 via-violet-50/80 to-white border-violet-200/70',
      iconTone: isDark ? 'bg-violet-500/14 text-violet-300 border-violet-400/20' : 'bg-violet-100 text-violet-700 border-violet-200/80',
    },
    {
      key: 'tenants',
      label: 'Tenants Seen',
      value: stats.tenants,
      icon: Building2,
      tone: isDark
        ? 'from-emerald-500/16 via-emerald-500/6 to-transparent border-emerald-500/18'
        : 'from-emerald-100/90 via-emerald-50/80 to-white border-emerald-200/70',
      iconTone: isDark ? 'bg-emerald-500/14 text-emerald-300 border-emerald-400/20' : 'bg-emerald-100 text-emerald-700 border-emerald-200/80',
    },
    {
      key: 'criticalEvents',
      label: 'Delete Events',
      value: stats.criticalEvents,
      icon: Trash2,
      tone: isDark
        ? 'from-rose-500/16 via-rose-500/6 to-transparent border-rose-500/18'
        : 'from-rose-100/90 via-rose-50/80 to-white border-rose-200/70',
      iconTone: isDark ? 'bg-rose-500/14 text-rose-300 border-rose-400/20' : 'bg-rose-100 text-rose-700 border-rose-200/80',
    },
  ]

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search)
      setPage(1)
    }, 350)

    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [allTenants, allUsers] = await Promise.all([
          collectPaginatedItems(
            (pageNumber) =>
              api.get('/super-admin/tenants', {
                params: { page: pageNumber, per_page: 100, view: 'current' },
              }),
            'tenants'
          ),
          collectPaginatedItems(
            (pageNumber) =>
              api.get('/super-admin/admin-users', {
                params: { page: pageNumber },
              }),
            'users'
          ),
        ])

        setTenantOptions(allTenants)
        setUserOptions(allUsers)
      } catch (error) {
        console.error('Failed to load audit log lookups:', error)
      }
    }

    loadLookups()
  }, [])

  useEffect(() => {
    if (!selectedLog) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedLog(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedLog])

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true)
      try {
        const activeFilters = {
          ...filters,
          search: debouncedSearch,
        }
        const params = {
          ...Object.fromEntries(
            Object.entries(activeFilters).filter(([, value]) => value !== '' && value != null)
          ),
          page,
          per_page: pagination.per_page,
          sort_by: 'created_at',
          sort_dir: 'desc',
        }

        const { data } = await api.get('/super-admin/logs', { params })
        setLogs(data?.data || [])
        setPagination((prev) => ({
          ...prev,
          current_page: data?.current_page || prev.current_page,
          last_page: data?.last_page || prev.last_page,
          per_page: data?.per_page || prev.per_page,
          total: data?.total || 0,
          from: data?.from || 0,
          to: data?.to || 0,
        }))
      } catch (error) {
        console.error('Failed to load audit logs:', error)
        toast.error(t('Failed to load audit logs'))
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [
    debouncedSearch,
    filters.date_from,
    filters.date_to,
    filters.event,
    filters.log_name,
    filters.subject_type,
    filters.tenant_id,
    filters.user_id,
    page,
    pagination.per_page,
    refreshKey,
    t,
  ])

  const handleFilterChange = (key, value) => {
    if (key !== 'search') {
      setPage(1)
    }
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
    setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const activeFilters = {
        ...filters,
        search: debouncedSearch,
      }
      const params = Object.fromEntries(
        Object.entries(activeFilters).filter(([, value]) => value !== '' && value != null)
      )

      const response = await api.get('/super-admin/logs/export', {
        params,
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'audit_logs.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export audit logs:', error)
      toast.error(t('Failed to export audit logs'))
    } finally {
      setExporting(false)
    }
  }

  const handleCopyDetails = async () => {
    if (!selectedLog) return

    const payload = [
      selectedLog.description_summary || selectedLog.description || '',
      selectedLog.description_details || '',
      stringifyJsonBlock(selectedLog.properties),
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      await navigator.clipboard.writeText(payload)
      toast.success(t('Audit details copied'))
    } catch (error) {
      console.error('Failed to copy audit details:', error)
      toast.error(t('Failed to copy audit details'))
    }
  }

  const detailsDrawer =
    selectedLog && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 md:p-4 backdrop-blur-sm">
            <button
              type="button"
              className="absolute inset-0"
              onClick={() => setSelectedLog(null)}
              aria-label={t('Close details')}
            />

            <div
              className={`relative z-10 w-full max-w-4xl max-h-[84vh] overflow-y-auto rounded-2xl border shadow-2xl ${
                isDark
                  ? 'border-slate-700/70 bg-slate-900 text-slate-100'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className={`sticky top-0 z-10 border-b px-5 py-4 ${
                isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.25em] ${mutedTextClass}`}>{t('Audit Details')}</p>
                    <h2 className={`mt-2 text-xl font-bold ${headingClass}`}>
                      {selectedLog.description_summary || selectedLog.description || t('Audit log')}
                    </h2>
                    <p className={`mt-2 text-sm ${mutedTextClass}`}>
                      {selectedLog.causer_name || t('System')} | {prettyLogName(selectedLog.log_name)} | {formatDateTime(selectedLog.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyDetails}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                        isDark
                          ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      aria-label={t('Copy details')}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(null)}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                        isDark
                          ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      aria-label={t('Close')}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className={`px-5 py-5 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                <div className="space-y-6">
                <section className={`${glassCard} p-4`}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className={`text-xs uppercase tracking-[0.2em] ${mutedTextClass}`}>{t('User')}</p>
                      <p className="mt-2 text-sm font-semibold">{selectedLog.causer_name || t('System')}</p>
                      <p className={`mt-1 text-sm ${mutedTextClass}`}>{selectedLog.causer_email || '-'}</p>
                    </div>
                    <div>
                      <p className={`text-xs uppercase tracking-[0.2em] ${mutedTextClass}`}>{t('Tenant')}</p>
                      <p className="mt-2 text-sm font-semibold">{selectedLog.tenant_name || '-'}</p>
                      <p className={`mt-1 text-sm ${mutedTextClass}`}>{selectedLog.tenant_domain || '-'}</p>
                    </div>
                    <div>
                      <p className={`text-xs uppercase tracking-[0.2em] ${mutedTextClass}`}>{t('Event')}</p>
                      <p className="mt-2 text-sm font-semibold capitalize">{selectedLog.event || '-'}</p>
                    </div>
                    <div>
                      <p className={`text-xs uppercase tracking-[0.2em] ${mutedTextClass}`}>{t('Subject')}</p>
                      <p className="mt-2 text-sm font-semibold">{prettySubjectType(selectedLog.subject_type)}</p>
                    </div>
                  </div>
                </section>

                <section className={`${glassCard} p-4`}>
                  <h3 className={`text-sm font-semibold ${headingClass}`}>{t('Summary')}</h3>
                  <p className="mt-3 text-sm leading-6">{selectedLog.description_summary || selectedLog.description || '-'}</p>
                </section>

                <section className={`${glassCard} p-4`}>
                  <h3 className={`text-sm font-semibold ${headingClass}`}>{t('Detailed explanation')}</h3>
                  <div className="mt-3 space-y-2 text-sm leading-6">
                    {formatDescriptionDetails(selectedLog.description_details || '').length > 0 ? (
                      formatDescriptionDetails(selectedLog.description_details || '').map((line, index) => (
                        <p key={`drawer-detail-${selectedLog.id}-${index}`}>{line}</p>
                      ))
                    ) : (
                      <p>{t('No additional details')}</p>
                    )}
                  </div>
                </section>

                <section className={`${glassCard} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`text-sm font-semibold ${headingClass}`}>{t('Raw properties')}</h3>
                    <span className={`text-xs ${mutedTextClass}`}>{t('Selectable and copyable')}</span>
                  </div>
                  <pre
                    className={`mt-3 overflow-x-auto rounded-2xl border p-4 text-xs leading-6 ${
                      isDark
                        ? 'border-slate-800 bg-slate-900 text-slate-200'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {stringifyJsonBlock(selectedLog.properties)}
                  </pre>
                </section>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div className={`relative mx-auto max-w-screen-2xl overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${
      isDark
        ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
        : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
    }`}>
      {isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_28%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%)]" />
        </>
      )}

      <div className="relative z-10">
        <header className="mb-10">
          <div className="flex gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <p className={`mb-2 text-xs uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('Admin Panel')}
              </p>
              <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {t('Audit Logs')}
              </h1>
              <p className={`mt-3 max-w-2xl text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {t('Review platform-wide activity, changes, and admin actions from one place.')}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPage(1)
                  setRefreshKey((prev) => prev + 1)
                }}
                disabled={loading}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
                  isDark
                    ? 'border-slate-700/60 bg-slate-900/80 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-200/80 bg-white/78 text-slate-600 hover:bg-white'
                }`}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {t('Refresh')}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Download size={14} />
                {exporting ? t('Exporting...') : t('Export CSV')}
              </button>
            </div>
          </div>
        </header>

        <section className="mt-4 mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.key}
                className={`${glassCard} relative overflow-hidden border bg-gradient-to-br px-4 py-3 ${card.tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-xs uppercase tracking-[0.22em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t(card.label)}
                    </p>
                    <p className={`mt-3 break-words text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>{card.value}</p>
                  </div>
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${card.iconTone}`}>
                    <Icon size={19} />
                  </span>
                </div>
              </div>
            )
          })}
        </section>

        <section className={`${glassCard} mb-5 p-5 md:p-6`}>
          <div className="mb-5 flex gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${filterIconClass}`}>
                <Filter size={20} />
              </span>
                <div>
                  <h2 className={`text-xl font-bold ${headingClass}`}>{t('Filters')}</h2>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    {t('Filters apply automatically as you type or select.')}
                  </p>
                </div>
              </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowMoreFilters((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-colors ${filterBtnClass}`}
              >
                <span>{showMoreFilters ? t('Hide filters') : t('More filters')}</span>
                <ChevronDown size={18} className={`transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className={`px-2 py-2 text-xs font-medium transition-colors ${isDark ? 'text-slate-200 hover:text-white' : 'text-slate-950 hover:text-slate-600'}`}
              >
                {t('Reset')}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <label className={`flex items-center gap-2 ${labelClass}`}>
                  <Search className="h-4 w-4 text-blue-500" />
                  {t('Search')}
                </label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    placeholder={t('Search description or properties...')}
                    className={`${inputClass} pl-10 pr-3`}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className={`block ${labelClass}`}>{t('Event')}</label>
                <select
                  value={filters.event}
                  onChange={(e) => handleFilterChange('event', e.target.value)}
                  className={`${inputClass} px-3`}
                >
                  <option value="">{t('All events')}</option>
                  {EVENT_OPTIONS.map((event) => (
                    <option key={event} value={event}>
                      {t(event)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className={`block ${labelClass}`}>{t('Tenant')}</label>
                <select
                  value={filters.tenant_id}
                  onChange={(e) => handleFilterChange('tenant_id', e.target.value)}
                  className={`${inputClass} px-3`}
                >
                  <option value="">{t('All tenants')}</option>
                  {tenantOptions.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className={`block ${labelClass}`}>{t('User')}</label>
                <select
                  value={filters.user_id}
                  onChange={(e) => handleFilterChange('user_id', e.target.value)}
                  className={`${inputClass} px-3`}
                >
                  <option value="">{t('All users')}</option>
                  {userOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {showMoreFilters && (
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Log name')}</label>
                  <input
                    value={filters.log_name}
                    onChange={(e) => handleFilterChange('log_name', e.target.value)}
                    placeholder={t('Log name')}
                    className={`${inputClass} px-3`}
                  />
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Subject type')}</label>
                  <input
                    value={filters.subject_type}
                    onChange={(e) => handleFilterChange('subject_type', e.target.value)}
                    placeholder={t('Subject type')}
                    className={`${inputClass} px-3`}
                  />
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Start Date')}</label>
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => handleFilterChange('date_from', e.target.value)}
                    className={`${inputClass} px-3`}
                  />
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('End Date')}</label>
                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => handleFilterChange('date_to', e.target.value)}
                    className={`${inputClass} px-3`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {pagination.total > 0
                ? t('Showing {{from}}-{{to}} of {{total}}', {
                    from: pagination.from,
                    to: pagination.to,
                    total: pagination.total,
                  })
                : t('No results')}
            </div>
          </div>
        </section>

        <section className={`${glassCard} overflow-visible`}>
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[980px] text-sm">
              <thead className={isDark ? 'bg-slate-950/70' : 'bg-slate-50/90'}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('User')}</th>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('Tenant')}</th>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('Log')}</th>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('Event')}</th>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('Subject')}</th>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('Description')}</th>
                  <th className="px-4 py-3 text-left font-medium text-theme">{t('Time')}</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800 bg-slate-900/60' : 'divide-slate-200 bg-white/85'}`}>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center text-theme">
                      {t('Loading...')}
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center text-theme">
                      {t('No audit logs found.')}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const tenant = tenantLookup[log.tenant_id]
                    const user = userLookup[log.causer_id]
                    const event = String(log.event || '').toLowerCase()
                    const eventTone =
                      event === 'deleted'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                        : event === 'updated'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : event === 'created'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

                    return (
                      <tr key={log.id}>
                        <td className="px-4 py-3 text-theme">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {log.causer_name || user?.name || (log.causer_id ? `#${log.causer_id}` : t('System'))}
                            </p>
                            <p className={`truncate text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {log.causer_email || user?.email || ''}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-theme">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{log.tenant_name || tenant?.name || `#${log.tenant_id || '-'}`}</p>
                            <p className={`truncate text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {log.tenant_domain || tenant?.domain || tenant?.slug || ''}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-theme whitespace-nowrap">
                          {prettyLogName(log.log_name)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${eventTone}`}>
                            {event || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-theme whitespace-nowrap">
                          {prettySubjectType(log.subject_type)}
                        </td>
                        <td className="px-4 py-3 text-theme">
                          <div className="max-w-[420px]">
                            <button
                              type="button"
                              onClick={() => setSelectedLog(log)}
                              className={`w-full text-left transition ${
                                isDark ? 'hover:text-blue-300' : 'hover:text-blue-700'
                              }`}
                            >
                              <p className="truncate" title={log.description_details || log.description_summary || log.description || '-'}>
                                {log.description_summary || log.description || '-'}
                              </p>
                              <p className={`mt-1 text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                                {t('View details')}
                              </p>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-theme">
                          {formatDateTime(log.created_at)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className={`flex gap-4 border-t px-5 py-4 md:flex-row md:items-center md:justify-between ${
            isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'
          }`}>
            <div className="text-sm">
              {t('Showing {{from}}-{{to}} of {{total}}', {
                from: pagination.total === 0 ? 0 : pagination.from,
                to: pagination.total === 0 ? 0 : pagination.to,
                total: pagination.total,
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm md:justify-end">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || pagination.current_page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  aria-label={t('Previous')}
                >
                  <ChevronLeft size={18} />
                </button>
                <span className={`min-w-[96px] text-center font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {t('Page {{page}} of {{pages}}', {
                    page: Math.max(1, pagination.current_page),
                    pages: Math.max(1, pagination.last_page),
                  })}
                </span>
                <button
                  type="button"
                  disabled={loading || pagination.current_page === pagination.last_page || pagination.total === 0}
                  onClick={() => setPage((current) => Math.min(pagination.last_page, current + 1))}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  aria-label={t('Next')}
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className={mutedTextClass}>{t('Per page:')}</span>
                <div className="relative">
                  <select
                    value={pagination.per_page}
                    onChange={(e) => {
                      setPage(1)
                      setPagination((prev) => ({ ...prev, per_page: Number(e.target.value) }))
                    }}
                    className={`h-11 min-w-[88px] appearance-none rounded-xl border pl-4 pr-9 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-200 focus:ring-blue-500/20'
                        : 'border-slate-200 bg-white text-slate-700 shadow-sm'
                    }`}
                  >
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                      isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {detailsDrawer}
    </div>
  )
}
