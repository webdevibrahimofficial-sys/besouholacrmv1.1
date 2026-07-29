import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { BriefcaseBusiness, Building2, Edit, Layers3, Plus, RefreshCw, Rocket, Search, ShieldCheck, Star, Trash2, X } from 'lucide-react'
import { useTheme } from '@shared/context/ThemeProvider'
import {
  useSubscriptionPlans,
  AVAILABLE_PLAN_MODULES,
  PLAN_COLOR,
} from '../hooks/useSubscriptionPlans'
import { api } from '../utils/api'

const getFeatureNotReadyMessage = (meta, fallback) => {
  if (meta?.message) return meta.message
  if (meta?.migration_hint) return meta.migration_hint
  return fallback
}

const PLAN_ICON_COMPONENTS = {
  layers: Layers3,
  briefcase: BriefcaseBusiness,
  building: Building2,
  rocket: Rocket,
  shield: ShieldCheck,
  star: Star,
}

const PLAN_ICON_OPTIONS = [
  { id: 'layers', label: 'Layers' },
  { id: 'briefcase', label: 'Briefcase' },
  { id: 'building', label: 'Building' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'shield', label: 'Shield' },
  { id: 'star', label: 'Star' },
]

const PLAN_ICON_TINT = {
  layers: 'text-violet-400/30 dark:text-violet-300/20',
  briefcase: 'text-emerald-400/30 dark:text-emerald-300/20',
  building: 'text-amber-400/30 dark:text-amber-300/20',
  rocket: 'text-sky-400/30 dark:text-sky-300/20',
  shield: 'text-cyan-400/30 dark:text-cyan-300/20',
  star: 'text-rose-400/30 dark:text-rose-300/20',
}

