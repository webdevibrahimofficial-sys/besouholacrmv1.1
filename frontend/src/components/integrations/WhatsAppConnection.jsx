import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getWhatsappSettings,
  updateWhatsappSettings,
  sendWhatsappTest,
  getWhatsappChannels,
  setWhatsappChannelPrimary,
  startWhatsappChannelMigration,
  completeWhatsappChannelMigration,
  sendWhatsappMigrationVerification,
  getWhatsappOAuthStatus,
  connectWhatsappViaMeta,
  completeWhatsappEmbeddedSignup,
} from '../../services/whatsappService'
import { toast } from 'react-hot-toast'
import { Plug, Save, CheckCircle, AlertCircle, Star, Info, Send, ChevronDown, ChevronUp } from 'lucide-react'

const statusBadgeClass = (status) => {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    case 'connecting':
    case 'migrating':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    case 'error':
      return 'bg-red-500/15 text-red-600 dark:text-red-400'
    case 'archived':
      return 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
  }
}

function loadFacebookSdk(appId) {
  return new Promise((resolve, reject) => {
    if (!appId) {
      reject(new Error('Meta App ID is missing'))
      return
    }
    if (window.FB) {
      resolve(window.FB)
      return
    }
    window.fbAsyncInit = function () {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: 'v21.0',
      })
      resolve(window.FB)
    }
    if (document.getElementById('facebook-jssdk')) {
      return
    }
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('Failed to load Facebook SDK'))
    document.body.appendChild(script)
  })
}

