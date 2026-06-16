import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { metaService } from '../../services/metaService'
import { 
  Activity, 
  Database,
  Terminal,
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Facebook,
  AlertCircle,
  Trash2,
  ShieldCheck,
  ChevronRight,
  Zap,
  RefreshCw,
  Copy
} from 'lucide-react'
import { api } from '../../utils/api'

// --- Components ---

const StatusBadge = ({ connected }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${connected ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-white text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}`}>
    {connected ? (
      <>
        <CheckCircle className="w-3 h-3 mr-1" />
        Connected
      </>
    ) : (
      <>
        <XCircle className="w-3 h-3 mr-1" />
        Not Connected
      </>
    )}
  </span>
)

const TabButton = ({ active, id, icon: Icon, label, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`flex items-center w-full px-4 py-3 text-sm font-medium transition-colors duration-200 border-l-4 ${
      active 
        ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900/10 dark:text-blue-400 dark:border-blue-500' 
        : 'border-transparent text-theme hover:bg-white/80 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200'
    }`}
  >
    <Icon className={`w-5 h-5 mr-3 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-theme'}`} />
    {label}
  </button>
)

const InputField = ({ label, value, onChange, placeholder, icon: Icon, error, helperText, disabled, type = 'text' }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-theme mb-1">
      {label}
    </label>
    <div className="relative rounded-md shadow-sm">
      {Icon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-4 w-4 text-theme" />
        </div>
      )}
      <input
        type={type}
        className={`block w-full rounded-md sm:text-sm ${
          Icon ? 'pl-10' : 'pl-3'
        } ${
          error 
            ? 'border-red-300 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-800 dark:bg-gray-800' 
            : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-theme'
        } ${disabled ? 'bg-gray-100 dark:bg-gray-900 text-theme cursor-not-allowed' : ''} py-2`}
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
    {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    {helperText && !error && <p className="mt-1 text-xs text-theme">{helperText}</p>}
  </div>
)

