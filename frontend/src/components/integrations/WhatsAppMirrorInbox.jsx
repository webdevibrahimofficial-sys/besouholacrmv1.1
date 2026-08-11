import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CheckCheck, Clock, MessageCircle, Paperclip, Phone, RefreshCw, Search, Send, Smile, UserPlus, X } from 'lucide-react'
import { useTheme } from '../../shared/context/ThemeProvider'
import { whatsappMirrorService, whatsappService } from '../../services/whatsappService'
import { AddNewLeadForm } from '../AddNewLeadForm'

const EMPTY_META = { current_page: 1, last_page: 1, total: 0 }
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🙏', 'تمام', 'شكرا']
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
const ATTACHMENT_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar'

function resolveMediaTypeFromFile(file) {
  const mime = String(file?.type || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(value, isArabic) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function getMessageTypeLabel(type, isArabic) {
  const normalized = String(type || '').trim().toLowerCase()
  const labels = {
    image: isArabic ? 'صورة' : 'Photo',
    video: isArabic ? 'فيديو' : 'Video',
    audio: isArabic ? 'رسالة صوتية' : 'Voice message',
    document: isArabic ? 'مستند' : 'Document',
    sticker: isArabic ? 'ملصق' : 'Sticker',
  }
  if (labels[normalized]) return labels[normalized]
  if (!normalized || normalized === 'text') {
    return isArabic ? 'رسالة فارغة' : 'Empty message'
  }
  return isArabic ? `رسالة ${normalized}` : `${normalized} message`
}

function getMessageText(message) {
  return String(message?.body || message?.media?.caption || '').trim()
}

function getMessagePreview(message, isArabic) {
  const body = getMessageText(message)
  if (body) return body
  return getMessageTypeLabel(message?.type, isArabic)
}

function getMessageBubbleContent(message, isArabic) {
  const body = getMessageText(message)
  if (body) return body
  if (resolveBrowserMediaUrl(message)) return ''
  const type = String(message?.media?.type || message?.type || '').trim().toLowerCase()
  if (type && type !== 'text') return getMessageTypeLabel(type, isArabic)
  return isArabic ? 'رسالة فارغة' : 'Empty message'
}

function resolveBrowserMediaUrl(message) {
  const url = String(message?.media?.url || '').trim()
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    if (
      parsed.pathname.includes('/api/files/')
      || parsed.pathname.includes('/api/whatsapp/media/')
    ) {
      return `${parsed.pathname}${parsed.search}`
    }
  } catch {
    return url
  }
  return url
}

function resolveMessageMediaType(message) {
  return String(message?.media?.type || message?.type || message?.media?.mime_type || '')
    .trim()
    .toLowerCase()
}

function isImageMedia(message) {
  const type = resolveMessageMediaType(message)
  return type.startsWith('image') || type === 'sticker'
}

function looksLikeWhatsappLid(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return false
  if (raw.includes('@lid')) return true
  const digits = raw.replace(/\D+/g, '')
  return digits.length >= 14
}

function isMostlyPhoneNumber(value) {
  const raw = String(value || '').trim()
  if (!raw || looksLikeWhatsappLid(raw)) return false
  return /^\+?\d[\d\s\-()]{6,}$/.test(raw)
}

/**
 * Format dialable numbers with an international "+" prefix for display.
 * Leaves LIDs / unknown labels unchanged (returns '').
 */
function formatInternationalPhone(value) {
  const raw = String(value || '').trim()
  if (!raw || looksLikeWhatsappLid(raw)) return ''

  const digits = raw.replace(/\D+/g, '')
  if (!digits || digits.length < 7 || digits.length >= 14) return ''

  if (raw.startsWith('+') && /^\+\d[\d\s\-()]*$/.test(raw)) {
    return `+${digits}`
  }

  // Egypt local / trunk formats → +20...
  if (digits.length === 11 && digits.startsWith('01')) {
    return `+20${digits.slice(1)}`
  }
  if (digits.length === 10 && digits.startsWith('1')) {
    return `+20${digits}`
  }

  // Gulf local → prefer KSA when ambiguous (matches CRM normalize conventions)
  if (digits.length === 10 && digits.startsWith('05')) {
    return `+966${digits.slice(1)}`
  }
  if (digits.length === 9 && digits.startsWith('5')) {
    return `+966${digits}`
  }

  if (
    digits.startsWith('20')
    || digits.startsWith('966')
    || digits.startsWith('971')
  ) {
    return `+${digits}`
  }

  if (digits.startsWith('0') && digits.length > 1) {
    return `+20${digits.slice(1)}`
  }

  return `+${digits}`
}

function getAvatarLabel(title) {
  const raw = String(title || '').trim()
  if (!raw) return '?'
  if (looksLikeWhatsappLid(raw) || isMostlyPhoneNumber(raw)) {
    const digits = raw.replace(/\D+/g, '')
    return digits.slice(-2) || '#'
  }
  return raw.slice(0, 1).toUpperCase()
}

function getOutboundReceiptState(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (['read', 'played', 'played_ack', 'read_ack'].includes(normalized)) return 'read'
  if (['delivered', 'received', 'delivery_ack'].includes(normalized)) return 'delivered'
  if (['failed', 'error', 'unstable'].includes(normalized)) return 'failed'
  if (['sending', 'pending'].includes(normalized)) return 'sending'
  return 'sent'
}

function MessageReceiptTicks({ status, tone = 'onGreen', isArabic = false }) {
  const state = getOutboundReceiptState(status)
  const colorClass = state === 'read'
    ? (tone === 'onGreen' ? 'text-sky-200' : 'text-sky-500')
    : state === 'failed'
      ? 'text-red-400'
      : tone === 'onGreen'
        ? 'text-emerald-100'
        : 'text-current'
  const title = {
    sending: isArabic ? 'جاري الإرسال' : 'Sending',
    sent: isArabic ? 'تم الإرسال' : 'Sent',
    delivered: isArabic ? 'تم التسليم' : 'Delivered',
    read: isArabic ? 'تم الاطلاع' : 'Seen',
    failed: isArabic ? 'فشل الإرسال' : 'Failed',
  }[state]
  const Icon = state === 'sending' ? Clock : (state === 'sent' || state === 'failed' ? Check : CheckCheck)

  return (
    <span className={`inline-flex shrink-0 ${colorClass}`} title={title} aria-label={title}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

function formatUnreadCount(count) {
  const value = Number(count || 0)
  if (value <= 0) return ''
  if (value > 99) return '99+'
  return String(value)
}

function getConversationTitle(conversation, isArabic) {
  const leadName = String(conversation?.lead_name || '').trim()
  if (leadName) return leadName

  const name = String(conversation?.name || '').trim()
  if (name && !looksLikeWhatsappLid(name) && !isMostlyPhoneNumber(name)) return name

  const displayPhone = formatInternationalPhone(conversation?.display_phone)
    || formatInternationalPhone(conversation?.phone)
  if (displayPhone) return displayPhone

  if (conversation?.is_unresolved_lid) {
    return isArabic ? 'رقم غير معروف' : 'Unknown number'
  }

  if (name && !looksLikeWhatsappLid(name)) {
    return formatInternationalPhone(name) || name
  }

  const phone = formatInternationalPhone(conversation?.phone)
  if (phone) return phone

  return isArabic ? 'رقم غير معروف' : 'Unknown number'
}

function getConversationSubtitle(conversation, isArabic) {
  const leadName = String(conversation?.lead_name || '').trim()
  const title = getConversationTitle(conversation, isArabic)
  const realPhone = formatInternationalPhone(conversation?.display_phone)
    || formatInternationalPhone(conversation?.phone)

  if (leadName && realPhone) return realPhone
  if (realPhone && realPhone !== title) return realPhone

  if (conversation?.is_unresolved_lid) {
    return isArabic ? 'بانتظار ربط الرقم الحقيقي' : 'Waiting for real phone mapping'
  }

  return ''
}

function getConversationDialablePhone(conversation) {
  const displayPhone = String(conversation?.display_phone || '').trim()
  if (displayPhone && !looksLikeWhatsappLid(displayPhone)) return displayPhone

  const phone = String(conversation?.phone || '').trim()
  if (phone && !looksLikeWhatsappLid(phone)) return phone

  return ''
}

export default function WhatsAppMirrorInbox() {
  const { i18n } = useTranslation()
  const { resolvedTheme, theme } = useTheme()
  const isArabic = String(i18n.language || '').startsWith('ar')
  const isLight = (resolvedTheme || theme) === 'light'

  const [conversations, setConversations] = useState([])
  const [conversationMeta, setConversationMeta] = useState(EMPTY_META)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [showEmojiBar, setShowEmojiBar] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [resolveInfo, setResolveInfo] = useState('')
  const [resolvingPhones, setResolvingPhones] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [leadFormPrefill, setLeadFormPrefill] = useState(null)
  const [submittingConvert, setSubmittingConvert] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const searchTimer = useRef(null)
  const messagesEndRef = useRef(null)
  const composerRef = useRef(null)
  const fileInputRef = useRef(null)
  const autoResolveTried = useRef(false)
  const selectedPhoneRef = useRef('')
  const attachmentPreviewUrl = useMemo(
    () => (pendingAttachment ? URL.createObjectURL(pendingAttachment) : ''),
    [pendingAttachment]
  )

  const shellClass = isLight
    ? 'border-gray-200 bg-white text-gray-900'
    : 'border-slate-800 bg-slate-950 text-white'
  const subtleClass = isLight ? 'text-gray-500' : 'text-slate-400'
  const panelClass = isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-800 bg-slate-900/60'
  const activeRowClass = isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/30'
  const modalShellClass = isLight
    ? 'bg-white/95 border border-gray-200 shadow-[0_30px_80px_rgba(15,23,42,0.18)]'
    : 'bg-slate-900/96 border border-slate-700 shadow-[0_30px_80px_rgba(2,6,23,0.65)]'
  const modalOverlayClass = isLight
    ? 'bg-white/72 backdrop-blur-md'
    : 'bg-slate-950/78 backdrop-blur-md'
  const modalHeaderClass = isLight
    ? 'border-gray-200 bg-white/88'
    : 'border-slate-800 bg-slate-900/88'
  const modalCloseButtonClass = isLight
    ? 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800'
    : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'
  const titleTextClass = isLight ? 'text-gray-800' : 'text-white'

  const selectedPhone = selectedConversation?.phone || ''
  const selectedTitle = selectedConversation ? getConversationTitle(selectedConversation, isArabic) : ''
  const selectedDisplayPhone = selectedConversation ? getConversationSubtitle(selectedConversation, isArabic) : ''
  const canSendToSelected = Boolean(
    selectedConversation
    && !selectedConversation.is_unresolved_lid
    && !looksLikeWhatsappLid(selectedConversation.display_phone || selectedConversation.phone)
  )
  const canAddAsLead = Boolean(
    selectedConversation
    && !selectedConversation.lead_id
    && !selectedConversation.is_unresolved_lid
    && getConversationDialablePhone(selectedConversation)
  )
  const orderedMessages = useMemo(() => [...messages].reverse(), [messages])
  const orderedConversations = useMemo(() => (
    [...conversations].sort((a, b) => new Date(b?.last_message_at || 0).getTime() - new Date(a?.last_message_at || 0).getTime())
  ), [conversations])

  const loadConversations = async (page = 1, nextSearch = search) => {
    setLoadingConversations(true)
    setError('')
    try {
      const data = await whatsappMirrorService.getConversations({
        page,
        search: nextSearch,
        per_page: 20,
      })
      const rows = Array.isArray(data?.data) ? data.data : []
      setConversations(rows)
      setConversationMeta({
        current_page: data?.current_page || 1,
        last_page: data?.last_page || 1,
        total: data?.total || 0,
      })
      setSelectedConversation((current) => {
        if (current) {
          const refreshed = rows.find((row) => (
            row.phone === current.phone
            || (current.display_phone && row.display_phone === current.display_phone)
            || (current.lid && row.lid === current.lid)
          ))
          if (refreshed) return refreshed
          return current
        }
        return rows[0] || null
      })
    } catch (err) {
      setConversations([])
      setConversationMeta(EMPTY_META)
      setError(err?.response?.data?.message || (isArabic ? 'تعذر تحميل المحادثات' : 'Unable to load conversations'))
    } finally {
      setLoadingConversations(false)
    }
  }

  const loadMessages = async (phone = selectedPhone, { silent = false } = {}) => {
    if (!phone) {
      setMessages([])
      return
    }

    if (!silent) setLoadingMessages(true)
    try {
      const data = await whatsappMirrorService.getConversationMessages({
        phone,
        per_page: 80,
      })
      setMessages(Array.isArray(data?.data) ? data.data : [])
    } catch (err) {
      if (!silent) {
        setMessages([])
        setError(err?.response?.data?.message || (isArabic ? 'تعذر تحميل الرسائل' : 'Unable to load messages'))
      }
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }

  const unresolvedLidCount = useMemo(
    () => orderedConversations.filter((conversation) => conversation?.is_unresolved_lid).length,
    [orderedConversations]
  )
  const totalUnreadCount = useMemo(
    () => orderedConversations.reduce((sum, conversation) => sum + Number(conversation?.unread_count || 0), 0),
    [orderedConversations]
  )

  const markConversationAsRead = async (conversation) => {
    if (!conversation?.phone) return

    const currentUnread = Number(conversation.unread_count || 0)
    if (currentUnread > 0) {
      setConversations((rows) => rows.map((row) => (
        row.phone === conversation.phone ? { ...row, unread_count: 0 } : row
      )))
      setSelectedConversation((current) => (
        current?.phone === conversation.phone ? { ...current, unread_count: 0 } : current
      ))
    }

    try {
      await whatsappMirrorService.markConversationRead({
        phone: conversation.phone,
        lid: conversation.lid,
        display_phone: conversation.display_phone,
      })
    } catch {
      // Keep optimistic UI; next refresh will reconcile unread counts.
    }
  }

  const resolveConversationPhones = async ({ silent = false, lids } = {}) => {
    if (resolvingPhones) return null

    setResolvingPhones(true)
    if (!silent) {
      setError('')
      setResolveInfo('')
    }

    try {
      const data = await whatsappMirrorService.resolveConversationPhones({ lids })
      const result = data?.result || {}
      const resolved = Number(result.resolved || 0)
      const attempted = Number(result.attempted || 0)

      if (!silent) {
        if (result.skipped_reason === 'mirror_not_connected') {
          setError(isArabic
            ? 'Mirror غير متصل. صلّ واتساب Mirror ثم أعد المحاولة.'
            : 'WhatsApp Mirror is not connected. Connect Mirror and try again.')
        } else if (resolved > 0) {
          setResolveInfo(isArabic
            ? `تم جلب ${resolved} رقم حقيقي من أصل ${attempted || resolved}`
            : `Resolved ${resolved} real number(s) of ${attempted || resolved}`)
        } else if (result.skipped_reason === 'nothing_to_resolve') {
          setResolveInfo(isArabic ? 'لا توجد معرفات بحاجة للحل حالياً' : 'No unresolved WhatsApp IDs right now')
        } else {
          setResolveInfo(isArabic
            ? 'واتساب لم يُرجع أرقاماً لهذه المحادثات الآن. حاول لاحقاً.'
            : 'WhatsApp did not return real numbers for these chats yet. Try again later.')
        }
      }

      await loadConversations(conversationMeta.current_page, search)
      return data
    } catch (err) {
      if (!silent) {
        const payload = err?.response?.data
        if (payload?.result?.skipped_reason === 'mirror_not_connected' || payload?.message) {
          setError(payload?.message || (isArabic
            ? 'Mirror غير متصل. صلّ واتساب Mirror ثم أعد المحاولة.'
            : 'WhatsApp Mirror is not connected. Connect Mirror and try again.'))
        } else {
          setError(payload?.message || (isArabic ? 'تعذر جلب الأرقام الحقيقية' : 'Unable to resolve real phone numbers'))
        }
      }
      return null
    } finally {
      setResolvingPhones(false)
    }
  }

  const appendComposerText = (value) => {
    setComposerText((current) => `${current}${current ? ' ' : ''}${value}`)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const clearPendingAttachment = () => {
    setPendingAttachment(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleAttachmentSelected = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(isArabic ? 'حجم المرفق أكبر من 50 ميجابايت' : 'Attachment is larger than 50 MB')
      event.target.value = ''
      return
    }

    setError('')
    setPendingAttachment(file)
  }

  const openConvertModal = () => {
    if (!selectedConversation || !canAddAsLead) return

    const dialablePhone = getConversationDialablePhone(selectedConversation)
    const internationalPhone = formatInternationalPhone(dialablePhone) || dialablePhone
    const preview = getMessagePreview(selectedConversation.last_message, isArabic)
    const suggestedName = String(selectedConversation.name || '').trim()
    const nameLooksLikePhone = !suggestedName
      || looksLikeWhatsappLid(suggestedName)
      || isMostlyPhoneNumber(suggestedName)

    setLeadFormPrefill({
      name: nameLooksLikePhone ? '' : suggestedName,
      phone: internationalPhone,
      source: 'WhatsApp Mirror',
      notes: preview || '',
    })
    setShowConvertModal(true)
  }

  const closeConvertModal = () => {
    setShowConvertModal(false)
    setLeadFormPrefill(null)
    setSubmittingConvert(false)
  }

  const handleLeadFormSuccess = async ({ lead, response } = {}) => {
    if (!selectedConversation || submittingConvert) return

    const dialablePhone = getConversationDialablePhone(selectedConversation)
    if (!dialablePhone) {
      setError(isArabic
        ? 'لا يمكن ربط الليد قبل توفر الرقم الحقيقي'
        : 'Cannot link the lead until the real phone number is available')
      return
    }

    const leadPayload = lead?.data && typeof lead.data === 'object' ? lead.data : lead
    const leadId = Number(
      leadPayload?.id
      || response?.id
      || response?.data?.id
      || 0
    )
    const leadName = String(
      leadPayload?.name
      || response?.name
      || response?.data?.name
      || leadFormPrefill?.name
      || ''
    ).trim() || (isArabic ? 'ليد واتساب' : 'WhatsApp Lead')

    setSubmittingConvert(true)
    setError('')

    try {
      // Link conversation messages to the newly created lead.
      await whatsappMirrorService.createConversationLead({
        phone: selectedConversation.phone,
        display_phone: dialablePhone,
        lid: selectedConversation.lid || undefined,
        ...(leadId > 0 ? { lead_id: leadId } : {}),
        name: leadName,
        source: 'WhatsApp Mirror',
      })
      closeConvertModal()
      setResolveInfo(isArabic ? 'تم إنشاء الليد وربطه بالمحادثة' : 'Lead created and linked to this conversation')
      await loadConversations(conversationMeta.current_page, search)
    } catch (err) {
      const message = err?.response?.data?.message
        || err?.response?.data?.errors?.name?.[0]
        || (isArabic ? 'تم إنشاء الليد لكن تعذر ربطه بالمحادثة' : 'Lead was created but could not be linked to this conversation')
      setError(message)
      await loadConversations(conversationMeta.current_page, search)
    } finally {
      setSubmittingConvert(false)
    }
  }

  const handleSendMessage = async () => {
    const body = composerText.trim()
    if ((!body && !pendingAttachment) || !selectedConversation || sendingMessage) return

    const dialablePhone = getConversationDialablePhone(selectedConversation)
    const recipientNumber = dialablePhone.replace(/\D+/g, '')

    if (!recipientNumber || looksLikeWhatsappLid(dialablePhone) || selectedConversation.is_unresolved_lid) {
      setError(isArabic
        ? 'لا يمكن الإرسال قبل توفر الرقم الحقيقي لهذه المحادثة'
        : 'Cannot send until the real phone number is available for this conversation')
      return
    }

    setSendingMessage(true)
    setError('')

    const attachment = pendingAttachment
    const mediaType = attachment ? resolveMediaTypeFromFile(attachment) : 'text'
    const optimisticId = `local-${Date.now()}`
    const localPreviewUrl = attachment ? URL.createObjectURL(attachment) : ''
    const optimisticMessage = {
      id: optimisticId,
      body,
      direction: 'outbound',
      status: 'sending',
      type: mediaType,
      from: '',
      to: recipientNumber,
      timestamp: new Date().toISOString(),
      media: attachment
        ? {
            url: localPreviewUrl || undefined,
            filename: attachment.name,
            type: mediaType,
            mime_type: attachment.type,
            caption: body || null,
          }
        : null,
    }

    setMessages((current) => [optimisticMessage, ...current])
    setComposerText('')
    setShowEmojiBar(false)
    clearPendingAttachment()

    try {
      if (attachment) {
        await whatsappService.sendWhatsappMedia({
          recipient_number: recipientNumber,
          attachment,
          caption: body,
          lead_id: selectedConversation.lead_id,
        })
      } else {
        await whatsappService.sendWhatsappText({
          recipient_number: recipientNumber,
          message_body: body,
          lead_id: selectedConversation.lead_id,
        })
      }
      await Promise.all([
        loadMessages(selectedConversation.phone),
        loadConversations(conversationMeta.current_page, search),
      ])
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId))
      setComposerText(body)
      if (attachment) setPendingAttachment(attachment)
      setError(
        err?.response?.data?.message
        || err?.response?.data?.errors?.attachment?.[0]
        || (isArabic ? 'تعذر إرسال الرسالة أو المرفق' : 'Unable to send message or attachment')
      )
    } finally {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
      setSendingMessage(false)
    }
  }

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    handleSendMessage()
  }

  useEffect(() => {
    if (!showConvertModal) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showConvertModal])

  useEffect(() => {
    selectedPhoneRef.current = selectedPhone
  }, [selectedPhone])

  useEffect(() => {
    loadConversations(1, '')
    const interval = window.setInterval(() => {
      loadConversations(conversationMeta.current_page, search)
      if (selectedPhoneRef.current) {
        loadMessages(selectedPhoneRef.current, { silent: true })
      }
    }, 15000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (autoResolveTried.current || loadingConversations || resolvingPhones) return

    const unresolvedLids = orderedConversations
      .filter((conversation) => conversation?.is_unresolved_lid)
      .map((conversation) => conversation.lid || conversation.phone)
      .filter(Boolean)

    if (unresolvedLids.length === 0) return

    autoResolveTried.current = true
    resolveConversationPhones({ silent: true, lids: unresolvedLids })
  }, [orderedConversations, loadingConversations, resolvingPhones])

  useEffect(() => {
    loadMessages(selectedPhone)
    setComposerText('')
    setShowEmojiBar(false)
    clearPendingAttachment()
    if (selectedConversation?.phone) {
      markConversationAsRead(selectedConversation)
    }
  }, [selectedPhone])

  useEffect(() => {
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => loadConversations(1, search), 250)
    return () => window.clearTimeout(searchTimer.current)
  }, [search])

  useEffect(() => {
    if (loadingMessages) return

    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [orderedMessages.length, selectedPhone, loadingMessages])

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl)
    }
  }, [attachmentPreviewUrl])

  return (
    <div className={`mb-6 overflow-hidden rounded-2xl border ${shellClass}`}>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{isArabic ? 'كل محادثات واتساب' : 'All WhatsApp Conversations'}</h2>
          <p className={`text-sm ${subtleClass}`}>
            {isArabic ? `${conversationMeta.total} محادثة` : `${conversationMeta.total} conversations`}
            {totalUnreadCount > 0
              ? (isArabic ? ` · ${formatUnreadCount(totalUnreadCount)} غير مقروء` : ` · ${formatUnreadCount(totalUnreadCount)} unread`)
              : ''}
            {unresolvedLidCount > 0
              ? (isArabic ? ` · ${unresolvedLidCount} بدون رقم حقيقي` : ` · ${unresolvedLidCount} missing real numbers`)
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => resolveConversationPhones()}
            disabled={resolvingPhones}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
            }`}
            title={isArabic ? 'جلب الأرقام الحقيقية' : 'Resolve real phone numbers'}
          >
            <Phone className={`h-4 w-4 ${resolvingPhones ? 'animate-pulse' : ''}`} />
            <span>{isArabic ? (resolvingPhones ? 'جاري الجلب...' : 'جلب الأرقام') : (resolvingPhones ? 'Resolving...' : 'Resolve numbers')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              loadConversations(conversationMeta.current_page, search)
              loadMessages(selectedPhone)
            }}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${isLight ? 'border-gray-200 hover:bg-gray-100' : 'border-slate-700 hover:bg-slate-800'}`}
            title={isArabic ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className={`h-4 w-4 ${loadingConversations || loadingMessages || resolvingPhones ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {resolveInfo && (
        <div className={`border-b px-4 py-2 text-sm ${isLight ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}>
          {resolveInfo}
        </div>
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid h-[calc(100vh-24rem)] min-h-[460px] max-h-[600px] grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className={`flex min-h-0 flex-col border-b lg:border-b-0 ${isArabic ? 'lg:border-l' : 'lg:border-r'} ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
          <div className="shrink-0 p-3">
            <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-950'}`}>
              <Search className={`h-4 w-4 ${subtleClass}`} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={isArabic ? 'بحث بالاسم أو الرقم' : 'Search name or phone'}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loadingConversations && orderedConversations.length === 0 ? (
              <div className={`p-4 text-sm ${subtleClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
            ) : orderedConversations.length === 0 ? (
              <div className={`p-4 text-sm ${subtleClass}`}>{isArabic ? 'لا توجد محادثات' : 'No conversations found'}</div>
            ) : (
              orderedConversations.map((conversation) => {
                const isActive = conversation.phone === selectedPhone
                const rowTitle = getConversationTitle(conversation, isArabic)
                const rowDisplayPhone = getConversationSubtitle(conversation, isArabic)
                const isLead = Boolean(conversation.lead_id && conversation.lead_name)
                const unreadCount = Number(conversation.unread_count || 0)
                const hasUnread = unreadCount > 0
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversation(conversation)}
                    className={`mb-2 grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-xl border px-3 py-3 text-start transition ${
                      isActive ? activeRowClass : isLight ? 'border-transparent hover:bg-gray-50' : 'border-transparent hover:bg-slate-900'
                    }`}
                  >
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">
                      {getAvatarLabel(rowTitle)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-start justify-between gap-3">
                        <span className={`min-w-0 truncate text-sm ${hasUnread ? 'font-bold' : 'font-semibold'}`}>
                          {rowTitle}
                          {isLead ? (
                            <span className={`ms-2 align-middle text-[10px] font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                              {isArabic ? 'ليد' : 'Lead'}
                            </span>
                          ) : null}
                        </span>
                        <span className={`shrink-0 text-[11px] ${hasUnread ? 'font-semibold text-emerald-600' : subtleClass}`}>
                          {formatTime(conversation.last_message_at, isArabic)}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-3">
                        <span className={`min-w-0 flex items-center gap-1 truncate text-xs ${hasUnread ? (isLight ? 'font-semibold text-gray-800' : 'font-semibold text-white') : subtleClass}`}>
                          {conversation.last_message?.direction === 'outbound' ? (
                            <MessageReceiptTicks
                              status={conversation.last_message?.status}
                              tone="onList"
                              isArabic={isArabic}
                            />
                          ) : null}
                          <span className="truncate">{getMessagePreview(conversation.last_message, isArabic)}</span>
                        </span>
                        {hasUnread ? (
                          <span className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold leading-none text-white">
                            {formatUnreadCount(unreadCount)}
                          </span>
                        ) : null}
                      </span>
                      <span className={`mt-2 block text-[11px] ${subtleClass}`}>
                        {conversation.total_messages} {isArabic ? 'رسالة' : 'messages'}{rowDisplayPhone ? ` · ${rowDisplayPhone}` : ''}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {conversationMeta.last_page > 1 && (
            <div className={`flex shrink-0 items-center justify-between border-t px-3 py-2 text-xs ${subtleClass} ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
              <button
                type="button"
                disabled={conversationMeta.current_page <= 1}
                onClick={() => loadConversations(conversationMeta.current_page - 1, search)}
                className="rounded-md border px-2 py-1 disabled:opacity-40"
              >
                {isArabic ? 'السابق' : 'Prev'}
              </button>
              <span>{conversationMeta.current_page} / {conversationMeta.last_page}</span>
              <button
                type="button"
                disabled={conversationMeta.current_page >= conversationMeta.last_page}
                onClick={() => loadConversations(conversationMeta.current_page + 1, search)}
                className="rounded-md border px-2 py-1 disabled:opacity-40"
              >
                {isArabic ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </aside>

        <section className={`flex min-h-0 flex-col ${panelClass}`}>
          {selectedConversation ? (
            <>
              <div className={`border-b px-4 py-3 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {selectedTitle}
                      {selectedConversation.lead_id && selectedConversation.lead_name ? (
                        <span className={`ms-2 text-xs font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                          {isArabic ? 'ليد' : 'Lead'}
                        </span>
                      ) : null}
                    </div>
                    {selectedDisplayPhone ? (
                      <div className={`text-xs ${subtleClass}`}>{selectedDisplayPhone}</div>
                    ) : null}
                  </div>
                  {canAddAsLead ? (
                    <button
                      type="button"
                      onClick={openConvertModal}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        isLight
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                      }`}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>{isArabic ? 'إضافة كليد' : 'Add as Lead'}</span>
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {loadingMessages ? (
                  <div className={`text-sm ${subtleClass}`}>{isArabic ? 'جاري تحميل الرسائل...' : 'Loading messages...'}</div>
                ) : orderedMessages.length === 0 ? (
                  <div className={`flex h-full flex-col items-center justify-center gap-2 text-sm ${subtleClass}`}>
                    <MessageCircle className="h-8 w-8" />
                    <span>{isArabic ? 'لا توجد رسائل لهذه المحادثة' : 'No messages in this conversation'}</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orderedMessages.map((message) => {
                      const isOutbound = message.direction === 'outbound'
                      const mediaUrl = resolveBrowserMediaUrl(message)
                      const mediaType = resolveMessageMediaType(message)
                      const bubbleText = getMessageBubbleContent(message, isArabic)
                      return (
                        <div key={message.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                            isOutbound
                              ? 'bg-emerald-600 text-white'
                              : isLight ? 'bg-white text-gray-900' : 'bg-slate-800 text-white'
                          }`}>
                            {mediaUrl && isImageMedia(message) ? (
                              <a href={mediaUrl} target="_blank" rel="noreferrer" className="mb-2 block">
                                <img
                                  src={mediaUrl}
                                  alt={message.media?.filename || (isArabic ? 'صورة' : 'Image')}
                                  className="max-h-52 max-w-full rounded-xl object-cover"
                                />
                              </a>
                            ) : mediaUrl && mediaType.startsWith('video') ? (
                              <video controls className="mb-2 max-h-52 w-full rounded-xl bg-black">
                                <source src={mediaUrl} type={message.media?.mime_type || 'video/mp4'} />
                              </video>
                            ) : mediaUrl && mediaType.startsWith('audio') ? (
                              <audio controls className="mb-2 w-full">
                                <source src={mediaUrl} type={message.media?.mime_type || 'audio/mpeg'} />
                              </audio>
                            ) : mediaUrl ? (
                              <a href={mediaUrl} target="_blank" rel="noreferrer" className="mb-1 block underline">
                                {message.media?.filename || message.media?.type || (isArabic ? 'ملف مرفق' : 'Attachment')}
                              </a>
                            ) : isImageMedia(message) ? (
                              <div className="mb-1 italic opacity-80">
                                {isArabic ? 'صورة (تعذر التحميل)' : 'Photo (unavailable)'}
                              </div>
                            ) : null}
                            {bubbleText ? (
                            <div className={`whitespace-pre-wrap break-words ${!getMessageText(message) ? 'italic opacity-70' : ''}`}>
                              {bubbleText}
                            </div>
                            ) : null}
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isOutbound ? 'text-emerald-50' : subtleClass}`}>
                              <span>{formatTime(message.timestamp, isArabic)}</span>
                              {isOutbound ? <MessageReceiptTicks status={message.status} isArabic={isArabic} /> : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} className="h-px" />
                  </div>
                )}
              </div>
              <div className={`border-t p-3 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/80'}`}>
                {!canSendToSelected ? (
                  <div className={`mb-2 text-xs ${subtleClass}`}>
                    {isArabic
                      ? 'هذه المحادثة ما زالت بمعرف واتساب داخلي. سيظهر الرقم الحقيقي تلقائياً عند توفر الربط.'
                      : 'This conversation still uses an internal WhatsApp ID. The real number will appear once mapping is available.'}
                  </div>
                ) : null}
                {showEmojiBar && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => appendComposerText(emoji)}
                        disabled={!canSendToSelected}
                        className={`rounded-full border px-3 py-1 text-sm transition ${isLight ? 'border-gray-200 bg-gray-50 hover:bg-gray-100' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'} disabled:opacity-50`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {pendingAttachment ? (
                  <div className={`mb-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{pendingAttachment.name}</div>
                      <div className={`text-[11px] ${subtleClass}`}>{formatFileSize(pendingAttachment.size)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {pendingAttachment.type.startsWith('image/') && attachmentPreviewUrl ? (
                        <img src={attachmentPreviewUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : null}
                      <button
                        type="button"
                        onClick={clearPendingAttachment}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isLight ? 'text-gray-500 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-800'}`}
                        title={isArabic ? 'إزالة المرفق' : 'Remove attachment'}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={handleAttachmentSelected}
                />
                <div className={`flex items-end gap-2 rounded-2xl border px-3 py-2 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-900'}`}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canSendToSelected || sendingMessage}
                    className={`mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${isLight ? 'text-gray-500 hover:bg-gray-200' : 'text-slate-300 hover:bg-slate-800'} disabled:cursor-not-allowed disabled:opacity-50`}
                    title={isArabic ? 'إرفاق ملف' : 'Attach file'}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmojiBar((current) => !current)}
                    disabled={!canSendToSelected}
                    className={`mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${isLight ? 'text-gray-500 hover:bg-gray-200' : 'text-slate-300 hover:bg-slate-800'} disabled:opacity-50`}
                    title={isArabic ? 'إيموجي' : 'Emoji'}
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  <textarea
                    ref={composerRef}
                    rows={1}
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={!canSendToSelected}
                    placeholder={isArabic ? 'اكتب رسالة' : 'Type a message'}
                    className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-sm outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!canSendToSelected || sendingMessage || (!composerText.trim() && !pendingAttachment)}
                    className="mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    title={isArabic ? 'إرسال' : 'Send'}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={`flex flex-1 flex-col items-center justify-center gap-2 text-sm ${subtleClass}`}>
              <MessageCircle className="h-9 w-9" />
              <span>{isArabic ? 'اختر محادثة لعرض الرسائل' : 'Choose a conversation to view messages'}</span>
            </div>
          )}
        </section>
      </div>

      {showConvertModal && selectedConversation && leadFormPrefill && (
        <div
          className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${modalOverlayClass}`}
          role="dialog"
          aria-modal="true"
        >
          <div className={`${modalShellClass} flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px]`}>
            <div className={`flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5 ${modalHeaderClass}`}>
              <div className="min-w-0">
                <div className={`mb-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  isLight ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
                }`}>
                  {isArabic ? 'محادثة واتساب' : 'WhatsApp Conversation'}
                </div>
                <h4 className={`text-lg font-semibold ${titleTextClass}`}>
                  {isArabic ? 'إضافة كليد جديد' : 'Add as New Lead'}
                </h4>
                <p className={`mt-2 text-sm ${subtleClass}`}>
                  {formatInternationalPhone(getConversationDialablePhone(selectedConversation))
                    || getConversationDialablePhone(selectedConversation)
                    || selectedTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={closeConvertModal}
                disabled={submittingConvert}
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-xl leading-none transition disabled:opacity-50 ${modalCloseButtonClass}`}
              >
                ×
              </button>
            </div>

            <div className={`relative min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 ${submittingConvert ? 'pointer-events-none opacity-70' : ''}`}>
              {submittingConvert && (
                <div className={`sticky top-0 z-20 mb-3 rounded-xl px-3 py-2 text-sm ${
                  isLight ? 'bg-emerald-50 text-emerald-800' : 'bg-emerald-500/10 text-emerald-200'
                }`}>
                  {isArabic ? 'جاري ربط الليد بالمحادثة...' : 'Linking lead to conversation...'}
                </div>
              )}
              <AddNewLeadForm
                key={`${selectedConversation.phone}-${leadFormPrefill.phone || ''}`}
                embedded
                lockPhone
                allowExtraLeads={false}
                initialPrefill={leadFormPrefill}
                onCancel={closeConvertModal}
                onSuccess={handleLeadFormSuccess}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
