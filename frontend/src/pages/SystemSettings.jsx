/**
 * SystemSettings - Super Admin global platform settings.
 * Reads/writes from GET|POST /api/super-admin/settings (SystemSettingController).
 * Safe: key-value pairs in a separate system_settings table, no tenant data.
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { Save, RefreshCw } from 'lucide-react'
import { api } from '../utils/api'

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

export default function SystemSettings() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

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

  useEffect(() => {
    load()
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

  return (
    <div className="max-w-3xl px-4 py-6 md:px-6 lg:px-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.25em] text-theme opacity-60">
            {t('System Admin')}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-theme">{t('Platform Settings')}</h1>
          <p className="mt-1 text-sm text-theme opacity-60">
            {t('Global configuration for the Be Souhola CRM platform.')}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-theme-border p-2 text-theme hover:bg-theme-bg/60"
            title={t('Reload')}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Save size={14} />
            {saving ? t('Saving...') : t('Save Changes')}
          </button>
        </div>
      </header>

      {dirty ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          {t('You have unsaved changes.')}
        </div>
      ) : null}

      <div className="space-y-6">
        {SETTING_GROUPS.map((group) => (
          <div key={group.key} className="overflow-hidden rounded-2xl border border-theme-border bg-theme-bg/60">
            <div className="border-b border-theme-border px-5 py-3">
              <h2 className="text-sm font-semibold text-theme">{t(group.label)}</h2>
            </div>
            <div className="space-y-4 p-5">
              {loading
                ? group.fields.map((field) => (
                    <div key={field.key} className="animate-pulse">
                      <div className="mb-2 h-3 w-24 rounded bg-theme-border/40" />
                      <div className="h-9 rounded-lg bg-theme-border/40" />
                    </div>
                  ))
                : group.fields.map((field) => (
                    <div
                      key={field.key}
                      className={field.type === 'toggle' ? 'flex items-center justify-between' : 'flex flex-col gap-1'}
                    >
                      <label className="text-sm font-medium text-theme">{t(field.label)}</label>
                      <SettingField
                        field={field}
                        value={settings[field.key]}
                        onChange={(value) => setField(field.key, value)}
                      />
                    </div>
                  ))}
            </div>
          </div>
        ))}
      </div>

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
  )
}
