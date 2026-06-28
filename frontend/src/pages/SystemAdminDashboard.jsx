import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip,
  AreaChart, Area,
} from 'recharts'
import {
  AlertCircle, Building2, Clock3, Users, UserPlus, RefreshCw,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, Hourglass,
  ChevronRight, Plus, ExternalLink, Infinity,
} from 'lucide-react'
import { api } from '@utils/api'

// ─── KPI config ────────────────────────────────────────────────────────────────
const KPI_CONFIG = [
  {
    key: 'total_tenants',
    label: 'Total Tenants',
    icon: Building2,
    colorClasses: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    subtitle: 'All registered workspaces',
    trend: null,
  },
  {
    key: 'active_tenants',
    label: 'Active Tenants',
    icon: CheckCircle2,
    colorClasses: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
    subtitle: 'Currently operational',
    trend: 'positive',
  },
  {
    key: 'cancelled_tenants',
    label: 'Cancelled',
    icon: XCircle,
    colorClasses: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    subtitle: 'Cancelled subscriptions',
    trend: 'negative',
  },
  {
    key: 'new_last_30_days',
    label: 'New This Month',
    icon: UserPlus,
    colorClasses: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
    subtitle: 'Recent growth',
    trend: 'positive',
  },
  {
    key: 'expired_tenants',
    label: 'Expired',
    icon: XCircle,
    colorClasses: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusCfg(status) { return STATUS_CONFIG[status] || STATUS_CONFIG.unknown }

function DaysLeftBadge({ days }) {
  if (days <= 3)  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{days}d left</span>
  if (days <= 7)  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{days}d left</span>
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{days}d left</span>
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
function SummaryList({ items, labelKey, emptyLabel, getColorClass, total }) {
  if (!items?.length) return <p className="text-sm text-slate-400 dark:text-slate-500">{emptyLabel}</p>

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => {
        const pct = total ? Math.round((item.count / total) * 100) : null
        return (
          <div key={`${item[labelKey]}-${index}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getColorClass(item, index)}`} />
                <span className="truncate text-sm text-slate-600 dark:text-slate-300 capitalize">
                  {String(item[labelKey] || 'unknown').replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pct !== null && <span className="text-xs text-slate-400">{pct}%</span>}
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 w-6 text-right">{item.count ?? 0}</span>
              </div>
            </div>
            {pct !== null && (
              <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
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
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

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
    loadStats(selectedYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cards = useMemo(() => {
    if (!stats) return []
    return KPI_CONFIG.map((item) => ({ ...item, value: stats[item.key] ?? 0 }))
  }, [stats])

  const activeRate = useMemo(() => {
    if (!stats || !stats.total_tenants) return 0
    return Math.round((stats.active_tenants / stats.total_tenants) * 100)
  }, [stats])

  // ── Glass card class helper
  const glassCard = 'rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-sm'
  const glassCardHover = `${glassCard} hover:border-blue-300/60 dark:hover:border-blue-500/40 hover:shadow-md transition-all duration-200`

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-screen-2xl mx-auto">

      {/* ── Header ── */}
      <header className="mb-14">
        <div className="flex  gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-blue-500/80 dark:text-blue-400/70 mb-1 font-semibold">{t('System Admin')}</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
              {t('Super Admin Dashboard')}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:pt-1">
            {lastRefreshed && (
              <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
                {t('Updated')} {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => loadStats(selectedYear)}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shadow-sm disabled:opacity-50"
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
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
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
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 mb-5">
        {loading
          ? KPI_CONFIG.map(item => <StatCardSkeleton key={item.key} />)
          : cards.map(card => {
              const Icon = card.icon
              return (
                <div key={card.key} className={`${glassCard} p-4 min-h-[148px] flex flex-col justify-between`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] sm:text-sm font-semibold text-slate-600 dark:text-slate-300 leading-[1.35]">
                      {t(card.label)}
                    </p>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.colorClasses}`}>
                      <Icon size={17} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">{card.value}</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t(card.subtitle)}</p>
                  </div>
                </div>
              )
            })
        }
      </section>

      {/* ── Platform Health Banner ── */}
      {!loading && stats && (
        <section className={`${glassCard} mb-5 px-5 py-4`}>
          <div className="flex  sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                <TrendingUp size={17} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('Platform Health')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{activeRate}% {t('of tenants are active')}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800 dark:text-white">{stats.lifetime_count ?? 0}</p>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Infinity size={11} />
                  <span>{t('Lifetime')}</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800 dark:text-white">{stats.dated_count ?? 0}</p>
                <p className="text-xs text-slate-400">{t('Dated')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800 dark:text-white">{stats.expired_tenants ?? 0}</p>
                <p className="text-xs text-slate-400">{t('Churned')}</p>
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>{t('Active rate')}</span>
                <span className="font-semibold text-emerald-500">{activeRate}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
                  style={{ width: `${activeRate}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Main Grid: Chart + Sidebar ── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] mb-5">

        {/* Area Chart */}
        <div className={`${glassCard} px-5 py-5`}>
          <div className="hidden">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('New Tenants — Last 6 Months')}</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t('Monthly tenant creation activity across the platform.')}</p>
          </div>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t('New Tenants — {{year}}', { year: selectedYear })}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t('Monthly tenant creation activity across the platform.')}</p>
            </div>
            <select
              value={selectedYear}
              onChange={(event) => {
                const year = Number(event.target.value)
                setSelectedYear(year)
                loadStats(year)
              }}
              className="shrink-0 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/70 px-3 py-2 text-sm text-slate-600 dark:text-slate-200 outline-none transition hover:border-blue-300 focus:border-blue-400"
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(59,130,246,0.15)', strokeWidth: 2 }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid rgba(148,163,184,0.15)', fontSize: 12, backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.9)' }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.label || label}
                  />
                  <Area dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#tenantGrad)" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#2563eb' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sidebar: Plan + Status */}
        <div className="space-y-4">
          <div className={`${glassCard} px-5 py-5`}>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('Plan Distribution')}</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t('How tenants are split by subscription plan.')}</p>
            </div>
            {loading ? <RowSkeleton /> : (
              <SummaryList
                items={stats?.plan_distribution}
                labelKey="plan"
                emptyLabel={t('No plan data available.')}
                total={stats?.total_tenants}
                getColorClass={(_, i) => PLAN_DOT_CLASSES[i % PLAN_DOT_CLASSES.length]}
              />
            )}
          </div>

          <div className={`${glassCard} px-5 py-5`}>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('Status Breakdown')}</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t('Current tenant lifecycle distribution.')}</p>
            </div>
            {loading ? <RowSkeleton /> : (
              <SummaryList
                items={stats?.status_breakdown}
                labelKey="status"
                emptyLabel={t('No status data available.')}
                total={stats?.total_tenants}
                getColorClass={(item) => statusCfg(item.status).dot}
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Bottom Grid: Recent + Expiring ── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* Recent Tenants */}
        <div className={`${glassCard} px-5 py-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('Recent Tenants')}</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t('Last 5 workspaces created on the platform.')}</p>
            </div>
            <button
              onClick={() => navigate('/system/tenants')}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
            >
              {t('View all')} <ChevronRight size={13} />
            </button>
          </div>

          {loading ? (
            <RowSkeleton rows={5} />
          ) : !stats?.recent_tenants?.length ? (
            <p className="text-sm text-slate-400">{t('No tenants yet.')}</p>
          ) : (
            <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
              {stats.recent_tenants.map(tenant => {
                const sc = statusCfg(tenant.status)
                return (
                  <div key={tenant.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${sc.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{tenant.name}</p>
                      <p className="text-xs text-slate-400 truncate">{tenant.domain}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${sc.badge}`}>
                        {tenant.subscription_plan}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">{tenant.created_at}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Expiring Soon */}
        <div className={`${glassCard} px-5 py-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('Expiring Soon')}</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t('Active tenants whose subscription ends within 30 days.')}</p>
            </div>
            {(stats?.expiring_in_30 ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <AlertTriangle size={11} />
                {stats.expiring_in_30}
              </span>
            )}
          </div>

          {loading ? (
            <RowSkeleton rows={5} />
          ) : !stats?.expiring_soon?.length ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-sm">{t('No tenants expiring in the next 30 days.')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
              {stats.expiring_soon.map(tenant => (
                <div key={tenant.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{tenant.name}</p>
                    <p className="text-xs text-slate-400 truncate">{tenant.domain}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <DaysLeftBadge days={tenant.days_left} />
                    <p className="text-xs text-slate-400 mt-0.5">{tenant.end_date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
