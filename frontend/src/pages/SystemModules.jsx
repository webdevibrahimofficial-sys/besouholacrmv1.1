/**
 * SystemModules - Super Admin view for managing per-tenant module access.
 * Shows each tenant's enabled modules as chips; click to open a toggle drawer.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { Search, Layers } from 'lucide-react'
import { useTenants, AVAILABLE_MODULES } from '../hooks/useTenants'

function ResolutionNotice({ state, onClose, t }) {
  if (!state) return null

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4">
      <div className="card w-full max-w-lg rounded-2xl border border-amber-300 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-theme-border p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-500">{t('Resolution Required')}</p>
            <h3 className="mt-1 text-lg font-semibold text-theme">{t('Telesales cannot be disabled yet')}</h3>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-theme hover:opacity-70">
            &times;
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
            {state.message}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-theme-border p-3">
              <div className="text-xs text-theme opacity-60">{t('Tenant')}</div>
              <div className="mt-1 font-semibold text-theme">{state.tenantName}</div>
            </div>
            <div className="rounded-xl border border-theme-border p-3">
              <div className="text-xs text-theme opacity-60">{t('Active leads')}</div>
              <div className="mt-1 font-semibold text-theme">{state.activeLeadsCount || 0}</div>
            </div>
          </div>

          <div className="text-sm text-theme opacity-75">
            {t('Transfer or resolve active telesales leads first, then try disabling the module again.')}
          </div>
        </div>

        <div className="flex justify-end border-t border-theme-border p-4">
          <button onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModulesDrawer({ tenant, onClose, onSaved, updateModules }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [resolutionState, setResolutionState] = useState(null)
  const initial = (tenant.modules || [])
    .map((module) => (typeof module === 'string' ? module : (module.slug || module.name || '')))
    .filter(Boolean)
  const [enabled, setEnabled] = useState(new Set(initial))

  const toggle = (id) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateModules(tenant.id, [...enabled])
      toast.success(t('Modules updated for {{name}}', { name: tenant.name }))
      onSaved()
      onClose()
    } catch (error) {
      const payload = error?.response?.data || {}
      if (payload?.requires_resolution) {
        setResolutionState({
          tenantName: tenant.name,
          activeLeadsCount: Number(payload.active_leads_count || 0),
          message: payload.message || t('Resolve active telesales leads before disabling this module.'),
        })
      } else {
        toast.error(payload?.message || t('Failed to update modules'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b border-theme-border p-4">
          <div>
            <p className="text-xs text-theme opacity-60">{t('Module Access')}</p>
            <h3 className="font-semibold text-theme">{tenant.name}</h3>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-theme hover:opacity-70">
            &times;
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          {AVAILABLE_MODULES.map((module) => {
            const isOn = enabled.has(module.id)
            return (
              <label
                key={module.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                  isOn
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-theme-border hover:bg-theme-bg/60'
                }`}
              >
                <span className="text-sm font-medium text-theme">{t(module.name)}</span>
                <div
                  className={`relative flex h-5 w-10 flex-shrink-0 rounded-full transition-colors ${
                    isOn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      isOn ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(module.id)}
                  className="sr-only"
                />
              </label>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t border-theme-border p-4">
          <span className="text-xs text-theme opacity-50">
            {enabled.size} {t('modules enabled')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-theme-border px-4 py-2 text-sm text-theme"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t('Saving...') : t('Save Modules')}
            </button>
          </div>
        </div>
      </div>
      <ResolutionNotice state={resolutionState} onClose={() => setResolutionState(null)} t={t} />
    </div>
  )
}

function ModuleChip({ name }) {
  return (
    <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
      {name}
    </span>
  )
}

export default function SystemModules() {
  const { t } = useTranslation()
  const { tenants, loading, pagination, filters, setFilters, refetch, updateModules } = useTenants()
  const [managing, setManaging] = useState(null)

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8">
      <header className="mb-6">
        <p className="mb-1 text-xs uppercase tracking-[0.25em] text-theme opacity-60">
          {t('System Admin')}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-theme">{t('Module Management')}</h1>
        <p className="mt-1 text-sm text-theme opacity-60">
          {t('Control which modules each tenant can access.')}
        </p>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme opacity-50" />
        <input
          type="text"
          placeholder={t('Search tenant...')}
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          className="w-full rounded-lg border border-theme-border bg-transparent py-2 pl-8 pr-3 text-sm text-theme"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-2xl border border-theme-border p-4">
              <div className="mb-3 h-4 w-1/2 rounded bg-theme-border/40" />
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 3 }).map((__, chipIndex) => (
                  <div key={chipIndex} className="h-5 w-16 rounded-full bg-theme-border/40" />
                ))}
              </div>
            </div>
          ))
        ) : tenants.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-theme opacity-50">
            {t('No tenants found.')}
          </div>
        ) : (
          tenants.map((tenant) => {
            const modules = (tenant.modules || [])
              .map((module) => (typeof module === 'string' ? module : (module.slug || module.name || '')))
              .filter(Boolean)

            return (
              <div
                key={tenant.id}
                className="flex flex-col gap-3 rounded-2xl border border-theme-border bg-theme-bg/60 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold leading-tight text-theme">{tenant.name}</p>
                    <p className="mt-0.5 text-xs text-theme opacity-50">{tenant.domain || tenant.slug}</p>
                  </div>
                  <button
                    onClick={() => setManaging(tenant)}
                    className="flex-shrink-0 rounded-lg p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    title={t('Manage modules')}
                  >
                    <Layers size={15} />
                  </button>
                </div>

                <div className="flex min-h-[28px] flex-wrap gap-1.5">
                  {modules.length === 0 ? (
                    <span className="text-xs italic text-theme opacity-40">{t('No modules enabled')}</span>
                  ) : (
                    modules.map((slug) => {
                      const found = AVAILABLE_MODULES.find((module) => module.id === slug)
                      return <ModuleChip key={slug} name={t(found?.name || slug)} />
                    })
                  )}
                </div>

                <p className="mt-auto text-xs text-theme opacity-40">
                  {modules.length} / {AVAILABLE_MODULES.length} {t('modules')}
                </p>
              </div>
            )
          })
        )}
      </div>

      {pagination.last_page > 1 ? (
        <div className="mt-6 flex items-center justify-between text-xs text-theme">
          <span>
            {t('Page {{current}} of {{total}}', {
              current: pagination.current_page,
              total: pagination.last_page,
            })}
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagination.current_page === 1}
              onClick={() => refetch(pagination.current_page - 1)}
              className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40"
            >
              {t('Prev')}
            </button>
            <button
              disabled={pagination.current_page === pagination.last_page}
              onClick={() => refetch(pagination.current_page + 1)}
              className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40"
            >
              {t('Next')}
            </button>
          </div>
        </div>
      ) : null}

      {managing ? (
        <ModulesDrawer
          tenant={managing}
          updateModules={updateModules}
          onClose={() => setManaging(null)}
          onSaved={() => refetch(pagination.current_page)}
        />
      ) : null}
    </div>
  )
}
