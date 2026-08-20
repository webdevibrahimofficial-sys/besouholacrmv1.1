import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../shared/context/ThemeProvider'
import { useAppState } from '../shared/context/AppStateProvider'
import { useNavigate, useLocation } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { logExportEvent } from '../utils/api'
import { Users, Target, FileText, DollarSign, Filter, ChevronDown as LucideChevronDown, User, Tag, Briefcase, Calendar, Trophy, ChevronLeft, ChevronRight, Search, Eye } from 'lucide-react'
import { FaFileExport, FaFileExcel, FaFilePdf, FaChevronDown } from 'react-icons/fa'
import { PieChart } from '../shared/components/PieChart'
import { api } from '../utils/api'
import BackButton from '../components/BackButton'
import SearchableSelect from '../components/SearchableSelect'
import CustomerDetailsModal from '../components/CustomerDetailsModal'
import DateRangePicker from '../shared/components/DateRangePicker'
import { canExportReport } from '../shared/utils/reportPermissions'
import { getSourceDisplayName, mapSourceToOption } from '../shared/utils/sourceDisplay'
import { buildCustomerAddress } from '../shared/utils/customerAddress'
import { isRealEstateCompanyType, resolveTenantCompanyTypeSources } from '../shared/utils/tenantCompanyType'

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.data)) return payload.data.data
  if (Array.isArray(payload?.users)) return payload.users
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.sources)) return payload.sources
  return []
}

function formatActivityDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString()
}

function isEmailLike(value) {
  return String(value || '').includes('@')
}

function displayUserName(userOrName) {
  const name = typeof userOrName === 'string'
    ? userOrName.trim()
    : String(userOrName?.name || '').trim()
  if (!name || isEmailLike(name) || name.length < 2) return ''
  return name
}

function isManagerUser(user) {
  const role = String(user?.role || user?.job_title || '').toLowerCase()
  const roleNames = Array.isArray(user?.roles)
    ? user.roles.map((roleRow) => String(roleRow?.name || roleRow || '').toLowerCase())
    : []
  const haystack = [role, ...roleNames].join(' ')
  if (!haystack.trim()) return false
  if (haystack.includes('sales person') || haystack.includes('salesperson')) return false
  return haystack.includes('manager') || haystack.includes('team leader') || haystack.includes('مدير')
}

function itemDisplayName(item) {
  return String(item?.name || item?.name_ar || item?.product || item?.title || '').trim()
}

function translateClientType(type, isRTL) {
  const value = String(type || '').trim()
  const lower = value.toLowerCase()
  if (lower === 'company' || value === 'شركة') return isRTL ? 'شركة' : 'Company'
  if (lower === 'individual' || value === 'فرد') return isRTL ? 'فرد' : 'Individual'
  return value || '—'
}

