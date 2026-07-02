import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../utils/api'

const initialPagination = {
  current_page: 1,
  last_page: 1,
  per_page: 25,
  total: 0,
  from: 0,
  to: 0,
}

const initialStats = {
  tenants_24h: 0,
  total_24h: 0,
  error_incidents_24h: 0,
  oldest_open: '-',
}

export default function SystemErrorLog() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)
  const [selectedError, setSelectedError] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(initialPagination)
  const [stats, setStats] = useState(initialStats)
  const [lookups, setLookups] = useState({ tenants: [], levels: [], resolution_statuses: [] })
  const [launchStartAt, setLaunchStartAt] = useState(null)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [filters, setFilters] = useState({
    search: '',
    tenant_id: '',
    level: '',
    resolution_status: 'open',
    date_from: '',
    date_to: '',
  })

  const fetchErrors = useCallback(async (nextPage = page, { silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await api.get('/api/super-admin/system-errors', {
        params: {
          page: nextPage,
          per_page: pagination.per_page,
          ...filters,
        },
      })

      setErrors(response.data?.data || [])
      setPagination((prev) => ({
        ...prev,
        ...(response.data?.meta || {}),
      }))
      setLaunchStartAt(response.data?.meta?.launch_start_at || null)
      setStats(response.data?.stats || initialStats)
      setLookups(response.data?.lookups || { tenants: [], levels: [], resolution_statuses: [] })
    } catch (error) {
      console.error('Failed to fetch system errors:', error)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [filters, page, pagination.per_page])

  useEffect(() => {
    fetchErrors(page)
  }, [page, fetchErrors])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchErrors(page, { silent: true })
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [fetchErrors, page])

  useEffect(() => {
    if (!selectedError) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedError(null)
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedError])

  const updateFilter = (key, value) => {
    setPage(1)
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const resetFilters = () => {
    setPage(1)
    setFilters({
      search: '',
      tenant_id: '',
      level: '',
      resolution_status: 'open',
      date_from: '',
      date_to: '',
    })
  }

  const handleResolve = async (errorId) => {
    setResolvingId(errorId)
    try {
      await api.patch(`/api/super-admin/system-errors/${errorId}/resolve`)
      if (selectedError?.id === errorId) {
        setSelectedError(null)
      }
      await fetchErrors(page)
    } catch (error) {
      console.error('Failed to resolve system error:', error)
    } finally {
      setResolvingId(null)
    }
  }

  const levelTone = (level) => {
    if (level === 'error') return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
    if (level === 'warning') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-200'
  }

  const resolutionTone = (isResolved) => (
    isResolved
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200'
  )

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`
  const headingClass = isDark ? 'text-white' : 'text-slate-950'
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const labelClass = isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-900'
  const inputClass = `h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-900/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/80 text-slate-700 placeholder:text-slate-400'
  }`
  const filterBtnClass = isDark
    ? 'bg-blue-950/40 text-blue-300 hover:bg-blue-950/60'
    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'

  const statCards = useMemo(() => ([
    {
      key: 'tenants',
      label: t('Tenants with errors (24h)'),
      value: stats.tenants_24h,
      icon: ShieldAlert,
      tone: isDark
        ? 'from-blue-500/16 via-blue-500/6 to-transparent border-blue-500/18'
        : 'from-blue-100/90 via-blue-50/80 to-white border-blue-200/70',
      iconTone: isDark ? 'bg-blue-500/14 text-blue-300 border-blue-400/20' : 'bg-blue-100 text-blue-700 border-blue-200/80',
    },
    {
      key: 'total',
      label: t('Total errors (24h)'),
      value: stats.total_24h,
      icon: TriangleAlert,
      tone: isDark
        ? 'from-violet-500/16 via-violet-500/6 to-transparent border-violet-500/18'
        : 'from-violet-100/90 via-violet-50/80 to-white border-violet-200/70',
      iconTone: isDark ? 'bg-violet-500/14 text-violet-300 border-violet-400/20' : 'bg-violet-100 text-violet-700 border-violet-200/80',
    },
    {
      key: 'critical',
      label: t('Error-level incidents (24h)'),
      value: stats.error_incidents_24h,
      icon: Siren,
      tone: isDark
        ? 'from-rose-500/16 via-rose-500/6 to-transparent border-rose-500/18'
        : 'from-rose-100/90 via-rose-50/80 to-white border-rose-200/70',
      iconTone: isDark ? 'bg-rose-500/14 text-rose-300 border-rose-400/20' : 'bg-rose-100 text-rose-700 border-rose-200/80',
    },
    {
      key: 'oldest',
      label: t('Oldest open issue'),
      value: stats.oldest_open,
      icon: Clock3,
      tone: isDark
        ? 'from-amber-500/16 via-amber-500/6 to-transparent border-amber-500/18'
        : 'from-amber-100/90 via-amber-50/80 to-white border-amber-200/70',
      iconTone: isDark ? 'bg-amber-500/14 text-amber-300 border-amber-400/20' : 'bg-amber-100 text-amber-700 border-amber-200/80',
    },
  ]), [isDark, stats, t])

  const pageNumbers = useMemo(() => {
    const current = Math.max(1, pagination.current_page || 1)
    const last = Math.max(1, pagination.last_page || 1)
    const pages = new Set([1, last, current - 1, current, current + 1])

    return Array.from(pages)
      .filter((value) => value >= 1 && value <= last)
      .sort((a, b) => a - b)
  }, [pagination.current_page, pagination.last_page])

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8">
      <header className="mb-6">
        <div>
          <p className={`mb-2 text-xs uppercase tracking-[0.3em] ${mutedTextClass}`}>
            {t('System Monitor')}
          </p>
          <h1 className={`text-3xl font-bold tracking-tight md:text-4xl ${headingClass}`}>
            {t('Multi-tenant Error Log')}
          </h1>
          <p className={`mt-3 max-w-3xl text-sm md:text-base ${mutedTextClass}`}>
            {t('Central view of grouped errors across all tenants, services and endpoints.')}
          </p>
          {launchStartAt && (
            <p className={`mt-2 text-xs md:text-sm ${mutedTextClass}`}>
              {t('Showing production errors since {{date}}.', {
                date: new Date(launchStartAt).toLocaleString(),
              })}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 xl:flex-1">
            {statCards.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.key}
                  className={`${glassCard} relative overflow-hidden bg-gradient-to-br px-4 py-3 ${card.tone}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold leading-6 ${headingClass}`}>{card.label}</p>
                      <p className={`mt-3 break-words text-2xl font-bold tracking-tight md:text-3xl ${headingClass}`}>{card.value}</p>
                    </div>
                    <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${card.iconTone}`}>
                      <Icon size={19} />
                    </span>
                  </div>
                </div>
              )
            })}
          </section>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <button
              type="button"
              onClick={() => fetchErrors(page)}
              disabled={loading}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {t('Refresh')}
            </button>
            <span className={`text-xs ${mutedTextClass}`}>
              {t('Auto refresh every 30 seconds')}
            </span>
          </div>
        </div>
      </header>

      <section className={`${glassCard} mb-6 p-5 md:p-6`}>
        <div className="mb-5 flex  gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
              <Search size={20} />
            </span>
            <div>
              <p className={`text-2xl font-semibold ${headingClass}`}>{t('Filters')}</p>
              <p className={`mt-1 text-sm ${mutedTextClass}`}>{t('Filters apply automatically as you type or select.')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-auto">
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
              onClick={resetFilters}
              className={`px-2 py-2 text-xs font-medium transition-colors ${isDark ? 'text-slate-200 hover:text-white' : 'text-slate-950 hover:text-slate-600'}`}
            >
              {t('Reset')}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <span className={`flex items-center gap-2 ${labelClass}`}>
                <Search className="h-4 w-4 text-blue-500" />
                {t('Search')}
              </span>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder={t('Search message, service, or endpoint')}
                  className={`${inputClass} pl-10 pr-3`}
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className={`block ${labelClass}`}>{t('Tenant')}</span>
              <select
                value={filters.tenant_id}
                onChange={(event) => updateFilter('tenant_id', event.target.value)}
                className={inputClass}
              >
                <option value="">{t('All tenants')}</option>
                {lookups.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className={`block ${labelClass}`}>{t('Level')}</span>
              <select
                value={filters.level}
                onChange={(event) => updateFilter('level', event.target.value)}
                className={inputClass}
              >
                <option value="">{t('All levels')}</option>
                {lookups.levels.map((level) => (
                  <option key={level} value={level}>
                    {t(level)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className={`block ${labelClass}`}>{t('State')}</span>
              <select
                value={filters.resolution_status}
                onChange={(event) => updateFilter('resolution_status', event.target.value)}
                className={inputClass}
              >
                <option value="open">{t('Open only')}</option>
                <option value="resolved">{t('Resolved only')}</option>
                <option value="all">{t('Open and resolved')}</option>
              </select>
            </label>
          </div>

          {showMoreFilters && (
            <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className={`block ${labelClass}`}>{t('From date')}</span>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(event) => updateFilter('date_from', event.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className={`block ${labelClass}`}>{t('To date')}</span>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(event) => updateFilter('date_to', event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}
        </div>
      </section>

      <section className={`${glassCard} overflow-hidden`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200/80'}`}>
          <div>
            <p className={`text-2xl font-semibold ${headingClass}`}>{t('Error stream')}</p>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>{t('Grouped error incidents ordered by last seen time.')}</p>
          </div>
          <p className={`text-xs ${mutedTextClass}`}>
            {pagination.total > 0
              ? t('Showing {{from}}-{{to}} of {{total}}', {
                  from: pagination.from,
                  to: pagination.to,
                  total: pagination.total,
                })
              : t('No results')}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead className={isDark ? 'bg-slate-950/70' : 'bg-slate-50/80'}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Time')}</th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Tenant')}</th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Service')}</th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Message')}</th>
                <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Status')}</th>
                <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Level')}</th>
                <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Count')}</th>
                <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Last seen')}</th>
                <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('State')}</th>
                <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className={isDark ? 'divide-y divide-slate-800 bg-slate-900/40' : 'divide-y divide-slate-200/80 bg-white/90'}>
              {loading ? (
                <tr>
                  <td colSpan="10" className={`px-4 py-6 text-center ${mutedTextClass}`}>
                    {t('Loading...')}
                  </td>
                </tr>
              ) : errors.length === 0 ? (
                <tr>
                  <td colSpan="10" className={`px-4 py-8 text-center ${mutedTextClass}`}>
                    {t('No errors found.')}
                  </td>
                </tr>
              ) : (
                errors.map((err) => (
                  <tr key={err.id} className={`align-top transition-colors ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/80'}`}>
                    <td className={`whitespace-nowrap px-4 py-3 ${headingClass}`}>{err.time}</td>
                    <td className={`whitespace-nowrap px-4 py-3 font-medium ${headingClass}`}>{err.tenant}</td>
                    <td className={`px-4 py-3 ${headingClass}`}>
                      <div className="font-medium">{err.service || '-'}</div>
                      <div className={`mt-1 font-mono text-[11px] ${mutedTextClass}`}>{err.endpoint || '-'}</div>
                    </td>
                    <td className={`px-4 py-3 ${headingClass}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedError(err)}
                        className="max-w-[320px] truncate text-left hover:text-blue-400"
                        title={err.message || '-'}
                      >
                        {err.message || '-'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-800 dark:bg-gray-800/40 dark:text-gray-200">
                        {err.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-medium ${levelTone(err.level)}`}>
                        {t(err.level)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-center ${headingClass}`}>{err.count}</td>
                    <td className={`px-4 py-3 text-center ${mutedTextClass}`}>{err.last_seen_short}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-medium ${resolutionTone(err.is_resolved)}`}>
                        {err.is_resolved ? t('Resolved') : t('Open')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedError(err)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                            isDark
                              ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {t('Details')}
                        </button>
                        {!err.is_resolved && (
                          <button
                            type="button"
                            onClick={() => handleResolve(err.id)}
                            disabled={resolvingId === err.id}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {resolvingId === err.id ? t('Resolving...') : t('Resolve')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={`flex  gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-slate-800' : 'border-slate-200/80'}`}>
          <div className="flex  gap-1 sm:flex-row sm:items-center sm:gap-4">
            <p className={`text-xs ${mutedTextClass}`}>
              {t('Showing {{from}}-{{to}} of {{total}}', {
                from: pagination.total === 0 ? 0 : pagination.from,
                to: pagination.total === 0 ? 0 : pagination.to,
                total: pagination.total,
              })}
            </p>
            <p className={`text-xs ${mutedTextClass}`}>
              {t('Page {{page}} of {{pages}}', {
                page: Math.max(1, pagination.current_page),
                pages: Math.max(1, pagination.last_page),
              })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || pagination.current_page <= 1}
              aria-label={t('Previous')}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex items-center gap-1.5">
              {pageNumbers.map((pageNumber, index) => {
                const previous = pageNumbers[index - 1]
                const showGap = previous && pageNumber - previous > 1

                return (
                  <div key={pageNumber} className="flex items-center gap-1.5">
                    {showGap && <span className={`px-1 text-sm ${mutedTextClass}`}>...</span>}
                    <button
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      disabled={loading}
                      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        pageNumber === pagination.current_page
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : isDark
                            ? 'border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pagination.last_page, current + 1))}
              disabled={loading || pagination.current_page >= pagination.last_page}
              aria-label={t('Next')}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {selectedError && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center px-4 py-5">
          <div
            className="absolute inset-0 bg-slate-950/72 backdrop-blur-sm"
            onClick={() => setSelectedError(null)}
          />

          <div
            className={`relative z-10 flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border shadow-[0_30px_90px_rgba(0,0,0,0.35)] ${
              isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className={`sticky top-0 z-10 border-b backdrop-blur-xl ${
              isDark ? 'border-slate-700 bg-slate-900/96' : 'border-slate-200 bg-white/96'
            }`}>
              <div className="flex items-start justify-between gap-4 px-5 py-4 md:px-6">
                <div className="min-w-0">
                  <p className={`text-xs uppercase tracking-[0.28em] ${mutedTextClass}`}>
                    {t('Error details')}
                  </p>
                  <h2 className={`mt-3 line-clamp-2 text-2xl font-bold tracking-tight md:text-4xl ${headingClass}`}>
                    {selectedError.message || t('System error')}
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      isDark ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-700' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                    }`}>
                      {selectedError.tenant}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      isDark ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-700' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                    }`}>
                      {selectedError.service || '-'}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      isDark ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-700' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                    }`}>
                      {selectedError.time}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${levelTone(selectedError.level)}`}>
                      {t(selectedError.level)}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${resolutionTone(selectedError.is_resolved)}`}>
                      {selectedError.is_resolved ? t('Resolved') : t('Open')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedError(null)}
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                    isDark
                      ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
              <div className="space-y-5">
                <section className={`${glassCard} overflow-hidden bg-gradient-to-br px-5 py-5 ${
                  isDark ? 'from-slate-800/80 via-slate-900 to-slate-950' : 'from-slate-50 via-white to-white'
                }`}>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailMetric isDark={isDark} label={t('Status code')} value={String(selectedError.status ?? '-')} />
                    <DetailMetric isDark={isDark} label={t('Count')} value={String(selectedError.count ?? 0)} />
                    <DetailMetric isDark={isDark} label={t('First seen')} value={selectedError.created_at_human || '-'} />
                    <DetailMetric isDark={isDark} label={t('Last seen')} value={selectedError.last_seen_human || '-'} />
                  </div>
                </section>

                <DetailCard isDark={isDark} title={t('Overview')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailItem isDark={isDark} label={t('Tenant')} value={selectedError.tenant} />
                    <DetailItem isDark={isDark} label={t('Resolved at')} value={selectedError.resolved_at_human || '-'} />
                    <DetailItem isDark={isDark} label={t('Level')} value={t(selectedError.level)} />
                    <DetailItem isDark={isDark} label={t('State')} value={selectedError.is_resolved ? t('Resolved') : t('Open')} />
                  </div>
                </DetailCard>

                <DetailCard isDark={isDark} title={t('Request context')}>
                  <div className="space-y-3">
                    <DetailItem isDark={isDark} label={t('Service')} value={selectedError.service || '-'} full />
                    <DetailItem isDark={isDark} label={t('Endpoint')} value={selectedError.endpoint || '-'} mono full />
                  </div>
                </DetailCard>

                <DetailCard isDark={isDark} title={t('Message')}>
                  <div className={`rounded-3xl border p-4 text-sm leading-7 ${
                    isDark ? 'border-slate-700 bg-slate-950/70 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'
                  }`}>
                    {selectedError.message || '-'}
                  </div>
                </DetailCard>

                <DetailCard isDark={isDark} title={t('Stack trace')}>
                  <pre className={`overflow-x-auto rounded-3xl border p-4 text-xs leading-6 ${
                    isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}>
                    {selectedError.stack_trace || '-'}
                  </pre>
                </DetailCard>

                {!selectedError.is_resolved && (
                  <div className="flex justify-end border-t border-dashed pt-2 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleResolve(selectedError.id)}
                      disabled={resolvingId === selectedError.id}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 size={16} />
                      {resolvingId === selectedError.id ? t('Resolving...') : t('Mark as resolved')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function DetailCard({ title, children, isDark }) {
  return (
    <section className={`rounded-[28px] border p-5 shadow-[0_12px_30px_rgba(0,0,0,0.2)] ${
      isDark ? 'border-slate-800 bg-slate-900/55' : 'border-slate-200 bg-white/90'
    }`}>
      <h3 className={isDark ? 'text-xl font-semibold text-white' : 'text-xl font-semibold text-slate-900'}>{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function DetailItem({ label, value, mono = false, full = false, isDark }) {
  return (
    <div className={`rounded-3xl border p-4 ${
      isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/90'
    } ${full ? 'w-full' : ''}`}>
      <div className={isDark ? 'text-xs font-medium uppercase tracking-[0.2em] text-slate-400' : 'text-xs font-medium uppercase tracking-[0.2em] text-slate-500'}>{label}</div>
      <div className={`mt-2 break-words text-sm leading-7 ${mono ? 'font-mono' : ''} ${
        isDark ? 'text-slate-100' : 'text-slate-800'
      }`}>
        {value}
      </div>
    </div>
  )
}

function DetailMetric({ label, value, isDark }) {
  return (
    <div className={`rounded-3xl border p-4 ${
      isDark ? 'border-slate-800 bg-slate-950/45' : 'border-slate-200 bg-white/85'
    }`}>
      <div className={isDark ? 'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400' : 'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500'}>{label}</div>
      <div className={isDark ? 'mt-3 text-2xl font-semibold tracking-tight text-white' : 'mt-3 text-2xl font-semibold tracking-tight text-slate-900'}>{value}</div>
    </div>
  )
}
