import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`

const getStatusLabel = (value, t) => {
  const normalized = String(value || '').replace(/_/g, ' ').trim()
  return normalized || t('Unknown')
}

function StatCard({ label, value, tone = 'default' }) {
  const toneClasses = {
    default: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  }

  return (
    <div className={`p-4 rounded-xl border ${toneClasses[tone] || toneClasses.default}`}>
      <div className="text-xs text-[var(--muted-text)]">{label}</div>
      <div className="text-2xl font-bold text-theme mt-1">{value}</div>
    </div>
  )
}

function TopListCard({ title, items, emptyLabel, isRtl = false }) {
  const maxCount = items?.[0]?.count || 0

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h4 className="text-sm font-semibold text-theme mb-3">{title}</h4>
      {Array.isArray(items) && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, index) => {
            const width = maxCount > 0 ? Math.max((item.count / maxCount) * 100, 8) : 0

            return (
              <div key={`${item.label}-${index}`} className="space-y-1">
                <div className={`flex items-start justify-between gap-3 text-sm ${isRtl ? 'flex-row-reverse text-right' : ''}`}>
                  <span className="text-theme break-all" dir="auto">{item.label}</span>
                  <span className="text-[var(--muted-text)] shrink-0">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm text-[var(--muted-text)]">{emptyLabel}</div>
      )}
    </div>
  )
}

function TimeSeriesCard({ rows, t, locale }) {
  const recentRows = useMemo(() => (Array.isArray(rows) ? rows.slice(-10) : []), [rows])
  const maxTotal = recentRows.reduce((max, row) => Math.max(max, Number(row.total || 0)), 0)

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h4 className="text-sm font-semibold text-theme mb-3">{t('Leads Over Time')}</h4>
      {recentRows.length > 0 ? (
        <div className="space-y-3">
          {recentRows.map((row) => {
            const width = maxTotal > 0 ? Math.max((Number(row.total || 0) / maxTotal) * 100, row.total ? 8 : 0) : 0

            return (
              <div key={row.date} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--muted-text)]">{new Date(row.date).toLocaleDateString(locale)}</span>
                  <span className="text-theme">
                    {t('Accepted')}: {row.accepted || 0} - {t('Rejected')}: {row.rejected || 0} - {t('Duplicates')}: {row.duplicates || 0}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm text-[var(--muted-text)]">{t('No leads-over-time data yet.')}</div>
      )}
    </div>
  )
}

export default function WebsiteStatsPanel({ connection, stats, loading, onClose }) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')
  const locale = isArabic ? 'ar-EG' : 'en-US'
  const lastSuccess = stats?.last_successful_lead
  const lastFailure = stats?.last_failed_attempt

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-theme">{t('Website Stats')}</h3>
          <p className="text-sm text-[var(--muted-text)]">{connection?.name || t('Selected connection')}</p>
        </div>
        <button onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme">
          {t('Close')}
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-[var(--muted-text)]">{t('Loading stats...')}</div>
      ) : !stats ? (
        <div className="p-6 text-sm text-[var(--muted-text)]">{t('No stats available yet.')}</div>
      ) : (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard label={t('Total Leads')} value={stats.total || 0} />
            <StatCard label={t('This Month')} value={stats.this_month || 0} />
            <StatCard label={t('Today')} value={stats.today || 0} />
            <StatCard label={t('Last Lead')} value={stats.last_lead || t('No leads yet')} tone="blue" />
            <StatCard label={t('Total Requests')} value={stats.total_requests || 0} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label={t('Accepted Requests')} value={stats.accepted_requests || 0} tone="green" />
            <StatCard label={t('Rejected Requests')} value={stats.rejected_requests || 0} tone="red" />
            <StatCard label={t('Duplicate Count')} value={stats.duplicate_count || 0} tone="amber" />
            <StatCard label={t('Blocked Origins')} value={stats.blocked_origins_count || 0} tone="amber" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard label={t('Duplicate Rate')} value={formatPercent(stats.duplicate_rate)} tone="blue" />
            <StatCard label={t('Rejection Rate')} value={formatPercent(stats.rejection_rate)} tone="red" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-theme mb-3">{t('Latest Delivery Status')}</h4>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-[var(--muted-text)] mb-1">{t('Last Successful Lead')}</div>
                  {lastSuccess ? (
                    <div className="space-y-1">
                      <div className="font-medium text-theme">{lastSuccess.lead?.name || t('Lead created')}</div>
                      <div className="text-[var(--muted-text)]" dir="auto">
                        {lastSuccess.origin || t('No origin')}
                        {lastSuccess.page_url ? ` - ${lastSuccess.page_url}` : ''}
                      </div>
                      <div className="text-[var(--muted-text)]">{new Date(lastSuccess.created_at).toLocaleString(locale)}</div>
                    </div>
                  ) : (
                    <div className="text-[var(--muted-text)]">{t('No successful submissions yet.')}</div>
                  )}
                </div>

                <div>
                  <div className="text-[var(--muted-text)] mb-1">{t('Last Failed Attempt')}</div>
                  {lastFailure ? (
                    <div className="space-y-1">
                      <div className="font-medium text-theme">{getStatusLabel(lastFailure.status, t)}</div>
                      <div className="text-[var(--muted-text)]" dir="auto">
                        {lastFailure.origin || t('No origin')}
                        {lastFailure.page_url ? ` - ${lastFailure.page_url}` : ''}
                      </div>
                      <div className="text-[var(--muted-text)]">{new Date(lastFailure.created_at).toLocaleString(locale)}</div>
                      {lastFailure.error_message ? (
                        <div className="text-red-600 dark:text-red-300 text-xs whitespace-pre-wrap break-words">{lastFailure.error_message}</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-[var(--muted-text)]">{t('No failed attempts yet.')}</div>
                  )}
                </div>
              </div>
            </div>

            <TimeSeriesCard rows={stats.leads_over_time} t={t} locale={locale} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <TopListCard
              title={t('Top Pages')}
              items={stats.top_pages}
              emptyLabel={t('No page analytics yet.')}
              isRtl={isArabic}
            />
            <TopListCard
              title={t('Top Forms')}
              items={stats.top_forms}
              emptyLabel={t('No form analytics yet.')}
              isRtl={isArabic}
            />
            <TopListCard
              title={t('Top Origins')}
              items={stats.top_origins}
              emptyLabel={t('No origin analytics yet.')}
              isRtl={isArabic}
            />
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="text-sm font-semibold text-theme mb-3">{t('Lead Sources')}</h4>
            {Array.isArray(stats.by_source) && stats.by_source.length > 0 ? (
              <div className="space-y-2 text-sm">
                {stats.by_source.map((row, index) => (
                  <div key={`${row.source || 'unknown'}-${index}`} className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-text)] break-all" dir="auto">{row.source || t('Unknown')}</span>
                    <span className="font-medium text-theme shrink-0">{row.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--muted-text)]">{t('No source breakdown yet.')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
