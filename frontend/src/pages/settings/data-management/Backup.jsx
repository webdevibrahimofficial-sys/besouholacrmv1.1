import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ChevronRight,
  Database,
  HardDrive,
  Loader2,
  RotateCcw,
  ExternalLink,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '../../../utils/api'
import { useTheme } from '../../../shared/context/ThemeProvider'

const TABS = [
  { key: 'history', label: 'Backup History' },
  { key: 'schedules', label: 'Schedules' },
  { key: 'restore', label: 'Restore Requests' },
  { key: 'storage', label: 'Storage Settings' },
  { key: 'logs', label: 'Logs' },
]

const EMPTY_STATES = {
  schedules: 'Scheduling will be added in the next phase. This MVP focuses on manual backups and history.',
  restore: 'Restore requests are intentionally gated for a later phase to keep production recovery safe.',
  storage: 'Local storage is active now. External storage and retention controls will be added next.',
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const scaled = bytes / (1024 ** index)
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function statusClasses(status, isDark) {
  const map = {
    success: isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
    failed: isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700',
    running: isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700',
    pending: isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700',
  }

  return map[status] || (isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600')
}

function cardShell(isDark) {
  return isDark
    ? 'border border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
    : 'border border-slate-200/80 bg-white/80 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
}

function Modal({ open, onClose, children }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl">{children}</div>
    </div>
  )
}

export default function Backup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const shell = cardShell(isDark)

  const [dashboard, setDashboard] = useState(null)
  const [backups, setBackups] = useState([])
  const [restoreHistory, setRestoreHistory] = useState([])
  const [tenants, setTenants] = useState([])
  const [activeTab, setActiveTab] = useState('history')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState(null)
  const [restoredTenantResult, setRestoredTenantResult] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    scope: 'all',
    status: 'all',
    tenant_id: 'all',
    restored_only: false,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    scope: 'platform',
    tenant_id: '',
    type: 'manual',
    storage_disk: 'local',
    source: 'database',
  })

  const loadData = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const params = {}
      if (filters.scope !== 'all') params.scope = filters.scope
      if (filters.status !== 'all') params.status = filters.status
      if (filters.tenant_id !== 'all') params.tenant_id = filters.tenant_id
      if (filters.restored_only) params.restored_only = 1

      const [dashboardResp, historyResp, tenantsResp, restoreResp] = await Promise.all([
        api.get('/api/super-admin/backups/dashboard'),
        api.get('/api/super-admin/backups', { params }),
        api.get('/api/super-admin/tenants', { params: { per_page: 100, view: 'current' } }),
        api.get('/api/super-admin/backups/restores'),
      ])

      setDashboard(dashboardResp.data)
      setBackups(historyResp.data?.data || [])
      setTenants(tenantsResp.data?.tenants?.data || [])
      setRestoreHistory(restoreResp.data?.data || [])
    } catch (error) {
      console.error('Failed to load backups:', error)
      toast.error(t('Failed to load backups'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.scope, filters.status, filters.tenant_id, filters.restored_only])

  const tenantOptions = Array.isArray(tenants) ? tenants : []

  const filteredBackups = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    if (!query) return backups

    return backups.filter((backup) => {
      const haystack = [
        backup.tenant_name,
        backup.scope,
        backup.tenancy_type,
        backup.type,
        backup.status,
        backup.path,
      ].join(' ').toLowerCase()

      return haystack.includes(query)
    })
  }, [backups, filters.search])

  const cards = [
    {
      label: t('Last Backup'),
      value: dashboard?.last_successful_backup_at ? formatDateTime(dashboard.last_successful_backup_at) : t('No successful backups yet'),
      icon: Archive,
      tone: isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-700',
    },
    {
      label: t('Failed Backups'),
      value: dashboard?.failed_backups ?? 0,
      icon: Shield,
      tone: isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700',
    },
    {
      label: t('Storage Used'),
      value: formatBytes(dashboard?.storage_used_bytes),
      icon: HardDrive,
      tone: isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
    },
    {
      label: t('Scheduled Jobs'),
      value: dashboard?.scheduled_jobs ?? 0,
      icon: RefreshCw,
      tone: isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700',
    },
    {
      label: t('Tenants Protected'),
      value: dashboard?.protected_tenants ?? 0,
      icon: Database,
      tone: isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-100 text-violet-700',
    },
  ]

  const logsList = selectedBackup?.metadata?.logs || []

  const handleCreate = async () => {
    if (form.scope === 'tenant' && !form.tenant_id) {
      toast.error(t('Please choose a tenant'))
      return
    }

    try {
      setCreating(true)
      await api.post('/api/super-admin/backups', {
        ...form,
        tenant_id: form.scope === 'tenant' ? Number(form.tenant_id) : null,
      })
      toast.success(t('Backup started'))
      setModalOpen(false)
      setSelectedBackup(null)
      await loadData({ silent: true })
    } catch (error) {
      console.error('Failed to create backup:', error)
      toast.error(error?.response?.data?.message || t('Failed to start backup'))
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = async (backup) => {
    try {
      const token = window.localStorage.getItem('token') || window.sessionStorage.getItem('token')
      const response = await api.get(`/api/super-admin/backups/${backup.id}/download`, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      const contentDisposition = response.headers['content-disposition'] || ''
      const fallbackName = backup.path?.split('/').pop() || `backup-${backup.id}.zip`
      const match = contentDisposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || fallbackName
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download backup:', error)
      toast.error(t('Failed to download backup'))
    }
  }

  const handleDelete = async (backup) => {
    if (!window.confirm(t('Delete this backup permanently?'))) {
      return
    }

    try {
      await api.delete(`/api/super-admin/backups/${backup.id}`)
      toast.success(t('Backup deleted'))
      if (selectedBackup?.id === backup.id) {
        setSelectedBackup(null)
      }
      await loadData({ silent: true })
    } catch (error) {
      console.error('Failed to delete backup:', error)
      toast.error(error?.response?.data?.message || t('Failed to delete backup'))
    }
  }

  const handleRestore = async (backup) => {
    if (!window.confirm(t('Restore this backup into a new tenant copy?'))) {
      return
    }

    try {
      setRefreshing(true)
      const response = await api.post(`/api/super-admin/backups/${backup.id}/restore`, {
        mode: 'new_tenant_copy',
      })
      const tenant = response.data?.tenant
      setRestoredTenantResult(tenant || null)
      toast.success(
        tenant
          ? `${t('Restored as')} ${tenant.name}`
          : t('Backup restored to a new tenant copy')
      )
      await loadData({ silent: true })
    } catch (error) {
      console.error('Failed to restore backup:', error)
      toast.error(error?.response?.data?.message || t('Failed to restore backup'))
    } finally {
      setRefreshing(false)
    }
  }

  const openRestoredTenant = (tenant) => {
    if (!tenant?.slug && !tenant?.name) return
    const search = tenant.slug || tenant.name
    navigate(`/system/tenants?search=${encodeURIComponent(search)}`)
  }

  const renderHistory = () => (
    <div className={`rounded-[26px] ${shell} overflow-hidden`}>
      <div className={`border-b px-5 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200/80'}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t('Backup History')}</h2>
            <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {t('Manual platform and tenant backups live here, including shared exports and dedicated dumps.')}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder={t('Search backups')}
              className={`rounded-2xl border px-4 py-2.5 text-sm outline-none ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
              }`}
            />
            <select
              value={filters.scope}
              onChange={(event) => setFilters((prev) => ({ ...prev, scope: event.target.value }))}
              className={`rounded-2xl border px-4 py-2.5 text-sm outline-none ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <option value="all">{t('All scopes')}</option>
              <option value="platform">{t('Platform')}</option>
              <option value="tenant">{t('Tenant')}</option>
            </select>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className={`rounded-2xl border px-4 py-2.5 text-sm outline-none ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <option value="all">{t('All statuses')}</option>
              <option value="pending">{t('Pending')}</option>
              <option value="running">{t('Running')}</option>
              <option value="success">{t('Success')}</option>
              <option value="failed">{t('Failed')}</option>
            </select>
            <select
              value={filters.tenant_id}
              onChange={(event) => setFilters((prev) => ({ ...prev, tenant_id: event.target.value }))}
              className={`rounded-2xl border px-4 py-2.5 text-sm outline-none ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <option value="all">{t('All tenants')}</option>
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            <label className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm ${
              isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
            }`}>
              <input
                type="checkbox"
                checked={filters.restored_only}
                onChange={(event) => setFilters((prev) => ({ ...prev, restored_only: event.target.checked }))}
              />
              <span>{t('Restored only')}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className={isDark ? 'bg-slate-950/70 text-slate-400' : 'bg-slate-50 text-slate-500'}>
            <tr>
              <th className="px-5 py-3 text-left font-semibold">{t('Scope')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Tenant')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Restored Tenant')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Tenancy Type')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Type')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Size')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Status')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Created At')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredBackups.length === 0 ? (
              <tr>
                <td colSpan={9} className={`px-5 py-10 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {loading ? t('Loading backups...') : t('No backups found for the current filters.')}
                </td>
              </tr>
            ) : (
              filteredBackups.map((backup) => (
                <tr key={backup.id} className={isDark ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {backup.scope === 'platform' ? <Server size={15} /> : <Database size={15} />}
                      <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{backup.scope}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                      {backup.tenant_name || t('Platform-wide')}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{backup.path || '-'}</div>
                  </td>
                  <td className="px-5 py-4">
                    {backup.latest_restored_tenant ? (
                      <>
                        <div className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                          {backup.latest_restored_tenant.name}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {backup.latest_restored_tenant.domain || backup.latest_restored_tenant.slug}
                        </div>
                      </>
                    ) : (
                      <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 capitalize">{backup.tenancy_type || '-'}</td>
                  <td className="px-5 py-4 capitalize">{backup.type}</td>
                  <td className="px-5 py-4">{formatBytes(backup.size_bytes)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(backup.status, isDark)}`}>
                      {backup.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">{formatDateTime(backup.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setSelectedBackup(backup)
                          setActiveTab('logs')
                        }}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                          isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {t('Logs')}
                      </button>
                      <button
                        onClick={() => handleDownload(backup)}
                        disabled={!backup.path}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                          isDark ? 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {t('Download')}
                      </button>
                      <button
                        onClick={() => handleRestore(backup)}
                        disabled={backup.status !== 'success' || backup.scope !== 'tenant' || !['shared', 'dedicated'].includes(backup.tenancy_type)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                          isDark ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <RotateCcw size={12} />
                          {t('Restore')}
                        </span>
                      </button>
                      <button
                        onClick={() => handleDelete(backup)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                          isDark ? 'bg-rose-900/40 text-rose-300 hover:bg-rose-900/60' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Trash2 size={12} />
                          {t('Delete')}
                        </span>
                      </button>
                      {backup.latest_restored_tenant ? (
                        <button
                          onClick={() => openRestoredTenant(backup.latest_restored_tenant)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                            isDark ? 'bg-violet-900/40 text-violet-300 hover:bg-violet-900/60' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            <ExternalLink size={12} />
                            {t('Open restored tenant')}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderRestoreHistory = () => (
    <section className={`rounded-[26px] ${shell} overflow-hidden`}>
      <div className={`border-b px-5 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200/80'}`}>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t('Restore Requests')}</h2>
        <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {t('Track every restore operation separately from backup creation, including the tenant copy that was created.')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className={isDark ? 'bg-slate-950/70 text-slate-400' : 'bg-slate-50 text-slate-500'}>
            <tr>
              <th className="px-5 py-3 text-left font-semibold">{t('Backup')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Source Tenant')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Restored Tenant')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Mode')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Status')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Created At')}</th>
              <th className="px-5 py-3 text-left font-semibold">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {restoreHistory.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-5 py-10 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('No restore operations yet.')}
                </td>
              </tr>
            ) : (
              restoreHistory.map((item) => (
                <tr key={item.id} className={isDark ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                  <td className="px-5 py-4">#{item.backup_id}</td>
                  <td className="px-5 py-4">
                    <div className={isDark ? 'text-slate-200' : 'text-slate-700'}>{item.source_tenant?.name || '-'}</div>
                    <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{item.source_tenant?.domain || item.source_tenant?.slug || '-'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className={isDark ? 'text-slate-200' : 'text-slate-700'}>{item.restored_tenant?.name || '-'}</div>
                    <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{item.restored_tenant?.domain || item.restored_tenant?.slug || '-'}</div>
                  </td>
                  <td className="px-5 py-4 capitalize">{item.restore_mode?.replaceAll('_', ' ')}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(item.status, isDark)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">{formatDateTime(item.created_at)}</td>
                  <td className="px-5 py-4">
                    {item.restored_tenant ? (
                      <button
                        onClick={() => openRestoredTenant(item.restored_tenant)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                          isDark ? 'bg-violet-900/40 text-violet-300 hover:bg-violet-900/60' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <ExternalLink size={12} />
                          {t('Open restored tenant')}
                        </span>
                      </button>
                    ) : (
                      <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  return (
    <div className={`relative overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 max-w-screen-2xl mx-auto ${
      isDark
        ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
        : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
    }`}>
      <div className="relative z-10">
        <header className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {t('Backup Management')}
            </h1>
            <p className={`mt-3 max-w-3xl text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t('Manage platform snapshots, tenant-scoped exports for shared databases, and dedicated database dumps from one place.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => loadData({ silent: true })}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {t('Refresh')}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700"
            >
              <Plus size={16} />
              {t('Create Backup')}
            </button>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className={`rounded-[26px] p-5 ${shell}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{card.label}</p>
                    <p className={`mt-3 text-lg font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>{card.value}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.tone}`}>
                    <Icon size={18} />
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className={`mb-6 rounded-[26px] p-4 ${shell}`}>
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : isDark
                      ? 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'history' && renderHistory()}

        {activeTab === 'restore' && renderRestoreHistory()}

        {activeTab !== 'history' && activeTab !== 'logs' && activeTab !== 'restore' && (
          <section className={`rounded-[26px] p-6 ${shell}`}>
            <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t(TABS.find((tab) => tab.key === activeTab)?.label || '')}</h2>
            <p className={`mt-3 max-w-2xl text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t(EMPTY_STATES[activeTab])}</p>
          </section>
        )}

        {activeTab === 'logs' && (
          <section className={`rounded-[26px] p-6 ${shell}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t('Logs')}</h2>
                <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {selectedBackup ? t('Showing log trail for the selected backup.') : t('Pick any backup from history to inspect its execution trail.')}
                </p>
              </div>
              {selectedBackup && (
                <button
                  onClick={() => setActiveTab('history')}
                  className={`inline-flex items-center gap-1 text-sm font-medium ${isDark ? 'text-blue-300' : 'text-blue-600'}`}
                >
                  {t('Go to history')}
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {selectedBackup ? (
              <div className={`mt-5 rounded-3xl border p-5 ${isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'}`}>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className={`text-xs uppercase tracking-[0.16em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Scope')}</div>
                    <div className={`mt-1 text-sm font-semibold capitalize ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{selectedBackup.scope}</div>
                  </div>
                  <div>
                    <div className={`text-xs uppercase tracking-[0.16em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Tenant')}</div>
                    <div className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{selectedBackup.tenant_name || t('Platform-wide')}</div>
                  </div>
                  <div>
                    <div className={`text-xs uppercase tracking-[0.16em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Status')}</div>
                    <div className="mt-1">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(selectedBackup.status, isDark)}`}>
                        {selectedBackup.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {logsList.length === 0 ? (
                    <p className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t('No logs captured yet for this backup.')}</p>
                  ) : (
                    logsList.map((entry, index) => (
                      <div
                        key={`${selectedBackup.id}-${index}`}
                        className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-slate-800 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                      >
                        {entry}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className={`mt-5 rounded-3xl border border-dashed p-10 text-center ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-300 text-slate-400'}`}>
                {t('Select a backup from the history tab to inspect its logs here.')}
              </div>
            )}
          </section>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => !creating && setModalOpen(false)}>
        <div className={`rounded-[30px] p-6 ${shell}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>{t('Create Backup')}</h2>
              <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t('Use platform backup for global snapshots, or tenant backup for shared exports and dedicated database dumps.')}
              </p>
            </div>
            <button
              onClick={() => !creating && setModalOpen(false)}
              className={`rounded-2xl p-2 ${isDark ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-600'}`}
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t('Backup Scope')}</label>
              <select
                value={form.scope}
                onChange={(event) => setForm((prev) => ({ ...prev, scope: event.target.value, tenant_id: event.target.value === 'platform' ? '' : prev.tenant_id }))}
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none ${
                  isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="platform">{t('Full Platform')}</option>
                <option value="tenant">{t('Specific Tenant')}</option>
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t('Tenant')}</label>
              <select
                value={form.tenant_id}
                disabled={form.scope !== 'tenant'}
                onChange={(event) => setForm((prev) => ({ ...prev, tenant_id: event.target.value }))}
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="">{t('Choose tenant')}</option>
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.tenancy_type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t('Backup Type')}</label>
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none ${
                  isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="manual">{t('Manual Backup')}</option>
                <option value="pre_deployment">{t('Pre-deployment Backup')}</option>
                <option value="pre_delete">{t('Pre-delete Backup')}</option>
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t('Storage')}</label>
              <select
                value={form.storage_disk}
                onChange={(event) => setForm((prev) => ({ ...prev, storage_disk: event.target.value }))}
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none ${
                  isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {(dashboard?.supported_storage || ['local']).map((disk) => (
                  <option key={disk} value={disk}>
                    {disk}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`mt-5 rounded-3xl border p-4 ${isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'}`}>
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {form.scope === 'platform'
                ? t('This MVP creates a platform snapshot package with landlord and shared database exports.')
                : t('Shared tenants are exported by tenant_id, while dedicated tenants keep using a direct database dump.')}
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setModalOpen(false)}
              disabled={creating}
              className={`rounded-2xl px-4 py-2.5 text-sm font-medium ${
                isDark ? 'bg-slate-950 text-slate-200' : 'bg-slate-100 text-slate-700'
              } disabled:opacity-50`}
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creating ? t('Starting...') : t('Start Backup')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(restoredTenantResult)} onClose={() => setRestoredTenantResult(null)}>
        <div className={`rounded-[30px] p-6 ${shell}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>{t('Restore Completed')}</h2>
              <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t('A new tenant copy has been created from the selected backup.')}
              </p>
            </div>
            <button
              onClick={() => setRestoredTenantResult(null)}
              className={`rounded-2xl p-2 ${isDark ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-600'}`}
            >
              <X size={16} />
            </button>
          </div>

          {restoredTenantResult ? (
            <div className={`mt-6 rounded-3xl border p-5 ${isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'}`}>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className={`text-xs uppercase tracking-[0.16em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Tenant Name')}</div>
                  <div className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{restoredTenantResult.name}</div>
                </div>
                <div>
                  <div className={`text-xs uppercase tracking-[0.16em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Slug')}</div>
                  <div className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{restoredTenantResult.slug}</div>
                </div>
                <div>
                  <div className={`text-xs uppercase tracking-[0.16em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Domain')}</div>
                  <div className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{restoredTenantResult.domain}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setRestoredTenantResult(null)}
              className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('Close')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
