import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { Edit, Plus, Trash2, X } from 'lucide-react'
import {
  useSubscriptionPlans,
  AVAILABLE_PLAN_MODULES,
  PLAN_COLOR,
} from '../hooks/useSubscriptionPlans'

function PlanEditorModal({ plan, onClose, onSave }) {
  const { t } = useTranslation()
  const isEdit = !!plan
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: plan?.code || '',
    name: plan?.name || '',
    description: plan?.description || '',
    modules: Array.isArray(plan?.modules) ? plan.modules : [],
    is_active: plan?.is_active ?? true,
    display_order: plan?.display_order ?? 0,
  })

  const toggleModule = (moduleId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.modules) ? prev.modules : []
      const next = current.includes(moduleId)
        ? current.filter((item) => item !== moduleId)
        : [...current, moduleId]
      return { ...prev, modules: next }
    })
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave({
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        modules: form.modules,
        company_type_overrides: {},
        is_active: form.is_active,
        display_order: Number(form.display_order) || 0,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4">
      <div className="card flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b border-theme-border p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-theme opacity-50">
              {t('Subscription Plans')}
            </p>
            <h3 className="text-lg font-semibold text-theme">
              {isEdit ? t('Edit Plan') : t('Create Plan')}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-theme hover:bg-theme-bg/60">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-theme-border p-5">
            <div className="rounded-2xl border border-theme-border bg-theme-bg/30 p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-theme">{t('Plan Details')}</p>
                  <p className="text-xs text-theme opacity-60">
                    {t('Start with the essential metadata, then configure plan modules below.')}
                  </p>
                </div>
                <label className="flex items-center gap-2 rounded-full border border-theme-border px-3 py-2 text-sm text-theme">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded text-blue-600"
                  />
                  {t('Active plan')}
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Code')}</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
                    placeholder="enterprise_plus"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Name')}</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Description')}</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
                  />
                </div>
                <div className="md:max-w-[240px]">
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Display Order')}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.display_order}
                    onChange={(e) => setForm((prev) => ({ ...prev, display_order: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-theme">{t('Module Configuration')}</p>
                <p className="mt-1 text-xs text-theme opacity-60">
                  {t('Select the modules included in this plan. Tenant type rules are applied later during tenant creation.')}
                </p>
              </div>

              <div className="rounded-2xl border border-theme-border bg-theme-bg/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-theme">{t('Included Modules')}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-theme dark:bg-white/10">
                    {(form.modules || []).length}
                  </span>
                </div>
                <p className="mt-2 text-xs text-theme opacity-70">
                  {t('Keep plans simple here, then choose the tenant company type later in Tenant Setup.')}
                </p>
              </div>
            </aside>

            <section className="rounded-2xl border border-theme-border bg-theme-bg/30 p-4">
              <div className="mb-4 border-b border-theme-border pb-3">
                <p className="text-sm font-semibold text-theme">{t('Plan Modules')}</p>
                <p className="mt-1 text-xs text-theme opacity-60">
                  {t('These modules define what this plan can include before tenant-specific rules are applied.')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                {AVAILABLE_PLAN_MODULES.map((module) => (
                  <label
                    key={module.id}
                    className="flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-theme transition-colors hover:border-theme-border hover:bg-theme-bg/50"
                  >
                    <input
                      type="checkbox"
                      checked={(form.modules || []).includes(module.id)}
                      onChange={() => toggleModule(module.id)}
                      className="rounded text-blue-600"
                    />
                    <span>{t(module.name)}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-theme-border p-4">
          <button onClick={onClose} className="rounded-lg border border-theme-border px-4 py-2 text-sm text-theme">
            {t('Cancel')}
          </button>
          <button
            onClick={handleSubmit}
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
  const { plans, createPlan, updatePlan, deletePlan } = useSubscriptionPlans({ includeInactive: true })
  const [editingPlan, setEditingPlan] = useState(null)

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
          {t('Manage your plan catalog, then assign plans to tenants from one place.')}
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-theme-border bg-theme-bg/40 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-theme">{t('Subscription Plans')}</h2>
            <p className="text-sm text-theme opacity-60">
              {t('Create and adjust plans here so they are reusable later in tenant setup.')}
            </p>
          </div>
          <button
            onClick={() => setEditingPlan({})}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            {t('Create Plan')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-theme-border bg-theme-bg/60 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-theme">{plan.name}</h3>
                  <p className="text-xs uppercase tracking-[0.2em] text-theme opacity-50">{plan.code}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${PLAN_COLOR[plan.code] || 'bg-gray-100 text-gray-600'}`}>
                  {plan.is_active ? t('Active') : t('Inactive')}
                </span>
              </div>
              <p className="mb-3 text-sm text-theme opacity-70">{plan.description || '-'}</p>
              <div className="space-y-2 text-xs text-theme">
                <div>
                  <span className="font-semibold">{t('Modules')}:</span>{' '}
                  {(Array.isArray(plan.modules) ? plan.modules : []).map((moduleId) => {
                    const found = AVAILABLE_PLAN_MODULES.find((item) => item.id === moduleId)
                    return t(found?.name || moduleId)
                  }).join(', ') || '-'}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setEditingPlan(plan)}
                  className="rounded-lg p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  title={t('Edit Plan')}
                >
                  <Edit size={15} />
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(t('Delete this plan?'))) return
                    try {
                      await deletePlan(plan.id)
                    } catch (error) {
                      toast.error(error?.response?.data?.message || t('Failed to delete plan'))
                    }
                  }}
                  className="rounded-lg p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30"
                  title={t('Delete Plan')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {editingPlan !== null ? (
        <PlanEditorModal
          plan={editingPlan?.id ? editingPlan : null}
          onClose={() => setEditingPlan(null)}
          onSave={async (payload) => {
            try {
              if (editingPlan?.id) {
                await updatePlan(editingPlan.id, payload)
              } else {
                await createPlan(payload)
              }
            } catch (error) {
              toast.error(error?.response?.data?.message || t('Failed to save plan'))
              throw error
            }
          }}
        />
      ) : null}
    </div>
  )
}