const Toggle = ({ label, checked, onChange, description }) => (
  <div className="flex items-start justify-between py-3">
    <div className="flex flex-col">
      <span className="text-sm font-medium text-theme">{label}</span>
      {description && <span className="text-xs text-theme mt-0.5">{description}</span>}
    </div>
    <button
      type="button"
      className={`${
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
      } relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
      onClick={() => onChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={`${
          checked ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200`}
      />
    </button>
  </div>
)

// --- Main Component ---

export default function MetaSettings({ onClose }) {
  const { i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'
  // State
  const [activeTab, setActiveTab] = useState('overview')
  const [settings, setSettings] = useState({})
  const [appSettings, setAppSettings] = useState({ app_id: '', app_secret: '', verify_token: '', webhook_url: null })
  const [savingAppSettings, setSavingAppSettings] = useState(false)
  
  // Multi-account State
  const [connections, setConnections] = useState([])
  const [businesses, setBusinesses] = useState([])
  const [adAccounts, setAdAccounts] = useState([])
  const [pages, setPages] = useState([])

  // Loading states
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  
  // UI State
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [disconnectTargetId, setDisconnectTargetId] = useState(null)
  const [toast, setToast] = useState(null) // { type: 'success' | 'error', message: '' }
  
  // Form State
  const [events, setEvents] = useState({ Lead: true, Contact: true, CompleteRegistration: false, Purchase: false })
  const [enableCapi, setEnableCapi] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [fieldMap, setFieldMap] = useState({ name: 'name', email: 'email', phone: 'phone', utm_source: 'utm_source', utm_campaign: 'utm_campaign' })
  
  // Validation
  const [validationErrors, setValidationErrors] = useState({})
  const [appValidationErrors, setAppValidationErrors] = useState({})

  // Auto-save State
  const [saveStatus, setSaveStatus] = useState('idle') // idle, pending, saving, saved, error

  // Diagnostic State
  const [logs, setLogs] = useState([])
  const [testPayload, setTestPayload] = useState(null)

  // Refs
  const isLoaded = useRef(false)

  function showToast(type, message) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  function log(message, type = 'info') {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), message, type }, ...prev])
  }

  // Effects
  
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [data, appData] = await Promise.all([
        metaService.loadSettings(),
        metaService.loadAppSettings().catch(() => ({}))
      ])
      
      setConnections(data.connections || [])
      setBusinesses(data.businesses || [])
      setAdAccounts(data.ad_accounts || [])
      setPages(data.pages || [])

      const saved = data.settings || {}
      setEnableCapi(!!saved.enableCapi)
      setAutoSync(saved.autoSync ?? true)
      if (saved.events && typeof saved.events === 'object') {
        setEvents(prev => ({ ...prev, ...saved.events }))
      }
      if (saved.fieldMap && typeof saved.fieldMap === 'object') {
        setFieldMap(prev => ({ ...prev, ...saved.fieldMap }))
      }
      setAppSettings(prev => ({
        ...prev,
        app_id: appData.app_id || '',
        app_secret: '',
        verify_token: '',
        webhook_url: appData.webhook_url || null,
        app_secret_masked: appData.app_secret_masked || null,
        verify_token_set: !!appData.verify_token_set
      }))
      
      // Load global settings (Pixel, etc. might still be relevant globally or per account)
      // For now, assume global settings are in data.settings (if any) or separate
      // The current backend status endpoint returns `settings` inside the integration object if single, 
      // but we moved to multi-account. 
      // Let's assume we still might have global settings in the response or we need to fetch them.
      // The updated MetaAuthController::status doesn't return a global settings object anymore, 
      // but we can assume default empty or fetch from a different endpoint if needed.
      // For now, we'll keep the existing state for events/capi/etc. initialized with defaults.

    } catch {
      showToast('error', 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCallback = useCallback(async (code) => {
    setLoading(true)
    try {
      await metaService.handleCallback(code)
      showToast('success', 'Connected successfully')
      window.history.replaceState({}, document.title, window.location.pathname)
      await loadData()
    } catch {
      showToast('error', 'Failed to connect Meta account')
      await loadData()
    }
  }, [loadData])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      handleCallback(code)
      return
    }

    loadData()
  }, [handleCallback, loadData])

  useEffect(() => {
    if (loading || !isLoaded.current) return

    setSaveStatus('pending')

    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const merged = { ...settings, events, enableCapi, autoSync, fieldMap }
        await metaService.saveSettings(merged)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('error')
        showToast('error', 'Failed to auto-save settings')
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [autoSync, enableCapi, events, fieldMap, loading, settings])

  useEffect(() => {
    if (loading) return

    const timer = setTimeout(() => { isLoaded.current = true }, 500)
    return () => clearTimeout(timer)
  }, [loading])

  const handleSaveAppSettings = async () => {
    const appId = String(appSettings.app_id || '').trim()
    if (!appId) {
      setAppValidationErrors(prev => ({ ...prev, app_id: 'App ID is required' }))
      showToast('error', 'App ID is required')
      return
    }
    if (!/^\d+$/.test(appId)) {
      setAppValidationErrors(prev => ({ ...prev, app_id: 'App ID must be numbers only' }))
      showToast('error', 'App ID must be numbers only')
      return
    }
    // Secret must be set at least once (either masked already exists, or user entered a new one)
    if (!appSettings.app_secret_masked && !String(appSettings.app_secret || '').trim()) {
      setAppValidationErrors(prev => ({ ...prev, app_secret: 'App Secret is required' }))
      showToast('error', 'App Secret is required')
      return
    }

    setSavingAppSettings(true)
    try {
      await metaService.saveAppSettings({
        app_id: appId,
        app_secret: appSettings.app_secret || undefined,
        verify_token: appSettings.verify_token || undefined,
      })
      showToast('success', 'Tenant Meta App settings saved')
      await loadData()
    } catch {
      showToast('error', 'Failed to save tenant app settings')
    } finally {
      setSavingAppSettings(false)
    }
  }

  const handleCopyWebhookUrl = async () => {
    if (!appSettings.webhook_url) return

    try {
      await navigator.clipboard.writeText(appSettings.webhook_url)
      showToast('success', isArabic ? 'تم نسخ رابط الويب هوك' : 'Webhook URL copied')
    } catch {
      showToast('error', isArabic ? 'تعذر نسخ الرابط' : 'Failed to copy webhook URL')
    }
  }

  const validateNumeric = (key, value) => {
    if (value && !/^\d+$/.test(value)) {
      setValidationErrors(prev => ({ ...prev, [key]: 'Must contain only numbers' }))
    } else {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleSettingChange = (key, value) => {
    if (['businessManagerId', 'adAccountId', 'pageId', 'pixelId'].includes(key)) {
      validateNumeric(key, value)
    }
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // --- Actions ---

  const handleConnect = async (e) => {
    try {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      const appId = String(appSettings.app_id || '').trim()
      const canConnect = /^\d+$/.test(appId) && (!!appSettings.app_secret_masked || !!String(appSettings.app_secret || '').trim())
      if (!canConnect) {
        showToast('error', 'Configure Tenant Meta App ID and Secret first')
        return
      }
      await metaService.connectMeta()
    } catch {
      showToast('error', 'Failed to start Meta connection. Please login again and retry.')
    }
  }

  const confirmDisconnect = (id) => {
    setDisconnectTargetId(id)
    setShowDisconnectConfirm(true)
  }

  const handleDisconnect = async () => {
    try {
      await metaService.disconnectConnection(disconnectTargetId)
      setDisconnectTargetId(null)
      setShowDisconnectConfirm(false)
      showToast('success', 'Disconnected successfully')
      loadData()
    } catch {
      showToast('error', 'Failed to disconnect')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    log('Starting manual sync...', 'info')
    try {
      await api.post('/api/auth/meta/sync')
      log('Sync job dispatched successfully.', 'success')
      showToast('success', 'Sync started in background')
    } catch (error) {
      log(`Sync failed: ${error.message}`, 'error')
      showToast('error', 'Failed to start sync')
    } finally {
      setSyncing(false)
    }
  }

  const handleTestPixel = async () => {
    setTesting(true)
    log('Generating test pixel event...', 'info')
    try {
      const payload = metaService.simulatePixelEvent(settings, events, enableCapi)
      setTestPayload(payload)
      log(`Generated payload: ${JSON.stringify(payload, null, 2)}`, 'code')
      
      // Simulate API call for "Send to Server"
      if (enableCapi) {
        log('Sending to Conversions API (CAPI)...', 'info')
        const res = await metaService.sendCapiTest(payload)
        log(`CAPI Response: ${JSON.stringify(res, null, 2)}`, 'success')
      } else {
        log('CAPI is disabled. Enable it to test server-side events.', 'warning')
      }
    } catch (error) {
      log(`Test failed: ${error.message}`, 'error')
    } finally {
      setTesting(false)
    }
  }


  const handleToggleAsset = async (type, id, currentStatus) => {
    try {
      await metaService.toggleAsset(type, id, !currentStatus)
      showToast('success', `Asset ${!currentStatus ? 'activated' : 'deactivated'} successfully`)
      loadData()
    } catch {
      showToast('error', 'Failed to update asset status')
    }
  }

  const handleLinkPage = async (pageId, adAccountId) => {
    try {
      await metaService.linkPage(pageId, adAccountId)
      showToast('success', 'Page linked successfully')
      loadData()
    } catch {
      showToast('error', 'Failed to link page')
    }
  }

  const handleDeleteAsset = async (type, id) => {
    if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) return
    try {
      await metaService.deleteAsset(type, id)
      showToast('success', 'Asset deleted successfully')
      loadData()
    } catch {
      showToast('error', 'Failed to delete asset')
    }
  }

  // --- Renderers ---

  const renderOverview = () => {
    const sameId = (left, right) => String(left ?? '') === String(right ?? '')
    const appId = String(appSettings.app_id || '').trim()
    const canConnect = /^\d+$/.test(appId) && (!!appSettings.app_secret_masked || !!String(appSettings.app_secret || '').trim())

    return (
    <div className="space-y-6">
      {/* Header / Connect Button */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
           <h3 className="text-lg font-medium text-theme">{isArabic ? 'الحسابات المتصلة' : 'Connected Accounts'}</h3>
           <p className="text-sm text-theme">{isArabic ? 'إدارة اتصالات فيسبوك وإنستغرام الخاصة بك.' : 'Manage your Facebook & Instagram connections.'}</p>
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={!canConnect}
          title={!canConnect ? (isArabic ? 'احفظ إعدادات تطبيق ميتا الخاصة بالتينانت (App ID + Secret) أولًا' : 'Save Tenant Meta App settings (App ID + Secret) first') : ''}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[#1877F2] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#166fe5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <Facebook className="h-4 w-4" />
          {isArabic ? 'إضافة حساب جديد' : 'Add New Account'}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/40 sm:p-5">
        <h4 className="text-sm font-semibold text-theme mb-2">{isArabic ? 'تطبيق ميتا الخاص بالتينانت' : 'Tenant Meta App'}</h4>
        <p className="mb-4 text-xs leading-6 text-theme/70">
          {isArabic
            ? 'احفظ بيانات التطبيق أولًا، وبعدها استخدم رابط الويب هوك داخل Meta Developer.'
            : 'Save the app credentials first, then use the generated webhook URL inside Meta Developer.'}
        </p>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <InputField
            label={isArabic ? 'معرّف التطبيق' : 'App ID'}
            value={appSettings.app_id}
            onChange={(v) => {
              const next = v?.trim?.() ?? v
              setAppSettings(prev => ({ ...prev, app_id: next }))
              if (next && !/^\d+$/.test(String(next))) {
                setAppValidationErrors(prev => ({ ...prev, app_id: isArabic ? 'يجب أن يكون معرّف التطبيق أرقامًا فقط' : 'App ID must be numbers only' }))
              } else {
                setAppValidationErrors(prev => {
                  const n = { ...prev }
                  delete n.app_id
                  return n
                })
              }
            }}
            placeholder={isArabic ? 'مثال: 123456789012345' : 'e.g. 123456789012345'}
            error={appValidationErrors.app_id}
          />
          <InputField
            label={isArabic ? 'سر التطبيق (اتركه فارغًا للاحتفاظ بالقيمة الحالية)' : 'App Secret (leave empty to keep current)'}
            value={appSettings.app_secret}
            onChange={(v) => {
              setAppSettings(prev => ({ ...prev, app_secret: v }))
              setAppValidationErrors(prev => {
                const n = { ...prev }
                delete n.app_secret
                return n
              })
            }}
            placeholder={appSettings.app_secret_masked || (isArabic ? 'سر تطبيق ميتا' : 'Meta App Secret')}
            type="password"
            error={appValidationErrors.app_secret}
          />
          <InputField
            label={isArabic ? 'رمز التحقق (اختياري)' : 'Verify Token (optional)'}
            value={appSettings.verify_token}
            onChange={(v) => setAppSettings(prev => ({ ...prev, verify_token: v }))}
            placeholder={appSettings.verify_token_set ? (isArabic ? 'مُعدّ مسبقًا' : 'Already configured') : (isArabic ? 'رمز تحقق الويب هوك' : 'Webhook verify token')}
          />
          <div className="flex h-full flex-col rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-theme">
                {isArabic ? 'رابط الويب هوك' : 'Webhook URL'}
              </span>
              {appSettings.webhook_url ? (
                <button
                  type="button"
                  onClick={handleCopyWebhookUrl}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-theme transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {isArabic ? 'نسخ' : 'Copy'}
                </button>
              ) : null}
            </div>
            {appSettings.webhook_url ? (
              <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs leading-6 text-theme shadow-sm break-all dark:border-gray-700 dark:bg-gray-900/60">
                {appSettings.webhook_url}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs leading-6 text-theme/70 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
                {isArabic ? 'احفظ الإعدادات لإنشاء رابط الويب هوك' : 'Save settings to generate webhook URL'}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleSaveAppSettings}
            disabled={savingAppSettings}
            className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
          >
            {savingAppSettings ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : (isArabic ? 'حفظ إعدادات التطبيق' : 'Save App Settings')}
          </button>
        </div>
      </div>

      {/* Connections List */}
      <div className="grid grid-cols-1 gap-6">
        {connections.length === 0 ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md p-6 text-center">
             <AlertCircle className="h-8 w-8 text-blue-400 mx-auto mb-2" />
             <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">{isArabic ? 'لا توجد حسابات متصلة' : 'No Accounts Connected'}</h4>
             <p className="mt-1 text-sm text-blue-700 dark:text-blue-400 max-w-sm mx-auto">
               {isArabic ? 'اربط حساب فيسبوك لبدء مزامنة الأنشطة التجارية وحسابات الإعلانات والصفحات.' : 'Connect a Facebook account to start syncing businesses, ad accounts, and pages.'}
             </p>
          </div>
        ) : (
          connections.map(conn => (
            <div key={conn.id} className="bg-transparent rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Connection Header */}
              <div className="bg-gray-900/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                   <div className="h-8 w-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center font-bold">
                     {conn.name ? conn.name.charAt(0).toUpperCase() : 'F'}
                   </div>
                   <div>
                     <h4 className="text-sm font-bold text-theme">{conn.name || 'Facebook User'}</h4>
                     <p className="text-xs text-theme/60">ID: {conn.fb_user_id}</p>
                   </div>
                </div>
                <div className="flex items-center space-x-2">
                   <button 
                     onClick={() => confirmDisconnect(conn.id)}
                     className="text-red-600 hover:text-red-700 text-xs font-medium px-3 py-1 border border-red-200 rounded hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20 transition-colors"
                   >
                     Disconnect
                   </button>
                </div>
              </div>

              {/* Assets Content */}
              <div className="p-4 space-y-6 overflow-x-auto">
                
                {/* Businesses & Ad Accounts */}
                <div>
                  <h5 className="text-xs font-semibold text-theme/60 uppercase tracking-wider mb-3 flex items-center">
                    <LayoutDashboard className="w-3 h-3 mr-1" />
                    Businesses & Ad Accounts
                  </h5>
                  
                  {businesses.filter(b => sameId(b.connection_id, conn.id)).length === 0 ? (
                    <p className="text-xs text-theme/50 italic pl-2">No businesses found.</p>
                  ) : (
                    <div className="space-y-4">
                      {businesses.filter(b => sameId(b.connection_id, conn.id)).map(biz => (
                        <div key={biz.id} className="pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                           <div className="flex items-center justify-between mb-2">
                             <div>
                               <div className="text-sm font-medium text-theme">{biz.business_name}</div>
                               <div className="text-xs text-theme/60">Business ID: {biz.fb_business_id}</div>
                             </div>
                             <button 
                               onClick={() => handleDeleteAsset('business', biz.id)}
                               className="text-gray-400 hover:text-red-600 transition-colors p-1"
                               title="Delete Business"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                           
                           {/* Ad Accounts List */}
                           <div className="space-y-2 mt-2 ml-2">
                             {adAccounts.filter(acc => sameId(acc.business_id, biz.id)).length === 0 ? (
                               <p className="text-xs text-theme/50 italic">No ad accounts.</p>
                              ) : (
                               adAccounts.filter(acc => sameId(acc.business_id, biz.id)).map(acc => (
                                 <div key={acc.id} className="flex flex-col gap-2 rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-700/30 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs font-medium text-theme block">{acc.name}</span>
                                      <span className="text-[10px] text-theme/50 font-mono">{acc.ad_account_id}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-3">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${acc.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                                        {acc.is_active ? 'Active' : 'Inactive'}
                                      </span>
                                      <Toggle 
                                        label="" 
                                        checked={acc.is_active} 
                                        onChange={() => handleToggleAsset('ad_account', acc.id, acc.is_active)} 
                                      />
                                      <button 
                                        onClick={() => handleDeleteAsset('ad_account', acc.id)}
                                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                        title="Delete Ad Account"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                 </div>
                               ))
                             )}
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pages */}
                <div>
                  <h5 className="text-xs font-semibold text-theme/60 uppercase tracking-wider mb-3 flex items-center border-t border-gray-100 dark:border-gray-700 pt-4">
                    <LayoutDashboard className="w-3 h-3 mr-1" />
                    Pages
                  </h5>

                  {pages.filter(p => sameId(p.connection_id, conn.id)).length === 0 ? (
                    <p className="text-xs text-theme/50 italic pl-2">No pages found.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {pages.filter(p => sameId(p.connection_id, conn.id)).map(page => (
                        <div key={page.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-700/30 p-3 rounded border border-gray-200 dark:border-gray-700 gap-3">
                           <div className="flex items-center space-x-3">
                              {/* Page Avatar Placeholder */}
                              <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-xs font-bold">
                                {page.page_name.charAt(0)}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-theme">{page.page_name}</div>
                                <div className="text-xs text-theme/60">{page.page_id}</div>
                              </div>
                           </div>

                           <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                              {/* Link to Ad Account */}
                              <div className="w-full sm:w-48">
                                <select 
                                  className="block w-full text-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                  value={page.ad_account_id || ''}
                                  onChange={(e) => handleLinkPage(page.id, e.target.value || null)}
                                >
                                  <option value="">-- No Ad Account --</option>
                                  {adAccounts.filter(a => {
                                    const relatedBusiness = businesses.find(b => sameId(b.id, a.business_id))
                                    return sameId(relatedBusiness?.connection_id, conn.id)
                                  }).map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.name} ({acc.ad_account_id})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center space-x-2 self-end sm:self-auto">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${page.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                                  {page.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <Toggle 
                                  label="" 
                                  checked={page.is_active} 
                                  onChange={() => handleToggleAsset('page', page.id, page.is_active)} 
                                />
                                <button 
                                  onClick={() => handleDeleteAsset('page', page.id)}
                                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                  title="Delete Page"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ))
        )}
      </div>

      {/* Sync Action */}
      {connections.length > 0 && (
        <div className="flex justify-end pt-4">
           <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-theme bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync Assets Now' : 'Sync All Assets'}
          </button>
        </div>
      )}
    </div>
    )
  }

  const renderPixel = () => (
    <div className="space-y-6">
      <div className="bg-transparent rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-theme flex items-center">
            <Activity className="w-5 h-5 mr-2 text-theme" />
            Pixel & Conversions API
          </h3>
          <StatusBadge connected={!!settings.pixelId} />
        </div>
        
        <InputField
          label="Pixel ID"
          value={settings.pixelId}
          onChange={(v) => handleSettingChange('pixelId', v)}
          placeholder="e.g. 123456789012345"
          error={validationErrors.pixelId}
          icon={Activity}
        />

        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6 text-theme">
          <Toggle
            label="Enable Conversions API (CAPI)"
            description="Send events directly from server to improve tracking accuracy."
            checked={enableCapi}
            onChange={setEnableCapi}
            className="text-theme"
          />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-theme mb-2">
            Active Events to Track
          </label>
          <div className="grid grid-cols-2 gap-4">
            {Object.keys(events).map(event => (
              <label key={event} className="relative flex items-start p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-750 cursor-pointer">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-theme">{event}</div>
                </div>
                <div className="ml-3 flex items-center h-5">
                  <input
                    type="checkbox"
                    checked={events[event]}
                    onChange={(e) => setEvents(prev => ({ ...prev, [event]: e.target.checked }))}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800 flex items-start">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-medium mb-1">Privacy & Data Handling</p>
          We automatically hash sensitive user data (email, phone) using SHA-256 before sending to Meta, ensuring compliance with data privacy standards.
        </div>
      </div>
    </div>
  )

  const renderLeadSync = () => (
    <div className="space-y-6">
      <div className="bg-transparent rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-theme flex items-center">
            <Database className="w-5 h-5 mr-2 text-theme" />
            Lead Ads Sync
          </h3>
          <StatusBadge connected={connections.length > 0 && autoSync && pages.some(p => p?.is_active)} />
        </div>

        <Toggle
          label="Enable Auto-Sync for Incoming Leads"
          description="Automatically capture leads from Facebook/Instagram forms in real-time."
          checked={autoSync}
          onChange={setAutoSync}
        />

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-md p-4 border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Note: Webhook configuration is managed by the System Administrator. 
            Ensure your Facebook Page is connected to the App for leads to sync.
          </p>
        </div>
      </div>

      {/* Field Mapping */}
      <div className="bg-transparent rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-theme mb-4">Field Mapping</h3>
        <p className="text-sm text-theme mb-6">
          Map your Facebook Lead Form fields (left) to your CRM fields (right).
        </p>

        <div className="space-y-4">
          {Object.entries(fieldMap).map(([key, value]) => (
            <div key={key} className="flex items-center group">
               <div className="w-1/3 text-sm font-medium text-theme flex items-center">
                  <span className="bg-white/50 px-2 py-1 rounded text-xs font-mono mr-2 text-blue">META</span>
                  {key}
               </div>
               <div className="mx-4 text-blue">
                 <ChevronRight className="w-4 h-4" />
               </div>
               <div className="flex-1">
                 <input
                    value={value}
                    onChange={(e) => setFieldMap(prev => ({ ...prev, [key]: e.target.value }))}
                    className="block w-full rounded-md border-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-900 text-theme py-2 px-3"
                 />
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderDiagnostics = () => (
    <div className="h-full flex flex-col space-y-6">
      <div className="bg-transparent rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-theme mb-4 flex items-center">
          <Terminal className="w-5 h-5 mr-2 text-theme" />
          Integration Diagnostics
        </h3>
        
        <div className="flex space-x-3 mb-6">
           <button
             onClick={handleTestPixel}
             disabled={testing}
             className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-theme bg-transparent hover:bg-gray-700 focus:outline-none"
           >
             <Zap className="w-4 h-4 mr-2 text-yellow-500" />
             Test Pixel Event
           </button>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto border border-gray-800 custom-scrollbar">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic text-center mt-20">Ready to test. Logs will appear here.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1.5 font-mono">
                <span className="text-gray-500 mr-2">[{log.time}]</span>
                <span className={`${
                  log.type === 'error' ? 'text-red-400' : 
                  log.type === 'success' ? 'text-green-400' : 
                  log.type === 'warning' ? 'text-yellow-400' : 
                  log.type === 'code' ? 'text-blue-300' : 'text-gray-300'
                }`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>

        {testPayload && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-theme mb-2">Last Test Payload</h4>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-gray-800">
              <pre className="text-green-400">{JSON.stringify(testPayload, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-2 sm:items-center sm:p-6">
      <div className="card rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] min-h-0 grid grid-cols-1 overflow-hidden border border-gray-200 dark:border-gray-800 sm:h-[85vh] sm:max-h-[85vh] sm:grid-cols-[16rem_1fr]">
        
        {/* Sidebar */}
        <div className="w-full flex-shrink-0 bg-transparent border-b border-gray-200 dark:border-gray-800 flex flex-col min-h-0 sm:border-b-0 sm:border-r">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-theme flex items-center">
                <span className="bg-blue-600 text-theme p-1.5 rounded mr-2">
                   <Facebook className="w-4 h-4" />
                </span>
                {isArabic ? 'مزامنة ميتا' : 'Meta Sync'}
              </h2>
              <button
                onClick={onClose}
                className="sm:hidden shrink-0 p-2 text-gray-900 dark:text-gray-100 hover:text-gray-500 hover:bg-white/80 dark:hover:bg-gray-800 rounded-full transition-colors bg-white/90 shadow-md backdrop-blur dark:bg-gray-900/90"
                aria-label="Close"
              >
                <XCircle className="w-6 h-6 text-gray-900 dark:text-gray-100" />
              </button>
            </div>
            <p className="text-xs text-theme mt-2">v2.5.0 • Graph API v19.0</p>
          </div>
          
          <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
            <TabButton 
              active={activeTab === 'overview'} 
              id="overview" 
              icon={LayoutDashboard} 
              label={isArabic ? 'نظرة عامة' : 'Overview'} 
              onClick={setActiveTab} 
            />
            <TabButton 
              active={activeTab === 'pixel'} 
              id="pixel" 
              icon={Activity} 
              label={isArabic ? 'البكسل و CAPI' : 'Pixel & CAPI'} 
              onClick={setActiveTab} 
            />
            <TabButton 
              active={activeTab === 'leads'} 
              id="leads" 
              icon={Database} 
              label={isArabic ? 'مزامنة الليدز' : 'Lead Sync'} 
              onClick={setActiveTab} 
            />
            <TabButton 
              active={activeTab === 'diagnostics'} 
              id="diagnostics" 
              icon={Terminal} 
              label={isArabic ? 'التشخيص' : 'Diagnostics'} 
              onClick={setActiveTab} 
            />
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent">
          {/* Header */}
          <div className="sticky top-0 z-10 px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-transparent backdrop-blur flex justify-between items-center sm:px-8 sm:py-5">
             <div>
               <h1 className="text-2xl font-bold text-theme">
                 {activeTab === 'overview' && (isArabic ? 'نظرة عامة على الحساب' : 'Account Overview')}
                 {activeTab === 'pixel' && (isArabic ? 'إعداد التتبع' : 'Tracking Configuration')}
                 {activeTab === 'leads' && (isArabic ? 'مزامنة العملاء المحتملين' : 'Lead Generation')}
                 {activeTab === 'diagnostics' && (isArabic ? 'حالة النظام' : 'System Health')}
               </h1>
             </div>
              <div className="flex items-center space-x-4">
               {/* Auto-save Status Indicator */}
               <div className="text-sm font-medium transition-colors duration-300">
                  {saveStatus === 'pending' && <span className="text-gray-400">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>}
                  {saveStatus === 'saving' && <span className="text-blue-500 animate-pulse">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>}
                  {saveStatus === 'saved' && <span className="text-green-500 flex items-center"><CheckCircle className="w-4 h-4 mr-1"/>{isArabic ? 'تم الحفظ' : 'Saved'}</span>}
                  {saveStatus === 'error' && <span className="text-red-500">{isArabic ? 'فشل الحفظ' : 'Save Failed'}</span>}
               </div>
               <button
                 onClick={onClose}
                 className="hidden sm:inline-flex shrink-0 p-2 text-gray-900 dark:text-gray-100 hover:text-gray-500 hover:bg-white/80 dark:hover:bg-gray-800 rounded-full transition-colors bg-white/90 shadow-md backdrop-blur dark:bg-gray-900/90"
               >
                 <XCircle className="w-6 h-6 text-gray-900 dark:text-gray-100" />
               </button>
             </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-theme animate-pulse">{isArabic ? 'جارٍ تحميل الإعدادات...' : 'Loading settings...'}</p>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'pixel' && renderPixel()}
                {activeTab === 'leads' && renderLeadSync()}
                {activeTab === 'diagnostics' && renderDiagnostics()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Disconnect Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
           <div className="bg-transparent rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 transform transition-all scale-100">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
                 <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-medium text-center text-theme mb-2">Disconnect Meta Account?</h3>
              <p className="text-sm text-center text-theme mb-6">
                This will stop all data synchronization. Campaigns and Leads will no longer update automatically.
              </p>
              <div className="flex space-x-3">
                 <button 
                   onClick={() => setShowDisconnectConfirm(false)}
                   className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-theme hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleDisconnect}
                   className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-theme rounded-md font-medium"
                 >
                   Disconnect
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center transform transition-all duration-300 translate-y-0 z-[70] ${
          toast.type === 'success' ? 'bg-green-600 text-theme' : 'bg-red-600 text-theme'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  )
}
