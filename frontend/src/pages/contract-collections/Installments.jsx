import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTheme } from '@shared/context/ThemeProvider'
import { formatCrmDate } from '@shared/utils/crmDateTime'
import { api } from '@utils/api'
import SearchableSelect from '@components/SearchableSelect'
import { Ban, ChevronDown, ChevronUp, CreditCard, FileText, Filter, Pencil, RotateCcw, Search, X, XCircle } from 'lucide-react'
import { FaChevronLeft, FaChevronRight, FaFileImport } from 'react-icons/fa'
import CcInstallmentsImportModal from '@components/CcInstallmentsImportModal'
import DateRangePicker from '@shared/components/DateRangePicker'

const safeStr = (v) => (v === null || v === undefined ? '' : String(v))

const formatCustomerId = (id) => {
  const n = Number(id)
  if (!Number.isFinite(n)) return safeStr(id)
  return `C-${String(n).padStart(4, '0')}`
}

const formatMoney = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const formatDateOnly = (value) => {
  const s = safeStr(value).trim()
  if (!s) return ''
  // Most API dates are ISO strings, we only want the date portion for readability.
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  try {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {
  }
  return s
}

const normalizePaymentFromAllocation = (allocation) => {
  if (!allocation || typeof allocation !== 'object') return null

  // Preferred: backend eager-loaded relation.
  const direct = allocation?.payment || allocation?.cc_payment || allocation?.payment_details || null
  if (direct && typeof direct === 'object') return direct

  // Fallback: sometimes APIs flatten payment fields into the allocation.
  const paymentId =
    allocation?.payment_id ??
    allocation?.paymentId ??
    allocation?.cc_payment_id ??
    allocation?.ccPaymentId ??
    null

  if (!paymentId) return null

  return {
    id: paymentId,
    payment_date: allocation?.payment_date ?? allocation?.paid_at ?? allocation?.created_at ?? null,
    payment_method: allocation?.payment_method ?? allocation?.method ?? null,
    reference_number: allocation?.reference_number ?? allocation?.reference ?? allocation?.check_number ?? null,
    status: allocation?.payment_status ?? allocation?.status ?? null,
  }
}

const pickLatestPayment = (allocations) => {
  const list = Array.isArray(allocations) ? allocations : []
  const withPayment = list
    .map((a) => ({ allocation: a, payment: normalizePaymentFromAllocation(a) }))
    .filter((x) => x.payment)

  if (withPayment.length === 0) return null

  withPayment.sort((a, b) => {
    const ad = a.payment?.payment_date ? new Date(a.payment.payment_date).getTime() : 0
    const bd = b.payment?.payment_date ? new Date(b.payment.payment_date).getTime() : 0
    if (ad !== bd) return bd - ad
    return Number(b.payment?.id || 0) - Number(a.payment?.id || 0)
  })
  return withPayment[0].payment
}

function ModalShell({ open, title, onClose, children, widthClass = 'max-w-lg', textColorClass = '' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[20000]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="absolute inset-0" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`card w-full ${widthClass} bg-[var(--content-bg)] rounded-2xl shadow-2xl border border-[var(--panel-border)] overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--panel-border)]">
            <div className="min-w-0">
              <div className={`text-base font-semibold truncate ${textColorClass}`}>{title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              aria-label="Close"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function ContractCollectionsInstallments() {
  const { i18n } = useTranslation()
  const { company, crmSettings } = useAppState()
  const { isLight } = useTheme()

  const isArabic = i18n.language === 'ar'
  const isRTL = i18n.dir(i18n.language || 'en') === 'rtl'
  const companyTypeLower = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyTypeLower.includes('real')

  const title = useMemo(() => (isArabic ? 'الأقساط' : 'Installments'), [isArabic])
  const textColorClass = isLight ? 'text-black' : 'text-white'
  const mutedTextClass = textColorClass

  const formatDisplayDate = useCallback(
    (value) => {
      const raw = safeStr(value).trim()
      if (!raw) return ''
      return formatCrmDate(raw, { crmSettings, language: i18n.language })
    },
    [crmSettings, i18n.language]
  )

  const [q, setQ] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)

  const [projects, setProjects] = useState([])

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [perPage, setPerPage] = useState(50)
  const [summary, setSummary] = useState({
    total_installments: 0,
    total_amount: 0,
    total_paid_amount: 0,
    total_unpaid_amount: 0,
    by_status: {},
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [editDueDate, setEditDueDate] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const [payOpen, setPayOpen] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payRow, setPayRow] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payDate, setPayDate] = useState('')
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('')

  const [actionOpen, setActionOpen] = useState(false)
  const [actionSaving, setActionSaving] = useState(false)
  const [actionType, setActionType] = useState('void') // void | reject | unpaid
  const [actionRow, setActionRow] = useState(null)
  const [actionPaymentId, setActionPaymentId] = useState(null)
  const [actionReason, setActionReason] = useState('')

  const [importOpen, setImportOpen] = useState(false)

  const receiptIframeRef = useRef(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptError, setReceiptError] = useState('')

  const loadLookups = useCallback(async () => {
    try {
      const projRes = await api.get('/api/projects?all=1')
      const proj = Array.isArray(projRes?.data?.data) ? projRes.data.data : (Array.isArray(projRes?.data) ? projRes.data : [])
      setProjects(
        (Array.isArray(proj) ? proj : [])
          .map((p) => ({ value: String(p.id), label: String(p.name || p.title || `#${p.id}`) }))
          .filter((x) => x.value && x.label)
      )
    } catch {
      setProjects([])
    }
  }, [])

  const load = useCallback(
    async (page = 1, perPageOverride) => {
      setLoading(true)
      try {
        const pageSize = Number(perPageOverride || perPage || 50) || 50
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('per_page', String(pageSize))
        if (q.trim()) params.set('q', q.trim())
        if (paymentMethod) params.set('payment_method', String(paymentMethod))
        if (referenceNumber.trim()) params.set('reference_number', referenceNumber.trim())
        if (projectId) params.set('project_id', String(projectId))
        if (status) params.set('status', String(status))
        if (dueFrom) params.set('due_date_from', String(dueFrom))
        if (dueTo) params.set('due_date_to', String(dueTo))
        if (payFrom) params.set('payment_date_from', String(payFrom))
        if (payTo) params.set('payment_date_to', String(payTo))

        const res = await api.get(`/api/cc/installments?${params.toString()}`)
        const data = res?.data || {}
        const serverPerPage = Number(data?.per_page || pageSize) || pageSize
        if (serverPerPage !== pageSize) setPerPage(serverPerPage)
        setItems(Array.isArray(data.data) ? data.data : [])
        setPageMeta({
          current_page: Number(data.current_page || 1),
          last_page: Number(data.last_page || 1),
          total: Number(data.total || 0),
        })
        setSummary({
          total_installments: Number(data.summary?.total_installments || 0),
          total_amount: Number(data.summary?.total_amount || 0),
          total_paid_amount: Number(data.summary?.total_paid_amount || 0),
          total_unpaid_amount: Number(data.summary?.total_unpaid_amount || 0),
          by_status: data.summary?.by_status || {},
        })
      } catch {
        setItems([])
        setPageMeta({ current_page: 1, last_page: 1, total: 0 })
        setSummary({ total_installments: 0, total_amount: 0, total_paid_amount: 0, total_unpaid_amount: 0, by_status: {} })
      } finally {
        setLoading(false)
      }
    },
    [q, paymentMethod, referenceNumber, projectId, status, dueFrom, dueTo, payFrom, payTo, perPage]
  )

  useEffect(() => {
    if (!isRealEstate) return
    loadLookups()
    load(1)
  }, [isRealEstate, loadLookups, load])

  useEffect(() => {
    if (!isRealEstate) return
    const t = setTimeout(() => load(1), 350)
    return () => clearTimeout(t)
  }, [isRealEstate, q, paymentMethod, referenceNumber, projectId, status, dueFrom, dueTo, payFrom, payTo, load])

  const resetFilters = () => {
    setQ('')
    setPaymentMethod('')
    setReferenceNumber('')
    setProjectId('')
    setStatus('')
    setDueFrom('')
    setDueTo('')
    setPayFrom('')
    setPayTo('')
  }

  const parseInstallmentId = (v) => {
    const raw = String(v ?? '').trim()
    if (!raw) return null
    const cleaned = raw.replace(/[^\d]/g, '')
    const n = Number(cleaned || raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const parseAmount = (v) => {
    const raw = String(v ?? '').replace(/,/g, '').trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  const handleImport = async (rows) => {
    const list = Array.isArray(rows) ? rows : []
    let paid = 0
    let rescheduled = 0
    let failed = 0
    const errors = []

    for (const row of list) {
      const rowNo = row?.__rowNumber ?? ''
      const installmentId = parseInstallmentId(row?.installment_id ?? row?.id)
      if (!installmentId) {
        failed += 1
        errors.push(isArabic ? `صف ${rowNo}: Installment ID غير صحيح` : `Row ${rowNo}: invalid Installment ID`)
        continue
      }

      const newDueDate = String(row?.new_due_date ?? '').trim()
      const amount = parseAmount(row?.amount)
      const actionRaw = String(row?.action ?? '').trim().toLowerCase()
      const action = actionRaw || (newDueDate ? 'reschedule' : 'pay')

      try {
        if (action === 'reschedule' || action === 'move' || action === 'postpone') {
          if (!newDueDate) {
            failed += 1
            errors.push(isArabic ? `صف ${rowNo}: New Due Date مطلوب` : `Row ${rowNo}: New Due Date is required`)
            continue
          }
          await api.post(`/api/cc/installments/${encodeURIComponent(installmentId)}/reschedule`, {
            new_due_date: newDueDate,
            notes: String(row?.notes ?? '').trim() || undefined,
          })
          rescheduled += 1
          continue
        }

        // pay
        if (!amount || amount <= 0) {
          failed += 1
          errors.push(isArabic ? `صف ${rowNo}: Amount مطلوب للدفع` : `Row ${rowNo}: Amount is required for pay`)
          continue
        }

        const paymentMethodValue = String(row?.payment_method ?? '').trim()
        const normalizedMethod = ['cash', 'check', 'bank_transfer'].includes(paymentMethodValue) ? paymentMethodValue : undefined

        await api.post(`/api/cc/installments/${encodeURIComponent(installmentId)}/pay`, {
          amount,
          payment_method: normalizedMethod,
          payment_date: String(row?.payment_date ?? '').trim() || undefined,
          reference_number: String(row?.reference_number ?? '').trim() || undefined,
          notes: String(row?.notes ?? '').trim() || undefined,
        })
        paid += 1
      } catch (e) {
        failed += 1
        const msg =
          e?.response?.data?.message ||
          (typeof e?.message === 'string' ? e.message : '') ||
          (isArabic ? 'فشل الاستيراد' : 'Import failed')
        errors.push(isArabic ? `صف ${rowNo}: ${msg}` : `Row ${rowNo}: ${msg}`)
      }
    }

    await load(1)
    return { paid, rescheduled, failed, errors }
  }

  const openEdit = (row) => {
    setEditRow(row)
    setEditDueDate(safeStr(row?.due_date || ''))
    setEditNotes('')
    setEditOpen(true)
  }

  const openPay = (row) => {
    setPayRow(row)
    const amount = Number(row?.amount || 0)
    const paid = Number(row?.paid_amount || 0)
    const remaining = Math.max(0, amount - paid)
    setPayAmount(remaining ? String(remaining.toFixed(2)) : '')
    setPayMethod('cash')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayReference('')
    setPayNotes('')
    setPayOpen(true)
  }

  const saveEdit = async () => {
    if (!editRow?.id || !editDueDate) return
    setEditSaving(true)
    try {
      await api.post(`/api/cc/installments/${encodeURIComponent(editRow.id)}/reschedule`, {
        new_due_date: editDueDate,
        notes: editNotes || undefined,
      })
      setEditOpen(false)
      setEditRow(null)
      await load(pageMeta.current_page || 1)
    } catch {
    } finally {
      setEditSaving(false)
    }
  }

  const savePay = async () => {
    if (!payRow?.id) return
    const amt = Number(payAmount)
    if (!Number.isFinite(amt) || amt <= 0) return

    setPaySaving(true)
    try {
      const res = await api.post(`/api/cc/installments/${encodeURIComponent(payRow.id)}/pay`, {
        amount: amt,
        payment_method: payMethod || undefined,
        payment_date: payDate || undefined,
        reference_number: payReference || undefined,
        notes: payNotes || undefined,
      })

      setPayOpen(false)
      setPayRow(null)
      await load(pageMeta.current_page || 1)
    } catch {
    } finally {
      setPaySaving(false)
    }
  }

  const openAction = (type, row, paymentId) => {
    setActionType(type)
    setActionRow(row || null)
    setActionPaymentId(paymentId || null)
    setActionReason('')
    setActionOpen(true)
  }

  const submitAction = async () => {
    if (!actionRow?.id) return
    if (actionType === 'reject' && !actionReason.trim()) return

    setActionSaving(true)
    try {
      if (actionType === 'unpaid') {
        await api.post(`/api/cc/installments/${encodeURIComponent(actionRow.id)}/mark-unpaid`, {
          reason: actionReason.trim() || undefined,
        })
      } else {
        if (!actionPaymentId) return
        const endpoint = actionType === 'reject' ? 'reject' : 'void'
        await api.post(`/api/cc/payments/${encodeURIComponent(actionPaymentId)}/${endpoint}`, {
          reason: actionReason.trim() || undefined,
        })
      }

      setActionOpen(false)
      setActionRow(null)
      setActionPaymentId(null)
      setActionReason('')
      await load(pageMeta.current_page || 1)
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (typeof e?.message === 'string' ? e.message : '') ||
        (isArabic ? 'حدث خطأ' : 'Something went wrong')
      try {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: msg } }))
      } catch {}
    } finally {
      setActionSaving(false)
    }
  }

  const closeReceipt = () => {
    setReceiptOpen(false)
    setReceiptError('')
    if (receiptUrl) {
      try {
        URL.revokeObjectURL(receiptUrl)
      } catch {}
    }
    setReceiptUrl('')
  }

  const openReceiptByInstallment = async (installmentId) => {
    if (!installmentId) return
    setReceiptError('')
    setReceiptLoading(true)
    setReceiptOpen(true)

    // Use authenticated API client (cookies/headers) then preview as a blob URL.
    try {
      if (receiptUrl) {
        try {
          URL.revokeObjectURL(receiptUrl)
        } catch {}
      }
      const res = await api.get(`/api/cc/receipts/installments/${encodeURIComponent(installmentId)}/print`, {
        responseType: 'blob',
        headers: { Accept: 'text/html' },
      })
      const blobUrl = URL.createObjectURL(res.data)
      setReceiptUrl(blobUrl)
    } catch (e) {
      setReceiptUrl('')
      const msg =
        e?.response?.data?.message ||
        (typeof e?.message === 'string' ? e.message : '') ||
        (isArabic ? 'تعذر تحميل الإيصال' : 'Unable to load receipt')
      setReceiptError(msg)
      try {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: msg } }))
      } catch {}
    } finally {
      setReceiptLoading(false)
    }
  }

  const openReceipt = async (paymentId) => {
    if (!paymentId) return
    setReceiptError('')
    setReceiptLoading(true)
    setReceiptOpen(true)

    // Use authenticated API client (cookies/headers) then preview as a blob URL.
    try {
      if (receiptUrl) {
        try {
          URL.revokeObjectURL(receiptUrl)
        } catch {}
      }
      const res = await api.get(`/api/cc/receipts/${encodeURIComponent(paymentId)}/print`, {
        responseType: 'blob',
        headers: { Accept: 'text/html' },
      })
      const blobUrl = URL.createObjectURL(res.data)
      setReceiptUrl(blobUrl)
    } catch (e) {
      setReceiptUrl('')
      const msg =
        e?.response?.data?.message ||
        (typeof e?.message === 'string' ? e.message : '') ||
        (isArabic ? 'تعذر تحميل الإيصال' : 'Unable to load receipt')
      setReceiptError(msg)
      try {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: msg } }))
      } catch {}
    } finally {
      setReceiptLoading(false)
    }
  }

  const printReceipt = () => {
    try {
      const w = receiptIframeRef.current?.contentWindow
      if (w) w.print()
    } catch {}
  }

  if (!isRealEstate) {
    return (
      <div className="p-6">
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold">{isArabic ? 'غير متاح' : 'Not available'}</h2>
          <p className="text-sm text-[var(--muted-text)] mt-2">
            {isArabic ? 'هذا الموديول متاح فقط لشركات Real Estate.' : 'This module is available only for Real Estate tenants.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-4 md:p-6 space-y-6 ${textColorClass}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header (System UX) */}
      <div className="rounded-xl p-4 md:p-6 relative">
        <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-start gap-3">
            <div className="relative flex flex-col items-start gap-1">
              <h1 className={`text-xl md:text-2xl font-bold text-start ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
                {title}
                <span className={`text-sm font-normal ${isLight ? 'text-black' : 'text-white'} bg-[var(--muted-bg)] px-2 py-1 rounded-full flex items-center justify-center`}>
                  {loading ? (isArabic ? '...' : '...') : summary.total_installments || pageMeta.total || 0}
                </span>
              </h1>
              <span aria-hidden="true" className="inline-block h-[2px] w-full rounded bg-gradient-to-r from-blue-500 to-purple-600" />
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-wrap lg:flex-row items-stretch lg:items-center gap-2 lg:gap-3">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="btn btn-sm w-full lg:w-auto bg-blue-600 hover:bg-blue-700 !text-white border-none flex items-center justify-center gap-2"
            >
              <FaFileImport />
              {isArabic ? 'استيراد' : 'Import'}
            </button>
          </div>
        </div>

      </div>

      {/* Filter (System UX) */}
      <div className="glass-panel p-4 rounded-xl relative">
        <div className="flex justify-between items-center mb-3 relative z-10 pointer-events-auto">
          <h2 className={`text-sm font-semibold flex items-center gap-2 ${textColorClass}`}>
            <Filter className="text-blue-500" size={16} /> {isArabic ? 'تصفية' : 'Filter'}
          </h2>

          <div className="flex items-center gap-2 relative z-10 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowAllFilters((v) => !v)}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg transition-colors flex items-center gap-2 relative z-10 pointer-events-auto"
            >
              <span>{isArabic ? 'عرض الكل' : 'Show All'}</span>
              {showAllFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <button
              type="button"
              onClick={resetFilters}
              className={`px-3 py-1.5 text-sm ${textColorClass} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors inline-flex items-center gap-2 relative z-10 pointer-events-auto`}
            >
              <X className="w-4 h-4" />
              {isArabic ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className={`text-xs font-medium ${mutedTextClass} flex items-center gap-1`}>
              <Search className="text-blue-500" size={12} /> {isArabic ? 'بحث' : 'Search'}
            </label>
            <div className="relative">
              <Search className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-gray-400`} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={isArabic ? 'بحث (عميل / عقد / Unit Code)...' : 'Search (customer / contract / unit code)...'}
                className={`input w-full bg-[var(--content-bg)] ${isRTL ? 'pr-10' : 'pl-10'}`}
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-2' : 'right-2'} p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5`}
                  title={isArabic ? 'مسح' : 'Clear'}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'طريقة الدفع' : 'Payment Method'}</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="input w-full bg-[var(--content-bg)]"
            >
              <option value="">{isArabic ? 'الكل' : 'All'}</option>
              <option value="cash">{isArabic ? 'كاش' : 'Cash'}</option>
              <option value="check">{isArabic ? 'شيك' : 'Check'}</option>
              <option value="bank_transfer">{isArabic ? 'تحويل بنكي' : 'Bank Transfer'}</option>
            </select>
          </div>

          <div>
            <label className={`text-xs font-medium ${mutedTextClass}`}>Project</label>
            <div>
              <SearchableSelect
                options={projects}
                value={projectId}
                onChange={setProjectId}
                placeholder={isArabic ? 'الكل' : 'All'}
                isRTL={isRTL}
                className="w-full"
                multiple={false}
              />
            </div>
          </div>

          <div>
            <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'الحالة' : 'Status'}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-full bg-[var(--content-bg)]">
              <option value="">{isArabic ? 'الكل' : 'All'}</option>
              {['pending', 'paid', 'partial', 'unpaid', 'rejected', 'overdue'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showAllFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'رقم الشيك/المرجع' : 'Check/Reference No.'}</label>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="input w-full bg-[var(--content-bg)]"
                placeholder="..."
              />
            </div>
            <div>
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
              <DateRangePicker
                from={dueFrom}
                to={dueTo}
                onChange={({ from, to }) => {
                  setDueFrom(from)
                  setDueTo(to)
                }}
                isRTL={isRTL}
                className="input w-full bg-[var(--content-bg)]"
              />
            </div>
            <div>
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'تاريخ الدفع' : 'Payment Date'}</label>
              <DateRangePicker
                from={payFrom}
                to={payTo}
                onChange={({ from, to }) => {
                  setPayFrom(from)
                  setPayTo(to)
                }}
                isRTL={isRTL}
                className="input w-full bg-[var(--content-bg)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className={`text-xs font-semibold ${mutedTextClass} mb-1`}>{isArabic ? 'عدد الأقساط' : 'Total Installments'}</div>
          <div className="text-2xl font-bold">{summary.total_installments || pageMeta.total}</div>
          <div className={`mt-2 text-xs ${mutedTextClass}`}>
            {Object.entries(summary.by_status || {}).slice(0, 6).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span>{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className={`text-xs font-semibold ${mutedTextClass} mb-1`}>{isArabic ? 'إجمالي المبلغ' : 'Total Amount'}</div>
          <div className="text-2xl font-bold">{formatMoney(summary.total_amount)}</div>
          <div className={`mt-3 text-sm ${mutedTextClass} flex items-center justify-between`}>
            <span>{isArabic ? 'إجمالي المدفوع' : 'Total Paid'}</span>
            <span className="font-semibold">{formatMoney(summary.total_paid_amount)}</span>
          </div>
          <div className={`mt-1 text-sm ${mutedTextClass} flex items-center justify-between`}>
            <span>{isArabic ? 'إجمالي غير المدفوع' : 'Total Unpaid'}</span>
            <span className="font-semibold">{formatMoney(summary.total_unpaid_amount)}</span>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className={`text-xs font-semibold ${mutedTextClass} mb-1`}>{isArabic ? 'إجمالي المتبقي' : 'Outstanding'}</div>
          <div className="text-2xl font-bold">{formatMoney(summary.total_unpaid_amount)}</div>
          <div className={`mt-2 text-xs ${mutedTextClass}`}>{isArabic ? 'المتبقي = المبلغ - المدفوع' : 'Outstanding = Amount - Paid'}</div>
        </div>
      </div>

      {/* List */}
      <div className="glass-panel rounded-2xl p-4">
        <div className={`text-xs ${mutedTextClass} mb-3`}>Total: {pageMeta.total}</div>
        <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="text-left px-3 py-2">{isArabic ? 'القسط' : 'Installment'}</th>
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-left px-3 py-2">{isArabic ? 'العميل' : 'Customer'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'الهاتف' : 'Phone'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Unit' : 'Unit'}</th>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-left px-3 py-2">{isArabic ? 'مبلغ القسط المستحق' : 'Due Installment Amount'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Due Date' : 'Due Date'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Status' : 'Status'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Check No.' : 'Check No.'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Payment Date' : 'Payment Date'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Payment Method' : 'Payment Method'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'New Due Date' : 'New Due Date'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'Actions' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className={`px-3 py-4 ${mutedTextClass}`}>
                    {isArabic ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={14} className={`px-3 py-4 ${mutedTextClass}`}>
                    {isArabic ? 'لا توجد أقساط' : 'No installments found'}
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const contract = row?.contract || {}
                  const customer = contract?.customer || {}
                  const property = contract?.property || {}
                  const latestPayment = pickLatestPayment(row?.allocations)
                  const paymentId = latestPayment?.id ?? latestPayment?.payment_id ?? latestPayment?.paymentId ?? null
                  const meta = typeof row?.meta_data === 'object' && row.meta_data ? row.meta_data : {}
                  const originalDue = meta?.rescheduled_from || row?.due_date
                  const newDue = meta?.rescheduled_from ? row?.due_date : ''
                  const paid = Number(row?.paid_amount || 0)
                  const amount = Number(row?.amount || 0)
                  const outstanding = Math.max(0, amount - paid)
                  const canPay = outstanding > 0.00001 && String(row?.status || '').toLowerCase() !== 'paid'
                  const canReversePayment = !!paymentId
                  const canMarkUnpaid = paid <= 0.00001 && String(row?.status || '').toLowerCase() !== 'paid'

                  return (
                    <tr key={row.id} className="border-t border-[var(--panel-border)] hover:bg-black/5 dark:hover:bg-white/5">
                      <td className="px-3 py-2 font-medium">{isArabic ? `قسط #${row.installment_number}` : `Installment #${row.installment_number}`}</td>
                      <td className="px-3 py-2">{row.id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{safeStr(customer?.name)}</div>
                        <div className={`text-xs ${mutedTextClass}`}>{formatCustomerId(contract?.customer_id)}</div>
                      </td>
                      <td className="px-3 py-2" dir="ltr">
                        {safeStr(customer?.phone)}
                      </td>
                      <td className="px-3 py-2">{safeStr(property?.unit_code)}</td>
                      <td className="px-3 py-2">{safeStr(customer?.project?.name)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <div className="font-semibold">{formatMoney(row.amount)}</div>
                        <div className={`text-xs ${mutedTextClass} opacity-80`}>{isArabic ? 'مدفوع' : 'Paid'}: {formatMoney(paid)}</div>
                        <div className={`text-xs ${mutedTextClass} opacity-80`}>{isArabic ? 'متبقي' : 'Unpaid'}: {formatMoney(outstanding)}</div>
                      </td>
                      <td className="px-3 py-2" dir="ltr">
                        {formatDisplayDate(originalDue)}
                      </td>
                      <td className="px-3 py-2">{safeStr(row.status)}</td>
                      <td className="px-3 py-2">{safeStr(latestPayment?.reference_number)}</td>
                      <td className="px-3 py-2" dir="ltr">
                        {formatDisplayDate(latestPayment?.payment_date)}
                      </td>
                      <td className="px-3 py-2">{safeStr(latestPayment?.payment_method)}</td>
                      <td className="px-3 py-2" dir="ltr">
                        {formatDisplayDate(newDue)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${canPay ? '' : 'opacity-40 cursor-not-allowed'}`}
                            title={isArabic ? 'Pay' : 'Pay'}
                            onClick={() => canPay && openPay(row)}
                            disabled={!canPay}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                            title={isArabic ? 'تعديل تاريخ القسط' : 'Edit due date'}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${canMarkUnpaid ? '' : 'opacity-40 cursor-not-allowed'}`}
                            title={isArabic ? 'تعيين كغير مدفوع' : 'Mark unpaid'}
                            onClick={() => canMarkUnpaid && openAction('unpaid', row, null)}
                            disabled={!canMarkUnpaid}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${canReversePayment ? '' : 'opacity-40 cursor-not-allowed'}`}
                            title={isArabic ? 'إلغاء الدفعة' : 'Void payment'}
                            onClick={() => canReversePayment && openAction('void', row, paymentId)}
                            disabled={!canReversePayment}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${canReversePayment ? '' : 'opacity-40 cursor-not-allowed'}`}
                            title={isArabic ? 'رفض الدفعة' : 'Reject payment'}
                            onClick={() => canReversePayment && openAction('reject', row, paymentId)}
                            disabled={!canReversePayment}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${paymentId || paid > 0.00001 ? '' : 'opacity-40 cursor-not-allowed'}`}
                            title={isArabic ? 'إيصال' : 'Receipt'}
                            onClick={() => {
                              if (paymentId) return openReceipt(paymentId)
                              if (paid > 0.00001) return openReceiptByInstallment(row?.id)
                            }}
                            disabled={!paymentId && !(paid > 0.00001)}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {pageMeta.total > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between rounded-xl p-2 glass-panel gap-4">
            <div className="text-xs text-[var(--muted-text)]">
              {(() => {
                const cur = Number(pageMeta.current_page || 1)
                const total = Number(pageMeta.total || 0)
                const from = total ? (cur - 1) * perPage + 1 : 0
                const to = total ? Math.min(cur * perPage, total) : 0
                return isArabic ? `عرض ${from}-${to} من ${total}` : `Showing ${from}-${to} of ${total}`
              })()}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => load(Math.max(1, Number(pageMeta.current_page || 1) - 1))}
                  disabled={loading || Number(pageMeta.current_page || 1) <= 1}
                  title={isArabic ? 'السابق' : 'Prev'}
                >
                  <FaChevronLeft className={isRTL ? 'scale-x-[-1]' : ''} />
                </button>
                <span className="text-sm whitespace-nowrap">
                  {isArabic ? `الصفحة ${pageMeta.current_page} من ${pageMeta.last_page}` : `Page ${pageMeta.current_page} of ${pageMeta.last_page}`}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => load(Math.min(Number(pageMeta.last_page || 1), Number(pageMeta.current_page || 1) + 1))}
                  disabled={loading || Number(pageMeta.current_page || 1) >= Number(pageMeta.last_page || 1)}
                  title={isArabic ? 'التالي' : 'Next'}
                >
                  <FaChevronRight className={isRTL ? 'scale-x-[-1]' : ''} />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-xs text-[var(--muted-text)] whitespace-nowrap">{isArabic ? 'لكل صفحة:' : 'Per page:'}</span>
                <select
                  className="input w-16 text-sm py-0 px-2 h-8"
                  value={perPage}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    setPerPage(next)
                    load(1, next)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <ModalShell
        open={editOpen}
        textColorClass={textColorClass}
        title={isArabic ? 'تعديل تاريخ القسط' : 'Edit Installment Due Date'}
        onClose={() => setEditOpen(false)}
      >
        <div className="space-y-3">
          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>{isArabic ? 'التاريخ الجديد' : 'New Due Date'}</label>
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>{isArabic ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isArabic ? 'سبب التعديل...' : 'Reason...'}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => setEditOpen(false)}
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm disabled:opacity-50"
              onClick={saveEdit}
              disabled={editSaving || !editDueDate}
            >
              {editSaving ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ' : 'Save')}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={payOpen}
        textColorClass={textColorClass}
        title={isArabic ? 'Pay' : 'Pay Installment'}
        onClose={() => setPayOpen(false)}
        widthClass="max-w-xl"
      >
        <div className="space-y-3">
          {(() => {
            const latest = pickLatestPayment(payRow?.allocations)
            const paymentId = latest?.id ?? latest?.payment_id ?? latest?.paymentId ?? null
            return (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 ${
                    paymentId ? '' : 'opacity-40 cursor-not-allowed'
                  }`}
                  onClick={() => paymentId && openReceipt(paymentId)}
                  disabled={!paymentId}
                  title={isArabic ? 'طباعة الإيصال' : 'Print receipt'}
                >
                  <FileText className="w-4 h-4" />
                  {isArabic ? 'طباعة' : 'Print'}
                </button>
              </div>
            )
          })()}

          <div className="rounded-xl border border-[var(--panel-border)] p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className={`text-xs ${mutedTextClass}`}>Installment</div>
              <div className="font-semibold">#{safeStr(payRow?.installment_number || payRow?.id)}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'مبلغ القسط المستحق' : 'Due Installment Amount'}</div>
                <div>{formatMoney(payRow?.amount)}</div>
              </div>
              <div>
                <div className={`text-xs ${mutedTextClass}`}>Paid</div>
                <div>{formatMoney(payRow?.paid_amount)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Pay Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Reference / Check No.</label>
              <input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="..."
              />
            </div>
          </div>

          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>Notes</label>
            <textarea
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => setPayOpen(false)}
              disabled={paySaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm disabled:opacity-50"
              onClick={savePay}
              disabled={paySaving || !payAmount}
            >
              {paySaving ? 'Saving...' : 'Pay'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={receiptOpen}
        textColorClass={textColorClass}
        title={isArabic ? 'الإيصال' : 'Receipt'}
        onClose={closeReceipt}
        widthClass="max-w-5xl"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={`px-4 py-2 rounded-xl bg-blue-600 text-white text-sm disabled:opacity-50 ${
                receiptUrl ? '' : 'opacity-40 cursor-not-allowed'
              }`}
              onClick={printReceipt}
              disabled={!receiptUrl}
            >
              {isArabic ? 'طباعة' : 'Print'}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--panel-border)] overflow-hidden bg-white">
            {receiptLoading ? (
              <div className={`p-6 text-sm ${textColorClass}`}>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</div>
            ) : !receiptUrl ? (
              <div className={`p-6 text-sm ${textColorClass}`}>
                {receiptError ? receiptError : (isArabic ? 'لا يوجد إيصال' : 'No receipt available')}
              </div>
            ) : (
              <iframe
                ref={receiptIframeRef}
                src={receiptUrl}
                title="Receipt"
                className="w-full h-[70vh] bg-white"
              />
            )}
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={actionOpen}
        textColorClass={textColorClass}
        title={
          actionType === 'reject'
            ? (isArabic ? 'رفض الدفعة' : 'Reject Payment')
            : actionType === 'unpaid'
              ? (isArabic ? 'تعيين كغير مدفوع' : 'Mark Installment Unpaid')
              : (isArabic ? 'إلغاء الدفعة' : 'Void Payment')
        }
        onClose={() => setActionOpen(false)}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--panel-border)] p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'القسط' : 'Installment'}</div>
              <div className="font-semibold">#{safeStr(actionRow?.installment_number || actionRow?.id)}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'مبلغ القسط المستحق' : 'Due Installment Amount'}</div>
                <div>{formatMoney(actionRow?.amount)}</div>
              </div>
              <div>
                <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'المدفوع' : 'Paid'}</div>
                <div>{formatMoney(actionRow?.paid_amount)}</div>
              </div>
            </div>
          </div>

          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>
              {actionType === 'reject'
                ? (isArabic ? 'سبب الرفض (مطلوب)' : 'Reason (required)')
                : (isArabic ? 'سبب (اختياري)' : 'Reason (optional)')}
            </label>
            <textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => setActionOpen(false)}
              disabled={actionSaving}
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-xl text-white text-sm disabled:opacity-50 ${
                actionType === 'reject' ? 'bg-red-600' : actionType === 'unpaid' ? 'bg-gray-900' : 'bg-amber-600'
              }`}
              onClick={submitAction}
              disabled={actionSaving || (actionType === 'reject' && !actionReason.trim())}
            >
              {actionSaving
                ? (isArabic ? 'جاري...' : 'Saving...')
                : actionType === 'reject'
                  ? (isArabic ? 'رفض' : 'Reject')
                  : actionType === 'unpaid'
                    ? (isArabic ? 'تحديث' : 'Mark Unpaid')
                    : (isArabic ? 'إلغاء' : 'Void')}
            </button>
          </div>
        </div>
      </ModalShell>

      {importOpen && (
        <CcInstallmentsImportModal
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
          isRTL={isRTL}
        />
      )}
    </div>
  )
}
