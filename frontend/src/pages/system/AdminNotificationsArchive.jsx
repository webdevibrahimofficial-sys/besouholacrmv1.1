import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminNotificationsApi } from '@api/adminNotificationsApi'

const severityTone = {
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function AdminNotificationsArchive() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: 'all', severity: '', category: '', source: '' })

  const load = async () => {
    setLoading(true)
    try {
      const params = {
        ...(filters.status && filters.status !== 'all' ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.source ? { source: filters.source } : {}),
      }
      const { data } = await adminNotificationsApi.list(params)
      setItems(data?.notifications?.data || [])
    } finally {
      setLoading(false)
    }
  }

  const buildTenantManagementUrl = (tenantId, actionUrl = '/system/tenants') => {
    const baseUrl = actionUrl || '/system/tenants'
    const query = new URLSearchParams()
    query.set('view', 'current')
    if (tenantId) {
      query.set('tenant_id', String(tenantId))
    }
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query.toString()}`
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.severity, filters.category, filters.source])

  return (
    <div className="mx-auto max-w-screen-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Admin Notifications</h1>
        <div className="flex gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => adminNotificationsApi.markAllAsRead().then(load)}>Mark all read</button>
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => adminNotificationsApi.archiveAllRead().then(load)}>Archive all read</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="rounded-lg border px-3 py-2 text-sm" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="archived">Archived</option>
        </select>
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="severity" value={filters.severity} onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="category" value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="source" value={filters.source} onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))} />
      </div>

      <div className="space-y-2">
        {loading ? <div className="rounded-lg border p-4 text-sm">Loading...</div> : null}
        {!loading && items.length === 0 ? <div className="rounded-lg border p-4 text-sm">No admin notifications found.</div> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${severityTone[item.severity] || severityTone.info}`}>
                {item.severity || 'info'}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{item.body || '-'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{item.category}</span>
              <span>•</span>
              <span>{item.source}</span>
              <span>•</span>
              <span>{item.created_at}</span>
            </div>
            <div className="mt-3 flex gap-2">
              {!item.read_at ? (
                <button className="rounded-md border px-2 py-1 text-xs" onClick={() => adminNotificationsApi.markAsRead(item.id).then(load)}>Mark read</button>
              ) : null}
              {!item.archived_at ? (
                <button className="rounded-md border px-2 py-1 text-xs" onClick={() => adminNotificationsApi.archive(item.id).then(load)}>Archive</button>
              ) : null}
              {item.action_url ? (
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => {
                    if (item.action_url.startsWith('/system/tenants')) {
                      navigate(buildTenantManagementUrl(item.related_tenant_id, item.action_url))
                      return
                    }
                    navigate(item.action_url)
                  }}
                >
                  Open
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

