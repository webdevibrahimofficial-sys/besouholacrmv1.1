export default function WebsiteStatsPanel({ connection, stats, loading, onClose }) {
  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-theme">Website Stats</h3>
          <p className="text-sm text-[var(--muted-text)]">{connection?.name || 'Selected connection'}</p>
        </div>
        <button onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme">
          Close
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-[var(--muted-text)]">Loading stats...</div>
      ) : !stats ? (
        <div className="p-6 text-sm text-[var(--muted-text)]">No stats available yet.</div>
      ) : (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">Total Leads</div>
              <div className="text-2xl font-bold text-theme mt-1">{stats.total || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">This Month</div>
              <div className="text-2xl font-bold text-theme mt-1">{stats.this_month || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">Today</div>
              <div className="text-2xl font-bold text-theme mt-1">{stats.today || 0}</div>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-[var(--muted-text)]">Last Lead</div>
              <div className="text-sm font-semibold text-theme mt-2">{stats.last_lead || 'No leads yet'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-theme mb-3">Daily Leads (30 days)</h4>
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
                <div className="text-sm text-[var(--muted-text)]">No daily lead data yet.</div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-theme mb-3">Lead Sources</h4>
              {Array.isArray(stats.by_source) && stats.by_source.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {stats.by_source.map((row, index) => (
                    <div key={`${row.source || 'unknown'}-${index}`} className="flex items-center justify-between">
                      <span className="text-[var(--muted-text)]">{row.source || 'Unknown'}</span>
                      <span className="font-medium text-theme">{row.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--muted-text)]">No source breakdown yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