function PlanPriceEditorModal({ plans, price, onClose, onSave }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isEdit = !!price?.id
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    subscription_plan_id: price?.subscription_plan_id || plans[0]?.id || '',
    currency: price?.currency || 'EGP',
    billing_cycle: price?.billing_cycle || 'monthly',
    list_price: price?.list_price ?? '',
    is_active: price?.is_active ?? true,
  })

  const handleSubmit = async () => {
    if (!form.subscription_plan_id || !form.currency || !form.billing_cycle || form.list_price === '') {
      toast.error(t('Please complete all required price fields'))
      return
    }

    setSaving(true)
    try {
      await onSave({
        subscription_plan_id: Number(form.subscription_plan_id),
        currency: String(form.currency).toUpperCase(),
        billing_cycle: form.billing_cycle,
        list_price: Number(form.list_price),
        is_active: !!form.is_active,
      })
      onClose()
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || t('Failed to save price'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm">
      <div className={`w-full max-w-2xl rounded-2xl border ${
        isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-theme opacity-50">{t('Reference Prices')}</p>
            <h3 className="text-lg font-semibold text-theme">{isEdit ? t('Edit Reference Price') : t('Create Reference Price')}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-theme">{t('Plan')}</label>
            <select
              value={form.subscription_plan_id}
              onChange={(e) => setForm((prev) => ({ ...prev, subscription_plan_id: e.target.value }))}
              className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-theme">{t('Currency')}</label>
            <input value={form.currency} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme" maxLength={3} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-theme">{t('Billing Cycle')}</label>
            <select value={form.billing_cycle} onChange={(e) => setForm((prev) => ({ ...prev, billing_cycle: e.target.value }))} className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme">
              <option value="monthly">{t('Monthly')}</option>
              <option value="yearly">{t('Yearly')}</option>
              <option value="lifetime">{t('Lifetime')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-theme">{t('List Price')}</label>
            <input type="number" step="0.01" value={form.list_price} onChange={(e) => setForm((prev) => ({ ...prev, list_price: e.target.value }))} className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 rounded-full border border-theme-border px-3 py-2 text-sm text-theme">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} className="rounded text-blue-600" />
              {t('Active price')}
            </label>
          </div>
        </div>
        <div className={`flex justify-end gap-2 border-t px-5 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <button type="button" onClick={onClose} className="rounded-lg border border-theme-border px-4 py-2 text-sm text-theme">{t('Cancel')}</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {saving ? t('Saving...') : t('Save Changes')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function PlanEditorModal({ plan, onClose, onSave }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isEdit = !!plan
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [form, setForm] = useState({
    code: plan?.code || '',
    name: plan?.name || '',
    icon: plan?.icon || '',
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
    const normalizedCode = form.code.trim().toLowerCase()
    const normalizedName = form.name.trim()

    if (!normalizedCode) {
      setSubmitError(t('Code is required'))
      return
    }

    if (!/^[a-z0-9_-]+$/.test(normalizedCode)) {
      setSubmitError(t('Code can only contain lowercase letters, numbers, underscores, and hyphens'))
      return
    }

    if (!normalizedName) {
      setSubmitError(t('Name is required'))
      return
    }

    setSubmitError('')
    setSaving(true)
    try {
      await onSave({
        code: normalizedCode,
        name: normalizedName,
        icon: form.icon || null,
        description: form.description.trim(),
        modules: form.modules,
        company_type_overrides: plan?.company_type_overrides || {},
        is_active: form.is_active,
        display_order: Number(form.display_order) || 0,
      })
      onClose()
    } catch (error) {
      setSubmitError(error?.response?.data?.message || t('Failed to save plan'))
      throw error
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 md:p-4">
      <div
        className={`flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-xl ${
          isDark
            ? 'border-slate-700/70 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between border-b border-theme-border px-4 py-3 md:px-5">
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
          <div className="border-b border-theme-border p-4 md:p-5">
            <div className="rounded-2xl border border-theme-border bg-theme-bg/30 p-3 md:p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
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

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Code')}</label>
                  <input
                    value={form.code}
                    onChange={(e) => {
                      setSubmitError('')
                      setForm((prev) => ({ ...prev, code: e.target.value }))
                    }}
                    className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
                    placeholder="enterprise_plus"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Name')}</label>
                  <input
                    value={form.name}
                    onChange={(e) => {
                      setSubmitError('')
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }}
                    className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-medium text-theme">{t('Icon')}</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PLAN_ICON_OPTIONS.map((option) => {
                      const Icon = PLAN_ICON_COMPONENTS[option.id]
                      const isSelected = form.icon === option.id

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, icon: option.id }))}
                          className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-sm transition ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                              : 'border-theme-border text-theme hover:bg-theme-bg/40'
                          }`}
                        >
                          <Icon size={16} />
                          <span>{t(option.label)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-theme">{t('Description')}</label>
                  <textarea
                    rows={2}
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
                    className="h-10 w-full rounded-lg border border-theme-border bg-transparent px-3 text-sm text-theme"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 md:p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-theme">{t('Module Configuration')}</p>
                <p className="mt-1 text-xs text-theme opacity-60">
                  {t('Select the modules included in this plan. Tenant type rules are applied later during tenant creation.')}
                </p>
              </div>

              <div className="rounded-2xl border border-theme-border bg-theme-bg/20 p-3">
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

            <section className="rounded-2xl border border-theme-border bg-theme-bg/30 p-3 md:p-4">
              <div className="mb-3 border-b border-theme-border pb-3">
                <p className="text-sm font-semibold text-theme">{t('Plan Modules')}</p>
                <p className="mt-1 text-xs text-theme opacity-60">
                  {t('These modules define what this plan can include before tenant-specific rules are applied.')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
                {AVAILABLE_PLAN_MODULES.map((module) => (
                  <label
                    key={module.id}
                    className="flex min-h-[40px] items-center gap-3 rounded-xl border border-transparent px-3 py-1.5 text-sm text-theme transition-colors hover:border-theme-border hover:bg-theme-bg/50"
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

        <div className="flex justify-end gap-2 border-t border-theme-border px-4 py-3 md:px-5">
          {submitError ? (
            <p className="mr-auto max-w-md text-sm text-red-400">{submitError}</p>
          ) : null}
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
    </div>,
    document.body,
  )
}

export default function SystemSubscriptions() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const {
    plans,
    loading,
    error,
    createPlan,
    updatePlan,
    deletePlan,
    refetchPlans,
  } = useSubscriptionPlans({ includeInactive: true })
  const [editingPlan, setEditingPlan] = useState(null)
  const [editingPrice, setEditingPrice] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planPrices, setPlanPrices] = useState([])
  const [planPricesLoading, setPlanPricesLoading] = useState(false)
  const [planPricesMeta, setPlanPricesMeta] = useState({ ready: true })
  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`

  const filteredPlans = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return plans.filter((plan) => {
      const matchesSearch =
        !term ||
        plan.name?.toLowerCase().includes(term) ||
        plan.code?.toLowerCase().includes(term)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && plan.is_active) ||
        (statusFilter === 'inactive' && !plan.is_active)
      return matchesSearch && matchesStatus
    })
  }, [plans, searchTerm, statusFilter])

  const groupedPlanPrices = useMemo(() => {
    return filteredPlans.reduce((acc, plan) => {
      acc[plan.id] = planPrices.filter((price) => price.subscription_plan_id === plan.id)
      return acc
    }, {})
  }, [filteredPlans, planPrices])

  const loadPlanPrices = async () => {
    try {
      setPlanPricesLoading(true)
      const { data } = await api.get('/super-admin/plan-prices')
      setPlanPrices(Array.isArray(data?.prices) ? data.prices : [])
      setPlanPricesMeta(data?.meta || { ready: true })
    } catch (error) {
      console.error('Failed to load plan prices:', error)
      const meta = error?.response?.data?.meta || null
      setPlanPricesMeta(meta || { ready: false })
      toast.error(getFeatureNotReadyMessage(meta, error?.response?.data?.message || t('Failed to load reference prices')))
    } finally {
      setPlanPricesLoading(false)
    }
  }

  useEffect(() => {
    loadPlanPrices()
  }, [])

  const getPlanWatermarkIcon = (plan) => {
    if (plan?.icon && PLAN_ICON_COMPONENTS[plan.icon]) {
      return PLAN_ICON_COMPONENTS[plan.icon]
    }

    switch (plan?.code) {
      case 'basic':
        return PLAN_ICON_COMPONENTS.layers
      case 'professional':
        return PLAN_ICON_COMPONENTS.briefcase
      case 'enterprise':
        return PLAN_ICON_COMPONENTS.building
      default:
        return PLAN_ICON_COMPONENTS.layers
    }
  }

  const planPricesReady = planPricesMeta?.ready !== false
  const planPricesBlockedMessage = getFeatureNotReadyMessage(
    planPricesMeta,
    t('Reference pricing is temporarily unavailable until the new billing tables are migrated.'),
  )

  return (
    <div className={`relative mx-auto max-w-screen-2xl overflow-x-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${
      isDark
        ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
        : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
    }`}>
      {isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_28%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%)]" />
        </>
      )}
      {!isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.75),transparent_28%)]" />
          <div className="pointer-events-none absolute -top-24 right-12 h-56 w-56 rounded-full bg-blue-400/12 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-10 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        </>
      )}

      <div className="relative z-10">
        <header className="mb-10">
          <div className="flex gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className={`mb-2 text-xs uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('System Admin')}
              </p>
              <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {t('Subscription Management')}
              </h1>
              <p className={`mt-3 max-w-2xl text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {t('Manage your plan catalog, then assign plans to tenants from one place.')}
              </p>
            </div>

            <button
              onClick={() => setEditingPlan({})}
              className="flex shrink-0 self-start items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700 sm:self-auto"
            >
              <Plus size={14} />
              {t('Create Plan')}
            </button>
          </div>
        </header>

        <section className={`${glassCard} mb-5 px-4 py-4 md:px-5 mt-2`}>
          <div className="flex  gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Subscription Plans')}
              </h2>
              <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('Create and adjust plans here so they are reusable later in tenant setup.')}
              </p>
            </div>

            <div className="flex min-w-0  gap-3 sm:flex-row sm:items-center xl:w-full xl:max-w-[520px]">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('Search by plan name or code...')}
                  style={{
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                    color: isDark ? '#f1f5f9' : '#334155',
                  }}
                  className={`h-10 w-full rounded-xl border pl-9 text-sm outline-none transition focus:border-blue-400 ${
                    searchTerm ? 'pr-9' : 'pr-3'
                  } ${
                    isDark
                      ? 'border-slate-700/60 placeholder:text-slate-500'
                      : 'border-slate-200/80 placeholder:text-slate-400'
                  }`}
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    title={t('Clear search')}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 transition ${
                      isDark ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-300' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>

              <div className={`inline-flex shrink-0 self-start rounded-xl border p-1 backdrop-blur-md sm:self-auto ${
                isDark ? 'border-slate-700/60 bg-slate-900/80' : 'border-slate-200/80 bg-white/78'
              }`}>
                {['all', 'active', 'inactive'].map((option) => (
                  <button
                    key={option}
                    onClick={() => setStatusFilter(option)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                      statusFilter === option
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : isDark
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t(option === 'all' ? 'All' : option === 'active' ? 'Active' : 'Inactive')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {searchTerm.trim() || statusFilter !== 'all' ? (
            <p className={`mt-3 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('Showing')} {filteredPlans.length} {t('of')} {plans.length} {t('plans')}
            </p>
          ) : null}
        </section>


        {!planPricesReady ? (
          <section className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
            isDark
              ? 'border-amber-900/50 bg-amber-950/30 text-amber-100'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <p className="font-semibold">{t('Reference pricing is not ready yet')}</p>
            <p className="mt-1 opacity-90">{planPricesBlockedMessage}</p>
          </section>
        ) : null}

        {loading ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className={`${glassCard} min-h-[240px] animate-pulse px-5 py-5`}
              >
                <div className={`h-4 w-24 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`mt-4 h-8 w-36 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`mt-6 h-3 w-full rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`mt-2 h-3 w-4/5 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
              </div>
            ))}
          </section>
        ) : error ? (
          <section className="mb-5 rounded-2xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-red-700 backdrop-blur-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-medium">{t('Failed to load subscription plans')}</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              onClick={refetchPlans}
              className={`mt-4 inline-flex rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                isDark
                  ? 'border-red-900/40 bg-red-950/40 text-red-200 hover:bg-red-950/60'
                  : 'border-red-200 bg-white/70 text-red-700 hover:bg-white'
              }`}
            >
              {t('Try Again')}
            </button>
          </section>
        ) : plans.length === 0 ? (
          <section className={`${glassCard} px-4 py-12 text-center`}>
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t('No subscription plans have been created yet.')}
            </p>
          </section>
        ) : filteredPlans.length === 0 ? (
          <section className={`${glassCard} px-4 py-12 text-center`}>
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t('No plans match your search or filter.')}
            </p>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredPlans.map((plan) => {
              const moduleNames = (Array.isArray(plan.modules) ? plan.modules : []).map((moduleId) => {
                const found = AVAILABLE_PLAN_MODULES.find((item) => item.id === moduleId)
                return t(found?.name || moduleId)
              })
              const visibleModules = moduleNames
              const extraModulesCount = 0
              const tenantsCount = Number(plan.tenants_count ?? plan.tenant_count ?? 0)
              const WatermarkIcon = getPlanWatermarkIcon(plan)
              const watermarkTint = PLAN_ICON_TINT[plan.icon] || PLAN_ICON_TINT.layers
              const normalizedDescriptionParts = (plan.description || '')
                .split(',')
                .map((part) => part.trim().toLowerCase())
                .filter(Boolean)
              const normalizedModuleNames = moduleNames.map((name) => name.toLowerCase())
              const isDescriptionJustModuleList =
                normalizedDescriptionParts.length > 0 &&
                normalizedDescriptionParts.length === normalizedModuleNames.length &&
                normalizedDescriptionParts.every((part) => normalizedModuleNames.includes(part))

              return (
                <article
                  key={plan.id}
                  className={`group relative min-w-0 overflow-hidden rounded-[20px] border p-4 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 ${
                    isDark
                      ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:shadow-[0_18px_40px_rgba(0,0,0,0.4)]'
                      : 'border-white/55 bg-white/24 shadow-[0_14px_34px_rgba(15,23,42,0.08)] hover:border-blue-200/70 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)]'
                  }`}
                >
                  <div className="absolute inset-x-4 top-0 h-px bg-white/75 dark:bg-slate-600/40" />
                  <div className={`pointer-events-none absolute -right-5 top-10 ${watermarkTint}`}>
                    <WatermarkIcon size={120} strokeWidth={1.25} />
                  </div>

                    <div className="relative z-10 flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {plan.code && plan.code !== plan.name?.trim().toLowerCase().replace(/\s+/g, '_') ? (
                            <p className={`text-[11px] uppercase tracking-[0.28em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {plan.code}
                          </p>
                        ) : null}
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                          {plan.name}
                        </h3>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${PLAN_COLOR[plan.code] || 'bg-gray-100 text-gray-600'}`}>
                        {plan.is_active ? t('Active') : t('Inactive')}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {moduleNames.length} {t('Modules')}
                      </span>
                      <span className={`rounded-full px-3 py-1.5 text-xs ${
                        isDark ? 'bg-slate-950/70 text-slate-400 ring-1 ring-slate-800' : 'bg-white/85 text-slate-500 ring-1 ring-slate-200/80'
                      }`}>
                        {tenantsCount} {t('Tenants')}
                      </span>
                    </div>

                    {!isDescriptionJustModuleList ? (
                      <p className={`mt-3 line-clamp-2 text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {plan.description || '-'}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {visibleModules.length > 0 ? (
                        <>
                          {visibleModules.map((moduleName) => (
                            <span
                              key={`${plan.id}-${moduleName}`}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                                isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {moduleName}
                            </span>
                          ))}
                          {extraModulesCount > 0 ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                                isDark ? 'bg-blue-950/40 text-blue-300' : 'bg-blue-50 text-blue-600'
                              }`}
                            >
                              +{extraModulesCount}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>-</span>
                      )}
                    </div>

                      <div className="mt-4 space-y-2 rounded-2xl border border-theme-border/70 bg-theme-bg/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-theme opacity-60">
                            {t('Reference Prices')}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingPrice({ subscription_plan_id: plan.id })}
                          disabled={!planPricesReady}
                          className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                            isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {t('Add')}
                        </button>
                      </div>
                      {groupedPlanPrices[plan.id]?.length > 0 ? (
                        groupedPlanPrices[plan.id].map((price) => (
                          <div key={price.id} className={`flex flex-col gap-3 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                            isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white/85'
                          }`}>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-theme">
                                {price.list_price} {price.currency}
                              </p>
                              <p className={`text-xs capitalize ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {price.billing_cycle} • {price.is_active ? t('Active') : t('Inactive')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingPrice(price)}
                              disabled={!planPricesReady}
                              className={`self-end rounded-lg p-2 sm:self-auto ${
                                isDark ? 'text-blue-300 hover:bg-blue-950/40' : 'text-blue-600 hover:bg-blue-50'
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                              title={t('Edit Reference Price')}
                            >
                              <Edit size={15} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('No reference prices yet.')}</p>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-end gap-1 border-t border-white/10 pt-3 dark:border-slate-800">
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className={`rounded-lg p-2 transition ${
                          isDark
                            ? 'text-blue-300 hover:bg-blue-950/40'
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                        title={t('Edit Plan')}
                      >
                        <Edit size={16} />
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
                        className={`rounded-lg p-2 transition ${
                          isDark
                            ? 'text-red-300 hover:bg-red-950/40'
                            : 'text-red-600 hover:bg-red-50'
                        }`}
                        title={t('Delete Plan')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>

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

      {editingPrice !== null ? (
        <PlanPriceEditorModal
          plans={plans}
          price={editingPrice?.id ? editingPrice : editingPrice}
          onClose={() => setEditingPrice(null)}
          onSave={async (payload) => {
            if (!planPricesReady) {
              throw new Error(planPricesBlockedMessage)
            }

            if (editingPrice?.id) {
              await api.put(`/super-admin/plan-prices/${editingPrice.id}`, payload)
            } else {
              await api.post('/super-admin/plan-prices', payload)
            }
            await loadPlanPrices()
          }}
        />
      ) : null}
    </div>
  )
}
