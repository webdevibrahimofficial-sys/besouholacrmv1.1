import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import "react-datepicker/dist/react-datepicker.css"
import { api, logExportEvent } from '../utils/api'
import { sendEmailText } from '../services/emailService'
import { useTheme } from '../shared/context/ThemeProvider'
import { useAppState } from '../shared/context/AppStateProvider'
import { FaEdit, FaCheck, FaPlay, FaBan, FaPaperPlane, FaDownload, FaPlus, FaFileImport, FaEye, FaTrash, FaStickyNote, FaShoppingCart, FaUndo, FaTimes, FaCheckCircle, FaEllipsisV } from 'react-icons/fa'
import { Filter, ChevronDown, Search, User, DollarSign, Calendar } from 'lucide-react'
import SearchableSelect from '../components/SearchableSelect'
import SalesInvoicesFormModal from '../components/SalesInvoicesFormModal'
import SalesInvoicePreviewModal from '../components/SalesInvoicePreviewModal'
import SalesInvoicesPaymentModal from '../components/SalesInvoicesPaymentModal'
import SalesInvoicesImportModal from '../components/SalesInvoicesImportModal'
import { resolveDocumentCustomerAddress } from '../shared/utils/customerAddress'
import * as XLSX from 'xlsx'

export default function SalesInvoices() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { theme } = useTheme()
  const { crmSettings } = useAppState()
  const isLight = theme === 'light'
  const isRTL = String(i18n.language || '').startsWith('ar')
  const crmCurrency = String(crmSettings?.defaultCurrency || crmSettings?.default_currency || 'EGP').toUpperCase()

  const formatInvoiceStatus = (status) => {
    const map = {
      Draft: isRTL ? 'مسودة' : 'Draft',
      Posted: isRTL ? 'مرحلة' : 'Posted',
      Cancelled: isRTL ? 'ملغاة' : 'Cancelled',
    }
    return map[status] || status || '-'
  }

  const formatPaymentStatus = (status) => {
    const map = {
      Unpaid: isRTL ? 'غير مدفوعة' : 'Unpaid',
      Partial: isRTL ? 'دفع جزئي' : 'Partial Payment',
      Paid: isRTL ? 'مدفوعة' : 'Paid',
    }
    return map[status] || status || (isRTL ? 'غير مدفوعة' : 'Unpaid')
  }
  const surfaceClass = isLight
    ? 'bg-[var(--panel-bg)] border border-[var(--panel-border)]'
    : 'bg-[var(--panel-bg)]/95 border border-[var(--panel-border)]'
  const softSurfaceClass = isLight
    ? 'bg-[var(--table-header-bg)] border border-[var(--panel-border)]'
    : 'bg-[var(--table-header-bg)]/70 border border-[var(--panel-border)]'
  const inputClass = isLight
    ? 'bg-white border-[var(--panel-border)] text-[var(--content-text)] placeholder:text-[var(--muted-text)]'
    : 'bg-slate-900/60 border-[var(--panel-border)] text-[var(--content-text)] placeholder:text-[var(--muted-text)]'

  // State
  const [items, setItems] = useState([])
  const [customersList, setCustomersList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activeRowId, setActiveRowId] = useState(null)
  
  // Modals
  const [showForm, setShowForm] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [previewItem, setPreviewItem] = useState(null)
  const [paymentItem, setPaymentItem] = useState(null)

  // Status Management
  const [activeActionDropdown, setActiveActionDropdown] = useState(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [statusAction, setStatusAction] = useState(null)
  const [statusReason, setStatusReason] = useState('')
  const [sendingEmailId, setSendingEmailId] = useState(null)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [returnInvoice, setReturnInvoice] = useState(null)
  const [returnLines, setReturnLines] = useState([])
  const [returning, setReturning] = useState(false)

  // Filters
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({
    status: '',
    paymentStatus: '',
    customerName: '',
    orderId: '',
    dateFrom: '',
    dateTo: '',
    dueDateFrom: '',
    dueDateTo: '',
    totalMin: '',
    totalMax: '',
    invoiceType: '',
    createdAtFrom: '',
    createdAtTo: '',
    datePeriod: ''
  })
  const [showAllFilters, setShowAllFilters] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [pageSearch, setPageSearch] = useState('')

  // Sorting
  const [sortBy, setSortBy] = useState('issueDate')
  const [sortOrder, setSortOrder] = useState('desc')

  // Selection
  const [selectedItems, setSelectedItems] = useState([])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveActionDropdown(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Helper for success messages
  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  const normalizeWorkflowStatus = (status) => {
    const s = String(status ?? '').trim()
    if (!s) return 'Draft'
    const lower = s.toLowerCase()

    // Backward-compat: older backend code wrote settlement states into `status`.
    if (['unpaid', 'partial', 'partially paid', 'paid', 'overdue'].includes(lower)) return 'Posted'

    if (lower === 'draft') return 'Draft'
    if (lower === 'posted') return 'Posted'
    if (lower === 'cancelled' || lower === 'canceled' || lower === 'void') return 'Cancelled'

    return s
  }

  const normalizePaymentStatus = (status) => {
    const s = String(status ?? '').trim()
    if (!s) return 'Unpaid'
    const lower = s.toLowerCase()
    if (lower === 'paid') return 'Paid'
    if (lower === 'partial' || lower === 'partially_paid' || lower === 'partially paid') return 'Partial'
    if (lower === 'unpaid') return 'Unpaid'
    return s
  }

  const mapInvoiceFromApi = (item) => {
    if (!item || typeof item !== 'object') return null
    return {
      ...item,
      invoiceNumber: item.invoice_number || item.invoiceNumber || String(item.id),
      status: normalizeWorkflowStatus(item.status),
      invoiceType: (() => {
        const t = String(item.invoice_type || item.invoiceType || '').toLowerCase()
        if (t === 'advance') return 'Advance'
        if (t === 'partial') return 'Partial'
        if (t === 'full') return 'Full'
        return item.invoice_type || item.invoiceType || ''
      })(),
      paidAmount: Number(item.paid_amount ?? item.paidAmount ?? 0),
      advanceAppliedAmount: Number(item.advance_applied_amount ?? item.advanceAppliedAmount ?? 0),
      balanceDue: item.balance_due != null
        ? Number(item.balance_due)
        : Math.max(0, Number(item.total ?? 0) - Number(item.paid_amount ?? 0) - Number(item.advance_applied_amount ?? 0)),
      paymentStatus: normalizePaymentStatus(item.payment_status || item.paymentStatus),
      paymentMethod: item.payment_method || item.paymentMethod,
      paymentTerms: item.payment_terms || item.paymentTerms,
      customerName: item.customer_name || item.customerName,
      customerCode: item.customer_code || item.customerCode,
      customerAddress: resolveDocumentCustomerAddress(item),
      customerEmail: item.customer?.email || item.customer_email || item.customerEmail || '',
      customer: item.customer || null,
      dueDate: item.due_date || item.dueDate,
      createdAt: item.created_at || item.createdAt,
      issueDate: item.issue_date || item.issueDate,
      orderId: item.order_id ?? item.orderId ?? '',
      orderUuid: item.order?.uuid || item.orderUuid || '',
      meta_data: item.meta_data || item.metaData || {},
      taxRate: Number(item.meta_data?.tax_rate ?? item.metaData?.tax_rate ?? item.tax_rate ?? item.taxRate ?? 0) || undefined,
      isTaxEnabled: item.meta_data?.is_tax_enabled ?? item.metaData?.is_tax_enabled ?? item.isTaxEnabled,
      discountType: item.meta_data?.discount_type ?? item.metaData?.discount_type ?? item.discount_type ?? item.discountType,
      discountRate: Number(item.meta_data?.discount_rate ?? item.metaData?.discount_rate ?? item.discount_rate ?? item.discountRate ?? 0) || 0,
      discount: Number(item.discount ?? 0),
      installments: item.meta_data?.installments ?? item.metaData?.installments ?? item.installments,
      items: Array.isArray(item.items) ? item.items : [],
    }
  }

  const isOverdueInvoice = (invoice, balanceDue) => {
    const workflow = normalizeWorkflowStatus(invoice?.status)
    if (String(workflow).toLowerCase() !== 'posted') return false
    if ((Number(balanceDue) || 0) <= 0) return false
    const due = invoice?.dueDate
    if (!due) return false
    const dueDate = new Date(due)
    if (Number.isNaN(dueDate.getTime())) return false
    return dueDate < new Date()
  }

  // Load Data
  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const params = { page: currentPage }
      if (String(q || '').trim()) params.search = String(q).trim()
      if (String(filters.status || '').trim()) params.status = String(filters.status).trim()

      const response = await api.get('/api/sales-invoices', { params })
      // Handle both paginated and non-paginated responses
      const rawData = response.data.data || response.data
      const data = Array.isArray(rawData) ? rawData : []
      
      // Map snake_case to camelCase for frontend compatibility
      const mappedItems = data.map(mapInvoiceFromApi).filter(Boolean)
      
      setItems(mappedItems)
      // If using server-side pagination, you might want to set total items/pages here
    } catch (err) {
      console.error('Failed to fetch invoices:', err)
      // Fallback to empty or mock if needed, but for migration we want real data
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [currentPage, q, filters.status])

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const cRes = await api.get('/api/customers?all=1')
        const cRaw = cRes.data?.data || cRes.data || []
        setCustomersList(Array.isArray(cRaw) ? cRaw : [])
      } catch {
        setCustomersList([])
      }
    }
    loadCustomers()
  }, [])

  useEffect(() => {
    const invoiceId = new URLSearchParams(location.search || '').get('invoice_id')
    if (!invoiceId) return

    if (loading) return

    const existing = items.find(x => String(x.id) === String(invoiceId))
    if (existing) {
      setPreviewItem(existing)
      setShowPreview(true)
      return
    }

    const open = async () => {
      try {
        const res = await api.get(`/api/sales-invoices/${invoiceId}`)
        const raw = res?.data
        if (!raw) return

        const mapped = mapInvoiceFromApi(raw)
        if (!mapped) return

        setPreviewItem(mapped)
        setShowPreview(true)
      } catch (e) {
        const status = e?.response?.status
        if (status === 404) {
          const evt = new CustomEvent('app:toast', {
            detail: { type: 'warning', message: isRTL ? 'لم يتم العثور على الفاتورة من الرابط. اعرضها من الجدول.' : 'Invoice not found from link. Please open it from the table.' },
          })
          window.dispatchEvent(evt)
          return
        }
        const msg = e?.response?.data?.message || (isRTL ? 'فشل فتح الفاتورة' : 'Failed to open invoice')
        alert(msg)
      }
    }

    open()
  }, [location.search, items, loading])

  // Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(items.map(i => i.id))
    } else {
      setSelectedItems([])
    }
  }

  const handleSelectRow = (id) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleSaveInvoice = async (data) => {
    try {
      const toNumber = (value, fallback = 0) => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
        const s = String(value ?? '').trim()
        if (!s) return fallback
        const normalized = s
          .replace(/\u066B/g, '.') // Arabic decimal separator
          .replace(/[,\u066C\u060C\s]/g, '') // thousands separators + spaces
          .replace(/[^\d.-]/g, '') // strip currency/letters
        const n = Number(normalized)
        return Number.isFinite(n) ? n : fallback
      }

      const normalizeDate = (v) => {
        const s = String(v ?? '').trim()
        if (!s) return null
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        if (s.includes('T')) return s.split('T')[0]
        return s
      }

      const normalizeInvoiceType = (type) => {
        const t = String(type || '').toLowerCase()
        if (t === 'advance') return 'advance'
        if (t === 'partial') return 'partial'
        return 'full'
      }

      const issueDate = normalizeDate(data.date || data.issueDate) || new Date().toISOString().split('T')[0]
      const dueDate = normalizeDate(data.dueDate) || null

      const rawItems = Array.isArray(data.items) ? data.items : []
      const items = rawItems.map(it => {
        const itemId = it?.item_id ?? it?.itemId ?? it?.product_id ?? null
        return {
          ...it,
          item_id: itemId != null && String(itemId).trim() !== '' ? Number(itemId) || itemId : undefined,
          name: it?.name || it?.item_name || it?.product_name || '',
          quantity: toNumber(it?.quantity ?? it?.qty ?? 0, 0),
          price: toNumber(it?.price ?? it?.unit_price ?? it?.unitPrice ?? 0, 0),
          discount: toNumber(it?.discount ?? 0, 0),
        }
      })

      const payload = {
        customer_name: data.customerName,
        customer_code: data.customerCode || null,
        customer_address: data.customerAddress || null,
        sales_person: data.salesPerson || null,
        order_id: data.orderId ? Number(data.orderId) : null,
        invoice_type: normalizeInvoiceType(data.invoiceType),
        issue_date: issueDate,
        due_date: dueDate,
        items,
        subtotal: toNumber(data.subtotal ?? 0, 0),
        tax: toNumber(data.tax ?? 0, 0),
        tax_rate: toNumber(data.taxRate ?? data.tax_rate ?? 0, 0),
        is_tax_enabled: data.isTaxEnabled !== undefined ? (data.isTaxEnabled ? 1 : 0) : undefined,
        discount: toNumber(data.discountAmount ?? 0, 0),
        discount_type: data.discountType || data.discount_type || 'value',
        discount_rate: toNumber(
          data.discountType === 'percent'
            ? (data.discount ?? 0)
            : ((Number(data.discountRate) > 1 ? data.discountRate : (Number(data.discountRate) || 0) * 100)),
          0
        ),
        total: toNumber(data.total ?? 0, 0),
        advance_applied_amount: toNumber(data.advanceAppliedAmount ?? 0, 0),
        status: data.status || 'Draft',
        payment_method: data.paymentMethod || null,
        payment_terms: String(data.invoiceType) === 'Full' ? null : (data.paymentTerms || null),
        currency: data.currency || crmCurrency,
        notes: data.notes || null,
        meta_data: {
          ...(data.meta_data || data.metaData || {}),
          installments: data.installments || { enabled: false, schedule: [] },
        },
      }

      const isUpdate = typeof data.id === 'number'
      let createdInvoiceId = null

      if (isUpdate) {
        await api.put(`/api/sales-invoices/${data.id}`, payload)
      } else {
        const res = await api.post('/api/sales-invoices', payload)
        createdInvoiceId = res?.data?.id ?? null
      }

      // Advance invoice: optional "Mark as received" to create payment record.
      if (!isUpdate && createdInvoiceId && String(data.invoiceType) === 'Advance' && data.markAsReceived) {
        await api.post(`/api/sales-invoices/${createdInvoiceId}/payments`, {
          payment_date: payload.issue_date,
          amount: Number(payload.total) || 0,
          payment_method: payload.payment_method || 'Bank Transfer',
          reference: null,
          notes: isRTL ? 'تحصيل مقدم عند إنشاء الفاتورة' : 'Advance received on creation',
        })
      }
      
      await fetchInvoices()
      setShowForm(false)
      setEditingItem(null)
      showSuccess(isRTL ? 'تم حفظ الفاتورة بنجاح' : 'Invoice saved successfully')
    } catch (err) {
      console.error('Failed to save invoice:', err)
      alert(isRTL ? 'فشل حفظ الفاتورة' : 'Failed to save invoice')
    }
  }

  const handleSavePayment = async (paymentData) => {
    try {
      await api.post(`/api/sales-invoices/${paymentData.invoiceId}/payments`, {
        payment_date: paymentData.date,
        amount: Number(paymentData.amount),
        payment_method: paymentData.method || null,
        reference: paymentData.reference || null,
        notes: paymentData.notes || null,
      })

      await fetchInvoices()
      setShowPaymentModal(false)
      setPaymentItem(null)
      showSuccess(isRTL ? 'تم تأكيد الدفعة بنجاح' : 'Payment confirmed successfully')
    } catch (err) {
      console.error('Failed to save payment:', err)
      const msg = err?.response?.data?.message
      alert(msg || (isRTL ? 'فشل تسجيل الدفعة' : 'Failed to register payment'))
    }
  }

  // KPI Calculations
  const kpiData = useMemo(() => {
    const totalInvoiced = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
    const totalPaid = items.reduce((sum, item) => sum + (Number(item.paidAmount) || 0), 0)
    const totalOverdue = items.reduce((sum, item) => {
      const balance = Number(item.balanceDue ?? ((Number(item.total) || 0) - (Number(item.paidAmount) || 0) - (Number(item.advanceAppliedAmount) || 0))) || 0
      if (balance > 0 && new Date(item.dueDate) < new Date() && item.status !== 'Cancelled') {
        return sum + balance
      }
      return sum
    }, 0)
    const openInvoicesCount = items.filter(item => 
      (Number(item.balanceDue ?? ((Number(item.total) || 0) - (Number(item.paidAmount) || 0) - (Number(item.advanceAppliedAmount) || 0))) || 0) > 0 &&
      item.status !== 'Cancelled'
    ).length

    return { totalInvoiced, totalPaid, totalOverdue, openInvoicesCount }
  }, [items])

  const editAction = () => ({ type: 'edit', label: isRTL ? 'تعديل' : 'Edit', icon: FaEdit, color: 'text-blue-600' })
  const emailAction = () => ({ type: 'email', label: isRTL ? 'إرسال بالبريد' : 'Send by Email', icon: FaPaperPlane, color: 'text-purple-600' })
  const cancelAction = () => ({ type: 'cancel', label: isRTL ? 'إلغاء' : 'Cancel', icon: FaBan, color: 'text-red-600' })
  const paymentAction = () => ({ type: 'payment', label: isRTL ? 'تأكيد الدفع' : 'Confirm Payment', icon: FaPlay, color: 'text-blue-600' })
  const returnAction = () => ({ type: 'return', label: isRTL ? 'استرداد' : 'Refund', icon: FaUndo, color: 'text-orange-600' })

  const getInvoiceReturnableLines = (invoice) => {
    const lines = Array.isArray(invoice?.items) ? invoice.items : []
    const returned = invoice?.meta_data?.returned_quantities || invoice?.metaData?.returned_quantities || {}
    return lines.map((row, idx) => {
      const itemId = row?.item_id ?? row?.itemId ?? row?.product_id ?? row?.item ?? null
      const name = row?.name || row?.item_name || row?.product_name || ''
      const qty = Number(row?.quantity ?? row?.qty ?? 0) || 0
      const price = Number(row?.price ?? row?.unit_price ?? row?.unitPrice ?? 0) || 0
      const discount = Number(row?.discount ?? 0) || 0
      const lineNet = Math.max(0, (qty * price) - discount)
      const unitNet = qty > 0 ? lineNet / qty : 0
      const already = Number(
        (itemId != null ? (returned[String(itemId)] ?? returned[itemId]) : undefined)
        ?? 0
      ) || 0
      const max = Math.max(0, qty - already)
      return {
        key: `${itemId || name || 'line'}-${idx}`,
        item_id: itemId,
        name,
        price,
        unitNet,
        invoiced: qty,
        already,
        max,
        quantity: max,
      }
    }).filter((line) => line.max > 0 && (line.item_id || line.name))
  }

  const estimateRefundAmount = (lines, invoice) => {
    const selected = (lines || []).reduce((sum, line) => {
      const qty = Number(line.quantity) || 0
      const unit = Number(line.unitNet) || 0
      return sum + (qty * unit)
    }, 0)
    const paid = Number(invoice?.paidAmount ?? invoice?.paid_amount ?? 0) || 0
    return Math.min(Math.max(0, selected), Math.max(0, paid))
  }

  const getAvailableActionsForInvoice = (invoice, balanceDue) => {
    const workflow = normalizeWorkflowStatus(invoice?.status)
    const status = String(workflow || '').toLowerCase()
    const paymentStatus = normalizePaymentStatus(invoice?.paymentStatus)
    const paymentStatusLower = String(paymentStatus || '').toLowerCase()
    const settled = (Number(invoice?.paidAmount || 0) + Number(invoice?.advanceAppliedAmount || 0)) > 0.0001

    if (status === 'cancelled' || status === 'void') return []

    if (status === 'draft') {
      return [
        { type: 'confirm', label: isRTL ? 'تأكيد وترحيل' : 'Confirm & Post', icon: FaCheck, color: 'text-green-600' },
        editAction(),
        emailAction(),
        cancelAction(),
      ]
    }

    const actions = []
    if (paymentStatusLower !== 'paid' && (Number(balanceDue) || 0) > 0) {
      actions.push(paymentAction())
    }
    actions.push(editAction(), emailAction())
    if (status === 'posted' && getInvoiceReturnableLines(invoice).length > 0) {
      actions.push(returnAction())
    }
    if (!settled && status === 'posted') {
      actions.push(cancelAction())
    }
    return actions
  }

  const handleView = (item) => {
    setPreviewItem(item)
    setShowPreview(true)
  }

  const handleSendInvoiceEmail = async (invoice) => {
    const to = String(invoice?.customerEmail || '').trim()
    if (!to) {
      alert(isRTL ? 'لا يوجد إيميل لهذا العميل' : 'This customer has no email address')
      return
    }

    const invNo = invoice.invoiceNumber || invoice.id
    const subject = `${isRTL ? 'فاتورة' : 'Invoice'} ${invNo}`
    const body = `
      <p>${isRTL ? 'فاتورة رقم' : 'Invoice #'}: <strong>${invNo}</strong></p>
      <p>${isRTL ? 'العميل' : 'Customer'}: ${invoice.customerName || '-'}</p>
      <p>${isRTL ? 'إجمالي المبلغ' : 'Total Amount'}: ${Number(invoice.total || 0).toLocaleString()}</p>
      <p>${isRTL ? 'المتبقي' : 'Remaining'}: ${Number(invoice.balanceDue || 0).toLocaleString()}</p>
    `

    try {
      setSendingEmailId(invoice.id)
      await sendEmailText({ recipient_email: to, subject, body })
      showSuccess(isRTL ? 'تم إرسال الفاتورة من إيميل الشركة' : 'Invoice sent from the company email')
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message
      alert(msg || (isRTL ? 'فشل إرسال الإيميل. تأكد من إعدادات إيميل الشركة.' : 'Failed to send email. Check company email settings.'))
    } finally {
      setSendingEmailId(null)
    }
  }

  const handleStatusAction = (invoice, actionType) => {
    if (actionType === 'edit') {
      setEditingItem(invoice)
      setShowForm(true)
      return
    }
    if (actionType === 'payment') {
      setPaymentItem(invoice)
      setShowPaymentModal(true)
      return
    }
    if (actionType === 'email') {
      handleSendInvoiceEmail(invoice)
      return
    }
    if (actionType === 'return') {
      const openRefund = async () => {
        try {
          setReturning(true)
          const res = await api.get(`/api/sales-invoices/${invoice.id}`)
          const mapped = mapInvoiceFromApi(res?.data) || invoice
          const lines = getInvoiceReturnableLines(mapped)
          if (!lines.length) {
            alert(isRTL ? 'لا توجد كميات قابلة للاسترداد على هذه الفاتورة' : 'This invoice has no refundable quantities')
            return
          }
          setReturnInvoice(mapped)
          setReturnLines(lines)
          setShowReturnModal(true)
        } catch (e) {
          alert(e?.response?.data?.message || (isRTL ? 'فشل تحميل الفاتورة للاسترداد' : 'Failed to load invoice for refund'))
        } finally {
          setReturning(false)
        }
      }
      openRefund()
      return
    }

    const actionMap = {
      'confirm': { status: 'Posted', requireReason: false },
      'cancel': { status: 'Cancelled', requireReason: true },
    }

    const actionConfig = actionMap[actionType]
    if (!actionConfig) return

    const actionData = {
      type: actionType,
      invoiceId: invoice.id,
      nextStatus: actionConfig.status,
      currentStatus: invoice.status
    }

    if (actionConfig.requireReason) {
      setStatusAction(actionData)
      setStatusReason('')
      setShowStatusModal(true)
    } else {
      executeStatusChange(actionData)
    }
  }

  const renderInvoiceActions = (item, balanceDue) => {
    const actions = getAvailableActionsForInvoice(item, balanceDue)
    const primary = actions[0]
    const extraActions = actions.slice(1)
    const sending = sendingEmailId === item.id
    const sendingLabel = isRTL ? 'جاري الإرسال...' : 'Sending...'

    return (
      <div className="flex items-center justify-end gap-2">
        {primary && (
          <button
            type="button"
            disabled={sending && primary.type === 'email'}
            onClick={(e) => {
              e.stopPropagation()
              handleStatusAction(item, primary.type)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm ${primary.color.replace('text-', 'bg-').replace('600', '100')} ${primary.color} dark:bg-opacity-20`}
            title={primary.label}
          >
            {React.createElement(primary.icon, { size: 12 })}
            <span className="hidden xl:inline">{sending && primary.type === 'email' ? sendingLabel : primary.label}</span>
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleView(item)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors shadow-sm"
          title={isRTL ? 'عرض' : 'View'}
        >
          <FaEye size={12} />
          <span className="hidden xl:inline">{isRTL ? 'عرض' : 'View'}</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setActiveActionDropdown(activeActionDropdown === item.id ? null : item.id)
            }}
            className={`flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${isLight ? 'text-black' : 'text-white'} dark:text-gray-400`}
          >
            <FaEllipsisV size={12} />
          </button>

          {activeActionDropdown === item.id && (
            <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-1 w-48 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden`}>
              <div className="py-1 bg-white">
                {extraActions.map((action, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={sending && action.type === 'email'}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStatusAction(item, action.type)
                      setActiveActionDropdown(null)
                    }}
                    className={`w-full text-start px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${action.color}`}
                  >
                    <action.icon size={14} />
                    {sending && action.type === 'email' ? sendingLabel : action.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(item)
                    setActiveActionDropdown(null)
                  }}
                  className="w-full text-start px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                >
                  <FaTrash size={14} />
                  {isRTL ? 'حذف' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleSubmitReturn = async () => {
    if (!returnInvoice) return
    const payloadItems = returnLines
      .filter((line) => Number(line.quantity) > 0)
      .map((line) => ({
        item_id: line.item_id || undefined,
        name: line.name || undefined,
        quantity: Number(line.quantity),
      }))
    if (!payloadItems.length) {
      alert(isRTL ? 'حدد كمية للاسترداد' : 'Enter a refund quantity')
      return
    }
    const missingId = payloadItems.some((row) => !row.item_id && !row.name)
    if (missingId) {
      alert(isRTL ? 'بعض البنود بلا معرف أو اسم. عدّل الفاتورة واختر العنصر من الكتالوج.' : 'Some lines lack an item id or name. Edit the invoice and pick catalog items.')
      return
    }
    setReturning(true)
    try {
      const res = await api.post(`/api/sales-invoices/${returnInvoice.id}/returns`, {
        items: payloadItems,
        refund_payment: true,
        payment_method: returnInvoice.paymentMethod || returnInvoice.payment_method || null,
        notes: isRTL ? 'استرداد بنود فاتورة' : 'Refund for returned invoice items',
      })
      setShowReturnModal(false)
      setReturnInvoice(null)
      setReturnLines([])
      await fetchInvoices()
      const refundAmt = Number(res?.data?.refund_payment?.amount ?? 0)
      const baseMsg = isRTL
        ? 'تم تسجيل الاسترداد وإعادة الكمية للمخزون المتاح'
        : 'Refund recorded and stock restored to available'
      const moneyMsg = refundAmt > 0
        ? (isRTL ? ` · مبلغ مسترد: ${refundAmt.toLocaleString()}` : ` · Refunded amount: ${refundAmt.toLocaleString()}`)
        : ''
      showSuccess(baseMsg + moneyMsg)
    } catch (e) {
      alert(e?.response?.data?.message || (isRTL ? 'فشل تسجيل الاسترداد' : 'Refund failed'))
    } finally {
      setReturning(false)
    }
  }

  const handleDelete = async (invoice) => {
    const status = String(invoice?.status || '').toLowerCase()
    if (status === 'posted' || status === 'paid') {
      alert(isRTL ? 'لا يمكن حذف فاتورة مرحلة. يرجى إلغاؤها أولاً.' : 'Cannot delete a posted invoice. Please cancel it first.')
      return
    }
    if (!window.confirm(isRTL ? 'هل أنت متأكد من حذف هذه الفاتورة؟' : 'Are you sure you want to delete this invoice?')) return
    try {
      await api.delete(`/api/sales-invoices/${invoice.id}`)
      await fetchInvoices()
      showSuccess(isRTL ? 'تم حذف الفاتورة بنجاح' : 'Invoice deleted successfully')
    } catch (e) {
      alert(e?.response?.data?.message || (isRTL ? 'فشل الحذف' : 'Delete failed'))
    }
  }

  const executeStatusChange = async (actionData) => {
    setLoading(true)
    try {
      // Prepare update data
      let updates = { status: actionData.nextStatus }
      if (actionData.type === 'cancel') updates.cancel_reason = statusReason
      
      // Call API to update status
      await api.put(`/api/sales-invoices/${actionData.invoiceId}`, updates)
      
      // Refresh data
      await fetchInvoices()
      
      showSuccess(isRTL ? 'تم تحديث الحالة بنجاح' : 'Status updated successfully')
      setShowStatusModal(false)
      setStatusAction(null)
    } catch (e) {
      console.error('Update failed:', e)
      const msg = e?.response?.data?.message || (isRTL ? 'فشل التحديث' : 'Update failed')
      const errors = e?.response?.data?.errors
      if (errors && typeof errors === 'object') {
        const firstKey = Object.keys(errors)[0]
        const firstMsg = firstKey ? (Array.isArray(errors[firstKey]) ? errors[firstKey][0] : errors[firstKey]) : null
        alert(firstMsg || msg)
      } else {
        alert(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // Filtering Logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search
      if (q) {
        const query = q.toLowerCase()
        const match =
          String(item.invoiceNumber || item.id || '').toLowerCase().includes(query) ||
          String(item.customerName || '').toLowerCase().includes(query) ||
          String(item.orderUuid || item.orderId || '').toLowerCase().includes(query)
        if (!match) return false
      }

      // Filters
      if (filters.status && item.status !== filters.status) return false
      if (filters.paymentStatus && item.paymentStatus !== filters.paymentStatus) return false
      if (filters.customerName && item.customerName !== filters.customerName) return false
      if (filters.orderId && String(item.orderUuid || item.orderId || '').toLowerCase().indexOf(filters.orderId.toLowerCase()) === -1) return false
      
      // Total range
      const totalVal = Number(item.total) || 0
      if (filters.totalMin && totalVal < Number(filters.totalMin)) return false
      if (filters.totalMax && totalVal > Number(filters.totalMax)) return false
      
      // Invoice type
      if (filters.invoiceType && item.invoiceType !== filters.invoiceType) return false
      
      if (filters.dateFrom) {
        if (new Date(item.issueDate) < new Date(filters.dateFrom)) return false
      }
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo)
        endDate.setDate(endDate.getDate() + 1)
        if (new Date(item.issueDate) >= endDate) return false
      }
      
      // Due date range
      if (filters.dueDateFrom) {
        if (new Date(item.dueDate) < new Date(filters.dueDateFrom)) return false
      }
      if (filters.dueDateTo) {
        const endDue = new Date(filters.dueDateTo)
        endDue.setDate(endDue.getDate() + 1)
        if (new Date(item.dueDate) >= endDue) return false
      }
      
      // CreatedAt range
      if (filters.createdAtFrom) {
        if (new Date(item.createdAt) < new Date(filters.createdAtFrom)) return false
      }
      if (filters.createdAtTo) {
        const endCreated = new Date(filters.createdAtTo)
        endCreated.setDate(endCreated.getDate() + 1)
        if (new Date(item.createdAt) >= endCreated) return false
      }

      return true
    })
  }, [items, q, filters])

  // Pagination Logic
  const paginatedItems = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => {
      const aVal = a[sortBy]
      const bVal = b[sortBy]
      if (aVal === bVal) return 0
      if (sortOrder === 'asc') return aVal > bVal ? 1 : -1
      return aVal < bVal ? 1 : -1
    })
    return sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  }, [filteredItems, sortBy, sortOrder, currentPage, itemsPerPage])

  const pageCount = Math.ceil(filteredItems.length / itemsPerPage)

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  // Exports
  // Calculate export count for button label
  const exportCount = useMemo(() => {
    if (selectedItems.length > 0) return selectedItems.length

    if (!exportFrom && !exportTo) return filteredItems.length
    
    const start = parseInt(exportFrom)
    const end = parseInt(exportTo)
    
    if (!start || !end || start > end || start < 1) return 0
    
    return filteredItems.slice((start - 1) * itemsPerPage, end * itemsPerPage).length
  }, [filteredItems, exportFrom, exportTo, itemsPerPage, selectedItems])

  const handleExportRange = () => {
    let itemsToExport = []
    let filename = ''

    // Priority 1: Checkbox Selection
    if (selectedItems.length > 0) {
      itemsToExport = items.filter(item => selectedItems.includes(item.id))
      filename = 'selected_invoices_export.xlsx'
    } 
    // Priority 2: Page Range (if no selection)
    else if (exportFrom && exportTo) {
      const start = parseInt(exportFrom)
      const end = parseInt(exportTo)
      
      if (!start || !end || start > end || start < 1) {
        alert(isRTL ? 'الرجاء إدخال نطاق صفحات صحيح أو ترك الحقول فارغة لتصدير الكل' : 'Please enter a valid page range or leave empty to export all')
        return
      }

      itemsToExport = filteredItems.slice((start - 1) * itemsPerPage, end * itemsPerPage)
      filename = `invoices_pages_${start}_to_${end}.xlsx`
    }
    // Priority 3: All Filtered (Default)
    else {
      itemsToExport = filteredItems
      filename = 'filtered_invoices_export.xlsx'
    }
    
    if (itemsToExport.length === 0) {
      alert(isRTL ? 'لا توجد بيانات لتصديرها' : 'No data to export')
      return
    }

    const data = itemsToExport.map(item => ({
      'Invoice #': item.invoiceNumber || item.id,
      'Status': item.status,
      'Date': item.issueDate ? new Date(item.issueDate).toLocaleDateString() : '',
      'Due Date': new Date(item.dueDate).toLocaleDateString(),
      'Customer': item.customerName,
      'Order #': item.orderUuid || item.orderId,
      'Total Amount': item.total,
      'Paid': item.paidAmount,
      'Remaining': item.balanceDue ?? (item.total - item.paidAmount - (item.advanceAppliedAmount || 0)),
      'Payment Status': item.paymentStatus
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Invoices")
    XLSX.writeFile(wb, filename)
    logExportEvent({
      module: 'Sales Invoices',
      fileName: filename,
      format: 'xlsx',
    })
    showSuccess(isRTL ? `تم تصدير ${itemsToExport.length} فاتورة` : `Exported ${itemsToExport.length} invoices`)
  }

  const handleExportAll = () => {
    const data = items.map(item => ({
      'Invoice #': item.invoiceNumber || item.id,
      'Status': item.status,
      'Date': item.issueDate ? new Date(item.issueDate).toLocaleDateString() : '',
      'Due Date': new Date(item.dueDate).toLocaleDateString(),
      'Customer': item.customerName,
      'Order #': item.orderUuid || item.orderId,
      'Total Amount': item.total,
      'Paid': item.paidAmount,
      'Remaining': item.balanceDue ?? (item.total - item.paidAmount - (item.advanceAppliedAmount || 0)),
      'Payment Status': item.paymentStatus
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Invoices")
    const fileName = "invoices_export.xlsx"
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: 'Sales Invoices',
      fileName,
      format: 'xlsx',
    })
  }

  const handleImport = async (importedItems) => {
    try {
      for (const item of importedItems) {
        // Ensure item matches backend structure
        const payload = {
          ...item,
          issue_date: item.date || new Date().toISOString(),
          customer_name: item.customerName || 'Unknown',
          items: item.items || [],
          total: item.total || 0,
          status: 'Draft'
        }
        await api.post('/api/sales-invoices', payload)
      }
      
      await fetchInvoices()
      setShowImportModal(false)
      showSuccess(isRTL ? 'تم استيراد البيانات بنجاح' : 'Data imported successfully')
    } catch (e) {
      console.error('Import failed:', e)
      alert(isRTL ? 'فشل الاستيراد' : 'Import failed')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="rounded-xl p-4 md:p-6 relative mb-6">
        <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-start gap-3">
            <div className="relative flex flex-col items-start gap-1">
              <h1 className={`text-xl md:text-2xl font-bold text-start ${isLight ? 'text-black' : 'text-white'}  flex items-center gap-2`}>
                {isRTL ? 'فواتير المبيعات' : 'Sales Invoices'}
                <span className="text-sm font-normal text-[var(--muted-text)] bg-[var(--card-bg)] px-2 py-0.5 rounded-full border border-[var(--border-color)]">
                  {filteredItems.length}
                </span>
              </h1>
              <p className="text-sm text-[var(--muted-text)]">
                {isRTL ? 'إدارة ومتابعة فواتير المبيعات والمدفوعات' : 'Manage sales invoices and track payments'}
              </p>
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-wrap lg:flex-row items-stretch lg:items-center gap-2 lg:gap-3">
            <button 
              onClick={() => setShowImportModal(true)}
              className="btn btn-sm w-full lg:w-auto bg-blue-600 hover:bg-blue-700 !text-white border-none flex items-center justify-center gap-2"
            >
              <FaFileImport /> {isRTL ? 'استيراد' : 'Import'}
            </button>
            <button 
              onClick={() => {
                setEditingItem(null)
                setShowForm(true)
              }}
              className="btn btn-sm bg-green-700  hover:bg-blue-700 !text-white border-none gap-2"
            >
              <FaPlus /> {isRTL ? 'فاتورة جديدة' : 'New Invoice'}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className={`${surfaceClass} p-4 rounded-xl mb-6 shadow-sm`}>
        <div className="flex justify-between items-center mb-3">
          <h2 className={`text-sm font-semibold flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} `}>
            <Filter className="text-blue-500" size={16} /> {isRTL ? 'تصفية' : 'Filter'}
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowAllFilters(prev => !prev)} 
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isLight
                  ? 'text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100'
                  : 'text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20'
              }`}
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض المزيد' : 'Show More')} 
              <ChevronDown size={14} className={`transform transition-transform ${showAllFilters ? 'rotate-180' : ''}`} />
            </button>
            <button 
              onClick={() => {
                setQ('')
                setFilters({ 
                  status: '', 
                  paymentStatus: '', 
                  customerName: '', 
                  orderId: '',
                  dateFrom: '', 
                  dateTo: '',
                  dueDateFrom: '',
                  dueDateTo: '',
                  totalMin: '',
                  totalMax: '',
                  invoiceType: '',
                  createdAtFrom: '',
                  createdAtTo: '',
                  datePeriod: '' 
                })
              }} 
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        {/* Primary Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Search */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Search className="text-blue-500" size={10} /> {isRTL ? 'بحث عام' : 'Search All Data'}
            </label>
            <input
              className={`input w-full ${inputClass}`}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={isRTL ? 'بحث في كل البيانات...' : 'Search in all data...'}
            />
          </div>

          {/* 2. Status */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'الحالة' : 'Status'}
            </label>
            <SearchableSelect
              value={filters.status}
              onChange={(val) => setFilters(prev => ({ ...prev, status: val }))}
              options={[
                { value: 'Draft', label: isRTL ? 'مسودة' : 'Draft' },
                { value: 'Posted', label: isRTL ? 'مرحلة' : 'Posted' },
                { value: 'Cancelled', label: isRTL ? 'ملغاة' : 'Cancelled' }
              ]}
              placeholder={isRTL ? 'كل الحالات' : 'All Statuses'}
              isRTL={isRTL}
            />
          </div>

          {/* 3. Customer Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'العميل' : 'Customer'}
            </label>
             <SearchableSelect
              value={filters.customerName}
              onChange={(val) => setFilters(prev => ({ ...prev, customerName: val }))}
              options={[
                { value: "", label: isRTL ? 'الكل' : 'All' },
                ...Array.from(new Set(items.map(i => i.customerName).filter(Boolean))).map(name => ({
                  value: name,
                  label: name
                }))
              ]}
              placeholder={isRTL ? 'اختر العميل' : 'Select Customer'}
              isRTL={isRTL}
            />
          </div>

          {/* 4. Total Min/Max */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'الإجمالي (حد أدنى/أقصى)' : 'Total (Min/Max)'}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={isRTL ? 'حد أدنى' : 'Min'}
                value={filters.totalMin}
                onChange={(e) => setFilters(prev => ({ ...prev, totalMin: e.target.value }))}
                className={`input w-full ${inputClass}`}
              />
              <input
                type="number"
                placeholder={isRTL ? 'حد أقصى' : 'Max'}
                value={filters.totalMax}
                onChange={(e) => setFilters(prev => ({ ...prev, totalMax: e.target.value }))}
                className={`input w-full ${inputClass}`}
              />
            </div>
          </div>
          
        </div>

        {/* Secondary/Hidden Filters Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 transition-all duration-300 overflow-hidden ${showAllFilters ? 'max-h-[800px] opacity-100 pt-3' : 'max-h-0 opacity-0'}`}>

           {/* Payment Status */}
           <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'حالة الدفع' : 'Payment Status'}
            </label>
            <SearchableSelect
              value={filters.paymentStatus}
              onChange={(val) => setFilters(prev => ({ ...prev, paymentStatus: val }))}
              options={[
                { value: 'Unpaid', label: isRTL ? 'غير مدفوعة' : 'Unpaid' },
                { value: 'Partial', label: isRTL ? 'دفع جزئي' : 'Partial Payment' },
                { value: 'Paid', label: isRTL ? 'مدفوعة' : 'Paid' }
              ]}
              placeholder={isRTL ? 'حالة الدفع' : 'Payment Status'}
              isRTL={isRTL}
            />
          </div>
          
          {/* Invoice Type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'نوع الفاتورة' : 'Invoice Type'}
            </label>
            <SearchableSelect
              value={filters.invoiceType}
              onChange={(val) => setFilters(prev => ({ ...prev, invoiceType: val }))}
              options={[
                { value: 'Full', label: isRTL ? 'دفع كامل' : 'Full Payment' },
                { value: 'Partial', label: isRTL ? 'دفع جزئي' : 'Partial Payment' },
                { value: 'Advance', label: isRTL ? 'دفع مؤجل' : 'Deferred Payment' }
              ]}
              placeholder={isRTL ? 'كل الأنواع' : 'All Types'}
              isRTL={isRTL}
            />
          </div>


          {/* Due Date Range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Calendar className="text-blue-500" size={10} /> {isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}
            </label>
            <div className="w-full">
              <DatePicker
                popperContainer={({ children }) => createPortal(children, document.body)}
                selectsRange={true}
                startDate={filters.dueDateFrom ? new Date(filters.dueDateFrom) : null}
                endDate={filters.dueDateTo ? new Date(filters.dueDateTo) : null}
                onChange={(update) => {
                  const [start, end] = update;
                  setFilters(prev => ({
                    ...prev,
                    dueDateFrom: start ? start.toISOString().split('T')[0] : '',
                    dueDateTo: end ? end.toISOString().split('T')[0] : ''
                  }));
                }}
                isClearable={true}
                placeholderText={isRTL ? 'اختر الفترة الزمنية' : 'Select Due Date Range'}
                className={`input w-full text-sm ${inputClass}`}
                dateFormat="yyyy-MM-dd"
              />
            </div>
          </div>
          
          {/* Creation Date Range */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Calendar className="text-blue-500" size={10} /> {isRTL ? 'تاريخ الإنشاء' : 'Creation Date'}
            </label>
            <div className="w-full">
              <DatePicker
                popperContainer={({ children }) => createPortal(children, document.body)}
                selectsRange={true}
                startDate={filters.createdAtFrom ? new Date(filters.createdAtFrom) : null}
                endDate={filters.createdAtTo ? new Date(filters.createdAtTo) : null}
                onChange={(update) => {
                  const [start, end] = update;
                  setFilters(prev => ({
                    ...prev,
                    createdAtFrom: start ? start.toISOString().split('T')[0] : '',
                    createdAtTo: end ? end.toISOString().split('T')[0] : ''
                  }));
                }}
                isClearable={true}
                placeholderText={isRTL ? 'اختر الفترة الزمنية' : 'Select Creation Date Range'}
                className={`input w-full text-sm ${inputClass}`}
                dateFormat="yyyy-MM-dd"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`${surfaceClass} overflow-hidden rounded-xl shadow-sm`}>
        {loading ? (
          <div className="p-8 text-center text-[var(--muted-text)]">
            <span className="loading loading-spinner loading-md"></span>
            <p className="mt-2">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto min-h-[400px] hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead className={`text-xs uppercase ${isLight ? 'text-black' : 'text-white'} font-semibold backdrop-blur-sm`}>
                <tr>
                  <th className={`p-4 w-10 min-w-[44px] backdrop-blur-sm ${softSurfaceClass}`}>
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-xs"
                      checked={paginatedItems.length > 0 && selectedItems.length === paginatedItems.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th onClick={() => handleSort('id')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[120px]">
                    {isRTL ? 'رقم الفاتورة' : 'Invoice #'}
                  </th>
                  <th onClick={() => handleSort('status')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[120px]">
                    {isRTL ? 'الحالة' : 'Status'}
                  </th>

                  <th onClick={() => handleSort('dueDate')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[140px]">
                    {isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </th>
                  <th onClick={() => handleSort('createdAt')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[140px]">
                    {isRTL ? 'تاريخ الإنشاء' : 'Creation Date'}
                  </th>
                  <th onClick={() => handleSort('customerName')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[180px]">
                    {isRTL ? 'العميل' : 'Customer'}
                  </th>
                  <th onClick={() => handleSort('orderId')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[140px]">
                    {isRTL ? 'رقم الطلب' : 'Order #'}
                  </th>
                  <th onClick={() => handleSort('invoiceType')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[140px]">
                    {isRTL ? 'نوع الفاتورة' : 'Invoice Type'}
                  </th>
                  <th onClick={() => handleSort('total')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[120px]">
                    {isRTL ? 'إجمالي المبلغ' : 'Total Amount'}
                  </th>
                  <th onClick={() => handleSort('paidAmount')} className="p-4 cursor-pointer hover:text-blue-600 whitespace-nowrap transition-colors min-w-[120px]">
                    {isRTL ? 'المدفوع' : 'Paid'}
                  </th>
                  <th className="p-4 whitespace-nowrap min-w-[120px]">
                    {isRTL ? 'المتبقي' : 'Remaining'}
                  </th>
                  <th className="p-4 text-end min-w-[220px]">
                    {isRTL ? 'إجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--panel-border)] text-sm">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-[var(--muted-text)]">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-3xl">🔍</div>
                        <p>{isRTL ? 'لا توجد بيانات' : 'No data found'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                   paginatedItems.map((item) => {
                     const balanceDue = Number(item.balanceDue ?? ((Number(item.total) || 0) - (Number(item.paidAmount) || 0) - (Number(item.advanceAppliedAmount) || 0))) || 0
                     const overdue = isOverdueInvoice(item, balanceDue)
                     return (
                       <tr 
                        key={item.id} 
                        className={`
                          group transition-colors cursor-pointer
                          ${activeRowId === item.id
                            ? (isLight ? 'bg-blue-50' : 'bg-blue-500/12')
                            : (isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5')}
                          ${selectedItems.includes(item.id) ? (isLight ? 'bg-blue-50/80' : 'bg-blue-500/10') : ''}
                        `}
                        onClick={() => setActiveRowId(activeRowId === item.id ? null : item.id)}
                      >
                        <td
                          className={`p-4 w-10 min-w-[44px] ${
                            activeRowId === item.id || selectedItems.includes(item.id)
                              ? (isLight ? 'bg-blue-50' : 'bg-blue-500/10')
                              : ''
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input 
                            type="checkbox" 
                            className="checkbox checkbox-xs"
                            checked={selectedItems.includes(item.id)}
                            onChange={() => handleSelectRow(item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className={`p-4 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleView(item)
                            }}
                            className="hover:text-blue-600 hover:underline text-left"
                          >
                            {item.invoiceNumber || item.id}
                          </button>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                              item.status === 'Draft' ? ` ${isLight ? 'text-black' : 'text-white'} border-gray-200  dark:text-gray-300 dark:border-gray-700` :
                              item.status === 'Posted' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800' :
                              item.status === 'Cancelled' ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' :
                              'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
                            }`}>
                              {formatInvoiceStatus(item.status)}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                              item.paymentStatus === 'Paid' ? 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' :
                              item.paymentStatus === 'Partial' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800' :
                              'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
                            }`}>
                              {formatPaymentStatus(item.paymentStatus)}
                            </span>
                            {overdue && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium border bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                                {isRTL ? 'متأخرة' : 'Overdue'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className={`p-4 ${isLight ? 'text-black' : 'text-white'}`}>{new Date(item.dueDate).toLocaleDateString()}</td>
                        <td className={`p-4 ${isLight ? 'text-black' : 'text-white'}`}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}</td>
                        <td className={`p-4 ${isLight ? 'text-black' : 'text-white'}`}>{item.customerName}</td>
                        <td className={`p-4 ${isLight ? 'text-black' : 'text-white'}`}>{item.orderUuid || item.orderId || '-'}</td>
                        <td className={`p-4 ${isLight ? 'text-black' : 'text-white'}`}>
                          {item.invoiceType === 'Full'
                            ? (isRTL ? 'دفع كامل' : 'Full Payment')
                            : item.invoiceType === 'Partial'
                              ? (isRTL ? 'دفع جزئي' : 'Partial Payment')
                              : item.invoiceType === 'Advance'
                                ? (isRTL ? 'دفع مؤجل' : 'Deferred Payment')
                                : (item.invoiceType || '-')}
                        </td>
                        <td className={`p-4 font-bold ${isLight ? 'text-black' : 'text-white'}`}>{Number(item.total).toLocaleString()}</td>
                        <td className="p-4 text-green-600">{Number(item.paidAmount || 0).toLocaleString()}</td>
                        <td className="p-4 text-red-500">{balanceDue.toLocaleString()}</td>
                        <td className={`p-4 whitespace-nowrap ${activeRowId === item.id ? 'sticky ltr:right-0 rtl:left-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.1)] dark:shadow-none z-10' : ''}`}>
                          {renderInvoiceActions(item, balanceDue)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4">
            {paginatedItems.length === 0 ? (
               <div className="p-8 text-center text-[var(--muted-text)]">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-3xl">🔍</div>
                    <p>{isRTL ? 'لا توجد بيانات' : 'No data found'}</p>
                  </div>
               </div>
            ) : (
              paginatedItems.map((item) => {
                const balanceDue = Number(item.balanceDue ?? ((Number(item.total) || 0) - (Number(item.paidAmount) || 0) - (Number(item.advanceAppliedAmount) || 0))) || 0
                const overdue = isOverdueInvoice(item, balanceDue)
                return (
                  <div key={item.id} className={`${surfaceClass} p-4 rounded-xl shadow-sm space-y-3`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className={`font-bold flex items-center gap-2 ${isLight ? 'text-[var(--content-text)]' : 'text-white'}`}>
                           {item.invoiceNumber || item.id}
                           {selectedItems.includes(item.id) && <FaCheckCircle className="text-blue-600" size={14} />}
                        </h3>
                        <p className="text-sm text-[var(--muted-text)]">{item.customerName}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 justify-end">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                          item.status === 'Draft' ? ` ${isLight ? 'text-black' : 'text-white'} border-gray-200  dark:text-gray-300 dark:border-gray-700` :
                          item.status === 'Posted' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800' :
                          item.status === 'Cancelled' ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' :
                          'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
                        }`}>
                          {formatInvoiceStatus(item.status)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                          item.paymentStatus === 'Paid' ? 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' :
                          item.paymentStatus === 'Partial' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800' :
                          'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
                        }`}>
                          {formatPaymentStatus(item.paymentStatus)}
                        </span>
                        {overdue && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium border bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                            {isRTL ? 'متأخرة' : 'Overdue'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-[var(--muted-text)] block text-xs">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</span>
                        <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{new Date(item.dueDate).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted-text)] block text-xs">{isRTL ? 'نوع الفاتورة' : 'Invoice Type'}</span>
                        <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                          {item.invoiceType === 'Full'
                            ? (isRTL ? 'دفع كامل' : 'Full Payment')
                            : item.invoiceType === 'Partial'
                              ? (isRTL ? 'دفع جزئي' : 'Partial Payment')
                              : item.invoiceType === 'Advance'
                                ? (isRTL ? 'دفع مؤجل' : 'Deferred Payment')
                                : (item.invoiceType || '-')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted-text)] block text-xs">{isRTL ? 'إجمالي المبلغ' : 'Total Amount'}</span>
                        <span className={`font-bold ${isLight ? 'text-black' : 'text-white'}`}>{Number(item.total).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted-text)] block text-xs">{isRTL ? 'المدفوع' : 'Paid'}</span>
                        <span className="font-medium text-green-600">{Number(item.paidAmount || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted-text)] block text-xs">{isRTL ? 'المتبقي' : 'Remaining'}</span>
                        <span className="font-medium text-red-500">{balanceDue.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--panel-border)]">
                      <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            className="checkbox checkbox-sm"
                            checked={selectedItems.includes(item.id)}
                            onChange={() => handleSelectRow(item.id)}
                          />
                      </div>
                      <div className="flex items-center gap-2">
                        {renderInvoiceActions(item, balanceDue)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          </>
        )}

        {/* Pagination */}
        <nav className="flex flex-col gap-4 p-3 lg:p-4 border-t border-[var(--panel-border)] dark:bg-transparent rounded-b-lg backdrop-blur-sm">
          <div className="flex  lg:flex-row justify-between items-center gap-3">
            {/* Show Entries */}
            <div className={`flex flex-wrap items-center gap-2 w-full lg:w-auto text-sm font-medium ${isLight ? 'text-black' : 'text-white'} `}>
              <span style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{t('Show')}</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => { 
                  setItemsPerPage(Number(e.target.value)); 
                  setCurrentPage(1); 
                }} 
                className={`px-2 py-1 border border-[var(--panel-border)] rounded-md backdrop-blur-sm ${inputClass} text-xs`}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className={`text-xs font-semibold ${isLight ? 'text-black' : 'text-white'} `} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{t('entries')}</span>
              <label htmlFor="page-search" className="sr-only">{t('Search Page')}</label>
              <input
                id="page-search"
                type="text"
                placeholder={t('Go to page...')}
                value={pageSearch}
                onChange={(e) => setPageSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const page = Number(pageSearch)
                    if (page > 0 && page <= Math.ceil(filteredItems.length / itemsPerPage)) {
                      setCurrentPage(page)
                      setPageSearch('')
                    }
                  }
                }}
                className={`ml-2 px-3 py-1.5 border border-[var(--panel-border)] rounded-lg backdrop-blur-sm ${inputClass} text-xs w-full sm:w-64 lg:w-28 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400`}
                style={{ color: theme === 'dark' ? '#ffffff' : undefined }}
              />
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`block px-3 py-2 leading-tight ${isLight ? 'text-black' : 'text-white'} border border-[var(--panel-border)] rounded-l-lg ${isLight ? 'hover:bg-slate-100 hover:text-slate-700' : 'hover:bg-white/10 hover:text-white'} disabled:opacity-50 backdrop-blur-sm`}
              >
                <span className={`sr-only ${isLight ? 'text-black' : 'text-white'}  focus:text-white`}>{t('Previous')}</span>
                <svg className="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
              </button>
              <span className={`text-sm font-medium ${isLight ? 'text-black' : 'text-white'} `} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>
                {t('Page')} <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'} `} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{currentPage}</span> {t('of')} <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'} `} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{Math.ceil(filteredItems.length / itemsPerPage)}</span>
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredItems.length / itemsPerPage)))}
                disabled={currentPage === Math.ceil(filteredItems.length / itemsPerPage)}
                className={`block px-3 py-2 leading-tight ${isLight ? 'text-black' : 'text-white'} border border-[var(--panel-border)] rounded-r-lg ${isLight ? 'hover:bg-slate-100 hover:text-slate-700' : 'hover:bg-white/10 hover:text-white'} disabled:opacity-50 backdrop-blur-sm`}
              >
                <span className={`sr-only ${isLight ? 'text-black' : 'text-white'}  focus:text-white`} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{t('Next')}</span>
                <svg className="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
              </button>
            </div>
          </div>



                  <div className="flex justify-center items-center">
          <div className={`flex items-center flex-wrap gap-2 w-full lg:w-auto border p-2 rounded-lg justify-center ${softSurfaceClass}`}>
            <span className={`text-xs font-semibold ${isLight ? 'text-black' : 'text-white'} `} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{t('Export Pages')}</span>
            <input
              type="number"
              min="1"
              max={Math.ceil(filteredItems.length / itemsPerPage)}
              placeholder="From"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              className={`w-16 px-2 py-1 border border-[var(--panel-border)] rounded-md backdrop-blur-sm ${inputClass} text-xs focus:border-blue-500`}
              style={{ color: theme === 'dark' ? '#ffffff' : undefined }}
            />
            <span className={`text-xs font-semibold ${isLight ? 'text-black' : 'text-white'} `} style={{ color: theme === 'dark' ? '#ffffff' : undefined }}>{t('to')}</span>
            <input
              type="number"
              min="1"
              max={Math.ceil(filteredItems.length / itemsPerPage)}
              placeholder="To"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className={`w-16 px-2 py-1 border border-[var(--panel-border)] rounded-md backdrop-blur-sm ${inputClass} text-xs focus:border-blue-500`}
              style={{ color: theme === 'dark' ? '#ffffff' : undefined }}
            />
            <button
              onClick={handleExportRange}
              className={`btn btn-sm !text-white border-none flex items-center gap-1 ${
                (selectedItems.length > 0 || (exportFrom && exportTo && exportCount > 0))
                  ? 'bg-orange-500 hover:bg-orange-600' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <FaDownload size={12} className="text-white" />
              <span className="text-white">
                {(selectedItems.length > 0 || (exportFrom && exportTo && exportCount > 0)) ? `${isRTL ? 'تصدير المحدد' : 'Export Selected'} (${exportCount})` : t('Export')}
              </span>
            </button>
          </div>
        </div>
        </nav>
      </div>


       {/* Status Modal */}
       {showStatusModal && (
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-bold">
                  {statusAction?.type === 'cancel' ? (isRTL ? 'إلغاء الفاتورة' : 'Cancel Invoice') : (isRTL ? 'تحديث الحالة' : 'Update Status')}
                </h3>
                <button onClick={() => setShowStatusModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimes />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {isRTL ? 'الرجاء إدخال سبب لهذا الإجراء:' : 'Please enter a reason for this action:'}
                </p>
                <textarea
                  className="textarea w-full h-24"
                  placeholder={isRTL ? 'السبب...' : 'Reason...'}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                ></textarea>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-2">
                <button onClick={() => setShowStatusModal(false)} className="btn btn-ghost btn-sm">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={() => executeStatusChange(statusAction)}
                  disabled={!statusReason.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {isRTL ? 'تأكيد' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}

      {showReturnModal && returnInvoice && (
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-bold">{isRTL ? 'استرداد فاتورة' : 'Invoice Refund'}</h3>
                <button onClick={() => { setShowReturnModal(false); setReturnInvoice(null); setReturnLines([]) }} className="text-gray-400 hover:text-gray-600">
                  <FaTimes />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {isRTL
                    ? 'أدخل الكميات المراد استردادها. تُعاد للمخزون المتاح، ويُخفض المدفوع إن وُجد.'
                    : 'Enter quantities to refund. Stock returns to available, and paid amount is reduced when applicable.'}
                </p>
                <p className="text-xs text-gray-500">
                  {isRTL ? 'الفاتورة' : 'Invoice'}: {returnInvoice.invoiceNumber || returnInvoice.id}
                  {(Number(returnInvoice.paidAmount) || 0) > 0
                    ? ` · ${isRTL ? 'مدفوع' : 'Paid'}: ${Number(returnInvoice.paidAmount || 0).toLocaleString()}`
                    : ''}
                </p>
                {returnLines.map((line) => (
                  <div key={line.key} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                    <div>
                      <div className="text-sm font-medium">{line.name || `#${line.item_id}`}</div>
                      <div className="text-xs text-gray-500">
                        {isRTL ? 'مرحّل' : 'Invoiced'}: {line.invoiced}
                        {line.already > 0 ? ` · ${isRTL ? 'مسترد سابقاً' : 'Already refunded'}: ${line.already}` : ''}
                        {line.unitNet > 0 ? ` · ${isRTL ? 'صافي الوحدة' : 'Unit net'}: ${Number(line.unitNet).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{isRTL ? 'الحد' : 'Max'} {line.max}</span>
                    <input
                      type="number"
                      min="0"
                      max={line.max}
                      value={line.quantity}
                      onChange={(e) => {
                        const next = Math.min(line.max, Math.max(0, Number(e.target.value) || 0))
                        setReturnLines((prev) => prev.map((row) => row.key === line.key ? { ...row, quantity: next } : row))
                      }}
                      className="input input-sm w-20"
                    />
                  </div>
                ))}
                {estimateRefundAmount(returnLines, returnInvoice) > 0 && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700 text-sm font-medium">
                    {isRTL ? 'مبلغ الاسترداد التقديري' : 'Estimated refund'}:{' '}
                    {estimateRefundAmount(returnLines, returnInvoice).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-2">
                <button onClick={() => { setShowReturnModal(false); setReturnInvoice(null); setReturnLines([]) }} className="btn btn-ghost btn-sm">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleSubmitReturn}
                  disabled={returning || !returnLines.some((l) => Number(l.quantity) > 0)}
                  className="btn btn-primary btn-sm"
                >
                  {returning ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تأكيد الاسترداد' : 'Confirm Refund')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}

      {/* Success Toast */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-fade-in-up flex items-center gap-2">
          <span className="text-xl">✓</span>
          {successMessage}
        </div>
      )}

      {/* Modals */}
      <SalesInvoicesFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingItem(null); }}
        onSave={handleSaveInvoice}
        initialData={editingItem}
        isRTL={isRTL}
      />

      <SalesInvoicePreviewModal
        isOpen={showPreview}
        onClose={() => { setShowPreview(false); setPreviewItem(null); }}
        invoice={previewItem}
        customers={customersList}
      />

      <SalesInvoicesPaymentModal
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setPaymentItem(null); }}
        onSave={handleSavePayment}
        invoice={paymentItem}
      />

      {showImportModal && (
        <SalesInvoicesImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          isRTL={isRTL}
        />
      )}
    </div>
  )
}

// Components
const KpiCard = ({ title, value, subtext, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  }

  return (
    <div className="glass-card p-4 flex items-start justify-between">
      <div>
        <p className={`text-sm font-medium ${isLight ? 'text-black' : 'text-white'}`}>{title}</p>
        <h3 className={`text-2xl font-bold mt-1 text-gray-800 ${isLight ? 'text-black' : 'text-white' }`}>{value}</h3>
        <p className={`text-xs  mt-1 ${isLight ? 'text-black' : 'text-white'}`}>{subtext}</p>
      </div>
      <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
        {/* Icon based on color/type */}
        <div className="w-6 h-6 rounded-full bg-current opacity-20" />
      </div>
    </div>
  )
}

const getStatusBadge = (status) => {
  const styles = {
    'Draft': 'badge-ghost',
    'Posted': 'badge-info',
    'Paid': 'badge-success',
    'Overdue': 'badge-error',
    'Cancelled': 'badge-warning',
    'Partial': 'badge-warning'
  }
  return styles[status] || 'badge-ghost'
}

const getPaymentStatusBadge = (status) => {
  const styles = {
    'Unpaid': 'badge-error',
    'Partial': 'badge-warning',
    'Paid': 'badge-success'
  }
  return styles[status] || 'badge-ghost'
}