export default function WhatsAppConnection() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectingMeta, setConnectingMeta] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('idle')
  const [channels, setChannels] = useState([])
  const [oauthStatus, setOauthStatus] = useState({
    whatsapp_oauth_enabled: false,
    manual_token_default: true,
    connect_mode: 'manual',
  })
  const [showManualForm, setShowManualForm] = useState(true)
  const [verifyPhone, setVerifyPhone] = useState('')
  const [sendingVerify, setSendingVerify] = useState(false)
  const [waitingForInbound, setWaitingForInbound] = useState(false)

  const [formData, setFormData] = useState({
    provider: 'meta',
    business_number: '',
    phone_number_id: '',
    business_account_id: '',
    api_key: '',
    api_secret: '',
    auto_create_ctwa_leads: false,
  })
  const [secretHints, setSecretHints] = useState({
    api_key_masked: '',
    phone_number_id_masked: '',
  })
  const canTestConnection = Boolean(formData.api_key || secretHints.api_key_masked) && Boolean(formData.phone_number_id || secretHints.phone_number_id_masked)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [settings, channelList, authStatus] = await Promise.all([
        getWhatsappSettings(),
        getWhatsappChannels(),
        getWhatsappOAuthStatus().catch(() => ({
          whatsapp_oauth_enabled: false,
          manual_token_default: true,
          connect_mode: 'manual',
        })),
      ])

      if (settings) {
        setFormData({
          provider: settings.provider || 'meta',
          business_number: settings.business_number || '',
          phone_number_id: settings.phone_number_id || '',
          business_account_id: settings.business_account_id || settings.business_id || '',
          api_key: settings.api_key || '',
          api_secret: settings.api_secret || '',
          auto_create_ctwa_leads: Boolean(settings.auto_create_ctwa_leads),
        })
        setSecretHints({
          api_key_masked: settings.api_key_masked || '',
          phone_number_id_masked: settings.phone_number_id || '',
        })
      }

      setChannels(Array.isArray(channelList) ? channelList : [])
      setOauthStatus(authStatus || {})
      setShowManualForm(!authStatus?.whatsapp_oauth_enabled)
    } catch (error) {
      console.error('Failed to fetch WhatsApp settings:', error)
      toast.error(t('Failed to load settings'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    const hash = window.location.hash || ''
    const query = hash.includes('?') ? hash.split('?')[1] : ''
    const params = new URLSearchParams(query)
    const result = params.get('whatsapp')
    if (!result) return

    if (result === 'connected') {
      toast.success(t('WhatsApp connected via Meta'))
      fetchAll()
    } else if (result === 'error') {
      toast.error(params.get('reason') || t('WhatsApp Meta connection failed'))
    }

    const cleaned = hash.split('?')[0]
    window.history.replaceState(null, '', `${window.location.pathname}${cleaned}`)
  }, [fetchAll, t])

  useEffect(() => {
    const cloud = channels.find((c) => c.provider === 'meta_cloud')
    if (cloud?.metadata?.migration_test_received) {
      setWaitingForInbound(false)
      return undefined
    }
    if (!waitingForInbound) {
      return undefined
    }

    const interval = setInterval(async () => {
      try {
        const list = await getWhatsappChannels()
        setChannels(Array.isArray(list) ? list : [])
        const updatedCloud = (Array.isArray(list) ? list : []).find((c) => c.provider === 'meta_cloud')
        if (updatedCloud?.metadata?.migration_test_received) {
          setWaitingForInbound(false)
          toast.success(t('Inbound verified — you can complete migration'))
        }
      } catch {
        // keep polling quietly
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [waitingForInbound, t, channels])

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (connectionStatus !== 'idle') setConnectionStatus('idle')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await updateWhatsappSettings(formData)
      toast.success(t('Settings saved successfully'))
      await fetchAll()
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error(error?.response?.data?.message || t('Failed to save settings'))
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setConnectionStatus('idle')

    try {
      const result = await sendWhatsappTest({
        api_key: formData.api_key,
        phone_number_id: formData.phone_number_id,
      })

      if (result?.ok) {
        setConnectionStatus('success')
        toast.success(t('Connection successful'))
      } else {
        setConnectionStatus('error')
        toast.error(result?.response?.error?.message || t('Failed to establish connection. Please check your credentials.'))
      }
    } catch (error) {
      setConnectionStatus('error')
      toast.error(error?.response?.data?.message || error?.response?.data?.error || t('Failed to establish connection. Please check your credentials.'))
    } finally {
      setTesting(false)
    }
  }

  const handleSetPrimary = async (channelId) => {
    try {
      await setWhatsappChannelPrimary(channelId)
      toast.success(t('Primary channel updated'))
      await fetchAll()
    } catch (error) {
      toast.error(error?.response?.data?.message || t('Failed to update primary channel'))
    }
  }

  const runEmbeddedSignup = async () => {
    const appId = oauthStatus.meta_app_id
    const configId = oauthStatus.embedded_signup_config_id
    if (!appId || !configId) {
      throw new Error(t('Embedded Signup is not configured yet'))
    }

    const FB = await loadFacebookSdk(appId)
    let sessionPayload = {}
    const onMessage = (event) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          sessionPayload = {
            phone_number_id: data?.data?.phone_number_id || data?.phone_number_id,
            waba_id: data?.data?.waba_id || data?.waba_id,
            display_phone_number: data?.data?.display_phone_number,
            verified_name: data?.data?.verified_name,
          }
        }
      } catch {
        // ignore non-JSON postMessage payloads
      }
    }

    window.addEventListener('message', onMessage)
    try {
      const authResponse = await new Promise((resolve, reject) => {
        FB.login(
          (response) => {
            if (response?.authResponse?.code) {
              resolve(response.authResponse)
            } else {
              reject(new Error(t('Meta login was cancelled or failed')))
            }
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: '',
              sessionInfoVersion: '3',
            },
          }
        )
      })

      await completeWhatsappEmbeddedSignup({
        code: authResponse.code,
        ...sessionPayload,
      })
      toast.success(t('WhatsApp connected via Meta'))
      await fetchAll()
    } finally {
      window.removeEventListener('message', onMessage)
    }
  }

  const handleConnectViaMeta = async () => {
    setConnectingMeta(true)
    try {
      if (oauthStatus.embedded_signup_available || oauthStatus.connect_mode === 'embedded_signup') {
        await runEmbeddedSignup()
        return
      }

      const result = await connectWhatsappViaMeta()
      if (result?.url) {
        window.location.href = result.url
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.error
          || error?.message
          || t('WhatsApp OAuth is not available yet. Use manual token entry.')
      )
    } finally {
      setConnectingMeta(false)
    }
  }

  const mirrorChannel = channels.find((c) => c.provider === 'mirror')
  const cloudChannel = channels.find((c) => c.provider === 'meta_cloud')
  const migrationInProgress =
    mirrorChannel?.status === 'migrating' || cloudChannel?.status === 'connecting' || cloudChannel?.status === 'migrating'
  const migrationTestReceived = Boolean(cloudChannel?.metadata?.migration_test_received)
  const canCompleteMigration = Boolean(mirrorChannel?.id && cloudChannel?.id && migrationTestReceived)
  const completeMigrationTitle = canCompleteMigration
    ? t('Complete migration and archive Mirror')
    : t('Send a WhatsApp message to this Cloud number from any phone to verify inbound first')

  const handleStartMigration = async () => {
    if (!mirrorChannel?.id || !cloudChannel?.id) return
    try {
      await startWhatsappChannelMigration(mirrorChannel.id, cloudChannel.id)
      toast.success(t('Migration started'))
      await fetchAll()
    } catch (error) {
      toast.error(error?.response?.data?.message || t('Failed to start migration'))
    }
  }

  const handleCompleteMigration = async () => {
    if (!canCompleteMigration) return
    try {
      await completeWhatsappChannelMigration(mirrorChannel.id, cloudChannel.id)
      toast.success(t('Migration completed'))
      await fetchAll()
    } catch (error) {
      toast.error(error?.response?.data?.message || t('Failed to complete migration'))
    }
  }

  const handleSendMigrationVerification = async () => {
    if (!cloudChannel?.id || !verifyPhone.trim()) {
      toast.error(t('Enter a phone number including country code'))
      return
    }
    setSendingVerify(true)
    try {
      const result = await sendWhatsappMigrationVerification(cloudChannel.id, verifyPhone.trim())
      toast.success(result?.message || t('Verification message sent — reply to confirm inbound'))
      setWaitingForInbound(true)
      await fetchAll()
    } catch (error) {
      const data = error?.response?.data
      toast.error(data?.message || t('Failed to send verification message'))
      if (data?.hint) {
        toast(data.hint, { icon: 'ℹ️', duration: 6000 })
        setWaitingForInbound(true)
      }
    } finally {
      setSendingVerify(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel rounded-2xl p-6 border border-gray-200 dark:border-gray-700 bg-gray-800/50">
        <h3 className="text-lg font-semibold text-theme-text mb-4">{t('WhatsApp Channels')}</h3>

        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-5 space-y-2">
            <p className="text-sm font-medium text-theme-text">{t('No channels yet')}</p>
            <p className="text-sm opacity-70 text-theme-text">
              {t('Save Meta Cloud credentials below, or pair WhatsApp Mirror from the Mirror tab, to create your first channel.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl border ${
                  channel.status === 'error'
                    ? 'border-red-300/70 dark:border-red-700/60 bg-red-500/5'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-theme-text">{channel.display_name || channel.provider}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(channel.status)}`}>
                      {channel.status}
                    </span>
                    {channel.is_primary && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600">
                        <Star className="w-3 h-3" /> {t('Primary')}
                      </span>
                    )}
                    {channel.supports_ctwa_attribution && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600">CTWA</span>
                    )}
                  </div>
                  <p className="text-sm opacity-70 text-theme-text">
                    {channel.provider} · {channel.phone_number || channel.phone_number_id || t('No number yet')}
                  </p>
                  {channel.status === 'error' && (
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{channel.last_error || t('This channel is in an error state. Check credentials or reconnect.')}</span>
                    </p>
                  )}
                </div>
                {!channel.is_primary && channel.status === 'connected' && (
                  <button type="button" onClick={() => handleSetPrimary(channel.id)} className="btn btn-glass text-sm shrink-0">
                    {t('Set as primary')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {mirrorChannel && cloudChannel && (
          <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-theme-text">{t('Mirror → Cloud migration')}</h4>
              <p className="mt-1 text-sm opacity-70 text-theme-text">
                {t('Complete only after Cloud inbound is verified. Mirror will be archived.')}
              </p>
            </div>

            <ul className="space-y-1.5 text-sm text-theme-text">
              <li className="flex items-center gap-2">
                {cloudChannel.status === 'connected' || cloudChannel.status === 'connecting' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="inline-block w-4 h-4 rounded-full border border-gray-400" />
                )}
                {t('Cloud channel ready')}
                <span className="opacity-60">({cloudChannel.status})</span>
              </li>
              <li className="flex items-center gap-2">
                {migrationTestReceived ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="inline-block w-4 h-4 rounded-full border border-gray-400" />
                )}
                {t('Inbound test message received')}
              </li>
            </ul>

            {!migrationTestReceived && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>
                    {t('Send a WhatsApp message to this Cloud number from any phone to verify inbound.')}
                    {cloudChannel.phone_number ? (
                      <>
                        {' '}
                        <span className="font-medium">({cloudChannel.phone_number})</span>
                      </>
                    ) : null}
                    {' '}
                    {t('"Test Connection" only checks credentials — it does not mark migration as verified.')}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <p className="text-sm font-medium text-theme-text">{t('Or send a verification message from CRM')}</p>
                  <p className="text-xs opacity-70 text-theme-text">
                    {t('Enter your personal WhatsApp number (with country code). Reply to the message to verify inbound.')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={verifyPhone}
                      onChange={(e) => setVerifyPhone(e.target.value)}
                      placeholder="e.g. 2010xxxxxxxx"
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-theme-text bg-transparent focus:ring-2 focus:ring-green-500 outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSendMigrationVerification}
                      disabled={sendingVerify || !verifyPhone.trim()}
                      className="btn btn-glass text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {sendingVerify ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {t('Send verification message')}
                    </button>
                  </div>
                  {waitingForInbound && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {t('Waiting for inbound reply… this screen refreshes automatically')}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleStartMigration}
                disabled={migrationInProgress && mirrorChannel.status === 'migrating'}
                className="btn btn-glass text-sm disabled:opacity-50"
              >
                {mirrorChannel.status === 'migrating' ? t('Migration in progress') : t('Start Migration to Cloud')}
              </button>
              <button
                type="button"
                onClick={handleCompleteMigration}
                disabled={!canCompleteMigration}
                title={completeMigrationTitle}
                className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('Complete Migration')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-gray-200 dark:border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <Plug className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-theme-text">{t('Gateway Configuration')}</h3>
            <p className="text-sm opacity-60 text-theme-text">
              {oauthStatus.whatsapp_oauth_enabled
                ? t('One-click Meta connect. Manual token stays available as advanced fallback.')
                : t('Connect Meta Cloud API using manual token entry (default until App Review approval).')}
            </p>
          </div>
        </div>

        {oauthStatus.whatsapp_oauth_enabled ? (
          <div className="mb-6 space-y-3">
            <button
              type="button"
              onClick={handleConnectViaMeta}
              disabled={connectingMeta}
              className={`btn btn-primary ${connectingMeta ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {connectingMeta
                ? t('Connecting...')
                : oauthStatus.connect_mode === 'embedded_signup'
                  ? t('Connect WhatsApp with Meta')
                  : t('Connect via Meta')}
            </button>
            <p className="text-sm opacity-70 text-theme-text">
              {oauthStatus.connect_mode === 'embedded_signup'
                ? t('Opens Meta Embedded Signup — pick or register your WhatsApp Business number in a few steps.')
                : t('Opens Meta login and imports WhatsApp Business numbers linked to your account.')}
            </p>
          </div>
        ) : (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button type="button" disabled className="btn btn-glass opacity-50 cursor-not-allowed">
              {t('Connect via Meta')}
            </button>
            <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-slate-400/30">
              {t('Coming soon · Waiting for Meta App Review')}
            </span>
            <p className="w-full text-sm opacity-70 text-theme-text">
              {t('Use manual token entry below until WhatsApp App Review is approved.')}
            </p>
          </div>
        )}

        {oauthStatus.whatsapp_oauth_enabled && (
          <button
            type="button"
            onClick={() => setShowManualForm((prev) => !prev)}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-theme-text opacity-80 hover:opacity-100"
          >
            {showManualForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showManualForm ? t('Hide manual token form') : t('Advanced: manual token entry')}
          </button>
        )}

        {(showManualForm || !oauthStatus.whatsapp_oauth_enabled) && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-theme mb-2">{t('Provider')}</label>
              <select
                name="provider"
                value={formData.provider}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-theme-text bg-transparent focus:ring-2 focus:ring-green-500 outline-none transition-all"
              >
                <option value="meta">{t('Meta API (Cloud API)')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme mb-2">{t('Business Number')}</label>
              <input
                type="text"
                name="business_number"
                value={formData.business_number}
                onChange={handleInputChange}
                placeholder="e.g. +201234567890"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-theme-text bg-transparent focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-theme mb-2">{t('API Key / Access Token')}</label>
              <input
                type="password"
                name="api_key"
                value={formData.api_key}
                onChange={handleInputChange}
                placeholder="••••••••••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-theme-text bg-transparent focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
              {secretHints.api_key_masked && !formData.api_key && (
                <p className="mt-1 text-xs opacity-70 text-theme-text">{t('Saved token')}: {secretHints.api_key_masked}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-theme mb-2">{t('Phone Number ID')}</label>
              <input
                type="password"
                name="phone_number_id"
                value={formData.phone_number_id}
                onChange={handleInputChange}
                placeholder="••••••••••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-theme-text bg-transparent focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
              {secretHints.phone_number_id_masked && !formData.phone_number_id && (
                <p className="mt-1 text-xs opacity-70 text-theme-text">{t('Saved phone number ID')}: {secretHints.phone_number_id_masked}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-theme mb-2">{t('Business Account ID')}</label>
              <input
                type="text"
                name="business_account_id"
                value={formData.business_account_id}
                onChange={handleInputChange}
                placeholder="e.g. 1234567890"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-theme-text bg-transparent focus:ring-2 focus:ring-green-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="auto_create_ctwa_leads"
                checked={Boolean(formData.auto_create_ctwa_leads)}
                onChange={handleInputChange}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                <span className="block text-sm font-medium text-theme-text">
                  {t('Auto-create leads from Click-to-WhatsApp ads')}
                </span>
                <span className="mt-1 block text-xs opacity-70 text-theme-text">
                  {t('When enabled, first CTWA messages from unknown numbers create a lead automatically. Off by default.')}
                </span>
              </span>
            </label>
          </div>

          {connectionStatus !== 'idle' && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 ${
                connectionStatus === 'success'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {connectionStatus === 'success' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {t('Connection established successfully')}
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  {t('Failed to establish connection. Please check your credentials.')}
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !canTestConnection}
              title={t('Verifies Meta credentials only — does not send a WhatsApp message')}
              className={`btn btn-glass flex items-center gap-2 ${testing ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {testing ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              {t('Test Connection')}
            </button>

            <button
              type="submit"
              disabled={loading}
              className={`btn btn-primary flex items-center gap-2 px-6 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t('Save Changes')}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
