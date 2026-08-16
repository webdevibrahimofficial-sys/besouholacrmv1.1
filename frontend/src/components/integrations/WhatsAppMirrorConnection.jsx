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

export default function WhatsAppMirrorConnection({ mode = 'full', embedded = false }) {
  const { t, i18n } = useTranslation()
  const { company, crmSettings } = useAppState()
  const { resolvedTheme, theme } = useTheme()
  const isLight = (resolvedTheme || theme) === 'light'
  const isArabic = String(i18n.language || '').startsWith('ar')

  const [status, setStatus] = useState('disconnected')
  const [connectedPhoneNumber, setConnectedPhoneNumber] = useState(null)
  const [reconnectReason, setReconnectReason] = useState(null)
  const [reconnectDetail, setReconnectDetail] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showReconnectChoiceModal, setShowReconnectChoiceModal] = useState(false)

  const [activeDirectory, setActiveDirectory] = useState('unassigned')
  const [contacts, setContacts] = useState([])
  const [contactsMeta, setContactsMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactStatus, setContactStatus] = useState('pending')
  const [search, setSearch] = useState('')

  const [groupContacts, setGroupContacts] = useState([])
  const [groupContactsMeta, setGroupContactsMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loadingGroupContacts, setLoadingGroupContacts] = useState(false)
  const [groupContactStatus, setGroupContactStatus] = useState('pending')
  const [groupSearch, setGroupSearch] = useState('')
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('')
  const [groupFilterOptions, setGroupFilterOptions] = useState([])
  const [loadingGroupFilterOptions, setLoadingGroupFilterOptions] = useState(false)
  const [selectedGroupContactIds, setSelectedGroupContactIds] = useState([])
  const [syncingGroupContacts, setSyncingGroupContacts] = useState(false)
  const [adminGroups, setAdminGroups] = useState([])
  const [loadingAdminGroups, setLoadingAdminGroups] = useState(false)
  const [openGroupDropdownFor, setOpenGroupDropdownFor] = useState(null)
  const [groupPickerAction, setGroupPickerAction] = useState('add')
  const [addingToGroup, setAddingToGroup] = useState(false)
  const [bulkAddOpen, setBulkAddOpen] = useState(false)
  const [bulkAddingToGroup, setBulkAddingToGroup] = useState(false)
  const [groupAddQueue, setGroupAddQueue] = useState([])
  const [processingGroupAddQueue, setProcessingGroupAddQueue] = useState(false)
  const [deletingGroupContactId, setDeletingGroupContactId] = useState(null)
  const [showSyncPicker, setShowSyncPicker] = useState(false)
  const [syncableGroups, setSyncableGroups] = useState([])
  const [loadingSyncableGroups, setLoadingSyncableGroups] = useState(false)
  const [selectedSyncGroupIds, setSelectedSyncGroupIds] = useState([])

  const [showConvertModal, setShowConvertModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState(null)
  const [selectedContactSource, setSelectedContactSource] = useState('unassigned')
  const [convertForm, setConvertForm] = useState(DEFAULT_CONVERT_FORM)
  const [submittingConvert, setSubmittingConvert] = useState(false)
  const [inventoryOptions, setInventoryOptions] = useState([])
  const [loadingInventoryOptions, setLoadingInventoryOptions] = useState(false)

  const pollingInterval = useRef(null)
  const searchTimer = useRef(null)
  const groupAddQueueRef = useRef([])
  const processingGroupAddQueueRef = useRef(false)
  const groupAddRetryTimer = useRef(null)

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
  const toolbarShellClass = isLight
    ? 'rounded-2xl border border-gray-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/60 shadow-sm'
    : 'rounded-2xl border border-slate-800 bg-slate-950/40'
  const toolbarPanelClass = isLight
    ? 'rounded-2xl border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.08)]'
    : 'rounded-2xl border border-slate-800 bg-slate-900/80'
  const toolbarSelectClass = `w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none transition ${
    isLight
      ? 'border-gray-200 bg-white text-gray-700 shadow-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-50'
      : 'border-slate-700 bg-slate-950/70 text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
  }`
  const syncButtonClass = `inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
    isLight
      ? 'bg-slate-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)] hover:bg-slate-800'
      : 'bg-blue-500 text-slate-950 hover:bg-blue-400'
  }`

  const statusBadgeClass = useMemo(() => (
    status === 'connected'
      ? 'bg-green-100 text-green-800'
      : status === 'reconnecting'
        ? 'bg-blue-100 text-blue-800'
      : status === 'reconnect_failed'
        ? 'bg-red-100 text-red-800'
      : status === 'pending_qr'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-800'
  ), [status])

  const reconnectHint = status === 'reconnecting'
    ? (isArabic
      ? 'الجلسة محفوظة، والخدمة تحاول إعادة الاتصال تلقائيًا الآن. لا تحتاج لإعادة المسح طالما عادت الحالة خلال لحظات.'
      : 'The session is saved and the service is trying to reconnect automatically. You should not need to scan again if it comes back in a few moments.')
    : status === 'reconnect_failed'
      ? (isArabic
        ? 'فشلت كل محاولات الاستعادة التلقائية لهذه الجلسة. يلزم إعادة الربط عبر QR لإنشاء جلسة جديدة.'
        : 'Automatic reconnect attempts failed for this session. Please pair again via QR to create a fresh session.')
    : status === 'disconnected'
      ? (isArabic
        ? 'إذا كان الفصل مؤقتًا فسنلتقط عودة الجلسة تلقائيًا. استخدم ربط QR فقط إذا لم تعد الحالة بعد قليل.'
        : 'If this disconnect is temporary, the page will detect the restored session automatically. Use QR pairing only if the connection does not return after a short while.')
      : status === 'pending_qr'
        ? (isArabic
          ? 'امسح رمز QR من واتساب على الهاتف لإكمال الربط الأول.'
          : 'Scan the QR code from WhatsApp on your phone to finish the initial pairing.')
        : ''

  const reconnectIssueLabel = useMemo(() => {
    const reason = String(reconnectReason || '').trim()
    if (!reason) return ''

    if (isArabic) {
      return ({
        restoring_saved_session: 'يجري استعادة الجلسة المحفوظة.',
        session_conflict: 'هناك تعارض جلسة مع واتساب.',
        stream_errored: 'حدث خطأ في بث الاتصال مع واتساب.',
        device_removed: 'تمت إزالة الجهاز المرتبط من الهاتف.',
        multidevice_mismatch: 'هناك مشكلة توافق في الأجهزة المرتبطة.',
        connection_failure: 'فشل اتصال مؤقت مع واتساب.',
        restart_required: 'واتساب طلب إعادة تشغيل الجلسة.',
        corrupted_auth_state: 'ملفات الجلسة المحلية تبدو تالفة.',
        qr_expired_before_pairing: 'انتهت صلاحية QR قبل اكتمال الربط.',
        session_disconnected: 'انقطعت جلسة واتساب بشكل غير متوقع.',
      })[reason] || ''
    }

    return ({
      restoring_saved_session: 'Restoring the saved session.',
      session_conflict: 'WhatsApp reported a session conflict.',
      stream_errored: 'The WhatsApp stream errored.',
      device_removed: 'The linked device was removed from the phone.',
      multidevice_mismatch: 'WhatsApp reported a multi-device mismatch.',
      connection_failure: 'Temporary WhatsApp connection failure.',
      restart_required: 'WhatsApp requested a session restart.',
      corrupted_auth_state: 'The local auth state looks corrupted.',
      qr_expired_before_pairing: 'The QR expired before pairing completed.',
      session_disconnected: 'The WhatsApp session disconnected unexpectedly.',
    })[reason] || ''
  }, [isArabic, reconnectReason])

  useEffect(() => {
    checkStatus()
    startPolling()
    fetchContacts(1, 'pending', '')
    fetchGroupContacts(1, 'pending', '')

    return () => {
      stopPolling()
      clearTimeout(searchTimer.current)
      clearTimeout(groupAddRetryTimer.current)
    }
  }, [])

  useEffect(() => {
    groupAddQueueRef.current = groupAddQueue
  }, [groupAddQueue])

  useEffect(() => {
    processingGroupAddQueueRef.current = processingGroupAddQueue
  }, [processingGroupAddQueue])

  useEffect(() => {
    if (groupAddQueue.length > 0) {
      processGroupAddQueue()
    }
  }, [groupAddQueue, status])

  useEffect(() => {
    // When mirror becomes connected, prefetch admin groups for Add dropdown
    if (status === 'connected') {
      fetchAdminGroups().catch((err) => console.error('Error prefetching admin groups', err))
    }
  }, [status])

  useEffect(() => {
    loadStoredGroupOptions(groupContactStatus)
  }, [groupContactStatus])

  useEffect(() => {
    setSelectedGroupContactIds([])
    setBulkAddOpen(false)
  }, [groupContactStatus, groupSearch, selectedGroupFilter, groupContactsMeta.current_page])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      if (activeDirectory === 'groups') {
        fetchGroupContacts(1, groupContactStatus, groupSearch, selectedGroupFilter)
      } else {
        fetchContacts(1, contactStatus, search)
      }
    }, 250)

    return () => clearTimeout(searchTimer.current)
  }, [activeDirectory, contactStatus, search, groupContactStatus, groupSearch, selectedGroupFilter])

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

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const notifyConnectionStateChange = () => {
    window.dispatchEvent(new CustomEvent('whatsapp-mirror-state-changed'))
  }

  const checkStatus = async ({ allowQrModal = false } = {}) => {
    try {
      const data = await whatsappMirrorService.getStatus()
      if (!data) return
      setStatus(data.status || 'disconnected')
      setConnectedPhoneNumber(data.connected_phone_number || null)
      setReconnectReason(data.reconnect_reason || null)
      setReconnectDetail(data.reconnect_detail || null)
      if (data.status === 'pending_qr' && data.qr_base64) {
        setQrCode(data.qr_base64)
        if (allowQrModal || showModal) {
          setShowModal(true)
        }
        setReconnectReason(null)
        setReconnectDetail(null)
      } else if (data.status === 'connected') {
        setShowModal(false)
        setQrCode(null)
        setReconnectReason(null)
        setReconnectDetail(null)
      } else if (data.status === 'reconnect_failed' || data.status === 'disconnected') {
        setShowModal(false)
        setQrCode(null)
      }
      notifyConnectionStateChange()
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

  const fetchGroupContacts = async (page = 1, nextStatus = groupContactStatus, nextSearch = groupSearch, nextGroupId = selectedGroupFilter) => {
    setLoadingGroupContacts(true)
    try {
      const data = await whatsappMirrorService.getGroupContacts({
        page,
        status: nextStatus,
        search: nextSearch,
        group_id: nextGroupId,
        per_page: 20,
      })
      setGroupContacts(Array.isArray(data?.data) ? data.data : [])
      setGroupContactsMeta({
        current_page: data?.current_page || 1,
        last_page: data?.last_page || 1,
        total: data?.total || 0,
      })
    } catch (error) {
      console.error('Error fetching WhatsApp group contacts:', error)
      setGroupContacts([])
      setGroupContactsMeta({ current_page: 1, last_page: 1, total: 0 })
    } finally {
      setLoadingGroupContacts(false)
    }
  }

  const loadStoredGroupOptions = async (nextStatus = groupContactStatus) => {
    setLoadingGroupFilterOptions(true)
    try {
      const data = await whatsappMirrorService.getStoredGroupContactGroups({ status: nextStatus })
      const list = Array.isArray(data) ? data : []
      setGroupFilterOptions(list)
      if (selectedGroupFilter && !list.some((group) => group.id === selectedGroupFilter)) {
        setSelectedGroupFilter('')
      }
    } catch (error) {
      console.error('Error fetching stored group filters:', error)
      setGroupFilterOptions([])
    } finally {
      setLoadingGroupFilterOptions(false)
    }
  }

  const waitForMirrorReadyForGroupAdd = async ({ silent = false, attempts = 8, delayMs = 1500 } = {}) => {
    try {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const data = await whatsappMirrorService.getStatus()
        const nextStatus = data?.status || 'disconnected'
        setStatus(nextStatus)
        setConnectedPhoneNumber(data?.connected_phone_number || null)
        notifyConnectionStateChange()

        if (nextStatus === 'connected') {
          return true
        }

        if (nextStatus === 'reconnecting' || nextStatus === 'disconnected') {
          if (!silent && attempt === 0) {
            emitToast('info', isArabic ? 'واتساب ميرور يعيد الاتصال، سنحاول بعد لحظات...' : 'WhatsApp Mirror is reconnecting, retrying in a moment...')
          }
          await wait(delayMs)
          continue
        }

        if (nextStatus === 'reconnect_failed') {
          if (!silent) {
            emitToast('error', isArabic ? 'فشلت الاستعادة التلقائية. أعد الربط عبر QR للمتابعة.' : 'Automatic reconnect failed. Please pair again via QR to continue.')
          }
          return false
        }

        if (!silent) {
          emitToast('error', isArabic ? 'يرجى إعادة ربط واتساب قبل الإضافة إلى الجروب' : 'Please reconnect WhatsApp Mirror before adding to a group')
        }
        return false
      }

      if (!silent) {
        emitToast('error', isArabic ? 'واتساب ميرور ما زال يعيد الاتصال، حاول مرة أخرى بعد ثوانٍ' : 'WhatsApp Mirror is still reconnecting. Please try again in a few seconds.')
      }
      return false
    } catch (error) {
      if (!silent) {
        emitToast('error', isArabic ? 'تعذر التحقق من اتصال واتساب ميرور' : 'Unable to verify WhatsApp Mirror connection')
      }
      return false
    }
  }

  const isRetryableGroupAddError = (error) => {
    const httpStatus = Number(error?.response?.status || 0)
    const resultStatus = Number(error?.response?.data?.details?.status || 0)
    const message = String(error?.response?.data?.message || error?.message || '').toLowerCase()

    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(httpStatus)) return true
    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(resultStatus)) return true

    return ['reconnect', 'reconnecting', 'conflict', 'timeout', 'temporar', 'session', 'stream errored'].some((token) => message.includes(token))
  }

  const shouldAutoFallbackToInvite = (error) => {
    const fallbackAction = String(error?.response?.data?.fallback_action || '').toLowerCase()
    const reason = String(error?.response?.data?.contact?.group_action_reason || error?.response?.data?.details?.reason || '').toLowerCase()
    return fallbackAction === 'send_invite' || ['privacy_restricted', 'group_admin_only'].includes(reason)
  }

  const sendInviteFallbackForJob = async (job) => {
    const data = await whatsappMirrorService.sendContactInviteToGroup(job.contactId, job.groupId, job.groupName)
    emitToast(
      'success',
      isArabic
        ? `تعذرت الإضافة المباشرة، فتم إرسال رابط الدعوة إلى ${job.contactName || job.contactId} بدلًا من ذلك`
        : `Direct add was blocked, so an invite link was sent to ${job.contactName || `#${job.contactId}`} instead`
    )
    return data
  }

  const enqueueGroupAddJobs = (jobs) => {
    const normalizedJobs = Array.isArray(jobs)
      ? jobs
        .filter((job) => job?.contactId && job?.groupId)
        .map((job) => ({
          key: job.key || `${job.contactId}:${job.groupId}`,
          contactId: job.contactId,
          contactName: job.contactName || '',
          groupId: job.groupId,
          groupName: job.groupName || '',
          attempts: Number(job.attempts || 0),
        }))
      : []

    if (normalizedJobs.length === 0) return 0

    let addedCount = 0
    setGroupAddQueue((prev) => {
      const existingKeys = new Set(prev.map((job) => job.key))
      const freshJobs = normalizedJobs.filter((job) => !existingKeys.has(job.key))
      addedCount = freshJobs.length
      return freshJobs.length > 0 ? [...prev, ...freshJobs] : prev
    })

    return addedCount
  }

  const scheduleGroupAddQueueRetry = (delayMs = 2500) => {
    clearTimeout(groupAddRetryTimer.current)
    groupAddRetryTimer.current = window.setTimeout(() => {
      processGroupAddQueue()
    }, delayMs)
  }

  const processGroupAddQueue = async () => {
    if (processingGroupAddQueueRef.current || groupAddQueueRef.current.length === 0) return

    processingGroupAddQueueRef.current = true
    setProcessingGroupAddQueue(true)

    let succeededThisPass = 0
    let shouldRefreshContacts = false

    try {
      while (groupAddQueueRef.current.length > 0) {
        const currentJob = groupAddQueueRef.current[0]
        const ready = await waitForMirrorReadyForGroupAdd({
          silent: currentJob.attempts > 0,
          attempts: 10,
          delayMs: 1500,
        })

        if (!ready) {
          scheduleGroupAddQueueRetry(3000)
          return
        }

        try {
          const data = await whatsappMirrorService.addContactToGroup(currentJob.contactId, currentJob.groupId, currentJob.groupName)
          const resultStatus = Number(data?.result?.status ?? 200)

          if (Number.isFinite(resultStatus) && resultStatus >= 400) {
            const error = new Error(data?.message || (isArabic ? 'فشلت إضافة العضو' : 'Failed to add contact to group'))
            error.response = { data, status: resultStatus }
            throw error
          }

          succeededThisPass += 1
          shouldRefreshContacts = true
          setGroupAddQueue((prev) => prev.filter((job) => job.key !== currentJob.key))
          emitToast(
            'success',
            isArabic
              ? `تمت إضافة ${currentJob.contactName || currentJob.contactId} إلى ${currentJob.groupName || 'الجروب'}`
              : `Added ${currentJob.contactName || `#${currentJob.contactId}`} to ${currentJob.groupName || 'the group'}`
          )
        } catch (error) {
          if (shouldAutoFallbackToInvite(error)) {
            try {
              await sendInviteFallbackForJob(currentJob)
              succeededThisPass += 1
              shouldRefreshContacts = true
              setGroupAddQueue((prev) => prev.filter((job) => job.key !== currentJob.key))
              continue
            } catch (inviteError) {
              const inviteMessage = inviteError?.response?.data?.message
                || inviteError?.message
                || (isArabic ? 'فشل إرسال رابط الدعوة' : 'Failed to send invite link')
              shouldRefreshContacts = true
              setGroupAddQueue((prev) => prev.filter((job) => job.key !== currentJob.key))
              emitToast('error', inviteMessage)
              continue
            }
          }

          if (isRetryableGroupAddError(error) && currentJob.attempts < 6) {
            setGroupAddQueue((prev) => prev.map((job) => (
              job.key === currentJob.key ? { ...job, attempts: job.attempts + 1 } : job
            )))
            scheduleGroupAddQueueRetry(2500)
            return
          }

          shouldRefreshContacts = true
          setGroupAddQueue((prev) => prev.filter((job) => job.key !== currentJob.key))
          const message = error?.response?.data?.friendly_message
            || error?.response?.data?.message
            || error?.message
            || (isArabic ? 'فشل الإضافة' : 'Failed to add to group')
          emitToast('error', message)
        }
      }
    } finally {
      processingGroupAddQueueRef.current = false
      setProcessingGroupAddQueue(false)

      if (succeededThisPass > 0 || shouldRefreshContacts) {
        fetchGroupContacts(1, groupContactStatus, groupSearch, selectedGroupFilter)
        loadStoredGroupOptions(groupContactStatus)
      }
    }
  }

  const fetchAdminGroups = async (force = false) => {
    if (adminGroups.length > 0 && !force) return adminGroups
    setLoadingAdminGroups(true)
    try {
      const data = await whatsappMirrorService.getAdminGroups()
      let list = Array.isArray(data)
        ? data
        : (Array.isArray(data?.groups) ? data.groups : (Array.isArray(data?.data) ? data.data : []))

      // Fallback: if API returns empty array, try to infer groups from group contacts
      if ((!list || list.length === 0) && status === 'connected') {
        try {
          const gc = await whatsappMirrorService.getGroupContacts({ per_page: 200 })
          const contactsList = Array.isArray(gc?.data) ? gc.data : (Array.isArray(gc) ? gc : [])
          const groupsMap = {}
          contactsList.forEach((c) => {
            const name = c.group_name || c.subject || null
            if (name) groupsMap[name] = { id: c.group_id || c.group_jid || name, name, inferred: true }
          })
          list = Object.values(groupsMap)
        } catch (innerErr) {
          console.error('Fallback: failed to infer groups from group contacts', innerErr)
        }
      }

      setAdminGroups(list || [])
      return list || []
    } catch (error) {
      console.error('Error fetching admin groups:', error)
      setAdminGroups([])
      return []
    } finally {
      setLoadingAdminGroups(false)
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
    }, 4000)
  }

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }

  const startManualPair = async () => {
    setLoading(true)
    try {
      const data = await whatsappMirrorService.pair({ force: true })
      setStatus(data.status || 'pending_qr')
      setConnectedPhoneNumber(data.connected_phone_number || null)
      if (data.qr_base64) {
        setQrCode(data.qr_base64)
        setShowModal(true)
        setShowReconnectChoiceModal(false)
        startPolling()
      } else if (data.status === 'connected') {
        setStatus('connected')
        setShowReconnectChoiceModal(false)
      }
      notifyConnectionStateChange()
    } catch (error) {
      emitToast('error', t('Failed to start pairing. Please ensure the Mirror service is running.'))
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (status === 'reconnecting') {
      setShowReconnectChoiceModal(true)
      return
    }

    await startManualPair()
  }

  const handleDisconnect = async () => {
    if (!window.confirm(t('Are you sure you want to disconnect the Mirror?'))) return
    setLoading(true)
    try {
      await whatsappMirrorService.disconnect()
      setStatus('disconnected')
      setConnectedPhoneNumber(null)
      setQrCode(null)
      setShowModal(false)
      notifyConnectionStateChange()
    } catch (error) {
      emitToast('error', t('Failed to disconnect'))
    } finally {
      setLoading(false)
    }
  }

  const handleSyncGroupContacts = async (groupIds = []) => {
    setSyncingGroupContacts(true)
    try {
      const data = await whatsappMirrorService.syncGroupContacts(groupIds)
      const summary = data?.summary || {}
      emitToast(
        'success',
        isArabic
          ? `تمت مزامنة ${summary.received || 0} عضو من ${summary.groups || 0} جروب`
          : `Synced ${summary.received || 0} members from ${summary.groups || 0} groups`
      )
      fetchGroupContacts(1, groupContactStatus, groupSearch, selectedGroupFilter)
      loadStoredGroupOptions(groupContactStatus)
      setShowSyncPicker(false)
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل سحب أعضاء الجروبات' : 'Failed to sync group contacts')
      emitToast('error', message)
    } finally {
      setSyncingGroupContacts(false)
    }
  }

  const openSyncPicker = async () => {
    if (status !== 'connected') {
      emitToast('error', isArabic ? 'يرجى ربط الجهاز أولاً' : 'Please connect the mirror first')
      return
    }
    setShowSyncPicker(true)
    setSelectedSyncGroupIds([])
    setLoadingSyncableGroups(true)
    try {
      const data = await whatsappMirrorService.getGroups()
      const list = Array.isArray(data)
        ? data
        : (Array.isArray(data?.groups) ? data.groups : (Array.isArray(data?.data) ? data.data : []))
      setSyncableGroups(list || [])
    } catch (error) {
      console.error('Error fetching groups for sync picker:', error)
      setSyncableGroups([])
      emitToast('error', isArabic ? 'فشل تحميل قائمة الجروبات' : 'Failed to load groups')
    } finally {
      setLoadingSyncableGroups(false)
    }
  }

  const toggleSyncGroupSelection = (groupId) => {
    setSelectedSyncGroupIds((prev) => (
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    ))
  }

  const toggleSelectAllSyncGroups = () => {
    setSelectedSyncGroupIds((prev) => (
      prev.length === syncableGroups.length ? [] : syncableGroups.map((g) => g.id)
    ))
  }

  const handleDeleteGroupContact = async (contact) => {
    if (!window.confirm(
      isArabic
        ? `هل أنت متأكد من حذف ${contact.push_name || contact.phone}؟`
        : `Delete ${contact.push_name || contact.phone}?`
    )) return

    setDeletingGroupContactId(contact.id)
    try {
      await whatsappMirrorService.deleteGroupContact(contact.id)
      emitToast('success', isArabic ? 'تم الحذف' : 'Deleted')
      setGroupContacts((prev) => prev.filter((c) => c.id !== contact.id))
      fetchGroupContacts(groupContactsMeta.current_page, groupContactStatus, groupSearch, selectedGroupFilter)
      loadStoredGroupOptions(groupContactStatus)
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل الحذف' : 'Failed to delete')
      emitToast('error', message)
    } finally {
      setDeletingGroupContactId(null)
    }
  }

  const openBulkAddPicker = async () => {
    if (selectedGroupContactIds.length === 0) {
      emitToast('error', isArabic ? 'حدد عضوًا واحدًا على الأقل' : 'Select at least one contact')
      return
    }

    const groups = await fetchAdminGroups(true)
    if (!Array.isArray(groups) || groups.length === 0) {
      emitToast('error', isArabic ? 'لا توجد جروبات متاحة للإضافة' : 'No groups available for adding')
      return
    }
    setBulkAddOpen(true)
  }

  const handleBulkAddToGroup = async (groupId) => {
    setBulkAddingToGroup(true)
    try {
      const targetGroup = adminGroups.find((group) => String(group.id) === String(groupId))
      const selectedContacts = groupContacts.filter((contact) => selectedGroupContactIds.includes(contact.id))
      const queuedCount = enqueueGroupAddJobs(
        selectedContacts.map((contact) => ({
          contactId: contact.id,
          contactName: contact.push_name || contact.phone || `#${contact.id}`,
          groupId,
          groupName: targetGroup?.name || targetGroup?.subject || '',
        }))
      )

      if (queuedCount > 0) {
        emitToast(
          'info',
          isArabic
            ? `تمت إضافة ${queuedCount} عضو إلى طابور الإضافة. سيتم التنفيذ تلقائيًا بمجرد جاهزية واتساب ميرور.`
            : `${queuedCount} contacts were queued and will be added automatically once WhatsApp Mirror is ready.`
        )
      } else {
        emitToast('info', isArabic ? 'العناصر المحددة مضافة بالفعل أو موجودة في الطابور' : 'Selected contacts are already added or queued')
      }

      setBulkAddOpen(false)
      setSelectedGroupContactIds([])
      setOpenGroupDropdownFor(null)
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل إضافة الأعضاء المحددين' : 'Failed to add selected contacts')
      emitToast('error', message)
    } finally {
      setBulkAddingToGroup(false)
    }
  }

  const openConvertModal = async (contact, source = 'unassigned') => {
    setSelectedContact(contact)
    setSelectedContactSource(source)
    setConvertForm({
      ...DEFAULT_CONVERT_FORM,
      name: contact?.push_name || '',
      source: contact?.has_ctwa_attribution ? 'WhatsApp CTWA' : 'WhatsApp Mirror',
      campaign: contact?.ctwa_campaign_name || contact?.ctwa_ad_name || contact?.ctwa_headline || '',
      notes: source === 'groups'
        ? (contact?.group_name
          ? (isArabic ? `تم استيراده من جروب واتساب: ${contact.group_name}` : `Imported from WhatsApp group: ${contact.group_name}`)
          : (isArabic ? 'تم استيراده من أعضاء جروبات واتساب.' : 'Imported from WhatsApp group members.'))
        : (contact?.first_message_body || contact?.last_message_body || ''),
      country: defaultCountry,
    })
    setShowConvertModal(true)
    await fetchInventoryOptions()
  }

  const closeConvertModal = () => {
    setShowConvertModal(false)
    setSelectedContact(null)
    setSelectedContactSource('unassigned')
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

      if (selectedContactSource === 'groups') {
        await whatsappMirrorService.convertGroupContactToLead(selectedContact.id, payload)
      } else {
        await whatsappMirrorService.convertToLead(selectedContact.id, payload)
      }

      emitToast('success', isArabic ? 'تم تحويل الرقم إلى ليد بنجاح' : 'Contact converted to lead')
      closeConvertModal()

      if (selectedContactSource === 'groups') {
        fetchGroupContacts(1, groupContactStatus, groupSearch, selectedGroupFilter)
        loadStoredGroupOptions(groupContactStatus)
      } else {
        fetchContacts(1, contactStatus, search)
      }
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل تحويل الرقم إلى ليد' : 'Failed to convert contact to lead')
      emitToast('error', message)
    } finally {
      setSubmittingConvert(false)
    }
  }

  const currentStatus = activeDirectory === 'groups' ? groupContactStatus : contactStatus
  const currentSearch = activeDirectory === 'groups' ? groupSearch : search
  const currentMeta = activeDirectory === 'groups' ? groupContactsMeta : contactsMeta
  const currentItems = activeDirectory === 'groups' ? groupContacts : contacts
  const currentLoading = activeDirectory === 'groups' ? loadingGroupContacts : loadingContacts
  const showConnectionCard = mode === 'full' || mode === 'connection'
  const showDirectoryCard = mode === 'full' || mode === 'directory'
  const connectionWrapperClass = embedded ? '' : `${connectionCardClass} p-6`
  const connectionHeaderClass = embedded
    ? `flex items-start justify-between gap-4 pb-3 mb-3 ${isLight ? 'border-gray-100' : 'border-slate-800'}`
    : `flex items-center justify-between border-b pb-4 mb-4 ${isLight ? 'border-gray-100' : 'border-slate-800'}`
  const looksLikeLid = (value) => {
    const digits = String(value || '').replace(/\D+/g, '')
    return digits.length >= 14
  }

  const getPersistedGroupActionStatus = (contact) => {
    if (contact?.status === 'converted') return 'converted'
    return contact?.group_action_status || 'pending'
  }

  const getEffectiveGroupActionStatus = (contact) => {
    if (contact?.status === 'converted') return 'converted'
    if (isGroupContactActivelyAdding(contact?.id)) return 'adding'
    if (isGroupContactQueuedForAdd(contact?.id)) return 'queued_for_add'
    return contact?.group_action_status || 'pending'
  }

  const getGroupActionFailureHint = (contact) => {
    if (contact?.group_action_message) return contact.group_action_message

    return contact?.group_action_reason === 'privacy_restricted' || contact?.group_action_reason === 'group_admin_only'
      ? (isArabic
        ? 'لم يتم إضافة الرقم للجروب. السبب المحتمل: إعدادات الخصوصية أو صلاحيات الجروب تمنع الإضافة المباشرة. يمكنك إرسال رابط الدعوة بدلًا من الإضافة المباشرة.'
        : 'Direct add was blocked by privacy settings or group restrictions. You can send an invite link instead.')
      : contact?.group_action_reason === 'invalid_whatsapp_number'
        ? (isArabic
          ? 'لم يتم إضافة الرقم للجروب لأن الرقم غير صالح على واتساب أو لا يدعم الإضافة المباشرة.'
          : 'This number could not be added directly on WhatsApp.')
        : contact?.group_action_reason === 'rate_limited'
          ? (isArabic
            ? 'تعذرت الإضافة الآن بسبب قيود مؤقتة من واتساب. يمكنك المحاولة مرة أخرى أو إرسال رابط الدعوة.'
            : 'WhatsApp temporarily blocked the add request. Retry later or send an invite link.')
          : ''
  }

  const isGroupContactUnresolvedLid = (contact) => {
    const participantJid = String(contact?.participant_jid || '').toLowerCase().trim()
    const lidDigits = String(contact?.lid || participantJid.split('@')[0] || '').replace(/\D+/g, '')
    const phoneDigits = String(contact?.phone || '').replace(/\D+/g, '')
    const resolvedDigits = String(contact?.resolved_phone || '').replace(/\D+/g, '')

    if (looksLikeLid(resolvedDigits) || (lidDigits && resolvedDigits === lidDigits)) {
      return true
    }

    if (looksLikeLid(phoneDigits) || (lidDigits && phoneDigits === lidDigits)) {
      return true
    }

    if (typeof contact?.is_unresolved_lid === 'boolean') {
      return contact.is_unresolved_lid
    }

    return participantJid.endsWith('@lid') || participantJid.includes('@lid')
  }

  const getGroupContactSelectableState = (contact) => {
    const unresolved = isGroupContactUnresolvedLid(contact)
    const converted = contact?.status === 'converted'
    const actionStatus = getEffectiveGroupActionStatus(contact)
    return !unresolved && !converted && !['added', 'adding', 'queued_for_add'].includes(actionStatus)
  }

  const getQueuedGroupAddJobsForContact = (contactId) => (
    groupAddQueue.filter((job) => Number(job.contactId) === Number(contactId))
  )

  const isGroupContactQueuedForAdd = (contactId) => getQueuedGroupAddJobsForContact(contactId).length > 0

  const isGroupContactActivelyAdding = (contactId) => {
    if (!processingGroupAddQueue || groupAddQueue.length === 0) return false
    return Number(groupAddQueue[0]?.contactId) === Number(contactId)
  }

  const handleSendInvite = async (contact) => {
    const targetGroupId = contact?.last_target_group_jid
    const targetGroupName = contact?.last_target_group_name || contact?.group_name || ''

    if (!targetGroupId) {
      emitToast('error', isArabic ? 'اختر جروبًا أولًا عبر الإضافة المباشرة ثم أرسل الدعوة' : 'Try direct add first so we know which group to invite to')
      return
    }

    setAddingToGroup(true)
    try {
      await waitForMirrorReadyForGroupAdd()
      const data = await whatsappMirrorService.sendContactInviteToGroup(contact.id, targetGroupId, targetGroupName)
      emitToast(
        'success',
        isArabic
          ? 'تم إرسال رابط الدعوة لهذا الرقم بنجاح'
          : 'Invite link sent successfully'
      )
      if (data?.contact) {
        fetchGroupContacts(1, groupContactStatus, groupSearch, selectedGroupFilter)
      }
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل إرسال رابط الدعوة' : 'Failed to send invite link')
      emitToast('error', message)
    } finally {
      setAddingToGroup(false)
    }
  }

  const handleSendInviteToSelectedGroup = async (contact, group) => {
    const targetGroupId = group?.id
    const targetGroupName = group?.name || group?.subject || ''

    if (!targetGroupId) {
      emitToast('error', isArabic ? 'اختر جروبًا صالحًا أولًا' : 'Select a valid group first')
      return
    }

    setAddingToGroup(true)
    try {
      const ready = await waitForMirrorReadyForGroupAdd()
      if (!ready) return

      await whatsappMirrorService.sendContactInviteToGroup(contact.id, targetGroupId, targetGroupName)
      setOpenGroupDropdownFor(null)
      emitToast(
        'success',
        isArabic
          ? `تم إرسال رابط الدعوة إلى ${contact.push_name || contact.phone || contact.id} للجروب ${targetGroupName || 'المحدد'}`
          : `Invite link sent to ${contact.push_name || contact.phone || `#${contact.id}`} for ${targetGroupName || 'the selected group'}`
      )
      fetchGroupContacts(1, groupContactStatus, groupSearch, selectedGroupFilter)
    } catch (error) {
      const message = error?.response?.data?.message || (isArabic ? 'فشل إرسال رابط الدعوة' : 'Failed to send invite link')
      emitToast('error', message)
    } finally {
      setAddingToGroup(false)
    }
  }

  const openGroupPicker = async (contactId, action = 'add') => {
    if (openGroupDropdownFor === contactId && groupPickerAction === action) {
      setOpenGroupDropdownFor(null)
      return
    }

    const groups = await fetchAdminGroups(true)
    if (!Array.isArray(groups) || groups.length === 0) {
      emitToast('error', isArabic ? 'لا توجد جروبات متاحة' : 'No groups available')
      return
    }

    setGroupPickerAction(action)
    setOpenGroupDropdownFor(contactId)
  }

  const selectableGroupContacts = groupContacts.filter((contact) => getGroupContactSelectableState(contact))
  const allVisibleGroupContactsSelected = selectableGroupContacts.length > 0
    && selectableGroupContacts.every((contact) => selectedGroupContactIds.includes(contact.id))

  const toggleSelectAllVisibleGroupContacts = () => {
    if (allVisibleGroupContactsSelected) {
      setSelectedGroupContactIds((prev) => prev.filter((id) => !selectableGroupContacts.some((contact) => contact.id === id)))
      return
    }

    setSelectedGroupContactIds((prev) => Array.from(new Set([
      ...prev,
      ...selectableGroupContacts.map((contact) => contact.id),
    ])))
  }

  const toggleGroupContactSelection = (contactId) => {
    setSelectedGroupContactIds((prev) => (
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    ))
  }

  const renderTabButton = (value, label) => (
    <button
      key={value}
      type="button"
      onClick={() => setActiveDirectory(value)}
      role="tab"
      aria-selected={activeDirectory === value}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        activeDirectory === value
          ? (isLight
            ? 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]'
            : 'bg-blue-500 text-slate-950')
          : isLight
            ? 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-800'
            : 'bg-slate-950 text-slate-300 ring-1 ring-slate-800 hover:bg-slate-900 hover:text-slate-100'
      }`}
    >
      {label}
    </button>
  )

  const renderStatusSwitch = (value, setter) => (
    <div className={`inline-flex rounded-2xl p-1 ${isLight ? 'bg-gray-100 ring-1 ring-gray-200' : 'bg-slate-950 ring-1 ring-slate-800'}`}>
      {['pending', 'converted'].map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setter(item)}
          aria-pressed={value === item}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            value === item
              ? (isLight
                ? 'bg-white text-blue-600 shadow-sm'
                : 'bg-blue-500 text-slate-950')
              : isLight
                ? 'text-gray-500 hover:text-gray-800'
                : 'text-slate-300 hover:text-slate-100'
          }`}
        >
          {item === 'pending'
            ? (isArabic ? 'معلق' : 'Pending')
            : (isArabic ? 'تم التحويل' : 'Converted')}
        </button>
      ))}
    </div>
  )

  const renderUnassignedTable = () => (
    <>
      <div className={`grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] ${
        isLight ? 'bg-gray-50 text-gray-500' : 'bg-slate-950 text-slate-400'
      }`}>
        <div className="col-span-3">{isArabic ? 'الاسم' : 'Name'}</div>
        <div className="col-span-2">{isArabic ? 'الرقم' : 'Phone'}</div>
        <div className="col-span-4">{isArabic ? 'رسالة' : 'Message'}</div>
        <div className="col-span-1">{isArabic ? 'العدد' : 'Count'}</div>
        <div className="col-span-2">{isArabic ? 'إجراء' : 'Action'}</div>
      </div>

      {currentLoading ? (
        <div className={`px-4 py-8 text-sm ${mutedTextClass}`}>{isArabic ? 'جاري تحميل الأرقام...' : 'Loading contacts...'}</div>
      ) : currentItems.length === 0 ? (
        <div className={`px-4 py-8 text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد أرقام في هذه الحالة.' : 'No contacts found for this status.'}</div>
      ) : (
        currentItems.map((contact) => (
          <div
            key={contact.id}
            className={`grid grid-cols-12 gap-3 px-4 py-4 text-sm ${
              isLight ? 'border-t border-gray-100 bg-white text-gray-800' : 'border-t border-slate-800 bg-slate-950/30 text-slate-100'
            }`}
          >
            <div className="col-span-3 min-w-0">
              <div className="font-semibold truncate">{contact.push_name || (isArabic ? 'بدون اسم' : 'No name')}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {contact.provider === 'meta_cloud' && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isLight ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' : 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30'
                  }`}>
                    Cloud
                  </span>
                )}
                {contact.provider === 'mirror' && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isLight ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' : 'bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/30'
                  }`}>
                    Mirror
                  </span>
                )}
                {contact.has_ctwa_attribution && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isLight ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
                  }`}>
                    CTWA
                  </span>
                )}
                {contact.status !== 'converted' && (
                  <span className={`text-xs ${mutedTextClass}`}>{isArabic ? 'بانتظار التحويل' : 'Awaiting conversion'}</span>
                )}
              </div>
              {(contact.ctwa_headline || contact.ctwa_campaign_name || contact.channel_name) && (
                <div className={`mt-1 truncate text-xs ${mutedTextClass}`}>
                  {contact.ctwa_campaign_name || contact.ctwa_headline || contact.channel_name}
                </div>
              )}
            </div>
            <div className="col-span-2 break-all">
              {contact.is_unresolved_lid ? (
                <span
                  title={
                    isArabic
                      ? `معرف واتساب داخلي (LID) - الرقم الحقيقي غير معروف: ${contact.phone}`
                      : `Internal WhatsApp ID (LID) - real number unknown: ${contact.phone}`
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                    isLight
                      ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                      : 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
                  }`}
                >
                  ⚠ {isArabic ? 'رقم غير معروف (خصوصية)' : 'Unresolved (privacy)'}
                </span>
              ) : (
                contact.phone
              )}
            </div>
            <div className="col-span-4 min-w-0">
              <div className="truncate">{contact.first_message_body || contact.last_message_body || (isArabic ? 'لا توجد معاينة' : 'No preview')}</div>
              <div className={`mt-1 text-xs ${mutedTextClass}`}>
                {(contact.first_message_at || contact.last_message_at)
                  ? new Date(contact.first_message_at || contact.last_message_at).toLocaleString(isArabic ? 'ar-EG' : 'en-US')
                  : '-'}
              </div>
            </div>
            <div className="col-span-1">{contact.messages_count || 0}</div>
            <div className="col-span-2">
              {contact.status === 'converted' ? (
                <div className={`text-xs ${mutedTextClass}`}>
                  {contact.converted_lead?.name || (isArabic ? 'تم الربط بليد' : 'Linked to lead')}
                </div>
              ) : contact.is_unresolved_lid ? (
                <button
                  type="button"
                  disabled
                  title={
                    isArabic
                      ? 'لا يمكن التحويل قبل معرفة الرقم الحقيقي. انتظر رسالة تانية أو تواصل مع الشخص من رقم تاني.'
                      : "Can't convert until the real phone number is resolved. Wait for another message or contact them another way."
                  }
                  className={`cursor-not-allowed rounded-xl px-3 py-2 text-xs font-semibold ${
                    isLight ? 'bg-gray-200 text-gray-500' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isArabic ? 'بانتظار الرقم' : 'Awaiting number'}
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`convert-unassigned-${contact.id}`}
                  onClick={() => openConvertModal(contact, 'unassigned')}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  {isArabic ? 'تحويل' : 'Convert'}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </>
  )

  const renderGroupContactsTable = () => (
    <>
      <div className={`grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] ${
        isLight ? 'bg-gray-50 text-gray-500' : 'bg-slate-950 text-slate-400'
      }`}>
        <div className="col-span-1 flex items-center">
          <input
            type="checkbox"
            checked={allVisibleGroupContactsSelected}
            onChange={toggleSelectAllVisibleGroupContacts}
            disabled={selectableGroupContacts.length === 0}
          />
        </div>
        <div className="col-span-2">{isArabic ? 'الاسم' : 'Name'}</div>
        <div className="col-span-2">{isArabic ? 'الرقم' : 'Phone'}</div>
        <div className="col-span-3">{isArabic ? 'الجروب' : 'Group'}</div>
        <div className="col-span-1">{isArabic ? 'آخر مزامنة' : 'Synced'}</div>
        <div className="col-span-3">{isArabic ? 'إجراء' : 'Action'}</div>
      </div>

      {currentLoading ? (
        <div className={`px-4 py-8 text-sm ${mutedTextClass}`}>{isArabic ? 'جاري تحميل أعضاء الجروبات...' : 'Loading group contacts...'}</div>
      ) : currentItems.length === 0 ? (
        <div className={`px-4 py-8 text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد بيانات جروبات حتى الآن.' : 'No group contacts found yet.'}</div>
      ) : (
        currentItems.map((contact) => {
          const isUnresolvedGroupContact = isGroupContactUnresolvedLid(contact)
          const isSelectable = getGroupContactSelectableState(contact)
          const isQueuedForAdd = isGroupContactQueuedForAdd(contact.id)
          const isActivelyAdding = isGroupContactActivelyAdding(contact.id)
          const actionStatus = getEffectiveGroupActionStatus(contact)
          const persistedActionStatus = getPersistedGroupActionStatus(contact)
          const actionFailureHint = getGroupActionFailureHint(contact)

          return (
          <div
            key={contact.id}
            className={`grid grid-cols-12 gap-3 px-4 py-4 text-sm ${
              isLight ? 'border-t border-gray-100 bg-white text-gray-800' : 'border-t border-slate-800 bg-slate-950/30 text-slate-100'
            }`}
          >
            <div className="col-span-1 flex items-start pt-1">
              <input
                type="checkbox"
                checked={selectedGroupContactIds.includes(contact.id)}
                onChange={() => toggleGroupContactSelection(contact.id)}
                disabled={!isSelectable}
              />
            </div>
            <div className="col-span-2 min-w-0">
              <div className="font-semibold truncate">{contact.push_name || (isArabic ? 'بدون اسم' : 'No name')}</div>
              {contact.status !== 'converted' && (
                <div className={`mt-1 text-xs ${mutedTextClass}`}>{isArabic ? 'عضو جروب قابل للتحويل' : 'Group member ready for conversion'}</div>
              )}
            </div>
            <div className="col-span-2 break-all">
              {isUnresolvedGroupContact ? (
                <span
                  title={
                    isArabic
                      ? `معرف واتساب داخلي (LID) - الرقم الحقيقي غير معروف: ${contact.phone}`
                      : `Internal WhatsApp ID (LID) - real number unknown: ${contact.phone}`
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                    isLight
                      ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                      : 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
                  }`}
                >
                  ⚠ {isArabic ? 'رقم غير معروف' : 'Unresolved'}
                </span>
              ) : (
                contact.phone
              )}
            </div>
            <div className="col-span-3 min-w-0">
              <div className="truncate font-medium">{contact.group_name || (isArabic ? 'جروب بدون اسم' : 'Unnamed group')}</div>
              <div className={`mt-1 text-xs ${mutedTextClass}`}>{contact.participant_jid || '-'}</div>
            </div>
            <div className="col-span-1 text-xs">
              {contact.last_synced_at ? new Date(contact.last_synced_at).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US') : '-'}
            </div>
            <div className="col-span-3 relative flex items-center gap-2">
              <button
                type="button"
                aria-label={`delete-group-contact-${contact.id}`}
                title={isArabic ? 'حذف' : 'Delete'}
                disabled={deletingGroupContactId === contact.id}
                onClick={() => handleDeleteGroupContact(contact)}
                className={`shrink-0 rounded-xl border px-2.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isLight
                    ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                    : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                }`}
              >
                {deletingGroupContactId === contact.id ? '...' : '🗑'}
              </button>
              {contact.status === 'converted' ? (
                <div className={`text-xs ${mutedTextClass}`}>
                  {contact.converted_lead?.name || (isArabic ? 'تم الربط بليد' : 'Linked to lead')}
                </div>
              ) : isUnresolvedGroupContact ? (
                <button
                  type="button"
                  disabled
                  title={
                    isArabic
                      ? 'لا يمكن التحويل أو الإضافة قبل معرفة الرقم الحقيقي لهذا العضو.'
                      : "Can't convert or add until the real phone number is resolved."
                  }
                  className={`cursor-not-allowed rounded-xl px-3 py-2 text-xs font-semibold ${
                    isLight ? 'bg-gray-200 text-gray-500' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isArabic ? 'بانتظار الرقم' : 'Awaiting number'}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label={`convert-groups-${contact.id}`}
                    onClick={() => openConvertModal(contact, 'groups')}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    {isArabic ? 'تحويل' : 'Convert'}
                  </button>

                  {actionStatus === 'added' ? (
                    <span className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      isLight ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
                    }`}>
                      {isArabic ? 'تمت الإضافة بنجاح' : 'Added'}
                    </span>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={async () => {
                          if (isQueuedForAdd || isActivelyAdding || persistedActionStatus === 'added') {
                            return
                          }
                          await openGroupPicker(contact.id, 'add')
                        }}
                        disabled={addingToGroup || loadingAdminGroups || isQueuedForAdd || isActivelyAdding || persistedActionStatus === 'added'}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          (addingToGroup || loadingAdminGroups || isQueuedForAdd || isActivelyAdding || persistedActionStatus === 'added')
                            ? 'opacity-50 cursor-not-allowed'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {isActivelyAdding
                          ? (isArabic ? 'جارٍ الإضافة...' : 'Adding...')
                          : isQueuedForAdd
                            ? (isArabic ? 'في الطابور' : 'Queued')
                            : persistedActionStatus === 'add_failed'
                              ? (isArabic ? 'إعادة المحاولة' : 'Retry Add')
                              : (isArabic ? 'إضافة للجروب' : 'Add to Group')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await openGroupPicker(contact.id, 'invite')
                        }}
                        disabled={addingToGroup || loadingAdminGroups}
                        className={`mt-2 w-full rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isLight
                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                            : 'border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                        }`}
                      >
                        {isArabic ? 'إرسال دعوة للجروب' : 'Send Invite to Group'}
                      </button>

                      {openGroupDropdownFor === contact.id && (
                        <div className={`absolute bottom-full right-0 mb-2 w-64 rounded-lg shadow-lg z-30 ${isLight ? 'bg-white border' : 'bg-slate-900 border-slate-700'}`}>
                          <div className="p-2">
                            <div className="flex items-center justify-between px-2 pb-2">
                              <div className={`text-sm ${mutedTextClass}`}>
                                {groupPickerAction === 'invite'
                                  ? (isArabic ? 'اختر جروب لإرسال الدعوة' : 'Select a group to send invite')
                                  : (isArabic ? 'اختر جروب للإضافة' : 'Select a group to add')}
                              </div>
                              <button
                                type="button"
                                onClick={() => fetchAdminGroups(true)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {isArabic ? 'إعادة تحميل' : 'Reload'}
                              </button>
                            </div>
                          </div>
                          <div className="max-h-48 overflow-auto">
                            {loadingAdminGroups ? (
                              <div className={`p-3 text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
                            ) : adminGroups.length === 0 ? (
                              <div className={`p-3 text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد جروبات متاحة' : 'No groups available'}</div>
                            ) : (
                              adminGroups.map((g) => (
                                <div
                                  key={g.id}
                                  className={`flex items-center gap-2 px-3 py-2 ${isLight ? 'hover:bg-gray-50' : 'hover:bg-slate-800/70'}`}
                                >
                                  <div className={`min-w-0 flex-1 text-sm ${isLight ? 'text-gray-800' : 'text-slate-200'}`}>
                                    {(() => {
                                      const label = g.name || g.subject || `#${g.id}`
                                      return g.inferred ? `${label} ${isArabic ? '(مستنتج)' : '(inferred)'}` : label
                                    })()}
                                  </div>
                                  {groupPickerAction === 'invite' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleSendInviteToSelectedGroup(contact, g)}
                                      disabled={addingToGroup}
                                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        isLight
                                          ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                          : 'border border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                                      }`}
                                    >
                                      {isArabic ? 'إرسال الدعوة' : 'Send Invite'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        setAddingToGroup(true)
                                        try {
                                          const queuedCount = enqueueGroupAddJobs([{
                                            contactId: contact.id,
                                            contactName: contact.push_name || contact.phone || `#${contact.id}`,
                                            groupId: g.id,
                                            groupName: g.name || g.subject || '',
                                          }])

                                          if (queuedCount > 0) {
                                            emitToast(
                                              'info',
                                              isArabic
                                                ? 'تمت إضافة الطلب إلى الطابور. سننفذه تلقائيًا عند جاهزية الاتصال.'
                                                : 'Add request queued. It will run automatically once the connection is ready.'
                                            )
                                          }
                                          setOpenGroupDropdownFor(null)
                                        } catch (err) {
                                          const msg = err?.response?.data?.message || err?.message || (isArabic ? 'فشل الإضافة' : 'Failed to add to group')
                                          emitToast('error', msg)
                                        } finally {
                                          setAddingToGroup(false)
                                        }
                                      }}
                                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                        isLight
                                          ? 'bg-gray-900 text-white hover:bg-gray-800'
                                          : 'bg-blue-500 text-slate-950 hover:bg-blue-400'
                                      }`}
                                    >
                                      {isArabic ? 'إضافة' : 'Add'}
                                    </button>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {persistedActionStatus === 'add_failed' && contact.last_target_group_jid && (
                    <button
                      type="button"
                      onClick={() => handleSendInvite(contact)}
                      disabled={addingToGroup}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                        isLight ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                      }`}
                    >
                      {isArabic ? 'إرسال الدعوة' : 'Send Invite'}
                    </button>
                  )}

                  {persistedActionStatus === 'invite_sent' && (
                    <span className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      isLight ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' : 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30'
                    }`}>
                      {isArabic ? 'تم إرسال الدعوة' : 'Invite Sent'}
                    </span>
                  )}

                  {persistedActionStatus === 'add_failed' && actionFailureHint && (
                    <div className={`basis-full pt-1 text-[11px] leading-5 ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                      {actionFailureHint}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )
        })
      )}
    </>
  )

  return (
    <div className="space-y-6">
      {showConnectionCard && (
      <div className={connectionWrapperClass}>
        <div className={connectionHeaderClass}>
          <div>
            <h3 className={`${embedded ? 'text-base' : 'text-lg'} font-semibold ${titleTextClass}`}>
              {embedded
                ? (isArabic ? 'الربط المباشر' : t('Direct Link'))
                : (isArabic ? 'واتساب ميرور (ربط مباشر)' : t('WhatsApp Mirror (Direct Link)'))}
            </h3>
            <p className={`${embedded ? 'text-xs' : 'text-sm'} ${mutedTextClass}`}>
              {isArabic
                ? 'اربط رقمك الشخصي عبر مسح رمز QR لتفعيل مزامنة واتساب المباشرة.'
                : t('Link your personal number by scanning a QR for direct WhatsApp mirroring.')}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusBadgeClass}`}>
              {status === 'connected'
                ? t('Connected')
                : status === 'reconnecting'
                  ? (isArabic ? 'إعادة اتصال...' : 'Reconnecting...')
                  : status === 'reconnect_failed'
                    ? (isArabic ? 'فشل إعادة الاتصال' : 'Reconnect Failed')
                  : status === 'pending_qr'
                    ? t('Awaiting QR')
                    : t('Disconnected')}
            </span>
            {status === 'connected' && connectedPhoneNumber && (
              <span className={`text-[11px] font-mono ${mutedTextClass}`} dir="ltr">
                +{connectedPhoneNumber}
              </span>
            )}
          </div>
        </div>

        <div className={`mb-5 rounded-xl border-l-4 ${embedded ? 'p-3 text-xs' : 'p-4 text-sm'} ${
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

        {reconnectHint && (
          <div className={`mb-6 flex items-start justify-between gap-3 rounded-xl border p-4 text-sm ${
            status === 'reconnecting'
              ? (isLight ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-blue-500/30 bg-blue-500/10 text-blue-100')
              : status === 'pending_qr'
                ? (isLight ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-500/30 bg-amber-500/10 text-amber-100')
                : (isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-slate-700 bg-slate-900/70 text-slate-200')
          }`}>
            <div className="space-y-2">
              <p className="leading-6">{reconnectHint}</p>
              {(reconnectDetail || reconnectIssueLabel) && (
                <p className={`text-xs leading-5 ${status === 'reconnect_failed' ? '' : (isLight ? 'text-blue-800' : 'text-blue-200')}`}>
                  <span className="font-semibold">{isArabic ? 'السبب:' : 'Reason:'}</span>{' '}
                  {reconnectDetail || reconnectIssueLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={checkStatus}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                isLight ? 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100' : 'bg-slate-950 text-slate-100 ring-1 ring-slate-700 hover:bg-slate-900'
              }`}
            >
              {isArabic ? 'تحديث الحالة' : 'Refresh status'}
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          {status !== 'connected' ? (
            <button
              onClick={handleConnect}
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
              {loading
                ? (isArabic ? 'جاري التجهيز...' : t('Preparing...'))
                : status === 'reconnecting'
                  ? (isArabic ? 'انتظر الاستعادة أو اربط يدويًا' : 'Wait for restore or pair manually')
                  : status === 'reconnect_failed'
                    ? (isArabic ? 'إعادة الربط عبر QR' : 'Pair again via QR')
                  : (isArabic ? 'ربط رقم جديد عبر QR' : t('Pair new number via QR'))}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
                isLight
                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
              }`}
            >
              {loading ? (isArabic ? 'جاري الفصل...' : t('Disconnecting...')) : (isArabic ? 'فصل الرقم الحالي' : t('Disconnect current number'))}
            </button>
          )}
        </div>
      </div>
      )}

      {showDirectoryCard && (
      <div className={`${connectionCardClass} p-6`}>
        <div className={`${toolbarShellClass} p-4 md:p-5`}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  isLight ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20'
                }`}>
                  {activeDirectory === 'groups'
                    ? (isArabic ? 'أعضاء الجروبات' : 'Group members')
                  : (isArabic ? 'الأرقام غير المحولة (كل القنوات)' : 'Unassigned contacts (all channels)')}
                </div>
                <div className="mt-3 flex  gap-2 lg:flex-row lg:items-center">
                  <h4 className={`text-xl font-semibold tracking-tight ${titleTextClass}`}>{isArabic ? 'جهات واتساب' : 'WhatsApp Contacts'}</h4>
                  <p className={`text-sm ${mutedTextClass}`}>
                {activeDirectory === 'groups'
                  ? (isArabic
                    ? 'اعرض أعضاء الجروبات المستوردة من الرقم المربوط، مع فلترة أسرع وتحويل مباشر إلى ليد.'
                    : 'Showing group members pulled from the linked number. Convert them manually to leads.')
                  : (isArabic
                    ? 'أرقام من Mirror أو Cloud لم تُطابق ليدًا — بما فيها إعلانات Click-to-WhatsApp.'
                    : 'Numbers from Mirror or Cloud not matched to a lead — including Click-to-WhatsApp ads.')}
                  </p>
                </div>
              </div>

              <div className={`${toolbarPanelClass} flex  gap-3 p-3 sm:p-4 xl:min-w-[330px]`}>
                <div className="flex  gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div role="tablist" aria-label={isArabic ? 'التبويبات' : 'Tabs'} className="flex flex-wrap items-center gap-2">
                    {renderTabButton('unassigned', isArabic ? 'أرقام غير محولة' : 'Unassigned')}
                    {renderTabButton('groups', isArabic ? 'أعضاء الجروبات' : 'Group Contacts')}
                  </div>
                  <div className="shrink-0">
                    {activeDirectory === 'groups'
                      ? renderStatusSwitch(groupContactStatus, setGroupContactStatus)
                      : renderStatusSwitch(contactStatus, setContactStatus)}
                  </div>
                </div>

                {activeDirectory === 'groups' && (
                  <div className="flex  gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={openSyncPicker}
                      disabled={syncingGroupContacts || status !== 'connected'}
                      className={syncButtonClass}
                    >
                      {syncingGroupContacts
                        ? (isArabic ? 'جاري السحب...' : 'Syncing...')
                        : (isArabic ? 'سحب أعضاء الجروبات' : 'Sync Group Contacts')}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={openBulkAddPicker}
                        disabled={bulkAddingToGroup || selectedGroupContactIds.length === 0}
                        className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isLight
                            ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            : 'border border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900'
                        }`}
                      >
                        {bulkAddingToGroup
                          ? (isArabic ? 'جاري الإضافة...' : 'Adding...')
                          : (isArabic ? `إضافة المحدد (${selectedGroupContactIds.length})` : `Add Selected (${selectedGroupContactIds.length})`)}
                      </button>

                      {bulkAddOpen && (
                        <div className={`absolute right-0 mt-2 w-72 rounded-lg shadow-lg z-20 ${isLight ? 'bg-white border' : 'bg-slate-900 border-slate-700'}`}>
                          <div className="p-2">
                            <div className="flex items-center justify-between px-2 pb-2">
                              <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'اختر جروبًا لإضافة المحددين' : 'Select a group for selected contacts'}</div>
                              <button
                                type="button"
                                onClick={() => setBulkAddOpen(false)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {isArabic ? 'إغلاق' : 'Close'}
                              </button>
                            </div>
                          </div>
                          <div className="max-h-56 overflow-auto">
                            {loadingAdminGroups ? (
                              <div className={`p-3 text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
                            ) : adminGroups.length === 0 ? (
                              <div className={`p-3 text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد جروبات متاحة' : 'No groups available'}</div>
                            ) : (
                              adminGroups.map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => handleBulkAddToGroup(g.id)}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${isLight ? 'text-gray-800' : 'text-slate-200 hover:bg-slate-800'}`}
                                >
                                  {g.name || g.subject || `#${g.id}`}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={`${toolbarPanelClass} flex  gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between`}>
              {activeDirectory === 'groups' && (
                <div className="flex min-w-0 flex-col gap-2 lg:min-w-[260px]">
                  <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                    {isArabic ? 'فلتر الجروب' : 'Group Filter'}
                  </span>
                  <select
                    value={selectedGroupFilter}
                    onChange={(event) => setSelectedGroupFilter(event.target.value)}
                    className={toolbarSelectClass}
                    disabled={loadingGroupFilterOptions}
                  >
                    <option value="">{isArabic ? 'كل الجروبات' : 'All Groups'}</option>
                    {groupFilterOptions.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name || group.group_jid || `#${group.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                  {isArabic ? 'بحث سريع' : 'Quick Search'}
                </span>
                <input
                  value={currentSearch}
                  onChange={(event) => (
                    activeDirectory === 'groups'
                      ? setGroupSearch(event.target.value)
                      : setSearch(event.target.value)
                  )}
                  placeholder={
                    activeDirectory === 'groups'
                      ? (isArabic ? 'ابحث بالاسم أو الرقم أو اسم الجروب' : 'Search by name, phone, or group')
                      : (isArabic ? 'ابحث بالاسم أو الرقم' : 'Search by name or phone')
                  }
                  className={`${toolbarSelectClass} lg:min-w-[320px]`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-5 rounded-2xl border ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
          <div className="overflow-visible rounded-2xl">
            {activeDirectory === 'groups' ? renderGroupContactsTable() : renderUnassignedTable()}
          </div>
        </div>

        <div className={`mt-4 flex items-center justify-between text-sm ${mutedTextClass}`}>
          <span>{isArabic ? `الإجمالي: ${currentMeta.total}` : `Total: ${currentMeta.total}`}</span>
          {currentMeta.last_page > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentMeta.current_page <= 1}
                onClick={() => (
                  activeDirectory === 'groups'
                    ? fetchGroupContacts(currentMeta.current_page - 1, groupContactStatus, groupSearch, selectedGroupFilter)
                    : fetchContacts(currentMeta.current_page - 1, contactStatus, search)
                )}
                className="rounded-lg border px-3 py-1 disabled:opacity-40"
              >
                {isArabic ? 'السابق' : 'Prev'}
              </button>
              <span>{currentMeta.current_page} / {currentMeta.last_page}</span>
              <button
                type="button"
                disabled={currentMeta.current_page >= currentMeta.last_page}
                onClick={() => (
                  activeDirectory === 'groups'
                    ? fetchGroupContacts(currentMeta.current_page + 1, groupContactStatus, groupSearch, selectedGroupFilter)
                    : fetchContacts(currentMeta.current_page + 1, contactStatus, search)
                )}
                className="rounded-lg border px-3 py-1 disabled:opacity-40"
              >
                {isArabic ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {showReconnectChoiceModal && (
        <div
          className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${modalOverlayClass}`}
          role="dialog"
          aria-modal="true"
        >
          <div className={`${modalShellClass} w-full max-w-lg overflow-hidden rounded-[28px]`}>
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${modalHeaderClass}`}>
              <div className="min-w-0">
                <h4 className={`text-lg font-semibold ${titleTextClass}`}>
                  {isArabic ? 'واتساب ما زال يحاول الاستعادة' : 'WhatsApp is still restoring'}
                </h4>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  {isArabic
                    ? 'تقدر تكمل انتظار الاستعادة التلقائية، أو تبدأ ربطًا يدويًا جديدًا عبر QR الآن.'
                    : 'You can keep waiting for the automatic restore, or start a fresh manual QR pairing now.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReconnectChoiceModal(false)}
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xl leading-none transition ${modalCloseButtonClass}`}
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5">
              <div className={`${modalPanelClass} p-4 text-sm leading-6 ${mutedTextClass}`}>
                {isArabic
                  ? 'لو الجلسة القديمة مازالت صالحة، الانتظار قد يكفي. لو تريد تجاوز الانتظار، اختر الربط اليدوي وسيظهر لك QR جديد.'
                  : 'If the old session is still valid, waiting may be enough. If you want to skip waiting, choose manual pairing and a fresh QR will be generated.'}
              </div>
            </div>

            <div className={`flex items-center justify-between gap-3 border-t px-6 py-5 ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
              <button
                type="button"
                onClick={() => setShowReconnectChoiceModal(false)}
                className={`rounded-xl px-4 py-2 text-sm transition ${modalButtonSecondaryClass}`}
              >
                {isArabic ? 'استمر في الانتظار' : 'Continue waiting'}
              </button>
              <button
                type="button"
                onClick={startManualPair}
                disabled={loading}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${modalButtonPrimaryClass}`}
              >
                {loading
                  ? (isArabic ? 'جاري تجهيز QR...' : 'Preparing QR...')
                  : (isArabic ? 'ربط يدوي عبر QR' : 'Pair manually via QR')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${connectionCardClass} max-w-sm w-full p-6 relative text-center`}>
            <h4 className={`text-md font-bold mb-2 ${titleTextClass}`}>{t('Scan the QR to complete pairing')}</h4>
            <p className={`text-xs mb-4 ${mutedTextClass}`}>{isArabic ? 'افتح واتساب على هاتفك ثم الأجهزة المرتبطة ثم اربط جهازًا.' : t('Open WhatsApp on your phone → Linked Devices → Link a device')}</p>

            <div className={`p-4 rounded-lg inline-block border mb-4 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-950 border-slate-800'}`}>
              {qrCode ? (
                <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto" />
              ) : (
                <div className={`w-56 h-56 flex items-center justify-center text-xs ${mutedTextClass}`}>{t('Loading QR...')}</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-indigo-600 animate-pulse font-medium">{isArabic ? 'بانتظار اتصال الهاتف...' : t('Waiting for phone to connect...')}</span>
              <button
                onClick={() => { setShowModal(false) }}
                className={`mt-2 px-4 py-2 rounded-md text-xs font-medium transition ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSyncPicker && (
        <div
          className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${modalOverlayClass}`}
          role="dialog"
          aria-modal="true"
        >
          <div className={`${modalShellClass} w-full max-w-lg overflow-hidden rounded-[28px]`}>
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${modalHeaderClass}`}>
              <div className="min-w-0">
                <h4 className={`text-lg font-semibold ${titleTextClass}`}>
                  {isArabic ? 'اختر الجروبات للمزامنة' : 'Choose groups to sync'}
                </h4>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  {isArabic
                    ? 'اختر جروب أو أكثر لسحب أعضائها فقط. الإبقاء بدون اختيار يسحب كل الجروبات.'
                    : 'Select one or more groups to sync only their members. Leaving all unchecked will sync every group.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncPicker(false)}
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xl leading-none transition ${modalCloseButtonClass}`}
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5">
              <div className={`${modalPanelClass} p-4`}>
                <div className="flex items-center justify-between pb-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncableGroups.length > 0 && selectedSyncGroupIds.length === syncableGroups.length}
                      onChange={toggleSelectAllSyncGroups}
                      disabled={syncableGroups.length === 0}
                    />
                    <span className={titleTextClass}>{isArabic ? 'تحديد الكل' : 'Select all'}</span>
                  </label>
                  <span className={`text-xs ${mutedTextClass}`}>
                    {isArabic ? `محدد: ${selectedSyncGroupIds.length}` : `Selected: ${selectedSyncGroupIds.length}`}
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-1">
                  {loadingSyncableGroups ? (
                    <div className={`p-3 text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
                  ) : syncableGroups.length === 0 ? (
                    <div className={`p-3 text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد جروبات' : 'No groups found'}</div>
                  ) : (
                    syncableGroups.map((group) => (
                      <label
                        key={group.id}
                        className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm cursor-pointer transition ${
                          isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedSyncGroupIds.includes(group.id)}
                            onChange={() => toggleSyncGroupSelection(group.id)}
                          />
                          <span className={`truncate ${titleTextClass}`}>{group.name || `#${group.id}`}</span>
                        </span>
                        {typeof group.size === 'number' && (
                          <span className={`shrink-0 text-xs ${mutedTextClass}`}>{group.size}</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className={`flex items-center justify-between gap-3 border-t px-6 py-5 ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
              <button
                type="button"
                onClick={() => setShowSyncPicker(false)}
                className={`rounded-xl px-4 py-2 text-sm transition ${modalButtonSecondaryClass}`}
              >
                {isArabic ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={syncingGroupContacts}
                onClick={() => handleSyncGroupContacts(selectedSyncGroupIds)}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${modalButtonPrimaryClass}`}
              >
                {syncingGroupContacts
                  ? (isArabic ? 'جاري السحب...' : 'Syncing...')
                  : selectedSyncGroupIds.length > 0
                    ? (isArabic ? `سحب ${selectedSyncGroupIds.length} جروب` : `Sync ${selectedSyncGroupIds.length} group(s)`)
                    : (isArabic ? 'سحب كل الجروبات' : 'Sync all groups')}
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
                  {selectedContactSource === 'groups'
                    ? (isArabic ? 'عضو جروب' : 'Group Member')
                    : (isArabic ? 'جهة اتصال' : 'Contact')}
                </div>
                <h4 className={`text-lg font-semibold ${titleTextClass}`}>
                  {selectedContactSource === 'groups'
                    ? (isArabic ? 'تحويل عضو الجروب إلى ليد' : 'Convert Group Member to Lead')
                    : (isArabic ? 'تحويل جهة اتصال إلى ليد' : 'Convert Contact to Lead')}
                </h4>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  {selectedContact.push_name || selectedContact.phone}
                  {selectedContactSource === 'groups' && selectedContact.group_name ? ` • ${selectedContact.group_name}` : ''}
                </p>
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
                  {selectedContactSource === 'groups'
                    ? (isArabic ? 'يمكنك ترك ملاحظة عن الجروب أو تعديل الوصف قبل التحويل.' : 'You can keep a note about the group source before conversion.')
                    : (isArabic ? 'تقدر تراجع الرسالة أو تعدلها قبل التحويل.' : 'You can review or edit the imported message before converting.')}
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
                  {isArabic ? 'سيتم إنشاء ليد جديد وربط السجل بهذا الرقم.' : 'A new lead will be created and linked to this contact.'}
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

