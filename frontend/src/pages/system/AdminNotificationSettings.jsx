import { useEffect, useState } from 'react'
import { adminNotificationsApi } from '@api/adminNotificationsApi'
import toast from 'react-hot-toast'

const defaultSettings = {
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  quiet_hours_enabled: false,
  quiet_hours_start: '',
  quiet_hours_end: '',
}

export default function AdminNotificationSettings() {
  const [settings, setSettings] = useState(defaultSettings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminNotificationsApi.settings().then(({ data }) => {
      setSettings((prev) => ({ ...prev, ...data }))
    }).catch(() => {})
  }, [])

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await adminNotificationsApi.updateSettings(settings)
      toast.success('Admin notification settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Admin Notification Settings</h1>
      <div className="space-y-3 rounded-xl border p-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.in_app_enabled} onChange={(e) => updateField('in_app_enabled', e.target.checked)} /> In-app</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.email_enabled} onChange={(e) => updateField('email_enabled', e.target.checked)} /> Email</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.push_enabled} onChange={(e) => updateField('push_enabled', e.target.checked)} /> Web Push</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.quiet_hours_enabled} onChange={(e) => updateField('quiet_hours_enabled', e.target.checked)} /> Quiet Hours</label>
        <div className="flex gap-2">
          <input type="time" className="rounded-lg border px-3 py-2 text-sm" value={settings.quiet_hours_start || ''} onChange={(e) => updateField('quiet_hours_start', e.target.value)} />
          <input type="time" className="rounded-lg border px-3 py-2 text-sm" value={settings.quiet_hours_end || ''} onChange={(e) => updateField('quiet_hours_end', e.target.value)} />
        </div>
        <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" onClick={save}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

