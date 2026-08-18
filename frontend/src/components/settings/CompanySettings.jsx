import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../shared/context/ThemeProvider'
import { useAppState } from '../../shared/context/AppStateProvider'
import { api } from '@utils/api'
import { normalizeTenantAssetUrl } from '@shared/utils/tenantCompanyProfile'
import { Calendar, TrendingUp, Info, MapPin, Target, Upload, Building, Activity, Globe, FileText, CreditCard, Clock, Lock, Phone, Hash, Plus, Pencil, Save, Trash2, X } from 'lucide-react'

const normalizeCompanyType = (...values) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (!normalized) continue
    const lower = normalized.toLowerCase().replace(/[_-]+/g, ' ')
    if (lower.includes('real') && lower.includes('estate')) return 'Real Estate'
    if (lower.includes('general')) return 'General'
    return normalized
  }
  return ''
}

const formatCompanyTarget = (value, locale = 'en-US') => {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized)) return '0'
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(normalized)
}

const parseTargetAmount = (value) => String(value ?? '').replace(/,/g, '').replace(/[^\d.]/g, '')

const formatTargetAmountInput = (value) => {
  const raw = parseTargetAmount(value)
  if (!raw) return ''
  const [integerPart, ...fractionParts] = raw.split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (!raw.includes('.')) return formattedInteger
  return `${formattedInteger}.${fractionParts.join('').slice(0, 2)}`
}

const normalizeWebsiteUrl = (value) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const normalizeRole = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')

const isAdminUser = (user) => {
  if (!user) return false
  if (user.is_super_admin || user.is_primary_admin || user.is_tenant_admin) return true
  const roles = [
    user.role,
    user.job_title,
    ...(Array.isArray(user.roles) ? user.roles.map(role => role?.name || role) : []),
  ].map(normalizeRole)
  return roles.some(role => ['admin', 'tenant admin', 'super admin', 'administrator'].includes(role) || role.includes('admin'))
}

