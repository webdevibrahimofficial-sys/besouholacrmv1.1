import { useTranslation } from 'react-i18next'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'invalid_key', label: 'Invalid Key' },
  { value: 'inactive_connection', label: 'Inactive Connection' },
  { value: 'blocked_origin', label: 'Blocked Origin' },
  { value: 'validation_failed', label: 'Validation Failed' },
  { value: 'exception', label: 'Exception' },
]

const statusClasses = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  duplicate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  invalid_key: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  inactive_connection: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blocked_origin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  validation_failed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  exception: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
}

const formatStatus = (value, t) => {
  const translationMap = {
    success: t('Success'),
    duplicate: t('Duplicate'),
    invalid_key: t('Invalid Key'),
    inactive_connection: t('Inactive Connection'),
    blocked_origin: t('Blocked Origin'),
    validation_failed: t('Validation Failed'),
    exception: t('Exception'),
  }

  if (translationMap[value]) {
    return translationMap[value]
  }

  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function WebsiteIntakeLogsPanel({
  connections,
  filters,
  logs,
  loading,
  onFilterChange,
  onRefresh,
}) {
  const { t } = useTranslation()
  const rows = Array.isArray(logs?.data) ? logs.data : []

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-theme">{t('Intake Logs')}</h3>
          <p className="text-sm text-[var(--muted-text)]">{t('Review recent website intake attempts and failure reasons.')}</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {t('Refresh')}
        </button>
      </div>

      <div className="p-5 border-b border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-theme mb-1">{t('Connection')}</label>
          <select
            className="select w-full"
            value={filters.connection_id || ''}
            onChange={(e) => onFilterChange('connection_id', e.target.value)}
          >
            <option value="">{t('All connections')}</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-theme mb-1">{t('Status')}</label>
          <select
            className="select w-full"
            value={filters.status || ''}
            onChange={(e) => onFilterChange('status', e.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{t(option.label)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-theme mb-1">{t('Date From')}</label>
          <input
            type="date"
            className="input w-full"
            value={filters.date_from || ''}
            onChange={(e) => onFilterChange('date_from', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-theme mb-1">{t('Date To')}</label>
          <input
            type="date"
            className="input w-full"
            value={filters.date_to || ''}
            onChange={(e) => onFilterChange('date_to', e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-[var(--muted-text)]">{t('Loading intake logs...')}</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-sm text-[var(--muted-text)]">{t('No logs found for the selected filters.')}</div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((log) => (
            <div key={log.id} className="p-5 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses[log.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                      {formatStatus(log.status, t)}
                    </span>
                    <span className="text-sm text-theme">{log.connection?.name || t('Unknown connection')}</span>
                    <span className="text-xs text-[var(--muted-text)]">{new Date(log.created_at).toLocaleString()}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="text-[var(--muted-text)]">
                      <span className="font-medium text-theme">{t('Origin')}:</span> {log.origin || '—'}
                    </div>
                    <div className="text-[var(--muted-text)] break-all">
                      <span className="font-medium text-theme">{t('Page URL')}:</span> {log.page_url || '—'}
                    </div>
                    <div className="text-[var(--muted-text)]">
                      <span className="font-medium text-theme">{t('Lead')}:</span> {log.lead?.name || '—'}
                    </div>
                    <div className="text-[var(--muted-text)]">
                      <span className="font-medium text-theme">{t('Phone')}:</span> {log.lead?.phone || log.payload?.phone || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {log.error_message ? (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2 text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap break-words">
                  {log.error_message}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
