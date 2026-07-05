import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../utils/api'
import { useAppState } from '../../shared/context/AppStateProvider'
import { useTheme } from '../../shared/context/ThemeProvider'
import { whatsappMirrorService } from '../../services/whatsappService'

const DEFAULT_CONVERT_FORM = {
  name: '',
  email: '',
  company: '',
  notes: '',
  source: 'WhatsApp Mirror',
  stage: 'New Lead',
  status: 'new',
  priority: 'medium',
  campaign: '',
  country: '',
  project_id: '',
  item_id: '',
}

export default function WhatsAppMirrorConnection() {
  const { t, i18n } = useTranslation()
  const { company, crmSettings } = useAppState()
  const { resolvedTheme, theme } = useTheme()
  const isLight = (resolvedTheme || theme) === 'light'
  const isArabic = String(i18n.language || '').startsWith('ar')
  const [status, setStatus] = useState('disconnected')
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [contacts, setContacts] = useState([])
  const [contactsMeta, setContactsMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactStatus, setContactStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState(null)
  const [convertForm, setConvertForm] = useState(DEFAULT_CONVERT_FORM)
  const [submittingConvert, setSubmittingConvert] = useState(false)
  const [inventoryOptions, setInventoryOptions] = useState([])
  const [loadingInventoryOptions, setLoadingInventoryOptions] = useState(false)
  const pollingInterval = useRef(null)
  const searchTimer = useRef(null)

  const companyType = String(company?.company_type || company?.companyType || '').toLowerCase()
  const usesProjects = companyType === 'real estate'
  const inventoryLabel = usesProjects ? (isArabic ? 'المشروع' : 'Project') : (isArabic ? 'العنصر' : 'Item')
  const defaultCountry = crmSettings?.defaultCountryCode || ''

  const selectedInventoryValue = usesProjects ? convertForm.project_id : convertForm.item_id

  const connectionCardClass = isLight
    ? 'bg-white rounded-lg shadow-sm border border-gray-100'
    : 'bg-slate-900/70 border border-slate-700 rounded-lg shadow-sm'

  const inputClass = `w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
    isLight
      ? 'border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-400'
      : 'border-slate-700 bg-slate-950/70 text-white placeholder-slate-400 focus:border-blue-500'
  }`

  const mutedTextClass = isLight ? 'text-gray-500' : 'text-slate-400'
  const titleTextClass = isLight ? 'text-gray-800' : 'text-white'
  const modalShellClass = isLight
    ? 'bg-white/95 border border-gray-200 shadow-[0_30px_80px_rgba(15,23,42,0.18)]'
    : 'bg-slate-900/96 border border-slate-700 shadow-[0_30px_80px_rgba(2,6,23,0.65)]'
  const modalPanelClass = isLight
    ? 'rounded-2xl border border-gray-100 bg-gray-50/80'
    : 'rounded-2xl border border-slate-800 bg-slate-950/45'
  const modalOverlayClass = isLight
    ? 'bg-white/72 backdrop-blur-md'
    : 'bg-slate-950/78 backdrop-blur-md'
  const modalHeaderClass = isLight
    ? 'border-gray-200 bg-white/88'
    : 'border-slate-800 bg-slate-900/88'
  const modalButtonSecondaryClass = isLight
    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    : 'bg-slate-800 text-white hover:bg-slate-700'
  const modalButtonPrimaryClass = isLight
    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20'
    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-sm shadow-emerald-500/20'
  const modalCloseButtonClass = isLight
    ? 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800'
    : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'

  const statusBadgeClass = useMemo(() => (
    status === 'connected'
      ? 'bg-green-100 text-green-800'
      : status === 'pending_qr'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-800'
  ), [status])

  useEffect(() => {
    checkStatus()
    fetchContacts(1, 'pending', '')
    return () => {
      stopPolling()
      clearTimeout(searchTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchContacts(1, contactStatus, search)
    }, 250)

    return () => clearTimeout(searchTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactStatus, search])

  useEffect(() => {
    if (!showConvertModal) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showConvertModal])

  useEffect(() => {
    if (loadingInventoryOptions || inventoryOptions.length === 0 || selectedInventoryValue) return

    const firstOptionId = inventoryOptions[0]?.id
    if (!firstOptionId) return

    setConvertForm((prev) => (
      usesProjects
        ? { ...prev, project_id: String(firstOptionId) }
        : { ...prev, item_id: String(firstOptionId) }
    ))
  }, [inventoryOptions, loadingInventoryOptions, selectedInventoryValue, usesProjects])

  const emitToast = (type, message) => {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message } }))
  }

  const checkStatus = async () => {
    try {
      const data = await whatsappMirrorService.getStatus()
      if (!data) return
      setStatus(data.status || 'disconnected')
      if (data.status === 'pending_qr' && data.qr_base64) {
        setQrCode(data.qr_base64)
      } else if (data.status === 'connected') {
        stopPolling()
        setShowModal(false)
      }
    } catch (error) {
      console.error('Error fetching WhatsApp Mirror status:', error)
    }
  }

  const fetchContacts = async (page = 1, nextStatus = contactStatus, nextSearch = search) => {
    setLoadingContacts(true)
    try {
      const data = await whatsappMirrorService.getUnassignedContacts({
        page,
        status: nextStatus,
        search: nextSearch,
        per_page: 20,
      })
      setContacts(Array.isArray(data?.data) ? data.data : [])
      setContactsMeta({
        current_page: data?.current_page || 1,
        last_page: data?.last_page || 1,
        total: data?.total || 0,
      })
    } catch (error) {
      console.error('Error fetching unassigned WhatsApp contacts:', error)
      setContacts([])
      setContactsMeta({ current_page: 1, last_page: 1, total: 0 })
    } finally {
      setLoadingContacts(false)
    }
  }

  const fetchInventoryOptions = async () => {
    setLoadingInventoryOptions(true)
    try {
      const endpoint = usesProjects ? '/api/projects?all=1' : '/api/items?all=1'
      const res = await api.get(endpoint)
      const data = res?.data
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [])
      setInventoryOptions(list)
    } catch (error) {
      console.error('Error loading inventory options:', error)
      setInventoryOptions([])
    } finally {
      setLoadingInventoryOptions(false)
    }
  }

  const startPolling = () => {
    stopPolling()
    pollingInterval.current = setInterval(() => {
      checkStatus()
    }, 2500)
  }

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }

  const handleConnect = async () => {
    setLoading(true)
    try {
      const data = await whatsappMirrorService.pair()
      setStatus(data.status || 'pending_qr')
      if (data.qr_base64) {
        setQrCode(data.qr_base64)
        setShowModal(true)
        startPolling()
      } else if (data.status === 'connected') {
        setStatus('connected')
      }
    } catch (error) {
      emitToast('error', t('Failed to start pairing. Please ensure the Mirror service is running.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm(t('Are you sure you want to disconnect the Mirror?'))) return
    setLoading(true)
    try {
      await whatsappMirrorService.disconnect()
      setStatus('disconnected')
      setQrCode(null)
    } catch (error) {
      emitToast('error', t('Failed to disconnect'))
    } finally {
      setLoading(false)
    }
  }

  const openConvertModal = async (contact) => {
    setSelectedContact(contact)
    setConvertForm({
      ...DEFAULT_CONVERT_FORM,
      name: contact?.push_name || '',
      notes: contact?.last_message_body || '',
      country: defaultCountry,
    })
    setShowConvertModal(true)
    await fetchInventoryOptions()
  }

  const closeConvertModal = () => {
    setShowConvertModal(false)
    setSelectedContact(null)
    setConvertForm(DEFAULT_CONVERT_FORM)
    setInventoryOptions([])
  }

  const handleConvert = async (event) => {
    event.preventDefault()
    if (!selectedContact?.id || !convertForm.name.trim()) return

    setSubmittingConvert(true)
    try {
      const payload = {
        ...convertForm,
        project_id: usesProjects ? (convertForm.project_id || null) : null,
        item_id: usesProjects ? null : (convertForm.item_id || null),
        phone_country: defaultCountry || undefined,
      }

      await whatsappMirrorService.convertToLead(selectedContact.id, payload)
      emitToast('success', isArabic ? 'تم تحويل الرقم إلى ليد بنجاح' : 'Contact converted to lead')
      closeConvertModal()
      fetchContacts(1, contactStatus, search)
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل تحويل الرقم إلى ليد' : 'Failed to convert contact to lead')
      emitToast('error', message)
    } finally {
      setSubmittingConvert(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`${connectionCardClass} p-6`}>
        <div className={`flex items-center justify-between border-b pb-4 mb-4 ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
          <div>
            <h3 className={`text-lg font-semibold ${titleTextClass}`}>
              {isArabic ? 'واتساب ميرور (ربط مباشر)' : t('WhatsApp Mirror (Direct Link)')}
            </h3>
            <p className={`text-sm ${mutedTextClass}`}>
              {isArabic ? 'اربط رقمك الشخصي عبر مسح رمز QR لتفعيل مزامنة واتساب المباشرة.' : t('Link your personal number by scanning a QR for direct WhatsApp mirroring.')}
            </p>
          </div>

          <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusBadgeClass}`}>
            {status === 'connected' ? t('Connected') : status === 'pending_qr' ? t('Awaiting QR') : t('Disconnected')}
          </span>
        </div>

        <div className={`mb-6 rounded-xl border-l-4 p-4 text-sm ${
          isLight
            ? 'border-amber-500 bg-amber-50 text-amber-900'
            : 'border-amber-400 bg-amber-500/10 text-amber-100'
        }`}>
          <p className="font-bold mb-1">{isArabic ? 'تنبيه مهم' : 'Important note'}</p>
          <p>
            {isArabic
              ? 'هذا التكامل غير رسمي. إساءة الاستخدام قد تؤدي إلى حظر رقمك. استخدمه بمسؤولية.'
              : t('This integration is unofficial. Abuse may result in your number being banned. Use responsibly.')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {status !== 'connected' ? (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              {loading ? (isArabic ? 'جاري التجهيز...' : t('Preparing...')) : (isArabic ? 'ربط رقم جديد عبر QR' : t('Pair new number via QR'))}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              {loading ? (isArabic ? 'جاري الفصل...' : t('Disconnecting...')) : (isArabic ? 'فصل الرقم الحالي' : t('Disconnect current number'))}
            </button>
          )}
        </div>
      </div>

      <div className={`${connectionCardClass} p-6`}>
        <div className="flex  gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h4 className={`text-lg font-semibold ${titleTextClass}`}>{isArabic ? 'أرقام واتساب غير المحولة' : 'Unassigned WhatsApp Contacts'}</h4>
            <p className={`text-sm ${mutedTextClass}`}>{isArabic ? 'أي رقم لا يطابق ليد حاليًا سيظهر هنا مع الاسم القادم من واتساب.' : 'Numbers that do not match an existing lead appear here with their WhatsApp display name.'}</p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex rounded-xl border overflow-hidden border-gray-200 dark:border-slate-700">
              {['pending', 'converted'].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setContactStatus(value)}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    contactStatus === value
                      ? 'bg-blue-600 text-white'
                      : isLight
                        ? 'bg-white text-gray-700 hover:bg-gray-50'
                        : 'bg-slate-950 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {value === 'pending'
                    ? (isArabic ? 'معلق' : 'Pending')
                    : (isArabic ? 'تم التحويل' : 'Converted')}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isArabic ? 'ابحث بالاسم أو الرقم' : 'Search by name or phone'}
              className={`${inputClass} md:w-72`}
            />
          </div>
        </div>

        <div className={`mt-5 rounded-2xl border overflow-hidden ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
          <div className={`grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] ${
            isLight ? 'bg-gray-50 text-gray-500' : 'bg-slate-950 text-slate-400'
          }`}>
            <div className="col-span-3">{isArabic ? 'الاسم' : 'Name'}</div>
            <div className="col-span-2">{isArabic ? 'الرقم' : 'Phone'}</div>
            <div className="col-span-4">{isArabic ? 'آخر رسالة' : 'Last message'}</div>
            <div className="col-span-1">{isArabic ? 'العدد' : 'Count'}</div>
            <div className="col-span-2">{isArabic ? 'إجراء' : 'Action'}</div>
          </div>

          {loadingContacts ? (
            <div className={`px-4 py-8 text-sm ${mutedTextClass}`}>{isArabic ? 'جاري تحميل الأرقام...' : 'Loading contacts...'}</div>
          ) : contacts.length === 0 ? (
            <div className={`px-4 py-8 text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد أرقام في هذه الحالة.' : 'No contacts found for this status.'}</div>
          ) : (
            contacts.map((contact) => (
              <div
                key={contact.id}
                className={`grid grid-cols-12 gap-3 px-4 py-4 text-sm ${
                  isLight ? 'border-t border-gray-100 bg-white text-gray-800' : 'border-t border-slate-800 bg-slate-950/30 text-slate-100'
                }`}
              >
                <div className="col-span-3 min-w-0">
                  <div className="font-semibold truncate">{contact.push_name || (isArabic ? 'بدون اسم' : 'No name')}</div>
                  <div className={`mt-1 text-xs ${mutedTextClass}`}>{contact.status === 'converted' ? (isArabic ? 'تم تحويله' : 'Converted') : (isArabic ? 'بانتظار التحويل' : 'Awaiting conversion')}</div>
                </div>
                <div className="col-span-2 break-all">{contact.phone}</div>
                <div className="col-span-4 min-w-0">
                  <div className="truncate">{contact.last_message_body || (isArabic ? 'لا توجد معاينة' : 'No preview')}</div>
                  <div className={`mt-1 text-xs ${mutedTextClass}`}>
                    {contact.last_message_at ? new Date(contact.last_message_at).toLocaleString(isArabic ? 'ar-EG' : 'en-US') : '-'}
                  </div>
                </div>
                <div className="col-span-1">{contact.messages_count || 0}</div>
                <div className="col-span-2">
                  {contact.status === 'converted' ? (
                    <div className={`text-xs ${mutedTextClass}`}>
                      {contact.converted_lead?.name || (isArabic ? 'تم الربط بليد' : 'Linked to lead')}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openConvertModal(contact)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                    >
                      {isArabic ? 'تحويل إلى ليد' : 'Convert to Lead'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={`mt-4 flex items-center justify-between text-sm ${mutedTextClass}`}>
          <span>{isArabic ? `الإجمالي: ${contactsMeta.total}` : `Total: ${contactsMeta.total}`}</span>
          {contactsMeta.last_page > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={contactsMeta.current_page <= 1}
                onClick={() => fetchContacts(contactsMeta.current_page - 1)}
                className="rounded-lg border px-3 py-1 disabled:opacity-40"
              >
                {isArabic ? 'السابق' : 'Prev'}
              </button>
              <span>{contactsMeta.current_page} / {contactsMeta.last_page}</span>
              <button
                type="button"
                disabled={contactsMeta.current_page >= contactsMeta.last_page}
                onClick={() => fetchContacts(contactsMeta.current_page + 1)}
                className="rounded-lg border px-3 py-1 disabled:opacity-40"
              >
                {isArabic ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${connectionCardClass} max-w-sm w-full p-6 relative text-center`}>
            <h4 className={`text-md font-bold mb-2 ${titleTextClass}`}>{t('Scan the QR to complete pairing')}</h4>
            <p className={`text-xs mb-4 ${mutedTextClass}`}>{t('Open WhatsApp on your phone → Linked Devices → Link a device')}</p>

            <div className={`p-4 rounded-lg inline-block border mb-4 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-950 border-slate-800'}`}>
              {qrCode ? (
                <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto" />
              ) : (
                <div className={`w-56 h-56 flex items-center justify-center text-xs ${mutedTextClass}`}>{t('Loading QR...')}</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-indigo-600 animate-pulse font-medium">{t('Waiting for phone to connect...')}</span>
              <button
                onClick={() => { setShowModal(false); stopPolling() }}
                className={`mt-2 px-4 py-2 rounded-md text-xs font-medium transition ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConvertModal && selectedContact && (
        <div
          className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${modalOverlayClass}`}
          role="dialog"
          aria-modal="true"
        >
          <div className={`${modalShellClass} w-full max-w-3xl overflow-hidden rounded-[28px]`}>
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${modalHeaderClass}`}>
              <div className="min-w-0">
                <div className={`mb-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  isLight ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
                }`}>
                  {isArabic ? 'رقم واتساب جديد' : 'New WhatsApp Contact'}
                </div>
                <h4 className={`text-lg font-semibold ${titleTextClass}`}>{isArabic ? 'تحويل رقم واتساب إلى ليد' : 'Convert WhatsApp Contact to Lead'}</h4>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>{selectedContact.push_name || selectedContact.phone}</p>
              </div>
              <button
                type="button"
                onClick={closeConvertModal}
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xl leading-none transition ${modalCloseButtonClass}`}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleConvert} className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-6">
              <div className={`${modalPanelClass} p-5`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className={`mb-2 block text-sm font-medium ${titleTextClass}`}>{isArabic ? 'الاسم' : 'Name'}</label>
                    <input
                      value={convertForm.name}
                      onChange={(event) => setConvertForm((prev) => ({ ...prev, name: event.target.value }))}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-medium ${titleTextClass}`}>{isArabic ? 'البريد الإلكتروني' : 'Email'}</label>
                    <input
                      type="email"
                      value={convertForm.email}
                      onChange={(event) => setConvertForm((prev) => ({ ...prev, email: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-medium ${titleTextClass}`}>{isArabic ? 'الشركة' : 'Company'}</label>
                    <input
                      value={convertForm.company}
                      onChange={(event) => setConvertForm((prev) => ({ ...prev, company: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-medium ${titleTextClass}`}>{inventoryLabel}</label>
                    <select
                      value={selectedInventoryValue}
                      onChange={(event) => setConvertForm((prev) => (
                        usesProjects
                          ? { ...prev, project_id: event.target.value }
                          : { ...prev, item_id: event.target.value }
                    ))}
                      className={inputClass}
                    >
                      {loadingInventoryOptions && (
                        <option value="">{isArabic ? 'جاري التحميل...' : 'Loading...'}</option>
                      )}
                      {inventoryOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name || option.title || option.code || `#${option.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className={`${modalPanelClass} mt-4 p-5`}>
                <label className={`mb-2 block text-sm font-medium ${titleTextClass}`}>{isArabic ? 'ملاحظات' : 'Notes'}</label>
                <p className={`mb-3 text-xs ${mutedTextClass}`}>
                  {isArabic ? 'تقدر تراجع الرسالة أو تعدلها قبل التحويل.' : 'You can review or edit the imported message before converting.'}
                </p>
                <textarea
                  rows="5"
                  value={convertForm.notes}
                  onChange={(event) => setConvertForm((prev) => ({ ...prev, notes: event.target.value }))}
                  className={`${inputClass} min-h-[140px] resize-y`}
                />
              </div>

              <div className={`mt-5 flex items-center justify-between gap-3 border-t pt-5 ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
                <div className={`text-xs ${mutedTextClass}`}>
                  {isArabic ? 'سيتم إنشاء ليد جديد وربط المحادثات به.' : 'A new lead will be created and linked to this conversation.'}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeConvertModal}
                    className={`rounded-xl px-4 py-2 text-sm transition ${modalButtonSecondaryClass}`}
                  >
                    {isArabic ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingConvert || !convertForm.name.trim()}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${modalButtonPrimaryClass}`}
                  >
                    {submittingConvert ? (isArabic ? 'جاري التحويل...' : 'Converting...') : (isArabic ? 'تحويل' : 'Convert')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
