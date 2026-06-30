import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '@shared/context/AppStateProvider'
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip,
  AreaChart, Area,
} from 'recharts'
import {
  AlertCircle, Building2, Clock3, Users, UserPlus, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Hourglass,
  ChevronRight, Plus, ExternalLink, Infinity, Minus,
} from 'lucide-react'
import { api } from '@utils/api'

const DASHBOARD_SECTION_PERMISSIONS = {
  kpis: 'system.dashboard.kpis',
  health: 'system.dashboard.health',
  growth: 'system.dashboard.growth',
  planDistribution: 'system.dashboard.plan_distribution',
  statusBreakdown: 'system.dashboard.status_breakdown',
  recentTenants: 'system.dashboard.recent_tenants',
  expiringSoon: 'system.dashboard.expiring_soon',
}

// ─── KPI config ────────────────────────────────────────────────────────────────
const KPI_CONFIG = [
  {
    key: 'total_tenants',
    label: 'Total Tenants',
    icon: Building2,
    lightColorClasses: 'bg-slate-100 text-slate-600',
    darkColorClasses: 'bg-slate-800/90 text-slate-200',
    lightGlassTint: 'before:bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.28),transparent_52%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(226,232,240,0.42))]',
    darkGlassTint: 'before:bg-[linear-gradient(135deg,rgba(51,65,85,0.55),rgba(15,23,42,0.92))]',
    subtitle: 'All registered workspaces',
    trend: 'positive',
  },
  {
    key: 'active_tenants',
    label: 'Active Tenants',
    icon: CheckCircle2,
    lightColorClasses: 'bg-emerald-100 text-emerald-600',
    darkColorClasses: 'bg-emerald-900/50 text-emerald-300',
    lightGlassTint: 'before:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.32),transparent_52%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(209,250,229,0.44))]',
    darkGlassTint: 'before:bg-[linear-gradient(135deg,rgba(20,83,45,0.45),rgba(15,23,42,0.92))]',
    subtitle: 'Currently operational',
    trend: 'positive',
  },
  {
    key: 'cancelled_tenants',
    label: 'Cancelled',
    icon: XCircle,
    lightColorClasses: 'bg-red-100 text-red-600',
    darkColorClasses: 'bg-red-900/50 text-red-300',
    lightGlassTint: 'before:bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.32),transparent_52%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(254,226,226,0.44))]',
    darkGlassTint: 'before:bg-[linear-gradient(135deg,rgba(127,29,29,0.45),rgba(15,23,42,0.92))]',
    subtitle: 'Cancelled subscriptions',
    trend: 'negative',
  },
  {
    key: 'new_last_30_days',
    label: 'New This Month',
    icon: UserPlus,
    lightColorClasses: 'bg-blue-100 text-blue-600',
    darkColorClasses: 'bg-blue-900/50 text-blue-300',
    lightGlassTint: 'before:bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.34),transparent_52%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(219,234,254,0.44))]',
    darkGlassTint: 'before:bg-[linear-gradient(135deg,rgba(30,64,175,0.45),rgba(15,23,42,0.92))]',
    subtitle: 'Recent growth',
    trend: 'positive',
  },
  {
    key: 'expired_tenants',
    label: 'Expired',
    icon: XCircle,
    lightColorClasses: 'bg-amber-100 text-amber-600',
    darkColorClasses: 'bg-amber-900/50 text-amber-300',
    lightGlassTint: 'before:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.34),transparent_52%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(254,243,199,0.46))]',
    darkGlassTint: 'before:bg-[linear-gradient(135deg,rgba(120,53,15,0.45),rgba(15,23,42,0.92))]',
    subtitle: 'Churned workspaces',
    trend: 'negative',
  },
]

