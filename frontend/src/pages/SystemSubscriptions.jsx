/**
 * SystemSubscriptions - Super Admin view for managing tenant subscription plans.
 * Shows plan, dates, users limit, status with inline edit modal.
 * Uses useTenants hook; zero impact on tenant data.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { Search, Edit, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { useTenants, PLANS, PLAN_COLOR, STATUS_COLOR } from '../hooks/useTenants'

function daysDiff(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

function ExpiryCell({ tenant }) {
  const { t } = useTranslation()
  const isLifetime = tenant.meta_data?.subscription?.is_lifetime

  if (isLifetime) {
    return <span className="text-xs font-medium text-emerald-500">{t('Lifetime')}</span>
  }

  if (!tenant.end_date) {
    return <span className="text-xs text-theme opacity-50">-</span>
  }

  const days = daysDiff(tenant.end_date)
  if (days < 0) {
    return <span className="text-xs font-medium text-red-500">{t('Expired')}</span>
  }

  if (days <= 30) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-500">
        <AlertTriangle size={12} />
        {t('in {{n}} days', { n: days })}
      </span>
    )
  }

  return (
    <span className="text-xs text-theme">
      {new Date(tenant.end_date).toLocaleDateString()}
    </span>
  )
}

function EditSubscriptionModal({ tenant, onClose, onSave }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    subscription_plan: tenant.subscription_plan || 'core',
    status: tenant.status || 'active',
    users_limit: tenant.users_limit || 5,
    start_date: tenant.start_date ? tenant.start_date.split('T')[0] : '',
    end_date: tenant.end_date ? tenant.end_date.split('T')[0] : '',
    is_lifetime: tenant.meta_data?.subscription?.is_lifetime || false,
  })

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(tenant.id, {
        subscription_plan: form.subscription_plan,
        status: form.status,
        users_limit: Number(form.users_limit),
        start_date: form.start_date || undefined,
        end_date: form.is_lifetime ? undefined : (form.end_date || undefined),
        is_lifetime: form.is_lifetime,
      })
      toast.success(t('Subscription updated'))
      onClose()
    } catch {
      toast.error(t('Failed to update subscription'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b border-theme-border p-4">
          <div>
            <p className="text-xs text-theme opacity-60">{t('Edit Subscription')}</p>
            <h3 className="font-semibold text-theme">{tenant.name}</h3>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-theme hover:opacity-70">
            &times;
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-theme">{t('Plan')}</label>
            <select
              value={form.subscription_plan}
              onChange={(e) => setField('subscription_plan', e.target.value)}
              className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
            >
              {PLANS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {t(plan.name)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-theme">{t('Status')}</label>
            <select
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
              className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
            >
              {['active', 'pending', 'expired', 'cancelled'].map((status) => (
                <option key={status} value={status}>
                  {t(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-theme">{t('Users Limit')}</label>
            <input
              type="number"
              min="1"
              value={form.users_limit}
              onChange={(e) => setField('users_limit', e.target.value)}
              className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-theme">{t('Start Date')}</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setField('start_date', e.target.value)}
                className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-theme">{t('End Date')}</label>
              <input
                type="date"
                value={form.end_date}
                disabled={form.is_lifetime}
                onChange={(e) => setField('end_date', e.target.value)}
                className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_lifetime}
              onChange={(e) => setField('is_lifetime', e.target.checked)}
              className="rounded text-blue-600"
            />
            <span className="text-sm text-theme">{t('Lifetime subscription')}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-theme-border p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-theme-border bg-theme-bg px-4 py-2 text-sm text-theme"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t('Saving...') : t('Save Changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SystemSubscriptions() {
  const { t } = useTranslation()
  const { tenants, loading, pagination, filters, setFilters, refetch, updateTenant } = useTenants()
  const [editing, setEditing] = useState(null)

  const active = tenants.filter((tenant) => tenant.status === 'active').length
  const expiring = tenants.filter((tenant) => {
    const diff = daysDiff(tenant.end_date)
    return tenant.status === 'active' && diff !== null && diff >= 0 && diff <= 30
  }).length
  const expired = tenants.filter((tenant) => tenant.status === 'expired').length

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8">
      <header className="mb-6">
        <p className="mb-1 text-xs uppercase tracking-[0.25em] text-theme opacity-60">
          {t('System Admin')}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-theme">
          {t('Subscription Management')}
        </h1>
        <p className="mt-1 text-sm text-theme opacity-60">
          {t('Manage tenant plans, billing dates and status.')}
        </p>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { label: t('Active'), value: active, icon: <CheckCircle size={16} className="text-emerald-500" /> },
          { label: t('Expiring in 30d'), value: expiring, icon: <Clock size={16} className="text-amber-500" /> },
          { label: t('Expired'), value: expired, icon: <AlertTriangle size={16} className="text-red-500" /> },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-bg/60 px-4 py-3"
          >
            {item.icon}
            <div>
              <p className="text-xl font-bold text-theme">{item.value}</p>
              <p className="text-xs text-theme opacity-60">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme opacity-50" />
          <input
            type="text"
            placeholder={t('Search tenant...')}
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="w-full rounded-lg border border-theme-border bg-transparent py-2 pl-8 pr-3 text-sm text-theme"
          />
        </div>
        <select
          value={filters.plan}
          onChange={(e) => setFilters((prev) => ({ ...prev, plan: e.target.value }))}
          className="rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
        >
          <option value="all">{t('All Plans')}</option>
          {PLANS.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {t(plan.name)}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
        >
          <option value="all">{t('All Statuses')}</option>
          {['active', 'pending', 'expired', 'cancelled'].map((status) => (
            <option key={status} value={status}>
              {t(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-theme-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-theme-bg/80 text-left text-xs uppercase text-theme opacity-70">
                <th className="px-4 py-3">{t('Tenant')}</th>
                <th className="px-4 py-3">{t('Plan')}</th>
                <th className="px-4 py-3">{t('Status')}</th>
                <th className="px-4 py-3">{t('Users')}</th>
                <th className="px-4 py-3">{t('Start')}</th>
                <th className="px-4 py-3">{t('Expires')}</th>
                <th className="px-4 py-3 text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-theme-border/40" />
                    </td>
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-theme opacity-50">
                    {t('No tenants found.')}
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id} className="transition-colors hover:bg-theme-bg/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-theme">{tenant.name}</p>
                      <p className="text-xs text-theme opacity-50">{tenant.domain || tenant.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${PLAN_COLOR[tenant.subscription_plan] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {tenant.subscription_plan || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLOR[tenant.status] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {t(tenant.status || 'unknown')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-theme">
                      {tenant.users_count} / {tenant.users_limit}
                    </td>
                    <td className="px-4 py-3 text-xs text-theme">
                      {tenant.start_date ? new Date(tenant.start_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <ExpiryCell tenant={tenant} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(tenant)}
                        className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        title={t('Edit Subscription')}
                      >
                        <Edit size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.last_page > 1 ? (
          <div className="flex items-center justify-between border-t border-theme-border px-4 py-3 text-xs text-theme">
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
      </div>

      {editing ? (
        <EditSubscriptionModal
          tenant={editing}
          onClose={() => setEditing(null)}
          onSave={updateTenant}
        />
      ) : null}
    </div>
  )
}
