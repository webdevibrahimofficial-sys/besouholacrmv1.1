import { useTranslation } from 'react-i18next'

export default function WebsiteStatsPanel({ connection, stats, loading, onClose }) {
  const { t } = useTranslation()
  const lastSuccess = stats?.last_successful_lead
  const lastFailure = stats?.last_failed_attempt

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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
          <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">{t('Total Leads')}</div>
              <div className="text-2xl font-bold text-theme mt-1">{stats.total || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">{t('This Month')}</div>
              <div className="text-2xl font-bold text-theme mt-1">{stats.this_month || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">{t('Today')}</div>
              <div className="text-2xl font-bold text-theme mt-1">{stats.today || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">{t('Last Lead')}</div>
              <div className="text-sm font-semibold text-theme mt-2">{stats.last_lead || 'No leads yet'}</div>
            </div>
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="text-xs text-green-700 dark:text-green-300">{t('Accepted Requests')}</div>
              <div className="text-2xl font-bold text-green-800 dark:text-green-200 mt-1">{stats.accepted_requests || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="text-xs text-red-700 dark:text-red-300">{t('Rejected Requests')}</div>
              <div className="text-2xl font-bold text-red-800 dark:text-red-200 mt-1">{stats.rejected_requests || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="text-xs text-amber-700 dark:text-amber-300">{t('Duplicate Count')}</div>
              <div className="text-2xl font-bold text-amber-800 dark:text-amber-200 mt-1">{stats.duplicate_count || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="text-xs text-orange-700 dark:text-orange-300">{t('Blocked Origins')}</div>
              <div className="text-2xl font-bold text-orange-800 dark:text-orange-200 mt-1">{stats.blocked_origins_count || 0}</div>
            </div>
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
                      <div className="text-[var(--muted-text)]">{lastSuccess.origin || t('No origin')}{lastSuccess.page_url ? ` • ${lastSuccess.page_url}` : ''}</div>
                      <div className="text-[var(--muted-text)]">{new Date(lastSuccess.created_at).toLocaleString()}</div>
                    </div>
                  ) : (
                    <div className="text-[var(--muted-text)]">{t('No successful submissions yet.')}</div>
                  )}
                </div>
                <div>
                  <div className="text-[var(--muted-text)] mb-1">{t('Last Failed Attempt')}</div>
                  {lastFailure ? (
                    <div className="space-y-1">
                      <div className="font-medium text-theme">{String(lastFailure.status || t('Unknown')).replace(/_/g, ' ')}</div>
                      <div className="text-[var(--muted-text)]">{lastFailure.origin || t('No origin')}{lastFailure.page_url ? ` • ${lastFailure.page_url}` : ''}</div>
                      <div className="text-[var(--muted-text)]">{new Date(lastFailure.created_at).toLocaleString()}</div>
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

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-theme mb-3">{t('Daily Leads (30 days)')}</h4>
              {Array.isArray(stats.daily_leads) && stats.daily_leads.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {stats.daily_leads.map((row) => (
                    <div key={row.date} className="flex items-center justify-between">
                      <span className="text-[var(--muted-text)]">{row.date}</span>
                      <span className="font-medium text-theme">{row.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--muted-text)]">{t('No daily lead data yet.')}</div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-theme mb-3">{t('Lead Sources')}</h4>
              {Array.isArray(stats.by_source) && stats.by_source.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {stats.by_source.map((row, index) => (
                    <div key={`${row.source || 'unknown'}-${index}`} className="flex items-center justify-between">
                      <span className="text-[var(--muted-text)]">{row.source || t('Unknown')}</span>
                      <span className="font-medium text-theme">{row.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--muted-text)]">{t('No source breakdown yet.')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
