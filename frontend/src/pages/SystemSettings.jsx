/**
 * SystemSettings - Super Admin global platform settings.
 * Reads/writes from GET|POST /api/super-admin/settings (SystemSettingController).
 * Safe: key-value pairs in a separate system_settings table, no tenant data.
 */
import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import {
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Tag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { api } from '../utils/api'
import { useTheme } from '../shared/context/ThemeProvider'

const SETTING_GROUPS = [
  {
    key: 'general',
    label: 'General',
    fields: [
      { key: 'platform_name', label: 'Platform Name', type: 'text', placeholder: 'Be Souhola CRM' },
      { key: 'support_email', label: 'Support Email', type: 'email', placeholder: 'support@example.com' },
      {
        key: 'default_plan',
        label: 'Default Plan for New Tenants',
        type: 'select',
        options: ['core', 'basic', 'professional', 'enterprise', 'custom'],
      },
      { key: 'default_users_limit', label: 'Default Users Limit', type: 'number', placeholder: '5' },
    ],
  },
  {
    key: 'registration',
    label: 'Tenant Registration',
    fields: [
      { key: 'registration_enabled', label: 'Allow Self-Registration', type: 'toggle' },
      { key: 'default_trial_days', label: 'Trial Days', type: 'number', placeholder: '14' },
      {
        key: 'registration_notify_email',
        label: 'Notify Email on Signup',
        type: 'email',
        placeholder: 'admin@example.com',
      },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    fields: [
      { key: 'maintenance_mode', label: 'Maintenance Mode', type: 'toggle' },
      {
        key: 'maintenance_message',
        label: 'Maintenance Message',
        type: 'textarea',
        placeholder: 'We are performing scheduled maintenance. Back shortly.',
      },
    ],
  },
]

function SettingField({ field, value, onChange }) {
  const { t } = useTranslation()

  if (field.type === 'toggle') {
    const isOn = value === 'true' || value === true || value === '1'
    return (
      <div
        onClick={() => onChange(isOn ? 'false' : 'true')}
        className={`relative flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
          isOn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            isOn ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full resize-none rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
      />
    )
  }

  if (field.type === 'select') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
      >
        <option value="">{t('Select...')}</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      type={field.type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="w-full rounded-lg border border-theme-border bg-transparent px-3 py-2 text-sm text-theme"
    />
  )
}

const EMPTY_CATEGORY = {
  id: null,
  code: '',
  name: '',
  description: '',
  display_order: 0,
  is_active: true,
}

const TAB_META = {
  general: {
    icon: Settings2,
    description: 'Brand, support, defaults, and tenant bootstrap settings.',
  },
  registration: {
    icon: UserPlus,
    description: 'Control signup access, trial defaults, and registration alerts.',
  },
  maintenance: {
    icon: ShieldAlert,
    description: 'Switch platform maintenance mode and set the public message.',
  },
  task_categories: {
    icon: Tag,
    description: 'Organize super admin platform tasks with reusable categories.',
  },
}

const buildCategoryCode = (name = '') =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')

function TaskCategoryModal({
  category,
  savingId,
  onClose,
  onChange,
  onSave,
  onDelete,
  t,
}) {
  if (!category) return null

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div className="card relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-theme-border shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
        <div className="flex items-start justify-between border-b border-theme-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-theme opacity-60">
              {t('Platform Settings')}
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-theme md:text-2xl">
              {category.isNew ? t('Create Category') : t('Edit Category')}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-theme opacity-70 transition hover:bg-theme-bg/70 hover:opacity-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-theme opacity-60">
                {t('Name')}
              </label>
              <input
                value={category.name || ''}
                onChange={(event) => onChange('name', event.target.value)}
                placeholder={t('Operations')}
                className="h-12 w-full rounded-xl border border-theme-border bg-transparent px-4 text-sm text-theme"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-theme opacity-60">
                {t('Display Order')}
              </label>
              <input
                type="number"
                min="0"
                value={category.display_order ?? 0}
                onChange={(event) => onChange('display_order', event.target.value)}
                className="h-12 w-full rounded-xl border border-theme-border bg-transparent px-4 text-sm text-theme"
              />
            </div>

            <div className="flex items-end">
              <div className="flex h-12 w-full items-center justify-between rounded-xl border border-theme-border px-4">
                <span className="text-sm font-medium text-theme">{t('Active')}</span>
                <button
                  type="button"
                  onClick={() => onChange('is_active', !category.is_active)}
                  className={`relative flex h-5 w-10 rounded-full transition-colors ${
                    category.is_active ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      category.is_active ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-theme opacity-60">
                {t('Description')}
              </label>
              <textarea
                rows={4}
                value={category.description || ''}
                onChange={(event) => onChange('description', event.target.value)}
                placeholder={t('Short description for this category')}
                className="min-h-[140px] w-full resize-none rounded-xl border border-theme-border bg-transparent px-4 py-3 text-sm text-theme"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-theme-border px-5 py-4">
          <div>
            {!category.isNew ? (
              <button
                type="button"
                onClick={() => onDelete(category)}
                disabled={savingId === category.id}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <Trash2 size={14} />
                {t('Delete')}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-theme-border px-4 py-2.5 text-sm font-medium text-theme transition hover:bg-theme-bg/70"
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={() => onSave(category)}
              disabled={savingId === category.id}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {savingId === category.id ? t('Saving...') : t('Save Category')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function SystemSettings() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [settings, setSettings] = useState({})
  const [taskCategories, setTaskCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categorySavingId, setCategorySavingId] = useState(null)
  const [categoryEditor, setCategoryEditor] = useState(null)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categoryStatus, setCategoryStatus] = useState('all')
  const [dirty, setDirty] = useState(false)
  const [activeTab, setActiveTab] = useState(SETTING_GROUPS[0]?.key || 'general')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/super-admin/settings')
      setSettings(data || {})
      setDirty(false)
    } catch {
      toast.error(t('Failed to load settings'))
    } finally {
      setLoading(false)
    }
  }

  const loadTaskCategories = async () => {
    setCategoriesLoading(true)
    try {
      const { data } = await api.get('/api/super-admin/task-categories', {
        params: { include_inactive: true },
      })
      setTaskCategories((data?.categories || []).map((category) => ({
        ...category,
        isNew: false,
      })))
    } catch {
      toast.error(t('Failed to load task categories'))
    } finally {
      setCategoriesLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadTaskCategories()
  }, [])

  const setField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const normalizedSettings = Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [key, value == null ? '' : String(value)])
      )
      await api.post('/api/super-admin/settings', { settings: normalizedSettings })
      toast.success(t('Settings saved'))
      setDirty(false)
    } catch {
      toast.error(t('Failed to save settings'))
    } finally {
      setSaving(false)
    }
  }

  const addCategoryDraft = () => {
    setCategoryEditor({
      ...EMPTY_CATEGORY,
      id: `draft-${Date.now()}`,
      display_order: taskCategories.length
        ? Math.max(...taskCategories.map((item) => Number(item.display_order || 0))) + 10
        : 10,
      isNew: true,
    })
  }

  const openCategoryEditor = (category) => {
    setCategoryEditor({
      ...category,
      isNew: !!category.isNew,
    })
  }

  const setCategoryField = (key, value) => {
    setCategoryEditor((current) => (current ? { ...current, [key]: value } : current))
  }

  const saveCategory = async (category) => {
    if (!category.name?.trim()) {
      toast.error(t('Task category name is required'))
      return
    }

    setCategorySavingId(category.id)
    const generatedCode = buildCategoryCode(category.name)

    if (!generatedCode) {
      toast.error(t('Task category name must contain letters or numbers'))
      setCategorySavingId(null)
      return
    }

    const payload = {
      code: generatedCode,
      name: category.name.trim(),
      description: category.description?.trim() || '',
      display_order: Number(category.display_order || 0),
      is_active: !!category.is_active,
    }

    try {
      if (category.isNew) {
        await api.post('/api/super-admin/task-categories', payload)
        toast.success(t('Task category created'))
      } else {
        await api.put(`/api/super-admin/task-categories/${category.id}`, payload)
        toast.success(t('Task category updated'))
      }
      await loadTaskCategories()
      setCategoryEditor(null)
    } catch (error) {
      const message = error?.response?.data?.message || t('Failed to save task category')
      toast.error(message)
    } finally {
      setCategorySavingId(null)
    }
  }

  const deleteCategory = async (category) => {
    if (category.isNew) {
      setCategoryEditor(null)
      return
    }

    setCategorySavingId(category.id)
    try {
      await api.delete(`/api/super-admin/task-categories/${category.id}`)
      toast.success(t('Task category deleted'))
      await loadTaskCategories()
      setCategoryEditor(null)
    } catch (error) {
      const message = error?.response?.data?.message || t('Failed to delete task category')
      toast.error(message)
    } finally {
      setCategorySavingId(null)
    }
  }

  const tabs = [
    ...SETTING_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      helper: `${group.fields.length} fields`,
      description: TAB_META[group.key]?.description || '',
      icon: TAB_META[group.key]?.icon || Settings2,
    })),
    {
      key: 'task_categories',
      label: 'Task Categories',
      helper: `${taskCategories.length} items`,
      description: TAB_META.task_categories.description,
      icon: TAB_META.task_categories.icon,
    },
  ]

  const activeGroup = SETTING_GROUPS.find((group) => group.key === activeTab) || null
  const filteredTaskCategories = taskCategories.filter((category) => {
    const matchesQuery =
      !categoryQuery.trim() ||
      `${category.name} ${category.description || ''}`
        .toLowerCase()
        .includes(categoryQuery.trim().toLowerCase())

    const matchesStatus =
      categoryStatus === 'all' ||
      (categoryStatus === 'active' && category.is_active) ||
      (categoryStatus === 'inactive' && !category.is_active)

    return matchesQuery && matchesStatus
  })
  const activeTabMeta = tabs.find((tab) => tab.key === activeTab)
  const glassShell = isDark
    ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
    : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
  const glassPanel = isDark
    ? 'border border-slate-800/90 bg-slate-900/70 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl'
    : 'border border-slate-200/70 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl'

  return (
    <div className={`relative mx-auto max-w-6xl overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${glassShell}`}>
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
      <header className="mb-6 flex gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-1 text-xs uppercase tracking-[0.25em] text-theme opacity-60">
            {t('System Admin')}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-theme md:text-3xl">
            {t('Platform Settings')}
          </h1>
          <p className="mt-1 text-sm text-theme opacity-60">
            {t('Global configuration for the Be Souhola CRM platform.')}
          </p>
          
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            onClick={load}
            disabled={loading}
            className={`rounded-xl border p-3 text-theme transition ${
              isDark
                ? 'border-slate-700/70 bg-slate-900/72 hover:bg-slate-800/85'
                : 'border-slate-200/80 bg-white/75 hover:bg-white/90'
            }`}
            title={t('Reload')}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <Save size={14} />
            {saving ? t('Saving...') : t('Save Changes')}
          </button>
        </div>
      </header>

      <div className="mb-5 mt-4">
        <div className={`flex flex-wrap gap-2 rounded-[24px] p-2 ${glassPanel}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-w-[170px] flex-1 rounded-2xl border px-4 py-3 text-left transition ${
                isActive
                  ? 'border-blue-500 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]'
                  : 'border-transparent bg-transparent text-theme hover:border-theme-border hover:bg-theme-bg/70'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold md:text-base">{t(tab.label)}</div>
                  <div className={`mt-1 text-xs ${isActive ? 'text-blue-100' : 'opacity-60'}`}>
                    {tab.helper}
                  </div>
                </div>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    isActive ? 'bg-white/16 text-white' : 'bg-theme-bg/60 text-theme opacity-80'
                  }`}
                >
                  <Icon size={16} />
                </span>
              </div>
            </button>
          )
        })}
        </div>
      </div>

      <div className="space-y-6">
        {activeGroup ? (
          <div className={`overflow-hidden rounded-[24px] ${glassPanel}`}>
            <div className="border-b border-theme-border px-5 py-4">
              <h3 className="text-base font-semibold text-theme">{t(activeGroup.label)}</h3>
              <p className="mt-1 text-sm text-theme opacity-60">{t(activeTabMeta?.description || '')}</p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {loading
                ? activeGroup.fields.map((field) => (
                    <div key={field.key} className="animate-pulse rounded-2xl border border-theme-border/50 p-4">
                      <div className="mb-3 h-3 w-24 rounded bg-theme-border/40" />
                      <div className="h-11 rounded-xl bg-theme-border/40" />
                    </div>
                  ))
                : activeGroup.fields.map((field) => (
                    <div
                      key={field.key}
                      className={`rounded-2xl border border-theme-border/70 bg-theme-bg/35 p-4 ${
                        field.type === 'textarea' ? 'md:col-span-2' : ''
                      }`}
                    >
                      {field.type === 'toggle' ? (
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <label className="text-sm font-semibold text-theme">{t(field.label)}</label>
                            <p className="mt-1 text-xs text-theme opacity-55">
                              {field.key === 'registration_enabled'
                                ? t('Allow new companies to create tenant workspaces.')
                                : t('Enable or disable this platform-wide behavior.')}
                            </p>
                          </div>
                          <SettingField
                            field={field}
                            value={settings[field.key]}
                            onChange={(value) => setField(field.key, value)}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-semibold text-theme">{t(field.label)}</label>
                          <SettingField
                            field={field}
                            value={settings[field.key]}
                            onChange={(value) => setField(field.key, value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
            </div>
          </div>
        ) : (
          <div className={`overflow-hidden rounded-[24px] ${glassPanel}`}>
            <div className="border-b border-theme-border px-5 py-4">
              <div className="flex gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-theme">{t('Task Categories')}</h3>
                  <p className="mt-1 text-sm text-theme opacity-60">
                    {t('Control the categories available in super admin platform tasks.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    addCategoryDraft()
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  <Plus size={16} />
                  {t('Add Category')}
                </button>
              </div>
            </div>



            <div className="p-4">
              {categoriesLoading ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="animate-pulse rounded-2xl border border-theme-border/50 p-4">
                      <div className="mb-3 h-5 w-32 rounded bg-theme-border/40" />
                      <div className="mb-3 h-4 w-full rounded bg-theme-border/40" />
                      <div className="h-8 w-20 rounded-xl bg-theme-border/40" />
                    </div>
                  ))}
                </div>
              ) : filteredTaskCategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border px-4 py-10 text-center text-sm text-theme opacity-60">
                  {taskCategories.length === 0
                    ? t('No task categories yet.')
                    : t('No categories match your current filter.')}
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {filteredTaskCategories.map((category) => (
                    <div
                      key={category.id}
                      className="group w-full rounded-2xl border border-theme-border bg-theme-bg/35 p-4 text-left transition hover:border-blue-500/40 hover:bg-theme-bg/55"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-theme">{category.name}</h3>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                category.is_active
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                          >
                            {category.is_active ? t('Active') : t('Inactive')}
                          </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-theme opacity-65">
                            {category.description || t('No description yet.')}
                          </p>
                        </div>

                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-theme-border bg-theme-bg/55 text-theme opacity-65 transition group-hover:opacity-100">
                          <Tag size={16} />
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openCategoryEditor(category)}
                          className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg/50 px-3 py-2 text-xs font-medium text-theme transition hover:border-blue-500/40 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <Pencil size={14} />
                          {t('Edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category)}
                          disabled={categorySavingId === category.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200/70 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-500/10 disabled:opacity-50 dark:border-red-900/40 dark:text-red-400"
                        >
                          <Trash2 size={14} />
                          {categorySavingId === category.id ? t('Deleting...') : t('Delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <TaskCategoryModal
        category={categoryEditor}
        savingId={categorySavingId}
        onClose={() => {
          if (categorySavingId === categoryEditor?.id) return
          setCategoryEditor(null)
        }}
        onChange={setCategoryField}
        onSave={saveCategory}
        onDelete={deleteCategory}
        t={t}
      />

      {dirty ? (
        <div className="sticky bottom-4 mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm text-white shadow-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? t('Saving...') : t('Save Changes')}
          </button>
        </div>
      ) : null}
      </div>
    </div>
  )
}