// ─── Color maps ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:    { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle2 },
  expired:   { dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',           icon: XCircle },
  pending:   { dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',       icon: Hourglass },
  cancelled: { dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',          icon: XCircle },
  unknown:   { dot: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',   icon: AlertCircle },
}

const PLAN_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4']
const PLAN_DOT_CLASSES = ['bg-blue-500','bg-emerald-500','bg-amber-500','bg-violet-500','bg-rose-500','bg-cyan-500']

function startOfCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusCfg(status, isDark = false) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown
  if (!isDark) return config

  const darkBadgeMap = {
    active: 'bg-emerald-900/40 text-emerald-300',
    expired: 'bg-rose-900/40 text-rose-300',
    pending: 'bg-amber-900/40 text-amber-300',
    cancelled: 'bg-slate-800 text-slate-300',
    unknown: 'bg-violet-900/40 text-violet-300',
  }

  return { ...config, badge: darkBadgeMap[status] || darkBadgeMap.unknown }
}

function DaysLeftBadge({ days, isDark = false }) {
  if (days <= 3)  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'}`}>{days}d left</span>
  if (days <= 7)  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>{days}d left</span>
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{days}d left</span>
}

function TrendBadge({ delta, sentiment, compare, isDark = false }) {
  if (delta == null) return null

  if (delta === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100 text-slate-500'
        }`}
        title={compare === 'previous_month' ? 'No change vs last month' : 'No change this month'}
      >
        <Minus size={11} />
        <span>0</span>
      </span>
    )
  }

  const isUp = delta > 0
  const Icon = isUp ? TrendingUp : TrendingDown
  const goodDirection = sentiment === 'positive' ? isUp : !isUp
  const tone = goodDirection
    ? isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
    : isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'
  const label = compare === 'previous_month' ? 'vs last month' : 'this month'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
      title={`${isUp ? '+' : ''}${delta} ${label}`}
    >
      <Icon size={11} />
      <span>{isUp ? '+' : ''}{delta}</span>
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-bg/60 backdrop-blur-sm p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="h-9 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-3 w-36 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

function RowSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      ))}
    </div>
  )
}

// ─── SummaryList ──────────────────────────────────────────────────────────────
function SummaryList({ items, labelKey, emptyLabel, getColorClass, total, isDark = false }) {
  if (!items?.length) return <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{emptyLabel}</p>

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => {
        const pct = total ? Math.round((item.count / total) * 100) : null
        return (
          <div key={`${item[labelKey]}-${index}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getColorClass(item, index)}`} />
                <span className={`truncate text-sm capitalize ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {String(item[labelKey] || 'unknown').replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pct !== null && <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{pct}%</span>}
                <span className={`text-sm font-semibold w-6 text-right ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{item.count ?? 0}</span>
              </div>
            </div>
            {pct !== null && (
              <div className={`h-1 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div
                  className={`h-full rounded-full ${getColorClass(item, index)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SystemAdminDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const { permissions = [] } = useAppState()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const isDark = resolvedTheme === 'dark'
  const hasDashboardAccess = permissions.includes('system.dashboard.view')
  const grantedSectionPermissions = useMemo(
    () => Object.values(DASHBOARD_SECTION_PERMISSIONS).filter((permission) => permissions.includes(permission)),
    [permissions]
  )
  const useSectionScopedVisibility = grantedSectionPermissions.length > 0

  const canViewSection = (permissionName) => {
    if (!hasDashboardAccess) return false
    if (!useSectionScopedVisibility) return true
    return grantedSectionPermissions.includes(permissionName)
  }

  const loadStats = async (year = selectedYear) => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/api/super-admin/stats', { params: { year } })
      setStats(response.data)
      setSelectedYear(response.data?.selected_year || year)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load super admin stats:', err)
      setError(t('Failed to load dashboard stats.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!hasDashboardAccess) {
      setLoading(false)
      return
    }
    loadStats(selectedYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDashboardAccess])

  const cards = useMemo(() => {
    if (!stats) return []
    return KPI_CONFIG.map((item) => ({
      ...item,
      value: stats[item.key] ?? 0,
      trendDelta: stats.kpi_trends?.[item.key]?.delta ?? null,
      trendCompare: stats.kpi_trends?.[item.key]?.compare ?? 'month_start',
    }))
  }, [stats])

  const activeRate = useMemo(() => {
    if (!stats || !stats.total_tenants) return 0
    return Math.round((stats.active_tenants / stats.total_tenants) * 100)
  }, [stats])

  const openTenantView = (key) => {
    const params = new URLSearchParams({ view: 'current' })

    if (key === 'active_tenants') params.set('status', 'active')
    if (key === 'cancelled_tenants') params.set('status', 'cancelled')
    if (key === 'expired_tenants') params.set('status', 'expired')
    if (key === 'new_last_30_days') {
      params.set('start_date', startOfCurrentMonth())
      params.set('end_date', new Date().toISOString().slice(0, 10))
    }

    navigate(`/system/tenants?${params.toString()}`)
  }

  const getCardSubtitle = (card) => {
    if (card.key === 'new_last_30_days' && stats?.total_tenants && card.value === stats.total_tenants) {
      return t('All current tenants joined this month.')
    }
    return t(card.subtitle)
  }

  // ── Glass card class helper
  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`
  const chartTickColor = isDark ? '#94a3b8' : '#64748b'
  const chartGridStroke = isDark ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.12)'
  const chartTooltipStyle = {
    borderRadius: '16px',
    border: isDark ? '1px solid rgba(148,163,184,0.16)' : '1px solid rgba(148,163,184,0.15)',
    fontSize: 12,
    backdropFilter: 'blur(14px)',
    background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
    color: isDark ? '#e2e8f0' : '#0f172a',
    boxShadow: isDark ? '0 18px 40px rgba(2,6,23,0.4)' : '0 18px 40px rgba(15,23,42,0.12)',
  }

  if (!hasDashboardAccess) {
    return (
      <div className={`relative overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 max-w-screen-2xl mx-auto ${
        isDark
          ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
          : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
      }`}>
        <div className="relative z-10">
          <section className={`rounded-[26px] border px-5 py-8 text-center ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white/80 text-slate-600'
          }`}>
            <p className="text-base font-semibold">{t('Dashboard access is not enabled for this account.')}</p>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('Ask a system administrator to grant Dashboard / View permission first.')}
            </p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 max-w-screen-2xl mx-auto ${
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
      {!isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.75),transparent_28%)]" />
          <div className="pointer-events-none absolute -top-24 right-12 h-56 w-56 rounded-full blur-3xl bg-blue-400/12" />
          <div className="pointer-events-none absolute bottom-0 left-10 h-48 w-48 rounded-full blur-3xl bg-emerald-400/10" />
        </>
      )}
      <div className="relative z-10">

      {/* ── Header ── */}
      <header className="mb-14">
        <div className="flex  gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <h1 className={`text-2xl md:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {t('Super Admin Dashboard')}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:pt-1">
            {lastRefreshed && (
              <span className={`text-xs hidden sm:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('Updated')} {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => loadStats(selectedYear)}
              disabled={loading}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all shadow-sm disabled:opacity-50 ${
                isDark
                  ? 'border-slate-700/60 bg-slate-900/80 hover:bg-slate-800 text-slate-200'
                  : 'border-slate-200/80 bg-white/78 hover:bg-white text-slate-600'
              }`}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {t('Refresh')}
            </button>
            <button
              onClick={() => navigate('/system/tenants/new')}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-md shadow-blue-500/25"
            >
              <Plus size={13} />
              {t('New Tenant')}
            </button>
          </div>
        </div>
        <p className={`mt-3 text-sm max-w-2xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {t('High level view of tenants, revenue, usage and system health.')}
        </p>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <section className="mb-5 rounded-2xl border border-red-200/80 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30 backdrop-blur-sm px-4 py-3 text-red-700 dark:text-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{t('Unable to load dashboard')}</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        </section>
      )}

      {/* ── KPI Cards ── */}
      {canViewSection(DASHBOARD_SECTION_PERMISSIONS.kpis) ? (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-5 pt-2">
        {loading
          ? KPI_CONFIG.map(item => <StatCardSkeleton key={item.key} />)
          : cards.map(card => {
              const Icon = card.icon
              const filterLabel = card.key === 'total_tenants' ? t('View all') : t('View tenants')
              return (
                <button
                  type="button"
                  key={card.key}
                  onClick={() => openTenantView(card.key)}
                  aria-label={`${t(card.label)}: ${card.value}. ${filterLabel}`}
                  className={`group relative overflow-hidden rounded-[28px] text-left backdrop-blur-xl p-4 min-h-[148px] flex flex-col justify-between before:absolute before:inset-0 before:opacity-100 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400/60 ${
                  isDark
                    ? 'border border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-[0_18px_40px_rgba(0,0,0,0.4)]'
                    : 'border border-white/55 bg-white/24 shadow-[0_14px_34px_rgba(15,23,42,0.08)] hover:border-blue-200/70 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)]'
                } ${isDark ? card.darkGlassTint : card.lightGlassTint}`}>
                  {!isDark && <div className="absolute inset-x-5 top-0 h-px bg-white/75" />}
                  {isDark && <div className="absolute inset-x-5 top-0 h-px bg-slate-600/40" />}
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <p className={`text-[13px] sm:text-sm font-semibold leading-[1.35] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {t(card.label)}
                    </p>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border backdrop-blur-sm ${
                      isDark
                        ? `border-slate-600/50 ${card.darkColorClasses}`
                        : `border-white/20 shadow-inner shadow-white/10 ${card.lightColorClasses}`
                    }`}>
                      <Icon size={17} />
                    </div>
                  </div>
                  <div className="relative z-10 mt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>{card.value}</p>
                      <TrendBadge
                        delta={card.trendDelta}
                        sentiment={card.trend}
                        compare={card.trendCompare}
                        isDark={isDark}
                      />
                    </div>
                    <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{getCardSubtitle(card)}</p>
                    <p className={`mt-3 inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
                      isDark ? 'text-blue-300/80 group-hover:text-blue-200' : 'text-blue-600/75 group-hover:text-blue-700'
                    }`}>
                      {filterLabel}
                      <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </button>
              )
            })
        }
      </section>
      ) : null}

      {/* ── Platform Health Banner ── */}
      {canViewSection(DASHBOARD_SECTION_PERMISSIONS.health) && !loading && stats ? (
        <section className={`${glassCard} mb-5 px-5 py-4`}>
          <div className="flex  sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                <TrendingUp size={17} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{t('Platform Health')}</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Subscription mix and churn snapshot across the platform.')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center" title={t('Tenants with no subscription end date.')}>
                <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{stats.lifetime_count ?? 0}</p>
                <div className={`flex items-center gap-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Infinity size={11} />
                  <span>{t('Lifetime plans')}</span>
                </div>
              </div>
              <div className="text-center" title={t('Tenants with a fixed subscription end date.')}>
                <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{stats.dated_count ?? 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Dated plans')}</p>
              </div>
              <div className="text-center" title={t('Tenants no longer active because their subscription ended or was closed.')}>
                <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{stats.expired_tenants ?? 0}</p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Churned tenants')}</p>
              </div>
            </div>
            <div className="flex-1 max-w-xs" title={t('{{active}} of {{total}} tenants are active', { active: stats.active_tenants ?? 0, total: stats.total_tenants ?? 0 })}>
              <div className={`flex justify-between text-xs mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>{t('Active rate')}</span>
                <span className="font-semibold text-emerald-500">{activeRate}%</span>
              </div>
              <div className={`h-2 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-700/60' : 'bg-slate-200/60'}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
                  style={{ width: `${activeRate}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Main Grid: Chart + Sidebar ── */}
      {canViewSection(DASHBOARD_SECTION_PERMISSIONS.growth)
        || canViewSection(DASHBOARD_SECTION_PERMISSIONS.planDistribution)
        || canViewSection(DASHBOARD_SECTION_PERMISSIONS.statusBreakdown) ? (
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] mb-5">

        {/* Area Chart */}
        {canViewSection(DASHBOARD_SECTION_PERMISSIONS.growth) ? (
        <div className={`${glassCard} px-5 py-5`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('New Tenants — {{year}}', { year: selectedYear })}
              </h2>
              <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Monthly tenant creation activity across the platform.')}</p>
            </div>
            <select
              value={selectedYear}
              onChange={(event) => {
                const year = Number(event.target.value)
                setSelectedYear(year)
                loadStats(year)
              }}
              className={`shrink-0 rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-blue-400 ${
                isDark
                  ? 'border-slate-700/60 bg-slate-900/80 text-slate-100 hover:border-blue-500/50'
                  : 'border-slate-200/80 bg-white/80 text-slate-600 hover:border-blue-300'
              }`}
            >
              {(stats?.available_years || [new Date().getFullYear()]).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="h-[240px]">
            {loading ? (
              <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.monthly_new || []} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tenantGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: chartTickColor }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: chartTickColor }} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(59,130,246,0.15)', strokeWidth: 2 }}
                    contentStyle={chartTooltipStyle}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.label || label}
                  />
                  <Area dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#tenantGrad)" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#2563eb' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        ) : null}

        {/* Sidebar: Plan + Status */}
        {canViewSection(DASHBOARD_SECTION_PERMISSIONS.planDistribution) || canViewSection(DASHBOARD_SECTION_PERMISSIONS.statusBreakdown) ? (
        <div className="space-y-4">
          {canViewSection(DASHBOARD_SECTION_PERMISSIONS.planDistribution) ? (
          <div className={`${glassCard} px-5 py-5`}>
            <div className="mb-4">
              <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{t('Plan Distribution')}</h2>
              <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('How tenants are split by subscription plan.')}</p>
            </div>
            {loading ? <RowSkeleton /> : (
              <SummaryList
                items={stats?.plan_distribution}
                labelKey="plan"
                emptyLabel={t('No plan data available.')}
                total={stats?.total_tenants}
                getColorClass={(_, i) => PLAN_DOT_CLASSES[i % PLAN_DOT_CLASSES.length]}
                isDark={isDark}
              />
            )}
          </div>
          ) : null}

          {canViewSection(DASHBOARD_SECTION_PERMISSIONS.statusBreakdown) ? (
          <div className={`${glassCard} px-5 py-5`}>
            <div className="mb-4">
              <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{t('Status Breakdown')}</h2>
              <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Current tenant lifecycle distribution.')}</p>
            </div>
            {loading ? <RowSkeleton /> : (
              <SummaryList
                items={stats?.status_breakdown}
                labelKey="status"
                emptyLabel={t('No status data available.')}
                total={stats?.total_tenants}
                getColorClass={(item) => statusCfg(item.status).dot}
                isDark={isDark}
              />
            )}
          </div>
          ) : null}
        </div>
        ) : null}
      </section>
      ) : null}

      {/* ── Bottom Grid: Recent + Expiring ── */}
      {canViewSection(DASHBOARD_SECTION_PERMISSIONS.recentTenants)
        || canViewSection(DASHBOARD_SECTION_PERMISSIONS.expiringSoon) ? (
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* Recent Tenants */}
        {canViewSection(DASHBOARD_SECTION_PERMISSIONS.recentTenants) ? (
        <div className={`${glassCard} px-5 py-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{t('Recent Tenants')}</h2>
              <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Last 5 workspaces created on the platform.')}</p>
            </div>
            <button
              onClick={() => navigate('/system/tenants')}
              className={`flex items-center gap-1 text-xs transition-colors ${isDark ? 'text-blue-300 hover:text-blue-200' : 'text-blue-500 hover:text-blue-600'}`}
            >
              {t('View all')} <ChevronRight size={13} />
            </button>
          </div>

          {loading ? (
            <RowSkeleton rows={5} />
          ) : !stats?.recent_tenants?.length ? (
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('No tenants yet.')}</p>
          ) : (
            <div className={`divide-y ${isDark ? 'divide-slate-700/50' : 'divide-slate-200/60'}`}>
              {stats.recent_tenants.map(tenant => {
                const sc = statusCfg(tenant.status, isDark)
                return (
                  <div key={tenant.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${sc.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{tenant.name}</p>
                      <p className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{tenant.domain}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${sc.badge}`}>
                        {tenant.subscription_plan}
                      </span>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{tenant.created_at}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        ) : null}

        {/* Expiring Soon */}
        {canViewSection(DASHBOARD_SECTION_PERMISSIONS.expiringSoon) ? (
        <div className={`${glassCard} px-5 py-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{t('Expiring Soon')}</h2>
              <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Active tenants whose subscription ends within 30 days.')}</p>
            </div>
            {(stats?.expiring_in_30 ?? 0) > 0 && (
              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                <AlertTriangle size={11} />
                {stats.expiring_in_30}
              </span>
            )}
          </div>

          {loading ? (
            <RowSkeleton rows={5} />
          ) : !stats?.expiring_soon?.length ? (
            <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-sm">{t('No tenants expiring in the next 30 days.')}</p>
            </div>
          ) : (
            <div className={`divide-y ${isDark ? 'divide-slate-700/50' : 'divide-slate-200/60'}`}>
              {stats.expiring_soon.map(tenant => (
                <div key={tenant.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{tenant.name}</p>
                    <p className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{tenant.domain}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <DaysLeftBadge days={tenant.days_left} isDark={isDark} />
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{tenant.end_date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        ) : null}
      </section>
      ) : null}
      </div>
    </div>
  )
}
