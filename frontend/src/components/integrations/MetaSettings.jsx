import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { metaService } from '../../services/metaService'
import { 
  Activity, 
  Database,
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
  BookOpen,
  HelpCircle,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useAppState } from '../../shared/context/AppStateProvider'
import MetaSetupGuide from './meta/MetaSetupGuide'

const normalizeAgencyKey = (value) => {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

const sameAgency = (left, right) => normalizeAgencyKey(left) === normalizeAgencyKey(right)

const isTenantAdminUser = (user) => {
  if (!user) return false
  if (user.is_super_admin || user.is_primary_admin) return true

  const roleValues = [
    user.role,
    user.job_title,
    ...(Array.isArray(user.roles) ? user.roles.map((role) => role?.name || role) : []),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().trim())

  return roleValues.some((role) => ['admin', 'tenant admin', 'tenant-admin', 'owner'].includes(role))
}

// --- Components ---

const StatusBadge = ({ connected }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${connected ? 'bg-green-100 text-green-800 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border dark:border-emerald-400/20' : 'bg-white/90 text-gray-700 border border-gray-200 dark:bg-white/5 dark:text-slate-200 dark:border-white/10'}`}>
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
    className={`flex items-center w-full px-4 py-3 text-sm font-medium transition-all duration-200 border-l-4 ${
      active 
        ? 'bg-blue-50/90 border-blue-600 text-blue-700 shadow-sm dark:border-blue-400 dark:bg-[linear-gradient(90deg,rgba(37,99,235,0.26),rgba(29,78,216,0.10))] dark:text-blue-100' 
        : 'border-transparent text-theme hover:bg-white/80 hover:text-gray-900 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
    }`}
  >
    <Icon className={`w-5 h-5 mr-3 ${active ? 'text-blue-600 dark:text-blue-300' : 'text-theme'}`} />
    {label}
  </button>
)

const InputField = ({ label, value, onChange, placeholder, icon: Icon, error, helperText, disabled, type = 'text' }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-theme dark:text-slate-100 mb-1">
      {label}
    </label>
    <div className="relative rounded-md shadow-sm">
      {Icon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-4 w-4 text-theme dark:text-slate-300" />
        </div>
      )}
      <input
        type={type}
        className={`block w-full rounded-md sm:text-sm ${
          Icon ? 'pl-10' : 'pl-3'
        } ${
          error 
            ? 'border-red-300 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-500/40 dark:bg-white/5 dark:text-red-100'
            : 'border-gray-300 bg-white/90 focus:ring-blue-500 focus:border-blue-500 dark:bg-white/5 dark:border-white/10 dark:text-slate-100 dark:placeholder:text-slate-400'
        } ${disabled ? 'bg-gray-100 dark:bg-white/5 text-theme cursor-not-allowed opacity-70' : ''} py-2`}
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
    {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    {helperText && !error && <p className="mt-1 text-xs text-theme dark:text-slate-400">{helperText}</p>}
  </div>
)

const Toggle = ({ label, checked, onChange, description }) => (
  <div className="flex items-start justify-between py-3">
    <div className="flex flex-col">
      <span className="text-sm font-medium text-theme dark:text-slate-100">{label}</span>
      {description && <span className="text-xs text-theme dark:text-slate-400 mt-0.5">{description}</span>}
    </div>
    <button
      type="button"
      className={`${
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/15'
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
  const { t, i18n } = useTranslation()
  const { user } = useAppState()
  const isArabic = i18n.language === 'ar'
  const isTenantAdmin = isTenantAdminUser(user)
  const lockedAgencyId = !isTenantAdmin ? normalizeAgencyKey(user?.agency_id) : null
  // State
  const [activeTab, setActiveTab] = useState('overview')
  const [forceShowSetup, setForceShowSetup] = useState(false)
  const [settings, setSettings] = useState({})
  const [sharedMetaConfigured, setSharedMetaConfigured] = useState(false)
  
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
  const [formMap, setFormMap] = useState({})
  const [leadForms, setLeadForms] = useState([])
  const [selectedFormId, setSelectedFormId] = useState('')
  const [loadingForms, setLoadingForms] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [detectingMapping, setDetectingMapping] = useState(false)
  const [syncWarnings, setSyncWarnings] = useState([])
  const [tenantHealth, setTenantHealth] = useState(null)
  const [agencies, setAgencies] = useState([])
  const [selectedAgencyId, setSelectedAgencyId] = useState(lockedAgencyId || '')
  const [webhookTestResult, setWebhookTestResult] = useState(null)
  const [pixelTestResult, setPixelTestResult] = useState(null)
  
  // Validation
  const [validationErrors, setValidationErrors] = useState({})

  // Auto-save State
  const [saveStatus, setSaveStatus] = useState('idle') // idle, pending, saving, saved, error

  // Refs
  const isLoaded = useRef(false)
  const initialTabResolved = useRef(false)

  function showToast(type, message) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // Effects
  
  const activeAgencyId = lockedAgencyId || normalizeAgencyKey(selectedAgencyId)
  const hasConnectionForActiveAgency = useMemo(
    () => connections.some((conn) => sameAgency(conn.agency_id, activeAgencyId)),
    [connections, activeAgencyId]
  )
  const activePagesCount = useMemo(
    () => pages.filter((page) => page?.is_active).length,
    [pages]
  )
  const setupCoreComplete = useMemo(() => {
    const subscribed = Number(tenantHealth?.subscribe_summary?.subscribed ?? 0)
    return Boolean(
      sharedMetaConfigured &&
      hasConnectionForActiveAgency &&
      activePagesCount > 0 &&
      autoSync &&
      subscribed > 0
    )
  }, [sharedMetaConfigured, hasConnectionForActiveAgency, activePagesCount, autoSync, tenantHealth])
  const showSetupInNav = !setupCoreComplete || forceShowSetup
  const activeTitle = useMemo(() => {
    if (activeTab === 'setup') return isArabic ? 'دليل إعداد ميتا' : 'Meta Setup Guide'
    if (activeTab === 'overview') return isArabic ? 'نظرة عامة على الحساب' : 'Account Overview'
    if (activeTab === 'pixel') return isArabic ? 'إعداد التتبع' : 'Tracking Configuration'
    if (activeTab === 'leads') return isArabic ? 'مزامنة العملاء المحتملين' : 'Lead Generation'
    return isArabic ? 'مزامنة ميتا' : 'Meta Sync'
  }, [activeTab, isArabic])
  const isConnected = connections.length > 0

  const openSetupGuide = useCallback(() => {
    setForceShowSetup(true)
    setActiveTab('setup')
  }, [])

  const loadData = useCallback(async (agencyId = null) => {
    setLoading(true)
    try {
      const data = await metaService.loadSettings(agencyId)
      
      setConnections(data.connections || [])
      setBusinesses(data.businesses || [])
      setAdAccounts(data.ad_accounts || [])
      setPages(data.pages || [])
      setSharedMetaConfigured(!!data.shared_meta_configured)
      setSyncWarnings(data.sync_warnings || [])
      setTenantHealth(data.tenant_health || null)

      const saved = data.settings || {}
      setEnableCapi(!!saved.enableCapi)
      setAutoSync(saved.autoSync ?? true)
      if (saved.events && typeof saved.events === 'object') {
        setEvents(prev => ({ ...prev, ...saved.events }))
      }
      if (saved.fieldMap && typeof saved.fieldMap === 'object') {
        setFieldMap(prev => ({ ...prev, ...saved.fieldMap }))
      }
      if (saved.formMap && typeof saved.formMap === 'object') {
        setFormMap(saved.formMap)
      }

    } catch {
      showToast('error', 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isTenantAdmin) return

    api.get('/api/agencies?active=1')
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : []
        setAgencies(items)
      })
      .catch(() => setAgencies([]))
  }, [isTenantAdmin])

  useEffect(() => {
    if (lockedAgencyId) {
      setSelectedAgencyId(lockedAgencyId)
      return
    }

    const pendingAgencyId = localStorage.getItem('pending_meta_agency_id')
    if (pendingAgencyId) {
      setSelectedAgencyId(pendingAgencyId)
      localStorage.removeItem('pending_meta_agency_id')
    }
  }, [lockedAgencyId])

  const handleCallback = useCallback(async (code) => {
    setLoading(true)
    try {
      await metaService.handleCallback(code)
      showToast('success', 'Connected successfully')
      window.history.replaceState({}, document.title, window.location.pathname)
      await loadData()
    } catch (error) {
      showToast('error', error?.response?.data?.error || 'Failed to connect Meta account')
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

    loadData(activeAgencyId)
  }, [handleCallback, loadData, activeAgencyId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const metaParam = params.get('meta')
    if (metaParam === 'connected') {
      setForceShowSetup(true)
      setActiveTab('setup')
      showToast('success', isArabic ? 'تم ربط ميتا بنجاح! أكمل خطوات الإعداد.' : 'Meta connected! Complete the setup steps.')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [isArabic])

  useEffect(() => {
    if (loading || initialTabResolved.current) return
    initialTabResolved.current = true
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') || params.get('meta') === 'connected') return
    setActiveTab(setupCoreComplete ? 'overview' : 'setup')
    if (!setupCoreComplete) setForceShowSetup(true)
  }, [loading, setupCoreComplete])

  useEffect(() => {
    if (activeTab !== 'setup' && setupCoreComplete) {
      setForceShowSetup(false)
    }
  }, [activeTab, setupCoreComplete])

  useEffect(() => {
    if (activeTab === 'diagnostics' || activeTab === 'go-live') {
      setActiveTab(setupCoreComplete ? 'overview' : 'setup')
    }
  }, [activeTab, setupCoreComplete])

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

  useEffect(() => {
    if ((activeTab !== 'leads' && activeTab !== 'setup') || loading) return

    const loadForms = async () => {
      setLoadingForms(true)
      try {
        const res = await metaService.loadLeadForms(activeAgencyId)
        const forms = res.forms || []
        setLeadForms(forms)
        if (!selectedFormId && forms.length > 0) {
          setSelectedFormId(forms[0].id)
        }
      } catch {
        showToast('error', isArabic ? 'فشل تحميل نماذج الليدز' : 'Failed to load lead forms')
      } finally {
        setLoadingForms(false)
      }
    }

    loadForms()
  }, [activeTab, loading, isArabic, selectedFormId])

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
      if (!sharedMetaConfigured) {
        showToast('error', isArabic ? 'تكامل ميتا غير مفعّل. تواصل مع مسؤول النظام.' : 'Meta integration is not enabled. Contact your system administrator.')
        return
      }
      if (isTenantAdmin && !activeAgencyId) {
        showToast('error', isArabic ? 'اختر الأجينسي أولاً قبل ربط حساب ميتا.' : 'Select an agency before connecting a Meta account.')
        return
      }
      if (hasConnectionForActiveAgency) {
        showToast('error', isArabic ? 'هذه الأجينسي لديها اتصال ميتا بالفعل. افصله أولاً.' : 'This agency already has a Meta connection. Disconnect it first.')
        return
      }
      await metaService.connectMeta(activeAgencyId)
    } catch (error) {
      showToast('error', error?.response?.data?.error || 'Failed to start Meta connection. Please login again and retry.')
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
    try {
      await api.post('/api/auth/meta/sync')
      showToast('success', 'Sync started in background')
    } catch {
      showToast('error', 'Failed to start sync')
    } finally {
      setSyncing(false)
    }
  }

  const handleTestPixel = async () => {
    setTesting(true)
    setPixelTestResult(null)
    try {
      const payload = metaService.simulatePixelEvent(settings, events, enableCapi)
      if (enableCapi) {
        const res = await metaService.sendCapiTest(payload)
        const message = isArabic ? 'تم إرسال حدث اختبار للبكسل بنجاح' : 'Test pixel event sent successfully'
        setPixelTestResult({ ok: true, message, detail: res })
        showToast('success', message)
      } else {
        const message = isArabic
          ? 'فعّل Conversions API أولاً لإرسال حدث اختبار إلى السيرفر.'
          : 'Enable Conversions API first to send a server-side test event.'
        setPixelTestResult({ ok: false, message })
        showToast('error', message)
      }
    } catch (error) {
      const message = error?.message || (isArabic ? 'فشل اختبار البكسل' : 'Pixel test failed')
      setPixelTestResult({ ok: false, message })
      showToast('error', message)
    } finally {
      setTesting(false)
    }
  }

  const handleSaveFormMapping = async () => {
    if (!selectedFormId) return
    try {
      const mapping = formMap[selectedFormId] || fieldMap
      await metaService.saveFormMapping(selectedFormId, mapping)
      setFormMap(prev => ({ ...prev, [selectedFormId]: mapping }))
      showToast('success', isArabic ? 'تم حفظ تعيين النموذج' : 'Form mapping saved')
    } catch {
      showToast('error', isArabic ? 'فشل حفظ تعيين النموذج' : 'Failed to save form mapping')
    }
  }

  const handleTestWebhook = async () => {
    setTestingWebhook(true)
    setWebhookTestResult(null)
    try {
      const res = await metaService.testWebhook()
      const message = res.message || (isArabic ? 'نجح اختبار الويب هوك' : 'Webhook test passed')
      setWebhookTestResult({ ok: true, message })
      showToast('success', message)
      await loadData(activeAgencyId)
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل اختبار الويب هوك' : 'Webhook test failed')
      setWebhookTestResult({ ok: false, message })
      showToast('error', message)
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleAutoDetectMapping = async () => {
    setDetectingMapping(true)
    try {
      let forms = leadForms
      if (forms.length === 0) {
        const res = await metaService.loadLeadForms(activeAgencyId)
        forms = res.forms || []
        setLeadForms(forms)
      }

      if (forms.length === 0) {
        showToast('error', isArabic ? 'لا توجد نماذج ليدز نشطة.' : 'No active lead forms found.')
        setActiveTab('overview')
        return
      }

      const formId = forms[0].id
      const suggestion = await metaService.suggestFormMapping(formId, activeAgencyId)
      const mapping = suggestion.suggested_mapping || {}

      if (Object.keys(mapping).length === 0) {
        showToast('error', isArabic ? 'لم يتم اكتشاف تعيين تلقائي. عيّن الحقول يدوياً.' : 'No fields could be auto-detected. Map manually.')
        setSelectedFormId(formId)
        setActiveTab('leads')
        return
      }

      await metaService.saveFormMapping(formId, mapping)
      setFormMap((prev) => ({ ...prev, [formId]: mapping }))
      setSelectedFormId(formId)
      showToast('success', isArabic ? 'تم اكتشاف التعيين وحفظه بنجاح' : 'Field mapping auto-detected and saved')
      setActiveTab('leads')
    } catch (error) {
      showToast('error', error?.response?.data?.message || (isArabic ? 'فشل الاكتشاف التلقائي' : 'Auto-detect failed'))
    } finally {
      setDetectingMapping(false)
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

  const renderSetupGuide = () => (
    <MetaSetupGuide
      sharedMetaConfigured={sharedMetaConfigured}
      connections={connections}
      pages={pages}
      hasConnectionForActiveAgency={hasConnectionForActiveAgency}
      activeAgencyId={activeAgencyId}
      isTenantAdmin={isTenantAdmin}
      agencies={agencies}
      selectedAgencyId={selectedAgencyId}
      onSelectAgency={setSelectedAgencyId}
      autoSync={autoSync}
      enableCapi={enableCapi}
      pixelId={settings.pixelId}
      tenantHealth={tenantHealth}
      formMap={formMap}
      leadFormsCount={leadForms.length}
      loading={loading}
      syncing={syncing}
      testingWebhook={testingWebhook}
      detectingMapping={detectingMapping}
      onConnect={handleConnect}
      onSync={handleSync}
      onOpenTab={setActiveTab}
      onTestWebhook={handleTestWebhook}
      onAutoDetectMapping={handleAutoDetectMapping}
    />
  )

  const renderOverview = () => {
    const sameId = (left, right) => String(left ?? '') === String(right ?? '')
    const canConnect = sharedMetaConfigured && !hasConnectionForActiveAgency && (!isTenantAdmin || !!activeAgencyId)
    // Admins must pick a specific agency before they can toggle/delete/link assets,
    // otherwise a click would act across agencies without an agency filter.
    const canManageAssets = !isTenantAdmin || !!activeAgencyId
    const connectDisabledReason = !sharedMetaConfigured
      ? (isArabic ? 'تكامل ميتا غير مفعّل من إدارة النظام' : 'Meta integration is not enabled by system admin')
      : isTenantAdmin && !activeAgencyId
        ? (isArabic ? 'اختر الأجينسي أولاً' : 'Select an agency first')
        : hasConnectionForActiveAgency
          ? (isArabic ? 'هذه الأجينسي لديها اتصال ميتا بالفعل' : 'This agency already has a Meta connection')
          : ''
    const lastLeadLabel = tenantHealth?.last_lead_at
      ? new Date(tenantHealth.last_lead_at).toLocaleString(isArabic ? 'ar' : undefined)
      : (isArabic ? 'لا يوجد بعد' : 'None yet')
    const needsReauth = tenantHealth?.connections_needing_reauth
      ?? connections.filter((conn) => conn.needs_reauth).length

    return (
    <div className="space-y-6">
      {setupCoreComplete && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openSetupGuide}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-text)] transition-colors hover:text-[var(--primary-color)]"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {t('Re-run Setup Guide')}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200  p-4 dark:border-white/10 dark:bg-white/5 backdrop-blur-xl">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-text)]">
          {isArabic ? 'حالة المزامنة' : 'Sync Health'}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200  px-4 py-3 dark:border-white/10 ">
            <div className="text-xs text-[var(--muted-text)]">{isArabic ? 'آخر ليد مستلم' : 'Last lead synced'}</div>
            <div className="mt-1 text-sm font-semibold text-theme" title={tenantHealth?.last_lead_at || ''}>
              {lastLeadLabel}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200  px-4 py-3 dark:border-white/10 ">
            <div className="text-xs text-[var(--muted-text)]">{isArabic ? 'صفحات نشطة' : 'Active pages'}</div>
            <div className="mt-1 text-sm font-semibold text-theme">
              {tenantHealth?.active_pages ?? activePagesCount}
            </div>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${
            needsReauth > 0
              ? 'border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-900/20'
              : 'border-gray-200  dark:border-white/10 '
          }`}>
            <div className="text-xs text-[var(--muted-text)]">{isArabic ? 'تحتاج إعادة ربط' : 'Needs reauth'}</div>
            <div className="mt-1 text-sm font-semibold text-theme">{needsReauth}</div>
          </div>
        </div>
      </div>

      {isTenantAdmin && (
        <div className="rounded-2xl border border-gray-200  p-4 dark:border-white/10 dark:bg-white/5 backdrop-blur-xl">
          <label className="block text-sm font-medium text-theme mb-2">
            {isArabic ? 'الأجينسي' : 'Agency'}
          </label>
          <select
            value={selectedAgencyId}
            onChange={(e) => setSelectedAgencyId(e.target.value)}
            className="block w-full rounded-xl border border-gray-300 bg-white/85 text-theme sm:text-sm py-2 px-3 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            <option value="">{isArabic ? 'كل الأجينسيات' : 'All agencies'}</option>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.key}>
                {agency.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-theme/70">
            {isArabic
              ? 'اختر أجينسي محددة لربط حساب ميتا أو إدارة اتصالها. عرض "كل الأجينسيات" للمراجعة فقط.'
              : 'Select a specific agency to connect or manage its Meta account. Use "All agencies" for read-only overview.'}
          </p>
        </div>
      )}

      {!isTenantAdmin && lockedAgencyId && (
        <div className="rounded-2xl border border-gray-200  p-4 text-sm text-theme dark:text-slate-200 dark:border-white/10 dark:bg-white/5 backdrop-blur-xl">
          {isArabic ? 'أنت تعرض وتدير اتصال الأجينسي المرتبطة بحسابك.' : 'You are viewing and managing the Meta connection for your assigned agency.'}
        </div>
      )}

      {isTenantAdmin && !activeAgencyId && connections.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          {isArabic
            ? 'أنت تعرض كل الأجينسيات للقراءة فقط. اختر أجينسي محددة من القائمة بالأعلى لتفعيل تعديل أو حذف أو ربط الأصول.'
            : 'You are viewing all agencies in read-only mode. Select a specific agency above to enable toggling, deleting, or linking assets.'}
        </div>
      )}
      {!sharedMetaConfigured && (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          {isArabic
            ? 'تكامل ميتا غير مفعّل بعد. يجب على مسؤول النظام ضبط تطبيق ميتا المشترك من لوحة إدارة النظام.'
            : 'Meta integration is not enabled yet. A system administrator must configure the shared Meta App in System Admin settings.'}
        </div>
      )}

      {syncWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-medium mb-2">{isArabic ? 'تحذيرات المزامنة' : 'Sync warnings'}</p>
          <ul className="list-disc pl-5 space-y-1">
            {syncWarnings.map((warning, index) => (
              <li key={`${warning.page_id || warning.type}-${index}`}>
                {warning.message || warning.type}
              </li>
            ))}
          </ul>
        </div>
      )}

      {connections.some(conn => conn.needs_reauth) && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
          {isArabic
            ? 'هذا الاتصال يحتاج انتباه. افصل الاتصال الحالي أولاً، ثم اربط حساب فيسبوك مرة أخرى.'
            : 'This connection needs attention. Disconnect the current account first, then connect Facebook again.'}
        </div>
      )}

      {connections.length > 0 && !connections.some(conn => conn.needs_reauth) && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          {hasConnectionForActiveAgency
            ? (isArabic
              ? 'هذه الأجينسي لديها اتصال ميتا فعّال. افصل الاتصال أولاً إذا كنت تريد ربط حساب فيسبوك مختلف.'
              : 'This agency already has an active Meta connection. Disconnect it first if you need to connect a different Facebook account.')
            : (isArabic
              ? 'يمكنك الآن ربط حساب فيسبوك لهذه الأجينسي.'
              : 'You can now connect a Facebook account for this agency.')}
        </div>
      )}

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
          title={connectDisabledReason}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[#1877F2] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#166fe5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <Facebook className="h-4 w-4" />
          {hasConnectionForActiveAgency
            ? (isArabic ? 'افصل الحالي للربط' : 'Disconnect to Connect')
            : (isArabic ? 'ربط حساب ميتا' : 'Connect Meta Account')}
        </button>
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
            <div key={conn.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white/45 shadow backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
              {/* Connection Header */}
              <div className="border-b border-gray-200 bg-white/40 px-4 py-3 flex items-center justify-between dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center space-x-3">
                   <div className="h-8 w-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center font-bold">
                     {conn.name ? conn.name.charAt(0).toUpperCase() : 'F'}
                   </div>
                   <div>
                     <h4 className="text-sm font-bold text-theme" title={conn.fb_user_id ? `ID: ${conn.fb_user_id}` : undefined}>
                       {conn.name || 'Facebook User'}
                     </h4>
                     <p className="text-xs text-theme/60">
                       {isArabic ? 'حساب فيسبوك متصل' : 'Connected Facebook account'}
                     </p>
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
                        <div key={biz.id} className="pl-2 border-l-2 border-gray-200 dark:border-white/10">
                           <div className="flex items-center justify-between mb-2">
                             <div>
                               <div className="text-sm font-medium text-theme" title={biz.fb_business_id ? `Business ID: ${biz.fb_business_id}` : undefined}>
                                 {biz.business_name}
                               </div>
                             </div>
                             {canManageAssets && (
                               <button 
                                 onClick={() => handleDeleteAsset('business', biz.id)}
                                 className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                 title="Delete Business"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                             )}
                           </div>
                           
                           {/* Ad Accounts List */}
                           <div className="space-y-2 mt-2 ml-2">
                             {adAccounts.filter(acc => sameId(acc.business_id, biz.id)).length === 0 ? (
                               <p className="text-xs text-theme/50 italic">No ad accounts.</p>
                              ) : (
                               adAccounts.filter(acc => sameId(acc.business_id, biz.id)).map(acc => (
                                 <div key={acc.id} className="flex flex-col gap-2 rounded-xl border border-gray-200  p-2 dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs font-medium text-theme block" title={acc.ad_account_id || undefined}>{acc.name}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-3">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${acc.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                                        {acc.is_active ? 'Active' : 'Inactive'}
                                      </span>
                                      {canManageAssets && (
                                        <>
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
                                        </>
                                      )}
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
                  <h5 className="text-xs font-semibold text-theme/60 uppercase tracking-wider mb-3 flex items-center border-t border-gray-100 dark:border-white/10 pt-4">
                    <LayoutDashboard className="w-3 h-3 mr-1" />
                    Pages
                  </h5>

                  {pages.filter(p => sameId(p.connection_id, conn.id)).length === 0 ? (
                    <p className="text-xs text-theme/50 italic pl-2">No pages found.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {pages.filter(p => sameId(p.connection_id, conn.id)).map(page => (
                        <div key={page.id} className="flex flex-col sm:flex-row sm:items-center justify-between  dark:bg-white/5 p-3 rounded-xl border border-gray-200 dark:border-white/10 gap-3">
                           <div className="flex items-center space-x-3">
                              <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-xs font-bold">
                                {page.page_name.charAt(0)}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-theme" title={page.page_id ? `Page ID: ${page.page_id}` : undefined}>
                                  {page.page_name}
                                </div>
                              </div>
                           </div>

                           <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                              <div className="w-full sm:w-48">
                                {canManageAssets ? (
                                  <select 
                                    className="block w-full text-xs rounded-xl border border-gray-300 bg-white/85 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    value={page.ad_account_id || ''}
                                    onChange={(e) => handleLinkPage(page.id, e.target.value || null)}
                                  >
                                    <option value="">-- No Ad Account --</option>
                                    {adAccounts.filter(a => {
                                      const relatedBusiness = businesses.find(b => sameId(b.id, a.business_id))
                                      return sameId(relatedBusiness?.connection_id, conn.id)
                                    }).map(acc => (
                                      <option key={acc.id} value={acc.id}>
                                        {acc.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="block text-xs text-theme/60">
                                    {(() => {
                                      const linked = adAccounts.find(a => sameId(a.id, page.ad_account_id))
                                      return linked ? linked.name : (isArabic ? 'غير مرتبط' : 'Not linked')
                                    })()}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center space-x-2 self-end sm:self-auto">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${page.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                                  {page.is_active ? 'Active' : 'Inactive'}
                                </span>
                                {canManageAssets && (
                                  <>
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
                                  </>
                                )}
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
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
      <div className="rounded-2xl shadow p-6 border border-gray-200  backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
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
            description={t('When enabled, this sends a Lead event to Meta for every new lead in your CRM, not only leads coming from Meta Lead Ads — this improves Meta\'s ad attribution and audience matching across all your lead sources.')}
            checked={enableCapi}
            onChange={setEnableCapi}
            className="text-theme dark:text-slate-100"
          />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-theme mb-2">
            Active Events to Track
          </label>
          <div className="grid grid-cols-2 gap-4">
            {Object.keys(events).map(event => (
              <label key={event} className="relative flex items-start p-3 rounded-xl border border-gray-200 dark:border-white/10 dark:bg-white/5 hover:bg-white/70 dark:hover:bg-white/10 cursor-pointer">
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

        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            type="button"
            onClick={handleTestPixel}
            disabled={testing || !settings.pixelId}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-amber-500/50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-200"
          >
            <Zap className="h-4 w-4 text-yellow-500" />
            {testing
              ? (isArabic ? 'جاري الإرسال...' : 'Sending...')
              : (isArabic ? 'إرسال حدث اختبار للبكسل' : 'Send Test Pixel Event')}
          </button>
          <p className="mt-2 text-xs text-[var(--muted-text)]">
            {t('Temporary check only — does not change your Pixel settings.')}
          </p>
          {pixelTestResult && (
            <p className={`mt-2 text-sm ${pixelTestResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {pixelTestResult.message}
            </p>
          )}
        </div>
      </div>

      <div className="bg-blue-50/80 dark:bg-blue-500/10 rounded-2xl p-4 border border-blue-100 dark:border-blue-400/20 flex items-start backdrop-blur-xl">
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
      <div className="rounded-2xl shadow p-6 border border-gray-200  backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
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

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-400/20 dark:bg-blue-500/10 backdrop-blur-xl">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            {isArabic
              ? 'إعداد الويب هوك تتم إدارته من مسؤول النظام. تأكد أن صفحتك مربوطة ومفعّلة لاستقبال الليدز.'
              : 'Webhook configuration is managed by the System Administrator. Ensure your Facebook Page is connected and active for leads to sync.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={testingWebhook || !pages.some((p) => p?.is_active)}
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-cyan-500/50 px-4 py-2.5 text-sm font-medium text-cyan-800 transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-cyan-200"
            >
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              {testingWebhook
                ? (isArabic ? 'جاري الاختبار...' : 'Testing...')
                : (isArabic ? 'اختبار الويب هوك' : 'Test Webhook')}
            </button>
            <span className="text-xs text-blue-700/80 dark:text-blue-300/80">
              {t('Temporary check only — does not save settings.')}
            </span>
          </div>
          {webhookTestResult && (
            <p className={`mt-3 text-sm ${webhookTestResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              {webhookTestResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Per-form Field Mapping */}
      <div className="rounded-2xl shadow p-6 border border-gray-200  backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <h3 className="text-lg font-medium text-theme mb-4">{isArabic ? 'تعيين الحقول لكل نموذج' : 'Per-Form Field Mapping'}</h3>
        {loadingForms ? (
          <p className="text-sm text-theme">{isArabic ? 'جاري تحميل النماذج...' : 'Loading forms...'}</p>
        ) : leadForms.length === 0 ? (
          <p className="text-sm text-theme">{isArabic ? 'لا توجد نماذج ليدز نشطة.' : 'No active lead forms found.'}</p>
        ) : (
          <>
            <select
              value={selectedFormId}
              onChange={(e) => setSelectedFormId(e.target.value)}
              className="mb-4 block w-full rounded-xl border border-gray-300 bg-white/85 dark:border-white/10 dark:bg-white/5 text-theme dark:text-slate-100 sm:text-sm py-2 px-3"
            >
              {leadForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name} ({form.page_name})
                </option>
              ))}
            </select>

            <div className="space-y-4">
              {Object.entries(formMap[selectedFormId] || fieldMap).map(([key, value]) => (
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
                      onChange={(e) => setFormMap(prev => ({
                        ...prev,
                        [selectedFormId]: {
                          ...(prev[selectedFormId] || fieldMap),
                          [key]: e.target.value,
                        },
                      }))}
                      className="block w-full rounded-xl border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white/85 dark:border-white/10 dark:bg-slate-950/40 text-theme dark:text-slate-100 py-2 px-3"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleSaveFormMapping}
              className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              {isArabic ? 'حفظ تعيين النموذج' : 'Save Form Mapping'}
            </button>
          </>
        )}
      </div>

      {/* Default Field Mapping */}
      <div className="rounded-2xl shadow p-6 border border-gray-200  backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <h3 className="text-lg font-medium text-theme mb-4">{isArabic ? 'تعيين الحقول الافتراضي' : 'Default Field Mapping'}</h3>
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
                    className="block w-full rounded-xl border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white/85 dark:border-white/10 dark:bg-slate-950/40 text-theme dark:text-slate-100 py-2 px-3"
                 />
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-2 sm:items-center sm:p-6">
      <div className="card rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] min-h-0 grid grid-cols-1 overflow-hidden border border-gray-200 dark:border-gray-800 sm:h-[85vh] sm:max-h-[85vh] sm:grid-cols-[16rem_1fr]">
        
        {/* Sidebar */}
        <div className="w-full flex-shrink-0 bg-transparent border-b border-gray-200 dark:border-gray-800 flex flex-col min-h-0 sm:border-b-0 sm:border-r">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-theme flex items-center">
                <span className="bg-blue-600 text-white p-1.5 rounded mr-2">
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
            <div className="mt-3">
              <StatusBadge connected={isConnected} />
            </div>
          </div>
          
          <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
            {showSetupInNav && (
              <TabButton 
                active={activeTab === 'setup'} 
                id="setup" 
                icon={BookOpen} 
                label={isArabic ? 'دليل الإعداد' : 'Setup Guide'} 
                onClick={setActiveTab} 
              />
            )}
            <TabButton 
              active={activeTab === 'overview'} 
              id="overview" 
              icon={LayoutDashboard} 
              label={isArabic ? 'نظرة عامة' : 'Overview'} 
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
              active={activeTab === 'pixel'} 
              id="pixel" 
              icon={Activity} 
              label={isArabic ? 'البكسل و CAPI' : 'Pixel & CAPI'} 
              onClick={setActiveTab} 
            />
            {setupCoreComplete && !showSetupInNav && (
              <button
                type="button"
                onClick={openSetupGuide}
                className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-[var(--muted-text)] transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-gray-700 dark:hover:border-blue-500 dark:hover:text-blue-300"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {t('Re-run Setup Guide')}
              </button>
            )}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent">
          {/* Header */}
          <div className="hidden">
             <div>
               <h1 className="text-2xl font-bold text-theme">
                 {activeTab === 'setup' && (isArabic ? 'دليل إعداد ميتا' : 'Meta Setup Guide')}
                 {activeTab === 'overview' && (isArabic ? 'نظرة عامة على الحساب' : 'Account Overview')}
                 {activeTab === 'pixel' && (isArabic ? 'إعداد التتبع' : 'Tracking Configuration')}
                 {activeTab === 'leads' && (isArabic ? 'مزامنة العملاء المحتملين' : 'Lead Generation')}
               </h1>
             </div>
              <div className="flex items-center space-x-4">
               {/* Auto-save Status Indicator */}
               <div className="text-sm font-medium transition-colors duration-300">
                  {saveStatus === 'pending' && <span className="text-gray-400">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>}
                  {saveStatus === 'saving' && <span className="text-blue-500 dark:text-blue-300 animate-pulse">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>}
                  {saveStatus === 'saved' && <span className="text-green-500 dark:text-emerald-300 flex items-center"><CheckCircle className="w-4 h-4 mr-1"/>{isArabic ? 'تم الحفظ' : 'Saved'}</span>}
                  {saveStatus === 'error' && <span className="text-red-500">{isArabic ? 'فشل الحفظ' : 'Save Failed'}</span>}
               </div>
               <button
                 onClick={onClose}
                 className="hidden sm:inline-flex shrink-0 rounded-full bg-white/90 p-2 text-gray-900 shadow-md backdrop-blur transition-colors hover:text-gray-500 hover:bg-white dark:bg-slate-900/90 dark:text-gray-100 dark:hover:bg-slate-800"
               >
                 <XCircle className="w-6 h-6 text-gray-900 dark:text-gray-100" />
               </button>
             </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-theme">{activeTitle}</h1>
                <p className="text-sm text-theme/70 mt-1">
                  {isArabic
                    ? 'اربط فيسبوك، فعّل الصفحات، اضبط استقبال الليدز، وراجع حالة التكامل من مكان واحد.'
                    : 'Connect Facebook, activate pages, configure lead intake, and review integration health from one place.'}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-4">
                <div className="text-sm font-medium transition-colors duration-300">
                  {saveStatus === 'pending' && <span className="text-gray-400">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>}
                  {saveStatus === 'saving' && <span className="text-blue-500 animate-pulse">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>}
                  {saveStatus === 'saved' && <span className="text-green-500 flex items-center"><CheckCircle className="w-4 h-4 mr-1"/>{isArabic ? 'تم الحفظ' : 'Saved'}</span>}
                  {saveStatus === 'error' && <span className="text-red-500">{isArabic ? 'فشل الحفظ' : 'Save Failed'}</span>}
                </div>
                <button
                  onClick={onClose}
                  className="hidden sm:inline-flex shrink-0 p-2 text-gray-900 dark:text-gray-100 hover:text-gray-500 hover:bg-white/80 dark:hover:bg-gray-800 rounded-full transition-colors bg-white/90 shadow-md backdrop-blur dark:bg-gray-900/90"
                  aria-label="Close"
                >
                  <XCircle className="w-6 h-6 text-gray-900 dark:text-gray-100" />
                </button>
              </div>
            </div>
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-theme animate-pulse">{isArabic ? 'جارٍ تحميل الإعدادات...' : 'Loading settings...'}</p>
              </div>
            ) : (
              <>
                {activeTab === 'setup' && renderSetupGuide()}
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'pixel' && renderPixel()}
                {activeTab === 'leads' && renderLeadSync()}
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