export default function CompanySettings() {
  const { t, i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const initializedCompanyKeyRef = useRef(null)
  const isDirtyRef = useRef(false)
  useTheme()
  const { fetchCompanyInfo, crmSettings, company, user: currentUser } = useAppState()
  const canManageTargets = isAdminUser(currentUser)
  const [activeTab, setActiveTab] = useState('general')
  const [companyTargets, setCompanyTargets] = useState({
    monthly: 0,
    quarterly: 0,
    semiAnnual: 0,
    yearly: 0
  })
  const [companyTargetHistory, setCompanyTargetHistory] = useState([])
  const [targetEditorOpen, setTargetEditorOpen] = useState(false)
  const [targetSaving, setTargetSaving] = useState(false)
  const [targetForm, setTargetForm] = useState(() => ({
    year: new Date().getFullYear(),
    yearly_target: '',
  }))

  const currencySymbol = crmSettings?.defaultCurrency || crmSettings?.default_currency || 'SAR'
  const targetLocale = isArabic ? 'ar-EG' : 'en-US'

  const applyCurrentCompanyTarget = useCallback((targetRows) => {
    const currentYear = new Date().getFullYear()
    const currentTarget = targetRows.find(row => Number(row.year) === currentYear)
    setCompanyTargets({
      monthly: Number(currentTarget?.monthly_target || 0).toFixed(2),
      quarterly: Number(currentTarget?.quarterly_target || 0).toFixed(2),
      semiAnnual: Number(currentTarget?.semi_annual_target || 0).toFixed(2),
      yearly: Number(currentTarget?.yearly_target || 0).toFixed(2),
    })
  }, [])

  const fetchCompanyTargets = useCallback(async () => {
    try {
      const targetRes = await api.get('/api/company-targets?year=all')
      const targetRows = Array.isArray(targetRes.data?.data) ? targetRes.data.data : []
      setCompanyTargetHistory(targetRows)
      applyCurrentCompanyTarget(targetRows)
    } catch (err) {
      console.error('Failed to fetch company targets', err)
    }
  }, [applyCurrentCompanyTarget])

  useEffect(() => {
    if (activeTab === 'targets') {
        fetchCompanyTargets()
    }
  }, [activeTab, fetchCompanyTargets])

  // Root domain for subdomain display
  const rootDomain = useMemo(() => {
    try {
      const appUrl = import.meta.env.VITE_APP_URL;
      if (appUrl) {
        const u = new URL(appUrl);
        return u.host;
      }
    } catch {}
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const parts = host.split('.');
      if (parts[0] === 'www') parts.shift();
      return parts.join('.');
    }
    return 'besouholacrm.net';
  }, []);

  // Initial values
  const initial = useMemo(() => ({
    name: '',
    description: '',
    type: '',
    slug: '',
    subscriptionPlan: '',
    startDate: '',
    endDate: '',
    status: '',
    logo: '',
    logoPreview: '',
    country: '',
    city: '',
    state: '',
    addressLine1: '',
    addressLine2: '',
    phone: '',
    taxId: '',
    websiteUrl: '',
  }), [])

  const [savedValues, setSavedValues] = useState(initial)

  // Form State
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [slug, setSlug] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState('')
  const [logo, setLogo] = useState('')
  const [logoPreview, setLogoPreview] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [phone, setPhone] = useState('')
  const [taxId, setTaxId] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')

  // Fetch Company Data
  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const payload = await fetchCompanyInfo()
        const tenant = payload?.tenant || payload?.company || company || {}
        const profile = tenant.profile || {}
        const companyKey = String(
          tenant.id ??
          tenant.slug ??
          tenant.name ??
          'default-company'
        )

        if (isDirtyRef.current) {
          return
        }

        if (!loading && initializedCompanyKeyRef.current === companyKey) {
          return
        }

        const newValues = {
          name: tenant.name || '',
          description: profile.description || '',
          type: normalizeCompanyType(
            tenant.company_type,
            tenant.companyType,
            payload?.company?.company_type,
            payload?.company?.companyType
          ),
          slug: tenant.slug || '',
          subscriptionPlan: tenant.subscription_plan || '',
          startDate: tenant.start_date || '',
          endDate: tenant.end_date || '',
          status: tenant.status || '',
          logo: '',
          logoPreview: normalizeTenantAssetUrl(profile.logo_url || tenant.logo_url),
          country: tenant.country || '',
          city: tenant.city || '',
          state: tenant.state || '',
          addressLine1: tenant.address_line_1 || '',
          addressLine2: tenant.address_line_2 || '',
          phone: profile.phone || '',
          taxId: profile.tax_id || '',
          websiteUrl: tenant.website_url || profile.website_url || '',
        }

        initializedCompanyKeyRef.current = companyKey
        setSavedValues(newValues)

        // Update Form State
        setName(newValues.name)
        setDescription(newValues.description)
        setType(newValues.type)
        setSlug(newValues.slug)
        setSubscriptionPlan(newValues.subscriptionPlan)
        setStartDate(newValues.startDate)
        setEndDate(newValues.endDate)
        setStatus(newValues.status)
        setLogoPreview(newValues.logoPreview)
        setCountry(newValues.country)
        setCity(newValues.city)
        setState(newValues.state)
        setAddressLine1(newValues.addressLine1)
        setAddressLine2(newValues.addressLine2)
        setPhone(newValues.phone || '')
        setTaxId(newValues.taxId || '')
        setWebsiteUrl(newValues.websiteUrl || '')

      } catch (err) {
        console.error('Failed to fetch company info', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCompany()
  }, [company, fetchCompanyInfo, loading])

  const onLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert(t('File size exceeds 2MB limit'))
      return
    }

    setLogo(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result || '')
    reader.readAsDataURL(file)
  }

  const hasChanges = useMemo(() => {
    if (name !== savedValues.name) return true
    if (description !== savedValues.description) return true
    if (logo !== savedValues.logo) return true
    if (country !== savedValues.country) return true
    if (city !== savedValues.city) return true
    if (state !== savedValues.state) return true
    if (addressLine1 !== savedValues.addressLine1) return true
    if (addressLine2 !== savedValues.addressLine2) return true
    if (phone !== savedValues.phone) return true
    if (taxId !== savedValues.taxId) return true
    if (websiteUrl !== savedValues.websiteUrl) return true
    return false
  }, [
    savedValues,
    name, description, logo, country, city, state, addressLine1, addressLine2, phone, taxId, websiteUrl
  ])

  const saveChanges = async () => {
    if (!hasChanges) return

    setSaving(true)

    try {
      const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl)
      const formData = new FormData()
      formData.append('name', name)
      formData.append('description', description)
      formData.append('country', country)
      formData.append('city', city)
      formData.append('state', state)
      formData.append('address_line_1', addressLine1)
      formData.append('address_line_2', addressLine2)
      formData.append('phone', phone)
      formData.append('tax_id', taxId)
      if (normalizedWebsiteUrl) {
        formData.append('website_url', normalizedWebsiteUrl)
      }

      if (logo instanceof File) {
        formData.append('logo', logo)
      }

      const res = await api.post('/api/company-info', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const tenant = res.data?.tenant || res.data?.data?.tenant || company || {}
      const profile = tenant.profile || {}

      const currentValues = {
        ...savedValues,
        name: tenant.name || name,
        description: profile.description || '',
        phone: profile.phone || '',
        taxId: profile.tax_id || '',
        websiteUrl: tenant.website_url || profile.website_url || normalizedWebsiteUrl,
        logo: '',
        logoPreview: normalizeTenantAssetUrl(profile.logo_url || tenant.logo_url) || logoPreview,
        country: tenant.country || '',
        city: tenant.city || '',
        state: tenant.state || '',
        addressLine1: tenant.address_line_1 || '',
        addressLine2: tenant.address_line_2 || '',
      }

      initializedCompanyKeyRef.current = String(
        tenant.id ??
        tenant.slug ??
        tenant.name ??
        initializedCompanyKeyRef.current ??
        'default-company'
      )
      setSavedValues(currentValues)
      setName(currentValues.name)
      setLogo('') // Clear file input
      if (profile.logo_url || tenant.logo_url) {
        setLogoPreview(normalizeTenantAssetUrl(profile.logo_url || tenant.logo_url))
      }
      isDirtyRef.current = false

      await fetchCompanyInfo()
      alert(t('Company settings updated successfully'))
    } catch (err) {
      console.error('Failed to save company settings', err)
      const validationErrors = err?.response?.data?.errors || {}
      const firstValidationMessage = Object.values(validationErrors)?.flat?.()?.find(Boolean)
      alert(firstValidationMessage || err?.response?.data?.message || t('Failed to save changes'))
    } finally {
      setSaving(false)
    }
  }

  const resetChanges = () => {
    setName(savedValues.name)
    setDescription(savedValues.description)
    setLogo(savedValues.logo)
    setLogoPreview(savedValues.logoPreview)
    setCountry(savedValues.country)
    setCity(savedValues.city)
    setState(savedValues.state)
    setAddressLine1(savedValues.addressLine1)
    setAddressLine2(savedValues.addressLine2)
    setPhone(savedValues.phone)
    setTaxId(savedValues.taxId)
    setWebsiteUrl(savedValues.websiteUrl)
    isDirtyRef.current = false
  }

  const openAddTargetEditor = () => {
    setTargetForm({
      year: new Date().getFullYear(),
      yearly_target: '',
    })
    setTargetEditorOpen(true)
  }

  const openEditTargetEditor = (row) => {
    setTargetForm({
      year: Number(row.year || new Date().getFullYear()),
      yearly_target: String(row.yearly_target ?? ''),
    })
    setTargetEditorOpen(true)
  }

  const saveTarget = async () => {
    if (!canManageTargets) return
    if (!targetForm.year) {
      alert(isArabic ? 'اكتب السنة الأول' : 'Enter the year first')
      return
    }

    setTargetSaving(true)
    try {
      await api.post('/api/company-targets', {
        year: Number(targetForm.year),
        yearly_target: Number(parseTargetAmount(targetForm.yearly_target) || 0),
      })
      setTargetEditorOpen(false)
      await fetchCompanyTargets()
      alert(isArabic ? 'تم حفظ التارجت بنجاح' : 'Target saved successfully')
    } catch (err) {
      console.error('Failed to save target', err)
      alert(err?.response?.data?.message || (isArabic ? 'فشل حفظ التارجت' : 'Failed to save target'))
    } finally {
      setTargetSaving(false)
    }
  }

  const deleteTarget = async (row) => {
    if (!canManageTargets || !row?.id) return
    const confirmed = window.confirm(
      isArabic
        ? `هل أنت متأكد من حذف تارجت سنة ${row.year}؟`
        : `Are you sure you want to delete the ${row.year} company target?`
    )
    if (!confirmed) return

    try {
      await api.delete(`/api/company-targets/${row.id}`)
      await fetchCompanyTargets()
      alert(isArabic ? 'تم حذف التارجت بنجاح' : 'Target deleted successfully')
    } catch (err) {
      console.error('Failed to delete target', err)
      alert(err?.response?.data?.message || (isArabic ? 'فشل حذف التارجت' : 'Failed to delete target'))
    }
  }

  const formatDate = (dateString) => {
    if (String(subscriptionPlan).toUpperCase() === 'LIFETIME' && (!dateString || activeTab === 'general')) {
       // If it is lifetime, end date is effectively "Lifetime" or "N/A" depending on context, user asked for "Lifetime" display? 
       // User said "When subscription is lifetime, appear here as lifetime not N/A".
       // Assuming this is for the subscription period display.
       return isArabic ? 'مدى الحياة' : 'Lifetime';
    }
    if (!dateString) return t('N/A')
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl glass-panel w-full overflow-hidden shadow-2xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-md border border-white/20 dark:border-gray-700">

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
        
        {/* Tabs */}
        <div className="w-full mb-8">
          <div className="flex p-1 bg-transparent rounded-xl border border-gray-200/50 dark:border-gray-700/50 w-full md:w-fit backdrop-blur-sm">
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-300 font-medium ${
                activeTab === 'general' 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02]' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`} 
              onClick={()=>setActiveTab('general')}
            >
              <Info size={18} className={activeTab === 'general' ? 'animate-pulse' : ''} />
              <span>{t('General Info')}</span>
            </button>
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-300 font-medium ${
                activeTab === 'location' 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02]' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`} 
              onClick={()=>setActiveTab('location')}
            >
              <MapPin size={18} className={activeTab === 'location' ? 'animate-pulse' : ''} />
              <span>{t('Location')}</span>
            </button>
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-300 font-medium ${
                activeTab === 'targets' 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02]' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`} 
              onClick={()=>setActiveTab('targets')}
            >
              <Target size={18} className={activeTab === 'targets' ? 'animate-pulse' : ''} />
              <span>{t('Company Targets')}</span>
            </button>
          </div>
        </div>

        {activeTab === 'general' && (
          <>
          <div className="flex flex-col max-w-5xl mx-auto animate-in fade-in duration-300 p-4 sm:p-6 space-y-8">
            
            {/* Top Section: Identity & Web Presence */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              
              {/* Logo Upload - Compact & Focused */}
              <div className="w-full md:w-auto flex justify-center md:justify-start">
                <label className="group relative flex flex-col items-center justify-center w-40 h-40 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer overflow-hidden shadow-sm">
                   <div className="w-full h-full flex items-center justify-center p-2">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Company Logo" className="w-full h-full object-contain rounded-xl" loading="lazy" />
                    ) : (
                      <Building className="text-gray-300 dark:text-gray-500 group-hover:scale-110 transition-transform duration-300" size={48} />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-[1px]">
                    <Upload className="text-white mb-1" size={24} />
                    <span className="text-xs font-semibold text-white">{t('Change Logo')}</span>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={onLogoChange} />
                </label>
              </div>

              {/* Identity Fields Grid */}
              <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Company Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                    {t('Company Name')}
                  </label>
                  <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-2 ring-blue-500/20 focus-within:border-blue-500/50 transition-all hover:border-blue-500/30 group">
                    <Building className="text-gray-400" size={18} />
                    <input
                      className="flex-1 min-w-0 bg-transparent outline-none text-theme-text placeholder-gray-400 font-semibold text-lg"
                      value={name}
                      onChange={(e) => {
                        isDirtyRef.current = true
                        setName(e.target.value)
                      }}
                      placeholder={t('Company Name')}
                      aria-label={t('Company Name')}
                    />
                  </div>
                </div>

                {/* Company Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                    {t('Company Type')} <Lock size={12} />
                  </label>
                  <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent">
                    <Activity className="text-gray-400" size={18} />
                    <span className="text-theme-text font-medium truncate">{type || t('Not Specified')}</span>
                  </div>
                </div>

                {/* Website URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                    {t('Website URL')}
                  </label>
                  <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-2 ring-blue-500/20 focus-within:border-blue-500/50 transition-all hover:border-blue-500/30 group">
                    <Globe className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                      className="flex-1 min-w-0 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                      value={websiteUrl}
                      onChange={e => {
                        isDirtyRef.current = true
                        setWebsiteUrl(e.target.value)
                      }}
                      placeholder="https://yourwebsite.com"
                      dir="ltr"
                      aria-label={t('Website URL')}
                    />
                  </div>
                </div>

                {/* Subdomain */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                    {t('Subdomain')} <Lock size={12} />
                  </label>
                  <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent">
                    <Globe className="text-gray-400" size={18} />
                    <span className="text-theme-text font-medium truncate dir-ltr">{slug ? `${slug}.${rootDomain}` : t('Not Assigned')}</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Middle Section: Description */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-2">
                <FileText className="text-blue-500" size={18} />
                {t('Description')}
              </label>
              <div className="relative group">
                <textarea
                  className="w-full bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium rounded-2xl border border-gray-200/60 dark:border-gray-700/60 p-4 focus:ring-4 ring-blue-500/10 focus:border-blue-500/50 transition-all min-h-[120px] resize-none"
                  value={description}
                  onChange={e => {
                    isDirtyRef.current = true
                    setDescription(e.target.value)
                  }}
                  placeholder={t('Enter company description...')}
                />
                <div className="absolute bottom-3 right-3 text-xs text-gray-400 pointer-events-none bg-white/50 dark:bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm">
                  {description.length} chars
                </div>
              </div>
            </div>

            {/* Bottom Section: Subscription Details (Visual Card) */}
            <div className="bg-transparent p-6">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CreditCard size={16} />
                {t('Subscription Details')}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Current Plan */}
                <div className="flex flex-col gap-1">
                   <span className="text-xs text-gray-400">{t('Current Plan')}</span>
                   <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <CreditCard size={16} />
                      </div>
                      <span className="font-bold text-theme-text text-lg uppercase">{subscriptionPlan || t('Free Tier')}</span>
                   </div>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                   <span className="text-xs text-gray-400">{t('Status')}</span>
                   <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                        <Activity size={16} />
                      </div>
                      <span className={`font-bold text-lg capitalize ${status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {status || t('Inactive')}
                      </span>
                   </div>
                </div>

                 {/* Period */}
                <div className="flex flex-col gap-1">
                   <span className="text-xs text-gray-400">{t('Subscription Period')}</span>
                   <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                        <Clock size={16} />
                      </div>
                      <span className="font-medium text-theme-text text-sm">
                        {formatDate(startDate)} - {formatDate(endDate)}
                      </span>
                   </div>
                </div>

              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-6 border-t border-gray-200/50 dark:border-gray-700/50 flex items-center justify-end gap-3 bg-transparent backdrop-blur-sm">
            <button
              onClick={resetChanges}
              disabled={!hasChanges || saving}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all duration-200 ${!hasChanges
                ? 'text-gray-400 cursor-not-allowed bg-transparent'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                }`}
            >
              {t('Cancel')}
            </button>
            <button
              onClick={saveChanges}
              disabled={!hasChanges || saving}
              className={`px-8 py-2.5 rounded-xl font-medium text-white shadow-lg shadow-blue-500/20 transition-all duration-200 flex items-center gap-2 ${!hasChanges || saving
                ? 'bg-blue-400 cursor-not-allowed opacity-70'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30 active:scale-95'
                }`}
            >
              {saving && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>}
              {saving ? t('Saving...') : t('Save Changes')}
            </button>
          </div>
          </>
        )}

      {activeTab === 'location' && (
        <>
          <div className="flex flex-col items-center justify-center max-w-5xl mx-auto animate-in fade-in duration-300 p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
               
               {/* Location Details Header */}
               <div className="col-span-full pt-4 border-b border-gray-200/50 dark:border-gray-700/50 pb-4 mb-2">
                 <h3 className="text-lg font-semibold text-theme-text flex items-center gap-2">
                   <MapPin className="text-theme" size={20} />
                   {t('Location Details')}
                 </h3>
               </div>

               {/* Country */}
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('Country')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <Globe className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={country}
                     onChange={(e) => {
                       isDirtyRef.current = true
                       setCountry(e.target.value)
                     }}
                     placeholder={t('Enter country')}
                     aria-label={t('Country')}
                   />
                 </div>
               </div>

               {/* City */}
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('City')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <Building className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={city}
                     onChange={(e) => {
                       isDirtyRef.current = true
                       setCity(e.target.value)
                     }}
                     placeholder={t('Enter city')}
                     aria-label={t('City')}
                   />
                 </div>
               </div>

               {/* Address Line 1 */}
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('Address Line 1')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <MapPin className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={addressLine1}
                     onChange={(e) => {
                       isDirtyRef.current = true
                       setAddressLine1(e.target.value)
                     }}
                     placeholder={t('Enter address line 1')}
                     aria-label={t('Address Line 1')}
                   />
                 </div>
               </div>

               {/* State */}
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('State / Province')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <MapPin className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={state}
                     onChange={(e) => {
                       isDirtyRef.current = true
                       setState(e.target.value)
                     }}
                     placeholder={t('Enter state or province')}
                     aria-label={t('State')}
                   />
                 </div>
               </div>

               {/* Address Line 2 */}
               <div className="space-y-2 col-span-full">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('Address Line 2')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <MapPin className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={addressLine2}
                     onChange={(e) => setAddressLine2(e.target.value)}
                     placeholder={t('Enter address line 2')}
                     aria-label={t('Address Line 2')}
                   />
                 </div>
               </div>

               {/* Phone */}
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('Phone')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <Phone className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={phone}
                     onChange={(e) => setPhone(e.target.value)}
                     placeholder={t('Enter company phone')}
                     aria-label={t('Phone')}
                   />
                 </div>
               </div>

               {/* Tax ID */}
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-theme-text ml-1 flex items-center gap-1">
                   {t('Tax ID')}
                 </label>
                 <div className="flex items-center gap-3 px-4 h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-transparent focus-within:ring-4 ring-blue-500/10 focus-within:border-blue-500/50 transition-all shadow-sm hover:border-blue-500/30 group">
                   <Hash className="text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input
                     className="flex-1 bg-transparent outline-none text-theme-text placeholder-gray-400 font-medium"
                     value={taxId}
                     onChange={(e) => setTaxId(e.target.value)}
                     placeholder={t('Enter Tax ID')}
                     aria-label={t('Tax ID')}
                   />
                 </div>
               </div>

            </div>
          </div>
          {/* Footer Actions */}
          <div className="p-4 sm:p-6 border-t border-gray-200/50 dark:border-gray-700/50 flex items-center justify-end gap-3 bg-transparent backdrop-blur-sm">
            <button
              onClick={resetChanges}
              disabled={!hasChanges || saving}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all duration-200 ${!hasChanges
                ? 'text-gray-400 cursor-not-allowed bg-transparent'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                }`}
            >
              {t('Cancel')}
            </button>
            <button
              onClick={saveChanges}
              disabled={!hasChanges || saving}
              className={`px-8 py-2.5 rounded-xl font-medium text-white shadow-lg shadow-blue-500/20 transition-all duration-200 flex items-center gap-2 ${!hasChanges || saving
                ? 'bg-blue-400 cursor-not-allowed opacity-70'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30 active:scale-95'
                }`}
            >
              {saving && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>}
              {saving ? t('Saving...') : t('Save Changes')}
            </button>
          </div>
        </>
      )}

      {activeTab === 'targets' && (
        <div className="flex  flex-col items-center justify-center max-w-5xl mx-auto animate-in fade-in duration-300 p-4 sm:p-6 space-y-6 sm:space-y-8">
          <div className="w-full flex  sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-theme-text">
                {isArabic ? 'إدارة تارجت الشركة' : 'Company Target Management'}
              </h3>
              <p className="text-sm text-theme-text/60">
                {isArabic
                  ? 'تارجت الشركة رقم مستقل عن تارجتات المستخدمين، والإضافة والتعديل للأدمن فقط.'
                  : 'Company target is independent from user targets; only admins can add or edit it.'}
              </p>
            </div>
            {canManageTargets && (
              <button
                type="button"
                onClick={openAddTargetEditor}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-500/30"
              >
                <Plus size={18} />
                {isArabic ? 'إضافة تارجت سنة' : 'Add Year Target'}
              </button>
            )}
          </div>

          {canManageTargets && targetEditorOpen && (
            <div className="w-full glass-panel rounded-xl border border-gray-200/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/10">
                <div className="font-semibold text-theme-text">
                  {isArabic ? 'إضافة / تعديل تارجت' : 'Add / Edit Target'}
                </div>
                <button
                  type="button"
                  onClick={() => setTargetEditorOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-theme-text/60 transition hover:bg-white/10 hover:text-theme-text"
                  aria-label={isArabic ? 'إغلاق' : 'Close'}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-theme-text/70">{isArabic ? 'السنة' : 'Year'}</span>
                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      value={targetForm.year}
                      onChange={(e) => setTargetForm(prev => ({ ...prev, year: e.target.value }))}
                      className="input input-bordered w-full bg-transparent"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-theme-text/70">{isArabic ? 'التارجت السنوي' : 'Yearly Target'}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      lang="en"
                      style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
                      value={formatTargetAmountInput(targetForm.yearly_target)}
                      onChange={(e) => setTargetForm(prev => ({ ...prev, yearly_target: parseTargetAmount(e.target.value) }))}
                      className="input input-bordered w-full bg-transparent font-mono"
                      placeholder="100,000,000"
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetEditorOpen(false)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-theme-text/70 transition hover:bg-white/10"
                  >
                    {isArabic ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={saveTarget}
                    disabled={targetSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  >
                    <Save size={17} />
                    {targetSaving ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ التارجت' : 'Save Target')}
                  </button>
                </div>
              </div>
            </div>
          )}

           <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 rounded-r-xl w-full">
            <div className="flex items-start gap-3">
              <Info className="text-blue-400 mt-0.5" size={20} />
              <div>
                 <p className="text-sm text-blue-400 font-bold mb-1">
                   {isArabic ? 'معلومة:' : 'Info:'}
                 </p>
                 <p className="text-sm text-blue-400/90">
                   {isArabic ? 'هذه الأرقام تمثل تارجت الشركة المستقل للسنة الحالية، ولا تتأثر بحذف أو تعديل المستخدمين.' : 'These figures represent the independent company target for the current year and are not affected by user changes.'}
                 </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full relative">
             <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200/10 -z-10 hidden md:block"></div>
             
             {/* Monthly Target */}
             <div className="group">
               <div className="glass-panel p-5 rounded-xl border border-gray-200/5 bg-gray-100/20 dark:bg-gray-800/20 hover:bg-gray-100/40 dark:hover:bg-gray-800/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                 <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                   <Clock size={40} className="text-blue-500" />
                 </div>
                 
                 <label className="label pt-0 justify-start gap-2 mb-2 flex items-center">
                   <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-500">
                     <Clock size={16} />
                   </div>
                   <span className="label-text font-medium text-theme-text/80 ml-2 rtl:mr-2">
                     {isArabic ? 'تارجت شهري' : 'Monthly Target'}
                   </span>
                 </label>
                 
                 <div className="mt-2 min-w-0">
                   <div className="w-full min-w-0 bg-transparent font-mono text-[clamp(1.05rem,1.7vw,1.45rem)] leading-tight font-bold text-theme-text break-words">
                    {formatCompanyTarget(companyTargets.monthly, targetLocale)}
                   </div>
                   <div className="mt-1 inline-flex items-center rounded-md bg-theme-text/5 px-2 py-0.5 text-theme-text/60 text-xs font-mono">
                    {currencySymbol}
                  </div>
                </div>
                
                <div className="mt-3 text-xs text-theme-text/40 flex justify-between pt-3 border-t border-theme-text/5">
                  <span>{isArabic ? 'القيمة الأساسية' : 'Base Value'}</span>
                  <span className="font-mono">1x</span>
                </div>
              </div>
            </div>

            {/* Quarterly Target */}
            <div className="group">
              <div className="glass-panel p-5 rounded-xl border border-gray-200/5 bg-gray-100/20 dark:bg-gray-800/20 hover:bg-gray-100/40 dark:hover:bg-gray-800/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Calendar size={40} className="text-purple-500" />
                </div>
                
                <label className="label pt-0 justify-start gap-2 mb-2 flex items-center">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-500">
                    <Calendar size={16} />
                  </div>
                  <span className="label-text font-medium text-theme-text/80 ml-2 rtl:mr-2">
                    {isArabic ? 'تارجت ربع سنوي' : 'Quarterly Target'}
                  </span>
                </label>
                
                <div className="mt-2 min-w-0">
                   <div className="w-full min-w-0 bg-transparent font-mono text-[clamp(1.05rem,1.7vw,1.45rem)] leading-tight font-bold text-theme-text break-words">
                    {formatCompanyTarget(companyTargets.quarterly, targetLocale)}
                   </div>
                   <div className="mt-1 inline-flex items-center rounded-md bg-theme-text/5 px-2 py-0.5 text-theme-text/60 text-xs font-mono">
                    {currencySymbol}
                  </div>
                </div>

                <div className="mt-3 text-xs text-theme-text/40 flex justify-between pt-3 border-t border-theme-text/5">
                  <span>{isArabic ? 'تراكمي' : 'Accumulated'}</span>
                  <span className="font-mono">{isArabic ? '3 أشهر' : '3 Months'}</span>
                </div>
              </div>
            </div>

            <div className="group">
              <div className="glass-panel p-5 rounded-xl border border-gray-200/5 bg-gray-100/20 dark:bg-gray-800/20 hover:bg-gray-100/40 dark:hover:bg-gray-800/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Calendar size={40} className="text-cyan-500" />
                </div>
                <label className="label pt-0 justify-start gap-2 mb-2 flex items-center">
                  <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-500">
                    <Calendar size={16} />
                  </div>
                  <span className="label-text font-medium text-theme-text/80 ml-2 rtl:mr-2">
                    {isArabic ? 'تارجت نصف سنوي' : 'Semi Annual Target'}
                  </span>
                </label>
                <div className="mt-2 min-w-0">
                   <div className="w-full min-w-0 bg-transparent font-mono text-[clamp(1.05rem,1.7vw,1.45rem)] leading-tight font-bold text-theme-text break-words">
                    {formatCompanyTarget(companyTargets.semiAnnual, targetLocale)}
                   </div>
                   <div className="mt-1 inline-flex items-center rounded-md bg-theme-text/5 px-2 py-0.5 text-theme-text/60 text-xs font-mono">
                    {currencySymbol}
                  </div>
                </div>
                <div className="mt-3 text-xs text-theme-text/40 flex justify-between pt-3 border-t border-theme-text/5">
                  <span>{isArabic ? 'تراكمي' : 'Accumulated'}</span>
                  <span className="font-mono">{isArabic ? '6 أشهر' : '6 Months'}</span>
                </div>
              </div>
            </div>

            {/* Yearly Target */}
            <div className="group">
              <div className="glass-panel p-5 rounded-xl border border-gray-200/5 bg-gray-100/20 dark:bg-gray-800/20 hover:bg-gray-100/40 dark:hover:bg-gray-800/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={40} className="text-green-500" />
                </div>
                
                <label className="label pt-0 justify-start gap-2 mb-2 flex items-center">
                  <div className="p-1.5 bg-green-500/10 rounded-lg text-green-500">
                    <TrendingUp size={16} />
                  </div>
                  <span className="label-text font-medium text-theme-text/80 ml-2 rtl:mr-2">
                    {isArabic ? 'تارجت سنوي' : 'Yearly Target'}
                  </span>
                </label>
                
                <div className="mt-2 min-w-0">
                   <div className="w-full min-w-0 bg-transparent font-mono text-[clamp(1.05rem,1.7vw,1.45rem)] leading-tight font-bold text-theme-text break-words">
                    {formatCompanyTarget(companyTargets.yearly, targetLocale)}
                   </div>
                   <div className="mt-1 inline-flex items-center rounded-md bg-theme-text/5 px-2 py-0.5 text-theme-text/60 text-xs font-mono">
                    {currencySymbol}
                  </div>
                 </div>

                 <div className="mt-3 text-xs text-theme-text/40 flex justify-between pt-3 border-t border-theme-text/5">
                   <span>{isArabic ? 'الهدف الكلي' : 'Total Goal'}</span>
                   <span className="font-mono">{isArabic ? '12 شهر' : '12 Months'}</span>
                 </div>
               </div>
             </div>

          </div>

          <div className="w-full glass-panel rounded-xl border border-gray-200/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200/10 font-semibold text-theme-text">
              {isArabic ? 'تاريخ تارجت الشركة حسب السنة' : 'Company Target History by Year'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left rtl:text-right">
                <thead className="bg-white/5 text-theme-text/70 uppercase">
                  <tr>
                    <th className="px-4 py-3">{isArabic ? 'السنة' : 'Year'}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isArabic ? 'شهري' : 'Monthly'}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isArabic ? 'ربع سنوي' : 'Quarterly'}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isArabic ? 'نصف سنوي' : 'Semi Annual'}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isArabic ? 'سنوي' : 'Yearly'}</th>
                    {canManageTargets && (
                      <th className="px-4 py-3 text-center">{isArabic ? 'إجراءات' : 'Actions'}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/10">
                  {companyTargetHistory.map(row => (
                    <tr key={row.year} className="hover:bg-white/10 transition-colors">
                      <td className="px-4 py-3 font-semibold">{row.year}</td>
                      <td className="px-4 py-3 text-right rtl:text-left">{formatCompanyTarget(row.monthly_target, targetLocale)} {currencySymbol}</td>
                      <td className="px-4 py-3 text-right rtl:text-left">{formatCompanyTarget(row.quarterly_target, targetLocale)} {currencySymbol}</td>
                      <td className="px-4 py-3 text-right rtl:text-left">{formatCompanyTarget(row.semi_annual_target, targetLocale)} {currencySymbol}</td>
                      <td className="px-4 py-3 text-right rtl:text-left font-semibold">{formatCompanyTarget(row.yearly_target, targetLocale)} {currencySymbol}</td>
                      {canManageTargets && (
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditTargetEditor(row)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-500 transition hover:bg-blue-500/10 hover:text-blue-600"
                              title={isArabic ? 'تعديل التارجت' : 'Edit target'}
                              aria-label={isArabic ? 'تعديل التارجت' : 'Edit target'}
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTarget(row)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-500/10 hover:text-red-600"
                              title={isArabic ? 'حذف التارجت' : 'Delete target'}
                              aria-label={isArabic ? 'حذف التارجت' : 'Delete target'}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {companyTargetHistory.length === 0 && (
                    <tr>
                      <td colSpan={canManageTargets ? 6 : 5} className="px-4 py-6 text-center text-theme-text/50">
                        {isArabic ? 'لا يوجد تاريخ تارجت محفوظ بعد' : 'No saved target history yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