export default function CustomersReport() {
  const { i18n } = useTranslation()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const navigate = useNavigate()
  const location = useLocation()
  const isRTL = i18n.language === 'ar'
  const { user, company, crmSettings } = useAppState()
  const canExport = canExportReport(user, 'Customers Report')
  const currencyCode = String(crmSettings?.defaultCurrency || crmSettings?.default_currency || 'EGP').toUpperCase()
  const formatMoney = (value) => `${Number(value || 0).toLocaleString()} ${currencyCode}`
  const isRealEstate = isRealEstateCompanyType(...resolveTenantCompanyTypeSources(company, crmSettings))

  const [customers, setCustomers] = useState([])
  const [quotationTotals, setQuotationTotals] = useState(null)
  const [orderTotals, setOrderTotals] = useState(null)
  const [invoiceTotals, setInvoiceTotals] = useState(null)
  const [salesperson, setSalesperson] = useState('all')
  const [manager, setManager] = useState('all')
  const [source, setSource] = useState('all')
  const [selectedItem, setSelectedItem] = useState('all')
  const [convertDateFrom, setConvertDateFrom] = useState('')
  const [convertDateTo, setConvertDateTo] = useState('')
  const [clientType, setClientType] = useState('all')
  const [actionDateFrom, setActionDateFrom] = useState('')
  const [actionDateTo, setActionDateTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(true)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerDetailsModal, setShowCustomerDetailsModal] = useState(false)
  const exportMenuRef = useRef(null)
  const autoExportDoneRef = useRef(false)

  const [usersList, setUsersList] = useState([])
  const [sourcesList, setSourcesList] = useState([])
  const [itemsList, setItemsList] = useState([])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await api.get('/api/users', { params: { all: 1, per_page: 1000 } }).catch(() => api.get('/api/users'))
        setUsersList(unwrapList(res.data))
      } catch (error) {
        console.error('Failed to fetch users for customers report', error)
        setUsersList([])
      }
    }
    const loadSources = async () => {
      try {
        const res = await api.get('/api/sources?active=1').catch(() => api.get('/api/sources'))
        setSourcesList(unwrapList(res.data))
      } catch (error) {
        console.error('Failed to fetch sources for customers report', error)
        setSourcesList([])
      }
    }
    const loadItems = async () => {
      try {
        const res = await api.get('/api/items?all=1')
        setItemsList(unwrapList(res.data))
      } catch (error) {
        console.error('Failed to fetch items for customers report', error)
        setItemsList([])
      }
    }

    loadUsers()
    loadSources()
    if (!isRealEstate) {
      loadItems()
    }
  }, [isRealEstate])

  useEffect(() => {
    let cancelled = false

    const fetchCustomers = async () => {
      try {
        const res = await api.get('/api/reports/customers', {
          params: {
            all: 1,
            salesperson: salesperson !== 'all' ? salesperson : undefined,
            manager: manager !== 'all' ? manager : undefined,
            source: source !== 'all' ? source : undefined,
            client_type: clientType !== 'all' ? clientType : undefined,
            date_from: convertDateFrom || undefined,
            date_to: convertDateTo || undefined,
          },
        })
        const payload = res?.data
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []

        const normalized = rows.map((c) => {
          const billedTotal = Number(c.billedTotal ?? c.billed_total ?? 0)
          const collectedTotal = Number(c.collectedTotal ?? c.collected_total ?? c.totalRevenue ?? c.total_revenue ?? 0)
          const outstandingTotal = Number(c.outstandingTotal ?? c.outstanding_total ?? Math.max(0, billedTotal - collectedTotal))

          return {
            id: c.id,
            name: c.name || '',
            type: c.type || '',
            clientType: c.clientType || (c.company_name ? 'Company' : 'Individual'),
            manager: c.manager || '',
            source: c.source || '',
            project: c.project || '',
            phone: c.phone || '',
            email: c.email || '',
            address: buildCustomerAddress(c) || c.address || c.addressLine || '',
            country: c.country || '',
            city: c.city || '',
            joinedDate: c.joinedDate || c.created_at || '',
            billedTotal,
            collectedTotal,
            outstandingTotal,
            ordersTotal: Number(c.ordersTotal ?? c.orders_total ?? 0),
            totalRevenue: collectedTotal,
            orders: Number(c.orders ?? c.orders_count ?? 0),
            lastActivity: c.lastActivity || c.last_activity || null,
            salesperson: c.salesperson || c.sales_person || '',
            invoicePaidTotal: Number(c.invoicePaidTotal ?? 0),
            invoicePartialTotal: Number(c.invoicePartialTotal ?? 0),
            invoiceUnpaidTotal: Number(c.invoiceUnpaidTotal ?? 0),
            invoicePaidCount: Number(c.invoicePaidCount ?? 0),
            invoicePartialCount: Number(c.invoicePartialCount ?? 0),
            invoiceUnpaidCount: Number(c.invoiceUnpaidCount ?? 0),
            invoicesCount: Number(c.invoicesCount ?? 0),
            opportunitiesCount: Number(c.opportunitiesCount ?? 0),
            quotationTotal: Number(c.quotationTotal ?? 0),
            quotationDraft: Number(c.quotationDraft ?? 0),
            quotationSent: Number(c.quotationSent ?? c.quotationPending ?? 0),
            quotationApproved: Number(c.quotationApproved ?? c.quotationConverted ?? 0),
            quotationRejected: Number(c.quotationRejected ?? c.quotationLost ?? 0),
            revenueBreakdown: c.revenueBreakdown && typeof c.revenueBreakdown === 'object' ? c.revenueBreakdown : {},
          }
        })

        if (!cancelled) {
          setCustomers(normalized)
          const totals = payload?.quotation_totals || payload?.quotationTotals || null
          setQuotationTotals(totals && typeof totals === 'object' ? {
            total: Number(totals.total ?? totals.quotationTotal ?? 0),
            draft: Number(totals.draft ?? totals.quotationDraft ?? 0),
            sent: Number(totals.sent ?? totals.quotationSent ?? 0),
            approved: Number(totals.approved ?? totals.quotationApproved ?? 0),
            rejected: Number(totals.rejected ?? totals.quotationRejected ?? 0),
            orphanTotal: Number(totals.orphan_total ?? totals.orphanTotal ?? 0),
          } : null)
          const orderTotalsPayload = payload?.order_totals || payload?.orderTotals || null
          setOrderTotals(orderTotalsPayload && typeof orderTotalsPayload === 'object' ? {
            total: Number(orderTotalsPayload.total ?? orderTotalsPayload.ordersTotal ?? 0),
            open: Number(orderTotalsPayload.open ?? orderTotalsPayload.openTotal ?? 0),
            draft: Number(orderTotalsPayload.draft ?? 0),
            cancelled: Number(orderTotalsPayload.cancelled ?? orderTotalsPayload.canceled ?? 0),
            orphanTotal: Number(orderTotalsPayload.orphan_total ?? orderTotalsPayload.orphanTotal ?? 0),
          } : null)
          const invoiceTotalsPayload = payload?.invoice_totals || payload?.invoiceTotals || null
          setInvoiceTotals(invoiceTotalsPayload && typeof invoiceTotalsPayload === 'object' ? {
            total: Number(invoiceTotalsPayload.total ?? 0),
            posted: Number(invoiceTotalsPayload.posted ?? 0),
            billed: Number(invoiceTotalsPayload.billed ?? 0),
            collected: Number(invoiceTotalsPayload.collected ?? 0),
            paidTotal: Number(invoiceTotalsPayload.paid_total ?? invoiceTotalsPayload.paidTotal ?? 0),
            partialTotal: Number(invoiceTotalsPayload.partial_total ?? invoiceTotalsPayload.partialTotal ?? 0),
            unpaidTotal: Number(invoiceTotalsPayload.unpaid_total ?? invoiceTotalsPayload.unpaidTotal ?? 0),
            orphanTotal: Number(invoiceTotalsPayload.orphan_total ?? invoiceTotalsPayload.orphanTotal ?? 0),
          } : null)
        }
      } catch (error) {
        console.error('Failed to load customers report data', error)
        if (!cancelled) {
          setCustomers([])
          setQuotationTotals(null)
          setOrderTotals(null)
          setInvoiceTotals(null)
        }
      }
    }

    fetchCustomers()

    return () => {
      cancelled = true
    }
  }, [salesperson, manager, source, clientType, convertDateFrom, convertDateTo])

  const allOption = useMemo(() => ({ value: 'all', label: isRTL ? 'الكل' : 'All' }), [isRTL])

  const salespersonOptions = useMemo(() => {
    const names = [...new Set([
      ...usersList.map((u) => displayUserName(u)),
      ...customers.map((c) => displayUserName(c.salesperson)),
    ].filter(Boolean))]
    return [allOption, ...names.map((name) => ({ value: name, label: name }))]
  }, [usersList, customers, allOption])

  const managerOptions = useMemo(() => {
    const names = [...new Set([
      ...usersList.map((u) => displayUserName(u.manager)),
      ...usersList.filter(isManagerUser).map((u) => displayUserName(u)),
      ...customers.map((c) => displayUserName(c.manager)),
    ].filter(Boolean))]
    return [allOption, ...names.map((name) => ({ value: name, label: name }))]
  }, [usersList, customers, allOption])

  const sourceOptions = useMemo(() => {
    const fromCatalog = sourcesList.map((s) => mapSourceToOption(s, isRTL)).filter(Boolean)
    const extra = customers
      .map((c) => String(c.source || '').trim())
      .filter(Boolean)
      .filter((name) => !fromCatalog.some((opt) => opt.value === name))
      .map((name) => ({ value: name, label: getSourceDisplayName(name, isRTL) || name }))
    return [allOption, ...fromCatalog, ...extra]
  }, [sourcesList, customers, isRTL, allOption])

  const itemOptions = useMemo(() => {
    const names = [...new Set([
      ...itemsList.map(itemDisplayName),
      ...customers.flatMap((c) => Object.keys(c.revenueBreakdown || {})),
    ].filter(Boolean))]
    return [allOption, ...names.map((name) => ({ value: name, label: name }))]
  }, [itemsList, customers, allOption])

  const clientTypeOptions = useMemo(() => [
    allOption,
    { value: 'Individual', label: isRTL ? 'فرد' : 'Individual' },
    { value: 'Company', label: isRTL ? 'شركة' : 'Company' },
  ], [isRTL, allOption])

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const itemOk = selectedItem === 'all' || selectedItem === '' || Object.keys(c.revenueBreakdown || {}).some(
        (key) => String(key).trim().toLowerCase() === String(selectedItem).trim().toLowerCase()
      )
      const actOk = (() => {
        if (!actionDateFrom && !actionDateTo) return true
        const d = c.lastActivity || ''
        if (!d) return false
        if (actionDateFrom && d < actionDateFrom) return false
        if (actionDateTo && d > actionDateTo) return false
        return true
      })()

      return itemOk && actOk
    })
  }, [customers, selectedItem, actionDateFrom, actionDateTo])

  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(filtered.length / entriesPerPage))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return filtered.slice(start, start + entriesPerPage)
  }, [filtered, currentPage, entriesPerPage])

  const isActive = (c) => {
    const last = c.lastActivity ? new Date(c.lastActivity) : null
    if (!last || Number.isNaN(last.getTime())) return false
    const now = new Date()
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24))
    return diffDays <= 60
  }

  const totalCustomers = filtered.length
  // Prefer server scope totals (same visibility as Sales Invoices page) so orphan /
  // unmatched invoices are not dropped when summing per-customer rows only.
  const totalBilled = invoiceTotals && Number.isFinite(invoiceTotals.billed)
    ? invoiceTotals.billed
    : filtered.reduce((s, c) => s + (c.billedTotal || 0), 0)
  const totalCollected = invoiceTotals && Number.isFinite(invoiceTotals.collected)
    ? invoiceTotals.collected
    : filtered.reduce((s, c) => s + (c.collectedTotal || 0), 0)
  // Prefer server scope total (same visibility as Sales Orders page) so orphan /
  // unmatched orders are not dropped when summing per-customer open-order rows only.
  const totalSalesOrders = orderTotals && Number.isFinite(orderTotals.total)
    ? orderTotals.total
    : filtered.reduce((s, c) => s + (c.orders || 0), 0)
  // Prefer server scope total (same visibility as Sales Quotations page) so orphan /
  // unmatched quotes are not dropped when summing per-customer rows only.
  const totalQuotations = quotationTotals && Number.isFinite(quotationTotals.total)
    ? quotationTotals.total
    : filtered.reduce((s, c) => s + (c.quotationTotal || 0), 0)
  const totalInvoices = invoiceTotals && Number.isFinite(invoiceTotals.total)
    ? invoiceTotals.total
    : filtered.reduce((s, c) => s + (c.invoicesCount || 0), 0)

  const quotationsSegments = useMemo(() => {
    const draft = quotationTotals && Number.isFinite(quotationTotals.draft)
      ? quotationTotals.draft
      : filtered.reduce((s, c) => s + (c.quotationDraft || 0), 0)
    const sent = quotationTotals && Number.isFinite(quotationTotals.sent)
      ? quotationTotals.sent
      : filtered.reduce((s, c) => s + (c.quotationSent || 0), 0)
    const approved = quotationTotals && Number.isFinite(quotationTotals.approved)
      ? quotationTotals.approved
      : filtered.reduce((s, c) => s + (c.quotationApproved || 0), 0)
    const rejected = quotationTotals && Number.isFinite(quotationTotals.rejected)
      ? quotationTotals.rejected
      : filtered.reduce((s, c) => s + (c.quotationRejected || 0), 0)
    const total = draft + sent + approved + rejected

    // Same green bucket as Quotations page: status Converted (and Approved/Accepted)
    // are counted together — label as Converted to match the list UI.
    if (!total) {
      return [
        { label: isRTL ? 'مسودة' : 'Draft', value: 0, color: '#94a3b8', pct: 0 },
        { label: isRTL ? 'تم الإرسال' : 'Sent', value: 0, color: '#3b82f6', pct: 0 },
        { label: isRTL ? 'محوّل' : 'Converted', value: 0, color: '#22c55e', pct: 0 },
        { label: isRTL ? 'مرفوض' : 'Rejected', value: 0, color: '#ef4444', pct: 0 },
      ]
    }

    return [
      { label: isRTL ? 'مسودة' : 'Draft', value: draft, color: '#94a3b8', pct: Math.round((draft / total) * 100) },
      { label: isRTL ? 'تم الإرسال' : 'Sent', value: sent, color: '#3b82f6', pct: Math.round((sent / total) * 100) },
      { label: isRTL ? 'محوّل' : 'Converted', value: approved, color: '#22c55e', pct: Math.round((approved / total) * 100) },
      { label: isRTL ? 'مرفوض' : 'Rejected', value: rejected, color: '#ef4444', pct: Math.round((rejected / total) * 100) },
    ]
  }, [filtered, isRTL, quotationTotals])

  const invoicesSegments = useMemo(() => {
    const paid = invoiceTotals && Number.isFinite(invoiceTotals.paidTotal)
      ? invoiceTotals.paidTotal
      : filtered.reduce((s, c) => s + (c.invoicePaidTotal || 0), 0)
    const partial = invoiceTotals && Number.isFinite(invoiceTotals.partialTotal)
      ? invoiceTotals.partialTotal
      : filtered.reduce((s, c) => s + (c.invoicePartialTotal || 0), 0)
    const unpaid = invoiceTotals && Number.isFinite(invoiceTotals.unpaidTotal)
      ? invoiceTotals.unpaidTotal
      : filtered.reduce((s, c) => s + (c.invoiceUnpaidTotal || 0), 0)
    const total = paid + partial + unpaid

    if (!total) {
      return [
        { label: isRTL ? 'مدفوع' : 'Paid', value: 0, color: '#22c55e', pct: 0 },
        { label: isRTL ? 'مدفوع جزئياً' : 'Partially Paid', value: 0, color: '#0ea5e9', pct: 0 },
        { label: isRTL ? 'غير مدفوع' : 'Unpaid', value: 0, color: '#ef4444', pct: 0 },
      ]
    }

    return [
      { label: isRTL ? 'مدفوع' : 'Paid', value: paid, color: '#22c55e', pct: Math.round((paid / total) * 100) },
      { label: isRTL ? 'مدفوع جزئياً' : 'Partially Paid', value: partial, color: '#0ea5e9', pct: Math.round((partial / total) * 100) },
      { label: isRTL ? 'غير مدفوع' : 'Unpaid', value: unpaid, color: '#ef4444', pct: Math.round((unpaid / total) * 100) },
    ]
  }, [filtered, isRTL, invoiceTotals])

  const revenueSegments = useMemo(() => {
    const total = totalBilled || 0
    const palette = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#14b8a6']
    const aggregated = {}

    filtered.forEach((customer) => {
      const breakdown = customer.revenueBreakdown || {}
      Object.entries(breakdown).forEach(([label, value]) => {
        const amount = Number(value || 0)
        if (!label || amount <= 0) return
        aggregated[label] = (aggregated[label] || 0) + amount
      })
    })

    const entries = Object.entries(aggregated)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    if (entries.length === 0) {
      return [
        {
          label: isRTL ? 'المفوتر' : 'Billed',
          value: total,
          color: '#22c55e',
          pct: total > 0 ? 100 : 0,
        },
      ]
    }

    return [
      ...entries.map(([label, value], index) => ({
        label,
        value,
        color: palette[index % palette.length],
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
      })),
    ]
  }, [filtered, totalBilled, isRTL])

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const clearFilters = () => {
    setSalesperson('all')
    setManager('all')
    setSource('all')
    setSelectedItem('all')
    setConvertDateFrom('')
    setConvertDateTo('')
    setClientType('all')
    setActionDateFrom('')
    setActionDateTo('')
    setCurrentPage(1)
  }

  const openCustomerDetails = async (customer) => {
    if (!customer?.id) return
    try {
      const res = await api.get(`/api/customers/${encodeURIComponent(customer.id)}`)
      const payload = res?.data
      const full = payload?.data && !Array.isArray(payload.data) ? payload.data : payload
      const row = full && full.id ? full : customer
      setSelectedCustomer({
        ...row,
        companyName: row.companyName || row.company_name || '',
      })
    } catch (error) {
      console.error('Failed to load customer details', error)
      setSelectedCustomer(customer)
    }
    setShowCustomerDetailsModal(true)
  }

  const exportExcel = () => {
    if (!canExport) return
    const rows = filtered.map(c => ({
      [isRTL ? 'الاسم' : 'Name']: c.name,
      [isRTL ? 'النوع' : 'Type']: translateClientType(c.clientType || c.type, isRTL),
      [isRTL ? 'المصدر' : 'Source']: getSourceDisplayName(c.source, isRTL) || c.source || '',
      [isRTL ? 'العنوان' : 'Address']: c.address || '',
      [isRTL ? 'الهاتف' : 'Phone']: c.phone,
      [isRTL ? 'تاريخ الانضمام' : 'Joined']: c.joinedDate,
      [`${isRTL ? 'المفوتر' : 'Billed'} (${currencyCode})`]: c.billedTotal,
      [`${isRTL ? 'التحصيل' : 'Collected'} (${currencyCode})`]: c.collectedTotal,
      [`${isRTL ? 'المتبقي' : 'Outstanding'} (${currencyCode})`]: c.outstandingTotal,
      [isRTL ? 'الطلبات' : 'Orders']: c.orders,
      [isRTL ? 'آخر نشاط' : 'LastActivity']: c.lastActivity || '',
      [isRTL ? 'مسؤول المبيعات' : 'Salesperson']: c.salesperson,
      [isRTL ? 'الحالة' : 'Status']: isActive(c) ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    const fileName = 'customers_report.xlsx'
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: 'Customers Report',
      fileName,
      format: 'xlsx',
    })
    setShowExportMenu(false)
  }

  const exportPdf = async () => {
    if (!canExport) return
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF()

      const tableColumn = [
        isRTL ? 'اسم العميل' : 'Customer Name',
        isRTL ? 'النوع' : 'Type',
        isRTL ? 'المصدر' : 'Source',
        isRTL ? 'العنوان' : 'Address',
        isRTL ? 'الهاتف' : 'Phone',
        `${isRTL ? 'المفوتر' : 'Billed'} (${currencyCode})`,
        `${isRTL ? 'التحصيل' : 'Collected'} (${currencyCode})`,
        `${isRTL ? 'المتبقي' : 'Outstanding'} (${currencyCode})`,
        isRTL ? 'الطلبات' : 'Orders',
        isRTL ? 'آخر نشاط' : 'Last Activity',
        isRTL ? 'الحالة' : 'Status',
        isRTL ? 'مسؤول المبيعات' : 'Salesperson'
      ]
      const tableRows = []

      filtered.forEach(c => {
        const rowData = [
          c.name,
          translateClientType(c.clientType || c.type, isRTL),
          getSourceDisplayName(c.source, isRTL) || c.source || '—',
          c.address || '—',
          c.phone || '—',
          Number(c.billedTotal || 0).toLocaleString(),
          Number(c.collectedTotal || 0).toLocaleString(),
          Number(c.outstandingTotal || 0).toLocaleString(),
          c.orders,
          formatActivityDate(c.lastActivity),
          isActive(c) ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive'),
          c.salesperson
        ]
        tableRows.push(rowData)
      })

      doc.text(isRTL ? 'تقرير العملاء' : 'Customers Report', 14, 15)
      autoTable.default(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      })
      doc.save('customers_report.pdf')
      logExportEvent({
        module: 'Customers Report',
        fileName: 'customers_report.pdf',
        format: 'pdf',
      })
      setShowExportMenu(false)
    } catch (error) {
      console.error('Export PDF Error:', error)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('export') !== '1') {
      autoExportDoneRef.current = false
      return
    }

    if (!canExport || !filtered.length || autoExportDoneRef.current) return

    autoExportDoneRef.current = true

    const run = async () => {
      const format = String(params.get('format') || 'xlsx').toLowerCase()
      if (format === 'pdf') {
        await exportPdf()
      } else {
        await exportExcel()
      }

      params.delete('export')
      params.delete('format')
      params.delete('file_name')
      const nextSearch = params.toString()
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    }

    run()
  }, [canExport, filtered, location.pathname, location.search, navigate])

  const statusBadge = (active) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'}`}>
      {active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
    </span>
  )

  const kpiCards = [
    {
      label: isRTL ? 'إجمالي العملاء' : 'Total Customers',
      value: totalCustomers.toLocaleString(),
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      label: isRTL ? 'إجمالي عروض الأسعار' : 'Total Quotations',
      value: totalQuotations.toLocaleString(),
      icon: FileText,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-900/20'
    },
    {
      label: isRTL ? 'إجمالي أوامر البيع' : 'Total Sales Orders',
      value: totalSalesOrders.toLocaleString(),
      icon: FileText,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20'
    },
    {
      label: isRTL ? 'إجمالي الفواتير' : 'Total Invoices',
      value: totalInvoices.toLocaleString(),
      icon: FileText,
      color: 'text-pink-600 dark:text-pink-400',
      bgColor: 'bg-pink-50 dark:bg-pink-900/20'
    },
    {
      label: isRTL ? `المفوتر (${currencyCode})` : `Billed (${currencyCode})`,
      value: Number(totalBilled || 0).toLocaleString(),
      icon: DollarSign,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20'
    },
    {
      label: isRTL ? `التحصيل (${currencyCode})` : `Collected (${currencyCode})`,
      value: Number(totalCollected || 0).toLocaleString(),
      icon: DollarSign,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    }
  ]

  return (
    <div className="p-4 md:p-6 bg-[var(--content-bg)] text-[var(--content-text)] overflow-hidden min-w-0">
      <div className="mb-6">
        <BackButton to="/reports" />
        <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-2`}>
          {isRTL ? 'تقرير العملاء' : 'Customers Report'}
        </h1>
        <p className={`${isLight ? 'text-black' : 'text-white'} text-sm`}>
          {isRTL ? 'تحليل العملاء والمفوتر والتحصيل والأنشطة التجارية' : 'Analyze customers, billed vs collected, and commercial activity'}
        </p>
      </div>

      <div className=" backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 p-6 mb-8">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-400" />
            <h3>{isRTL ? 'تصفية' : 'Filter'}</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllFilters(prev => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <LucideChevronDown size={12} className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button
              onClick={clearFilters}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'مسؤول المبيعات' : 'Salesperson'}
              </label>
              <SearchableSelect
                value={salesperson}
                onChange={(v) => {
                  setSalesperson(v || 'all')
                  setCurrentPage(1)
                }}
                options={salespersonOptions}
                isRTL={isRTL}
                className="min-w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'المدير' : 'Manager'}
              </label>
              <SearchableSelect
                value={manager}
                onChange={(v) => {
                  setManager(v || 'all')
                  setCurrentPage(1)
                }}
                options={managerOptions}
                isRTL={isRTL}
                className="min-w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'المصدر' : 'Source'}
              </label>
              <SearchableSelect
                value={source}
                onChange={(v) => {
                  setSource(v || 'all')
                  setCurrentPage(1)
                }}
                options={sourceOptions}
                isRTL={isRTL}
                className="min-w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'الصنف' : 'Item'}
              </label>
              <SearchableSelect
                value={selectedItem}
                onChange={(v) => {
                  setSelectedItem(v || 'all')
                  setCurrentPage(1)
                }}
                options={itemOptions}
                isRTL={isRTL}
                className="min-w-[160px]"
              />
            </div>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${showAllFilters ? 'max-h-[200px] opacity-100 pt-2' : 'max-h-0 opacity-0'}`}>
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'تاريخ التحويل' : 'Convert Date'}
              </label>
              <DateRangePicker
                from={convertDateFrom}
                to={convertDateTo}
                onChange={({ from, to }) => {
                  setConvertDateFrom(from)
                  setConvertDateTo(to)
                  setCurrentPage(1)
                }}
                isRTL={isRTL}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'نوع العميل' : 'Customer Type'}
              </label>
              <SearchableSelect
                value={clientType}
                onChange={(v) => {
                  setClientType(v || 'all')
                  setCurrentPage(1)
                }}
                options={clientTypeOptions}
                isRTL={isRTL}
                className="min-w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'تاريخ الإجراء' : 'Action Date'}
              </label>
              <DateRangePicker
                from={actionDateFrom}
                to={actionDateTo}
                onChange={({ from, to }) => {
                  setActionDateFrom(from)
                  setActionDateTo(to)
                  setCurrentPage(1)
                }}
                isRTL={isRTL}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon
          return (
            <div
              key={idx}
              className="group relative  backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden h-32"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110">
                <Icon size={80} className={card.color} />
              </div>
              <div className="flex flex-col justify-between h-full relative z-10">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${card.bgColor} ${card.color}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className={`${isLight ? 'text-black' : 'text-white'} text-sm font-semibold opacity-80`}>
                    {card.label}
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2 rtl:space-x-reverse pl-1">
                  <span className={`text-2xl font-bold ${card.color}`}>
                    {card.value}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {[
          {
            title: isRTL ? 'عروض الأسعار' : 'Quotations',
            totalLabel: isRTL ? 'إجمالي عروض الأسعار' : 'Total Quotations',
            total: totalQuotations,
            segments: quotationsSegments
          },
          {
            title: isRTL ? 'الفواتير' : 'Invoices',
            totalLabel: isRTL ? 'إجمالي المفوتر' : 'Total Billed',
            total: totalBilled,
            segments: invoicesSegments
          },
          {
            title: isRTL ? 'المفوتر' : 'Billed',
            totalLabel: isRTL ? 'إجمالي المفوتر' : 'Total Billed',
            total: totalBilled,
            segments: revenueSegments
          }
        ].map(card => (
          <div
            key={card.title}
            className="group relative  backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
          >
        <div className={`text-sm font-semibold mb-2 ${isLight ? 'text-black' : 'text-white'} text-center md:text-left`}>
              {card.title}
            </div>
            <div className="h-48 flex items-center justify-center">
              <PieChart
                segments={card.segments}
                size={170}
                centerValue={card.total}
                centerLabel={card.totalLabel}
              />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {card.segments.map(segment => (
                <div key={segment.label} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className={`${isLight ? 'text-black' : 'text-white'}`}>
                    {segment.label}: {card.title === (isRTL ? 'عروض الأسعار' : 'Quotations')
                      ? segment.value.toLocaleString()
                      : formatMoney(segment.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>
            {isRTL ? 'العملاء' : 'Customers'}
          </h2>
          {canExport && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                <FaFileExport /> {isRTL ? 'تصدير' : 'Export'}
                <FaChevronDown className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} size={12} />
              </button>

              {showExportMenu && (
                <div className={`absolute top-full ${isRTL ? 'left-0' : 'right-0'} mt-1  rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}>
                  <button
                    onClick={exportExcel}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFileExcel className="text-green-600" /> {isRTL ? 'تصدير كـ Excel' : 'Export to Excel'}
                  </button>
                  <button
                    onClick={exportPdf}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className="text-red-600" /> {isRTL ? 'تصدير كـ PDF' : 'Export to PDF'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4">
          {/* Mobile View - Cards */}
          <div className="md:hidden space-y-4">
            {paginatedRows.map(c => (
              <div key={c.id} className="rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openCustomerDetails(c)}
                      className={`text-lg font-semibold text-start text-blue-600 dark:text-blue-400 hover:underline`}
                    >
                      {c.name}
                    </button>
                    <span className={`block text-xs ${isLight ? 'text-black' : 'text-white'} opacity-70`}>
                      {translateClientType(c.clientType || c.type, isRTL)}
                    </span>
                  </div>
                  <div>{statusBadge(isActive(c))}</div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                    <span className="text-xs">{isRTL ? 'الهاتف' : 'Phone'}:</span>
                    <span className="font-medium" dir="ltr">{c.phone || '—'}</span>
                  </div>
                  <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                    <span className="text-xs">{isRTL ? 'المصدر' : 'Source'}:</span>
                    <span className="font-medium">{getSourceDisplayName(c.source, isRTL) || c.source || '—'}</span>
                  </div>
                  <div className={`flex items-start gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                    <span className="text-xs shrink-0">{isRTL ? 'العنوان' : 'Address'}:</span>
                    <span className="font-medium break-words">{c.address || '—'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="flex flex-col">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'المفوتر' : 'Billed'}</span>
                      <span className={`font-medium tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{formatMoney(c.billedTotal)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'التحصيل' : 'Collected'}</span>
                      <span className={`font-medium tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{formatMoney(c.collectedTotal)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'المتبقي' : 'Outstanding'}</span>
                      <span className={`font-medium tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{formatMoney(c.outstandingTotal)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'الطلبات' : 'Orders'}</span>
                      <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{c.orders}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'آخر نشاط' : 'Last Activity'}</span>
                      <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{formatActivityDate(c.lastActivity)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'مسؤول المبيعات' : 'Salesperson'}</span>
                      <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{displayUserName(c.salesperson) || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
                <div className={`text-center py-8 ${isLight ? 'text-black' : 'text-white'}`}>
                    {isRTL ? 'لا توجد بيانات' : 'No data'}
                </div>
            )}
          </div>

          {/* Desktop View - Table */}
          <div className="hidden md:block overflow-x-auto">
          <table className={`w-full min-w-[1100px] text-sm text-left ${isLight ? 'text-black' : 'text-white'}`}>
            <thead className={`text-xs uppercase bg-white/5 dark:bg-white/5 border-b border-black/10 dark:border-white/15 ${isLight ? 'text-black' : 'text-white'}`}>
              <tr>
                <th className="px-4 py-3 text-start whitespace-nowrap min-w-[160px]">{isRTL ? 'اسم العميل' : 'Customer Name'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap">{isRTL ? 'النوع' : 'Type'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap min-w-[120px]">{isRTL ? 'المصدر' : 'Source'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap min-w-[160px]">{isRTL ? 'العنوان' : 'Address'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap min-w-[120px]">{isRTL ? 'الهاتف' : 'Phone'}</th>
                <th className="px-4 py-3 text-end whitespace-nowrap min-w-[120px]">{isRTL ? 'المفوتر' : 'Billed'}</th>
                <th className="px-4 py-3 text-end whitespace-nowrap min-w-[120px]">{isRTL ? 'التحصيل' : 'Collected'}</th>
                <th className="px-4 py-3 text-end whitespace-nowrap min-w-[120px]">{isRTL ? 'المتبقي' : 'Outstanding'}</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">{isRTL ? 'الطلبات' : 'Orders'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap">{isRTL ? 'آخر نشاط' : 'Last Activity'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap">{isRTL ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-start whitespace-nowrap min-w-[140px]">{isRTL ? 'مسؤول المبيعات' : 'Salesperson'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 dark:divide-gray-700/50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-[var(--muted-text)]">{isRTL ? 'لا توجد بيانات' : 'No data'}</td>
                </tr>
              )}
              {filtered.length > 0 && paginatedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-6 text-center text-[var(--muted-text)]"
                  >
                    {isRTL ? 'لا توجد نتائج' : 'No results'}
                  </td>
                </tr>
              )}
              {paginatedRows.map(c => (
                <tr key={c.id} className="hover:bg-white/5 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => openCustomerDetails(c)}
                      className="text-start text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{translateClientType(c.clientType || c.type, isRTL)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{getSourceDisplayName(c.source, isRTL) || c.source || '—'}</td>
                  <td className="px-4 py-3 max-w-[220px] truncate" title={c.address || ''}>{c.address || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap" dir="ltr">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap">{formatMoney(c.billedTotal)}</td>
                  <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap">{formatMoney(c.collectedTotal)}</td>
                  <td className="px-4 py-3 text-end tabular-nums whitespace-nowrap">{formatMoney(c.outstandingTotal)}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">{c.orders}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatActivityDate(c.lastActivity)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{statusBadge(isActive(c))}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{displayUserName(c.salesperson) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
          <div className="px-6 py-3 border-t border-theme-border dark:border-gray-700/60 flex sm:flex-row items-center justify-between gap-3">
            <div className={`text-[11px] sm:text-xs ${isLight ? 'text-black' : 'text-white'} opacity-70`}>
            {isRTL
              ? `إظهار ${Math.min((currentPage - 1) * entriesPerPage + 1, filtered.length)}-${Math.min(currentPage * entriesPerPage, filtered.length)} من ${filtered.length}`
              : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, filtered.length)}-${Math.min(currentPage * entriesPerPage, filtered.length)} of ${filtered.length}`}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                title={isRTL ? 'السابق' : 'Prev'}
              >
                {isRTL ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
              <span className="text-sm whitespace-nowrap">
                {isRTL
                  ? `الصفحة ${currentPage} من ${pageCount}`
                  : `Page ${currentPage} of ${pageCount}`}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))}
                disabled={currentPage === pageCount}
                title={isRTL ? 'التالي' : 'Next'}
              >
                {isRTL ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] sm:text-xs text-[var(--muted-text)] whitespace-nowrap">
                {isRTL ? 'لكل صفحة:' : 'Per page:'}
              </span>
              <select
                className="input w-24 text-sm py-0 px-2 h-8"
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {showCustomerDetailsModal && selectedCustomer && (
        <CustomerDetailsModal
          isOpen={showCustomerDetailsModal}
          onClose={() => {
            setShowCustomerDetailsModal(false)
            setSelectedCustomer(null)
          }}
          customer={selectedCustomer}
          initialTab="details"
          isRTL={isRTL}
        />
      )}
    </div>
  )
}
