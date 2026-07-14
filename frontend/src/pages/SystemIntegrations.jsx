import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../utils/api'
import { toast } from 'react-hot-toast'
import {
  FaFacebook,
  FaGoogle,
  FaEye,
  FaEyeSlash,
  FaCopy,
  FaCheckCircle,
  FaExclamationTriangle,
  FaVial,
} from 'react-icons/fa'

const fieldClass =
  'block w-full rounded-xl border border-theme-border bg-theme-bg/40 text-theme placeholder:text-[var(--muted-text)] focus:border-[var(--primary-color)] focus:ring-[var(--primary-color)] sm:text-sm px-4 py-2.5 transition-colors'

const secondaryBtnClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-bg/50 px-4 py-2.5 text-sm font-medium text-theme shadow-sm transition-colors hover:bg-theme-bg/80 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 disabled:cursor-not-allowed disabled:opacity-50'

const cardClass =
  'rounded-2xl border border-theme-border bg-theme-bg/60 backdrop-blur-sm overflow-hidden shadow-sm'

export default function SystemIntegrations() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [activeTab, setActiveTab] = useState('meta')
  const [metaHealth, setMetaHealth] = useState(null)
  const [webhookTest, setWebhookTest] = useState(null)
  const [testingWebhook, setTestingWebhook] = useState(false)

  const [settings, setSettings] = useState({
    meta_app_id: '',
    meta_app_secret: '',
    meta_verify_token: '',
    meta_webhook_url: '',
    meta_configured: false,
    google_client_id: '',
    google_client_secret: '',
    google_developer_token: '',
  })

  const apiBase = import.meta.env.VITE_API_BASE || import.meta.env.VITE_SERVER_URL || 'https://api.yourdomain.com'
  const metaWebhookUrl = settings.meta_webhook_url || `${apiBase.replace(/\/$/, '')}/api/meta/webhook`
  const googleWebhookUrl = `${apiBase.replace(/\/$/, '')}/api/google/webhook`

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/settings')
      setSettings((prev) => ({
        ...prev,
        meta_app_id: res.data.meta_app_id || '',
        meta_app_secret: res.data.meta_app_secret || '',
        meta_verify_token: res.data.meta_verify_token || '',
        meta_webhook_url: res.data.meta_webhook_url || '',
        meta_configured: Boolean(res.data.meta_configured),
        google_client_id: res.data.google_client_id || '',
        google_client_secret: res.data.google_client_secret || '',
        google_developer_token: res.data.google_developer_token || '',
      }))
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      toast.error(t('Failed to load settings'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchMetaHealth = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/meta/health')
      setMetaHealth(res.data)
    } catch (error) {
      console.error('Failed to fetch Meta health:', error)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchMetaHealth()
  }, [fetchSettings, fetchMetaHealth])

  const handleChange = (e) => {
    const { name, value } = e.target
    setSettings((prev) => ({ ...prev, [name]: value }))
  }

  const handleTestWebhook = async () => {
    setTestingWebhook(true)
    setWebhookTest(null)
    try {
      const res = await api.post('/api/super-admin/meta/test-webhook')
      setWebhookTest(res.data)
      if (res.data?.ok) {
        toast.success(t('Webhook verification succeeded'))
      } else {
        toast.error(t('Webhook verification failed'))
      }
    } catch (error) {
      console.error('Webhook test failed:', error)
      toast.error(t('Webhook verification failed'))
      setWebhookTest({ ok: false, message: error?.response?.data?.message || 'Request failed' })
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/api/super-admin/settings', {
        settings: {
          meta_app_id: settings.meta_app_id,
          meta_app_secret: settings.meta_app_secret,
          meta_verify_token: settings.meta_verify_token,
          google_client_id: settings.google_client_id,
          google_client_secret: settings.google_client_secret,
          google_developer_token: settings.google_developer_token,
        },
      })
      toast.success(t('Settings saved successfully'))
      await Promise.all([fetchSettings(), fetchMetaHealth()])
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error(t('Failed to save settings'))
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success(t('Copied to clipboard'))
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--primary-color)]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex  justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[var(--primary-color)]">
              {t('System Admin')}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-theme">{t('Global Integrations')}</h1>
            <p className="mt-2 max-w-2xl text-base text-[var(--muted-text)]">
              {t('Configure global API keys and secrets for third-party integrations. These settings apply to all tenants unless overridden.')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-[0_14px_34px_rgba(251,191,36,0.30)] transition-all hover:-translate-y-0.5 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 hover:shadow-[0_18px_38px_rgba(251,191,36,0.38)] focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-slate-950" />
                {t('Saving...')}
              </>
            ) : (
              <>
                <FaCheckCircle className="mr-2" />
                {t('Save Changes')}
              </>
            )}
          </button>
        </div>
      </header>

      <div className="mb-8 border-b border-theme-border">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            type="button"
            onClick={() => setActiveTab('meta')}
            className={`flex items-center whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'meta'
                ? 'border-[var(--primary-color)] text-[var(--primary-color)]'
                : 'border-transparent text-[var(--muted-text)] hover:border-theme-border hover:text-theme'
            }`}
          >
            <FaFacebook className={`mr-2 text-lg ${activeTab === 'meta' ? 'text-[var(--primary-color)]' : 'opacity-50'}`} />
            {t('Meta (Facebook)')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('google')}
            className={`flex items-center whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'google'
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'border-transparent text-[var(--muted-text)] hover:border-theme-border hover:text-theme'
            }`}
          >
            <FaGoogle className={`mr-2 text-lg ${activeTab === 'google' ? 'text-red-600 dark:text-red-400' : 'opacity-50'}`} />
            {t('Google Ads')}
          </button>
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <form onSubmit={handleSubmit}>
            {activeTab === 'meta' && (
              <div className={cardClass}>
                <div className="flex items-center justify-between border-b border-theme-border bg-theme-bg/40 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-500/10 p-2 dark:bg-blue-400/10">
                      <FaFacebook className="text-xl text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-theme">{t('Meta App Configuration')}</h2>
                      <p className="text-sm text-[var(--muted-text)]">
                        {t('Configure the shared Meta App used by all tenants for Facebook Login and Lead Ads webhooks.')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-theme">{t('Meta App ID')}</label>
                    <input
                      type="text"
                      name="meta_app_id"
                      value={settings.meta_app_id}
                      onChange={handleChange}
                      placeholder="e.g. 1234567890"
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-theme">{t('Meta App Secret')}</label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        name="meta_app_secret"
                        value={settings.meta_app_secret}
                        onChange={handleChange}
                        placeholder={t('Leave blank to keep existing secret')}
                        className={`${fieldClass} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted-text)] transition-colors hover:text-theme"
                      >
                        {showSecret ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-theme">{t('Verify Token')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="meta_verify_token"
                        value={settings.meta_verify_token}
                        onChange={handleChange}
                        placeholder={t('Enter a strong random string')}
                        className={`flex-grow ${fieldClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(settings.meta_verify_token)}
                        className={secondaryBtnClass}
                        title={t('Copy to clipboard')}
                      >
                        <FaCopy />
                      </button>
                    </div>
                    <p className="mt-2 flex items-start gap-2 text-sm text-[var(--muted-text)]">
                      <FaCheckCircle className="mt-0.5 h-3 w-3 text-[var(--primary-color)]" />
                      {t('Use this same token in the Meta App Webhook settings.')}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-theme-border bg-theme-bg/35 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted-text)]">
                      {t('Webhook URL')}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded-xl border border-theme-border bg-theme-bg/60 px-3 py-2 font-mono text-sm text-theme">
                        {metaWebhookUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(metaWebhookUrl)}
                        className="rounded-xl p-2 text-[var(--muted-text)] transition-colors hover:bg-theme-bg/80 hover:text-theme"
                        title={t('Copy to clipboard')}
                      >
                        <FaCopy className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted-text)]">
                      {t('Use this single webhook URL in your Meta App settings. Events are routed to tenants by page_id.')}
                    </p>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={handleTestWebhook}
                        disabled={testingWebhook || !settings.meta_configured}
                        className={`${secondaryBtnClass} border-dashed border-cyan-500/40 text-cyan-700 hover:border-cyan-500/70 hover:bg-cyan-500/10 dark:text-cyan-300`}
                      >
                        <FaVial className="h-3.5 w-3.5" />
                        {testingWebhook ? t('Verifying...') : t('Verify Webhook')}
                      </button>
                      <span className="text-xs text-[var(--muted-text)]">
                        {t('Temporary check only — does not save settings.')}
                      </span>
                    </div>

                    {webhookTest && (
                      <p
                        className={`mt-3 text-sm ${
                          webhookTest.ok
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {webhookTest.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'google' && (
              <div className={cardClass}>
                <div className="flex items-center justify-between border-b border-theme-border bg-theme-bg/40 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-red-500/10 p-2 dark:bg-red-400/10">
                      <FaGoogle className="text-xl text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-theme">{t('Google Ads Configuration')}</h2>
                      <p className="text-sm text-[var(--muted-text)]">
                        {t('Configure Google Ads API credentials for campaign management.')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-theme">{t('Google Client ID')}</label>
                    <input
                      type="text"
                      name="google_client_id"
                      value={settings.google_client_id}
                      onChange={handleChange}
                      placeholder="e.g. 1234567890-abcdef.apps.googleusercontent.com"
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-theme">{t('Google Client Secret')}</label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        name="google_client_secret"
                        value={settings.google_client_secret}
                        onChange={handleChange}
                        placeholder="e.g. GOCSPX-..."
                        className={`${fieldClass} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted-text)] transition-colors hover:text-theme"
                      >
                        {showSecret ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-theme">{t('Google Developer Token')}</label>
                    <input
                      type="text"
                      name="google_developer_token"
                      value={settings.google_developer_token}
                      onChange={handleChange}
                      placeholder="e.g. 1234567890"
                      className={fieldClass}
                    />
                  </div>

                  <div className="rounded-2xl border border-theme-border bg-theme-bg/35 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted-text)]">
                      {t('Google Webhook URL')}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded-xl border border-theme-border bg-theme-bg/60 px-3 py-2 font-mono text-sm text-theme">
                        {googleWebhookUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(googleWebhookUrl)}
                        className="rounded-xl p-2 text-[var(--muted-text)] transition-colors hover:bg-theme-bg/80 hover:text-theme"
                        title={t('Copy to clipboard')}
                      >
                        <FaCopy className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted-text)]">
                      {t('Use this URL in your Google Lead Form webhook settings.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-6 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30">
            <h3 className="mb-2 flex items-center text-lg font-semibold text-amber-900 dark:text-amber-100">
              <FaExclamationTriangle className="mr-2 shrink-0 text-amber-600 dark:text-amber-400" />
              {t('Important Info')}
            </h3>
            <div className="space-y-3 text-sm text-amber-950/90 dark:text-amber-100/90">
              <p>
                {t('These settings are GLOBAL and apply to all tenants. Changing them may break existing integrations for all users.')}
              </p>
              <hr className="border-amber-300/70 dark:border-amber-700/50" />
              <div>
                <p className="mb-1 font-semibold text-amber-950 dark:text-amber-50">{t('Resources:')}</p>
                <ul className="ml-1 list-inside list-disc space-y-1">
                  <li>
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-amber-500/50 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-200"
                    >
                      {t('Meta Developers Portal')}
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-amber-500/50 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-200"
                    >
                      {t('Google Cloud Console')}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className={`${cardClass} p-6`}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--muted-text)]">
              {t('System Status')}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--muted-text)]">{t('Meta App')}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    settings.meta_configured
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {settings.meta_configured ? t('Configured') : t('Not configured')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--muted-text)]">{t('Environment')}</span>
                <span className="rounded-full border border-theme-border bg-theme-bg/50 px-2.5 py-1 font-mono text-xs text-theme">
                  {import.meta.env.MODE}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--muted-text)]">{t('API Version')}</span>
                <span className="font-mono text-sm text-theme">v1.0</span>
              </div>
              {metaHealth && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--muted-text)]">{t('Connected tenants')}</span>
                    <span className="font-mono text-sm text-theme">{metaHealth.connected_tenants ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--muted-text)]">{t('Active pages')}</span>
                    <span className="font-mono text-sm text-theme">{metaHealth.active_pages ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--muted-text)]">{t('Needs reauth')}</span>
                    <span className="font-mono text-sm text-theme">{metaHealth.connections_needing_reauth ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--muted-text)]">{t('Page conflicts')}</span>
                    <span className="font-mono text-sm text-theme">{metaHealth.page_conflicts ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--muted-text)]">{t('Rate limits (24h)')}</span>
                    <span className="font-mono text-sm text-theme">{metaHealth.rate_limit_events_24h ?? 0}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {activeTab === 'meta' && metaHealth && (
            <div className={`${cardClass} p-6`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-text)]">
                  {t('Meta Rate Limits')}
                </h3>
                {(metaHealth.rate_limit_events_24h ?? 0) > 10 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                    {t('Elevated')}
                  </span>
                )}
              </div>
              <div className="mb-4">
                <div className="text-xs text-[var(--muted-text)]">{t('Events in last 24 hours')}</div>
                <div className="mt-1 text-3xl font-bold text-theme">{metaHealth.rate_limit_events_24h ?? 0}</div>
              </div>
              {Array.isArray(metaHealth.rate_limit_recent) && metaHealth.rate_limit_recent.length > 0 ? (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-theme-border">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-theme-bg/90 text-[var(--muted-text)] backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t('Time')}</th>
                        <th className="px-3 py-2 font-medium">{t('Code')}</th>
                        <th className="px-3 py-2 font-medium">{t('Endpoint')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaHealth.rate_limit_recent.map((event, index) => (
                        <tr key={`${event.recorded_at}-${index}`} className="border-t border-theme-border/70">
                          <td className="whitespace-nowrap px-3 py-2 text-theme/80">
                            {event.recorded_at ? new Date(event.recorded_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-theme">{event.code}</td>
                          <td className="break-all px-3 py-2 text-theme/80">{event.endpoint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-text)]">
                  {t('No rate limit events recorded in the last 24 hours.')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
