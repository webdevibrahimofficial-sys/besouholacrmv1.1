import { useState, useEffect, useRef, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../shared/context/ThemeProvider'
import { api } from '../utils/api'
import { buildCustomerAddress } from '../shared/utils/customerAddress'
import { FaFileInvoiceDollar, FaTimes, FaHashtag, FaUser, FaBoxOpen, FaCalendarAlt, FaPlus, FaTrash, FaStickyNote, FaPaperclip, FaSave } from 'react-icons/fa'
import SearchableSelect from './SearchableSelect'
import { getQuotationLineAddonsTotal, getQuotationLineTotal } from './QuotationsFormModal'
import {
  CATEGORY_TYPE_PRODUCTS,
  CATEGORY_TYPE_SERVICES,
  normalizeCategoryType,
} from '../features/inventory/categoryType'
import {
  applyCatalogSelectionToLine,
  extractItemsCollection,
  findCatalogProduct,
  emptySalesLineAddons,
  findCatalogMatchForLine,
  resolveAvailableAddonsForLine,
  formatServiceBillingLabel,
  getLineIdentityMeta,
  getSalesLineLabels,
  isServiceSalesLine,
  mapCatalogItem,
  resetLineForCategoryChange,
  resetLineForTypeChange,
  resolveCategoryName,
  resolveLineItemType,
} from '../features/inventory/salesLineCatalog'
import SalesLineAddonsPicker from '../features/inventory/SalesLineAddonsPicker'

const DEFAULT_TAX_RATE = 14

const normalizeDiscountType = (value) => (
  String(value || '').toLowerCase() === 'percent' ? 'percent' : 'value'
)

/** Coerce API/meta flags — Boolean("0")/Boolean("false") are wrongly true. */
const coerceTaxEnabled = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0 && Number.isFinite(value)
  const s = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(s)) return true
  if (['0', 'false', 'no', 'off'].includes(s)) return false
  return fallback
}

/** Active % rate: treat missing/NaN as default so UI display and calc stay aligned. */
const resolveActiveTaxRate = (taxRate) => {
  if (taxRate === undefined || taxRate === null || taxRate === '') return DEFAULT_TAX_RATE
  const n = Number(taxRate)
  return Number.isFinite(n) ? Math.max(0, n) : DEFAULT_TAX_RATE
}

const resolveInvoiceTaxRate = (data, taxableBase = 0) => {
  const stored = Number(data?.taxRate ?? data?.tax_rate ?? data?.meta_data?.tax_rate)
  if (Number.isFinite(stored) && stored > 0) return stored
  const tax = Number(data?.tax || 0)
  const base = Number(taxableBase) || Number(data?.subtotal || 0)
  if (base > 0 && tax > 0) return Math.round((tax / base) * 10000) / 100
  return DEFAULT_TAX_RATE
}

const resolveDocumentDiscount = (data) => {
  const meta = data?.meta_data || data?.metaData || {}
  const discountType = normalizeDiscountType(
    data?.discountType ?? data?.discount_type ?? meta?.discount_type
  )
  const storedAmount = Number(data?.discountAmount ?? data?.discount ?? meta?.discount_amount ?? 0)
  const storedRate = Number(
    data?.discountRate
    ?? data?.discount_rate
    ?? meta?.discount_rate
    ?? 0
  )
  if (discountType === 'percent') {
    // Prefer explicit percent; fall back from fraction (0–1) used by older forms.
    if (Number.isFinite(storedRate) && storedRate > 0) {
      return { discountType, discount: storedRate > 1 ? storedRate : storedRate * 100 }
    }
    return { discountType, discount: 0 }
  }
  if (Number.isFinite(storedAmount) && storedAmount > 0) {
    return { discountType: 'value', discount: storedAmount }
  }
  // Legacy: only fraction rate available → treat as percent for editing.
  if (Number.isFinite(storedRate) && storedRate > 0) {
    return { discountType: 'percent', discount: storedRate > 1 ? storedRate : storedRate * 100 }
  }
  return { discountType: 'value', discount: 0 }
}

const toDateOnly = (value) => {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.includes('T')) return s.split('T')[0]
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

const addMonthsToDateOnly = (dateStr, monthsToAdd) => {
  const base = toDateOnly(dateStr)
  if (!base) return ''
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  const day = dt.getUTCDate()
  dt.setUTCDate(1)
  dt.setUTCMonth(dt.getUTCMonth() + Number(monthsToAdd || 0))
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(day, lastDay))
  return dt.toISOString().split('T')[0]
}

/** Equal-split by default; last row absorbs rounding. Due dates: monthly from startDate, preserving prior edits. */
const buildInvoiceInstallmentSchedule = ({
  total,
  count,
  startDate,
  previousSchedule = [],
  amountOverrides = {},
  equalSplit = true,
}) => {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const base = Math.max(0, Number(total) || 0)
  if (n < 1 || base <= 0) return []

  const prevByNumber = new Map(
    (Array.isArray(previousSchedule) ? previousSchedule : [])
      .map((row) => [Number(row?.number), row])
  )

  const equalEach = base / n
  const schedule = []
  let allocated = 0

  for (let i = 1; i <= n; i += 1) {
    const prev = prevByNumber.get(i)
    const overrideRaw = amountOverrides[i]
    const hasOverride = equalSplit
      ? false
      : (overrideRaw !== undefined && overrideRaw !== null && String(overrideRaw) !== '')

    let amount
    if (hasOverride) {
      amount = Math.round(Math.max(0, Number(overrideRaw) || 0) * 100) / 100
    } else if (equalSplit || Object.keys(amountOverrides).length === 0) {
      amount = Math.round(equalEach * 100) / 100
      if (i === n) {
        amount = Math.round((base - allocated) * 100) / 100
      }
    } else {
      amount = Math.round(Math.max(0, Number(prev?.amount) || 0) * 100) / 100
    }

    const suggestedDue = addMonthsToDateOnly(startDate, i - 1)
    const dueDate = toDateOnly(prev?.dueDate ?? prev?.due_date) || suggestedDue

    schedule.push({
      number: i,
      amount,
      percent: base > 0 ? Math.round((amount / base) * 10000) / 100 : 0,
      dueDate,
    })
    allocated += amount
  }

  // Equal mode: force last row to exact remainder after rounding earlier rows
  if (equalSplit && schedule.length > 0) {
    const withoutLast = schedule.slice(0, -1).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const last = schedule[schedule.length - 1]
    last.amount = Math.round((base - withoutLast) * 100) / 100
    last.percent = base > 0 ? Math.round((last.amount / base) * 10000) / 100 : 0
  }

  return schedule
}

const resolveInstallmentPlan = (data) => {
  const meta = data?.meta_data || data?.metaData || {}
  const plan = data?.installments || meta?.installments || {}
  const schedule = Array.isArray(data?.installmentSchedule)
    ? data.installmentSchedule
    : (Array.isArray(plan?.schedule) ? plan.schedule : [])
  const mode = String(data?.installmentMode ?? plan?.mode ?? '').toLowerCase()
  const customFromLegacy = Number(data?.installmentInput ?? plan?.input ?? 0) > 0
  return {
    installmentEnabled: Boolean(data?.installmentEnabled ?? plan?.enabled),
    installmentCount: Math.max(0, Number(data?.installmentCount ?? plan?.count ?? 0) || 0),
    installmentCustom: mode === 'custom' || customFromLegacy,
    installmentSchedule: schedule.map((row, idx) => ({
      number: Number(row?.number) || (idx + 1),
      amount: Math.round((Number(row?.amount) || 0) * 100) / 100,
      percent: Number(row?.percent) || 0,
      dueDate: toDateOnly(row?.dueDate ?? row?.due_date),
    })),
  }
}

const SalesInvoicesFormModal = ({ isOpen, onClose, onSave, initialData = null, isRTL, readOnly = false }) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  
  const [customers, setCustomers] = useState([])
  const [availableOrders, setAvailableOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [salesPersons, setSalesPersons] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        try {
          setLookupsReady(false)
          setLoadingData(true)
          const [cRes, catRes, itemsRes, oRes, iRes, usersRes] = await Promise.all([
            api.get('/api/customers', { params: { all: 1 } }),
            api.get('/api/item-categories', { params: { all: 1 } }),
            api.get('/api/items', { params: { all: 1 } }),
            api.get('/api/sales-orders', { params: { all: 1 } }),
            api.get('/api/sales-invoices', { params: { all: 1 } }),
            api.get('/api/users', { params: { all: 1 } })
          ])

          if (cRes.data?.data) {
            setCustomers(cRes.data.data.map(c => ({
              ...c, 
              code: c.customer_code, 
              name: c.name || c.customer_name || c.company_name || (isRTL ? 'بدون اسم' : 'No Name'),
              assignedSalesRep: c.assignee?.name || c.assigned_to
            })))
          }

          const catData = catRes.data?.data || catRes.data || []
          setCategories(
            (Array.isArray(catData) ? catData : []).map((c) => ({
              value: c.name,
              label: c.name,
              categoryType: normalizeCategoryType(c.applies_to || c.category_type || c.type) || CATEGORY_TYPE_PRODUCTS,
            })).filter((c) => c.value)
          )

          const itemsData = extractItemsCollection(itemsRes.data)
          setProducts(itemsData.map(mapCatalogItem).filter((item) => item.name))

          const oData = oRes.data.data || oRes.data || []
          if (Array.isArray(oData)) {
            setAvailableOrders(oData.map(o => ({
              ...o,
              // Use uuid for display if available, fallback to id
              label: o.uuid || o.id,
              customerCode: o.customer_code || o.customerCode,
              customerName: o.customer_name || o.customerName,
              customerAddress: o.customer_address || o.customerAddress || '',
              salesPerson: o.sales_person || o.salesPerson,
            })))
          }

          const iData = iRes.data.data || iRes.data || []
          if (Array.isArray(iData)) {
            setInvoices(iData.map(i => ({
              ...i,
              orderId: i.order_id || i.orderId,
              invoiceType: i.invoice_type || i.invoiceType,
              items: i.items || []
            })))
          }

          const rawUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.data || [])
          const filteredSales = rawUsers.filter(u => {
            const role = String(u.role || (Array.isArray(u.roles) && u.roles[0]?.name) || u.job_title || '').toLowerCase()
            const status = String(u.status || '').toLowerCase()
            const isSalesRole = role.includes('sales') || role.includes('agent') || role.includes('broker')
            const isActive = status === 'active' || status === ''
            return isSalesRole && isActive
          }).map(u => ({
            id: u.id,
            value: u.name || u.fullName || u.username,
            label: `${u.name || u.fullName} (${u.username || 'N/A'})`,
            username: u.username
          }))
          setSalesPersons(filteredSales)

        } catch (err) {
          console.error('Error loading form data:', err)
        } finally {
          setLoadingData(false)
          setLookupsReady(true)
        }
      }
      fetchData()
    }
  }, [isOpen])
  
  const [formData, setFormData] = useState({
    id: '',
    orderId: '',
    customerCode: '',
    customerName: '',
    customerAddress: '',
    status: 'Draft',
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    items: [], // Array of line items
    tax: 0,
    taxRate: DEFAULT_TAX_RATE,
    isTaxEnabled: true,
    paidAmount: 0,
    advanceAppliedAmount: 0,
    paymentTerms: '',
    paymentMethod: '', // Renamed from paymentType to paymentMethod as per strict requirements
    invoiceType: 'Full', // Advance, Partial, Full
    markAsReceived: false,
    notes: '',
    attachment: null,
    salesPerson: '',
    discountType: 'value',
    discount: 0,
    discountRate: 0,
    installmentEnabled: false,
    installmentCount: 2,
    installmentSchedule: [],
  })

  const [errors, setErrors] = useState({})

  const [isManual, setIsManual] = useState(false)
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [lookupsReady, setLookupsReady] = useState(false)
  const [linkedOrder, setLinkedOrder] = useState(null)
  const [installmentCustom, setInstallmentCustom] = useState(false)
  const [installmentAmountOverrides, setInstallmentAmountOverrides] = useState({})
  const hydratedOpenRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      hydratedOpenRef.current = false
      setLinkedOrder(null)
      setLookupsReady(false)
      return
    }

    if (hydratedOpenRef.current) return
    hydratedOpenRef.current = true

    if (initialData) {
      const docDiscount = resolveDocumentDiscount(initialData)
      const meta = initialData.meta_data || initialData.metaData || {}
      const normalizedItems = (Array.isArray(initialData.items) ? initialData.items : []).map((item, idx) => ({
        ...item,
        id: item?.id ?? item?.item_id ?? `line-${idx}`,
        type: resolveLineItemType(item?.type),
        category: resolveCategoryName(item) || String(item?.category || item?.product_category || '').trim(),
        discountType: normalizeDiscountType(item?.discountType ?? item?.discount_type),
        discount: Number(item?.discount ?? 0) || 0,
        addon_ids: Array.isArray(item?.addon_ids)
          ? item.addon_ids
          : (Array.isArray(item?.addons)
            ? item.addons.map((addon) => addon?.id ?? addon?.addon_id).filter((id) => id != null && id !== '')
            : []),
        addons: Array.isArray(item?.addons) ? item.addons : [],
        addons_total: getQuotationLineAddonsTotal(item),
      }))
      const itemsSubtotal = normalizedItems.reduce((sum, item) => sum + getQuotationLineTotal(item), 0)
      const provisionalDiscount = docDiscount.discountType === 'percent'
        ? itemsSubtotal * (Math.max(0, Math.min(100, Number(docDiscount.discount) || 0)) / 100)
        : Math.min(itemsSubtotal, Math.max(0, Number(docDiscount.discount) || 0))
      const taxableBase = Math.max(0, itemsSubtotal - provisionalDiscount)
      const taxRate = resolveInvoiceTaxRate(initialData, taxableBase)
      const rawTaxEnabled = initialData.isTaxEnabled ?? meta.is_tax_enabled
      const isTaxEnabled = coerceTaxEnabled(
        rawTaxEnabled,
        Array.isArray(initialData.items) ? Number(initialData.tax || 0) > 0 : true
      )
      const installmentPlan = resolveInstallmentPlan(initialData)

      setFormData({
        ...initialData,
        id: initialData.id || initialData.invoice_number || initialData.invoiceNumber || `INV-${Math.floor(Math.random() * 10000)}`,
        orderId: initialData.orderId || '',
        date: initialData.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        dueDate: initialData.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : '',
        items: normalizedItems,
        tax: initialData.tax || 0,
        taxRate,
        isTaxEnabled,
        paidAmount: initialData.paidAmount || 0,
        advanceAppliedAmount: initialData.advanceAppliedAmount || initialData.advance_applied_amount || 0,
        discountType: docDiscount.discountType,
        discount: docDiscount.discount,
        discountRate: itemsSubtotal > 0 ? provisionalDiscount / itemsSubtotal : 0,
        installmentEnabled: installmentPlan.installmentEnabled,
        installmentCount: installmentPlan.installmentCount || 2,
        installmentSchedule: installmentPlan.installmentSchedule,
        customerCode: initialData.customerCode || '',
        customerName: initialData.customerName || '',
        customerAddress: initialData.customerAddress || initialData.customer_address || '',
        salesPerson: initialData.salesPerson || '',
        paymentTerms: (initialData.invoiceType || 'Full') === 'Full' ? '' : (initialData.paymentTerms || ''),
        paymentMethod: initialData.paymentMethod || initialData.paymentType || '',
        invoiceType: initialData.invoiceType || 'Full',
        markAsReceived: false,
        status: initialData.status || 'Draft'
      })
      setInstallmentCustom(Boolean(installmentPlan.installmentCustom))
      const amountOverrides = {}
      if (installmentPlan.installmentCustom) {
        installmentPlan.installmentSchedule.forEach((row) => {
          amountOverrides[row.number] = row.amount
        })
      }
      setInstallmentAmountOverrides(amountOverrides)
      setIsManual(!initialData.orderId)
    } else {
      setFormData({
        id: `INV-${Math.floor(Math.random() * 10000)}`,
        orderId: '',
        customerCode: '',
        customerName: '',
        customerAddress: '',
        status: 'Draft',
        date: new Date().toISOString().split('T')[0],
        dueDate: '',
        items: [],
        tax: 0,
        taxRate: DEFAULT_TAX_RATE,
        isTaxEnabled: true,
        paidAmount: 0,
        advanceAppliedAmount: 0,
        discountType: 'value',
        discount: 0,
        discountRate: 0,
        installmentEnabled: false,
        installmentCount: 2,
        installmentSchedule: [],
        paymentTerms: '',
        paymentMethod: '',
        invoiceType: 'Full',
        markAsReceived: false,
        notes: '',
        attachment: null,
        salesPerson: ''
      })
      setInstallmentCustom(false)
      setInstallmentAmountOverrides({})
      setIsManual(false)
    }
    setIsNewCustomer(false)
    setErrors({})
    setLinkedOrder(null)
    if (!initialData) {
      setInstallmentCustom(false)
      setInstallmentAmountOverrides({})
    }
  }, [initialData, isOpen])

  useEffect(() => {
    if (!customers.length) return
    if (!formData.customerCode) return
    if (String(formData.customerAddress || '').trim()) return

    const customer = customers.find((entry) => entry.code === formData.customerCode)
    if (!customer) return

    const resolvedAddress = buildCustomerAddress(customer)
    if (!resolvedAddress) return

    setFormData(prev => ({ ...prev, customerAddress: resolvedAddress }))
  }, [customers, formData.customerCode, formData.customerAddress])

  const [paymentTermsOptions, setPaymentTermsOptions] = useState([
    { value: 'Immediate', label: isRTL ? 'فوري' : 'Immediate' },
    { value: 'Net 15', label: isRTL ? '15 يوم' : 'Net 15' },
    { value: 'Net 30', label: isRTL ? '30 يوم' : 'Net 30' },
    { value: 'Net 60', label: isRTL ? '60 يوم' : 'Net 60' },
    { value: 'COD', label: isRTL ? 'الدفع عند الاستلام' : 'Cash on Delivery' }
  ])

  // Resolve Sales Person name if it's an ID
  useEffect(() => {
    if (formData.salesPerson && !isNaN(formData.salesPerson) && salesPersons.length > 0) {
      const user = salesPersons.find(u => String(u.id) === String(formData.salesPerson));
      if (user) {
        setFormData(prev => ({ ...prev, salesPerson: user.value }));
      }
    }
  }, [salesPersons, formData.salesPerson])

  // Calculations
  const isPrefill = !!initialData?.__prefill
  const isEditMode = !!initialData && !isPrefill

  const getItemKey = (item) => {
    const name = String(item?.name ?? item?.item_name ?? item?.product_name ?? '').trim().toLowerCase()
    if (name) {
      const category = String(item?.category ?? item?.product_category ?? '').trim().toLowerCase()
      return `name:${category}|${name}`
    }

    const stableId = item?.item_id ?? item?.itemId ?? item?.product_id
    if (stableId !== undefined && stableId !== null && String(stableId).trim() !== '') {
      return `id:${String(stableId)}`
    }

    return null
  }

  const getItemQty = (item) => parseFloat(item?.quantity ?? item?.qty ?? 0) || 0

  const normalizeOrderItems = (orderOrItems) => {
    let items = Array.isArray(orderOrItems) ? orderOrItems : orderOrItems?.items
    if (typeof items === 'string') {
      try { items = JSON.parse(items) } catch { items = [] }
    }
    if (!Array.isArray(items)) return []

    return items.map((item, idx) => ({
      ...item,
      id: item?.id ?? item?.item_id ?? `line-${idx}`,
      item_id: item?.item_id ?? item?.itemId ?? item?.product_id ?? undefined,
      name: item?.name || item?.item_name || item?.product_name || '',
      quantity: getItemQty(item),
      price: parseFloat(item?.price ?? item?.unit_price ?? 0) || 0,
      discount: parseFloat(item?.discount ?? 0) || 0,
      discountType: normalizeDiscountType(item?.discountType ?? item?.discount_type),
      type: resolveLineItemType(item?.type),
      category: resolveCategoryName(item) || String(item?.category || item?.product_category || '').trim(),
      addon_ids: Array.isArray(item?.addon_ids)
        ? item.addon_ids
        : (Array.isArray(item?.addons)
          ? item.addons.map((addon) => addon?.id ?? addon?.addon_id).filter((id) => id != null && id !== '')
          : []),
      addons: Array.isArray(item?.addons) ? item.addons : [],
      addons_total: getQuotationLineAddonsTotal(item),
    }))
  }

  const mapSalesOrder = (o) => {
    if (!o) return null
    return {
      ...o,
      id: o.id,
      label: o.uuid || o.id,
      customerCode: o.customer_code || o.customerCode,
      customerName: o.customer_name || o.customerName,
      customerAddress: o.customer_address || o.customerAddress || '',
      salesPerson: o.sales_person || o.salesPerson,
      items: normalizeOrderItems(o),
    }
  }

  const getInvoicedQtyByKey = (orderId) => {
    const map = new Map()
    const oid = String(orderId ?? '')

    invoices
      .filter(inv => String(inv?.orderId ?? inv?.order_id ?? '') === oid)
      .filter(inv => String(inv?.status ?? '').toLowerCase() !== 'cancelled')
      .filter(inv => String(inv?.invoiceType ?? inv?.invoice_type ?? '').toLowerCase() !== 'advance')
      .forEach(inv => {
        normalizeOrderItems(inv).forEach(it => {
          const key = getItemKey(it)
          if (!key) return
          const qty = getItemQty(it)
          if (qty <= 0) return
          map.set(key, (map.get(key) || 0) + qty)
        })
      })

    return map
  }

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + getQuotationLineTotal(item), 0)
  }

  const subtotal = calculateSubtotal()
  const rawDiscount = Math.max(0, Number(formData.discount) || 0)
  const globalDiscountAmount = formData.discountType === 'percent'
    ? subtotal * (Math.min(100, rawDiscount) / 100)
    : Math.min(subtotal, rawDiscount)
  const discountRate = subtotal > 0 ? globalDiscountAmount / subtotal : 0
  const taxableBase = Math.max(0, subtotal - globalDiscountAmount)
  const taxAmount = parseFloat(formData.tax) || 0
  const total = taxableBase + taxAmount
  const advanceApplied = parseFloat(formData.advanceAppliedAmount) || 0
  const balanceDue = total - (parseFloat(formData.paidAmount) || 0) - advanceApplied
  const allowsInstallments = formData.invoiceType === 'Partial' || formData.invoiceType === 'Advance'
  const installmentStartDate = toDateOnly(formData.dueDate) || toDateOnly(formData.date) || toDateOnly(new Date().toISOString())
  const installmentSchedule = (allowsInstallments && formData.installmentEnabled)
    ? buildInvoiceInstallmentSchedule({
        total,
        count: formData.installmentCount,
        startDate: installmentStartDate,
        previousSchedule: formData.installmentSchedule,
        amountOverrides: installmentAmountOverrides,
        equalSplit: !installmentCustom,
      })
    : []
  const installmentPlanTotal = installmentSchedule.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const installmentRemaining = Math.round((Number(total || 0) - installmentPlanTotal) * 100) / 100
  const installmentMismatch = allowsInstallments
    && formData.installmentEnabled
    && installmentSchedule.length > 0
    && Math.abs(installmentRemaining) > 0.01
  const equalInstallmentAmount = (formData.installmentCount > 0 && Number(total) > 0)
    ? Math.round((Number(total) / Math.max(1, Number(formData.installmentCount) || 1)) * 100) / 100
    : 0
  const installmentMissingDueDate = allowsInstallments
    && formData.installmentEnabled
    && installmentSchedule.some((row) => !toDateOnly(row.dueDate))

  // Keep schedule in form state so due-date edits persist across recalculations.
  useEffect(() => {
    if (!(allowsInstallments && formData.installmentEnabled)) {
      if ((formData.installmentSchedule || []).length) {
        setFormData(prev => ({ ...prev, installmentSchedule: [] }))
      }
      return
    }
    const next = installmentSchedule
    const prev = formData.installmentSchedule || []
    const same = prev.length === next.length
      && next.every((row, idx) => (
        Number(prev[idx]?.number) === Number(row.number)
        && Math.abs(Number(prev[idx]?.amount || 0) - Number(row.amount || 0)) < 0.001
        && toDateOnly(prev[idx]?.dueDate) === toDateOnly(row.dueDate)
      ))
    if (!same) {
      setFormData(prev => ({ ...prev, installmentSchedule: next }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync derived schedule into form
  }, [
    formData.invoiceType,
    formData.installmentEnabled,
    formData.installmentCount,
    formData.dueDate,
    formData.date,
    total,
    installmentCustom,
    installmentAmountOverrides,
  ])

  // Keep tax in sync with taxable base / rate when enabled (all invoice types, including Deferred/Advance).
  useEffect(() => {
    if (formData.isTaxEnabled) {
      const rate = resolveActiveTaxRate(formData.taxRate)
      const calculatedTax = taxableBase * (rate / 100)
      setFormData(prev => {
        const nextRate = resolveActiveTaxRate(prev.taxRate)
        const needsRateFix = prev.taxRate === undefined || prev.taxRate === null || prev.taxRate === ''
        if (Math.abs(Number(prev.tax) - calculatedTax) <= 0.01 && !needsRateFix) return prev
        return {
          ...prev,
          tax: calculatedTax,
          ...(needsRateFix ? { taxRate: nextRate } : {}),
        }
      })
    } else {
      setFormData(prev => {
        if (Number(prev.tax) === 0) return prev
        return { ...prev, tax: 0 }
      })
    }
  }, [taxableBase, formData.isTaxEnabled, formData.taxRate])

  // Helper to calculate items based on Order and Type
  const calculateInvoiceItems = (order, type) => {
    if (!order) return { items: [], paidAmount: 0 }

    let newItems = []
    let newPaidAmount = 0

    const orderItems = normalizeOrderItems(order)

    if (type === 'Advance') {
      // Advance: Create a single item for advance payment (e.g., 30% of remaining value)
      const totalOrderValue = orderItems.reduce((sum, i) => sum + (i.price * i.quantity), 0)
      const advanceValue = totalOrderValue * 0.30
      
      newItems = [{
        id: Date.now(),
        name: isRTL ? 'دفع مؤجل' : 'Deferred Payment',
        quantity: 1,
        price: advanceValue,
        discount: 0,
        type: 'Service',
        category: 'Financial'
      }]
      newPaidAmount = 0
    } else if (type === 'Full' || type === 'Partial') {
      const invoicedQtyByKey = getInvoicedQtyByKey(order.id)
      newItems = orderItems.map(item => {
        const key = getItemKey(item)
        const originalQty = getItemQty(item)
        const alreadyInvoiced = key ? (invoicedQtyByKey.get(key) || 0) : (item.invoicedQuantity || 0)
        const remaining = Math.max(0, originalQty - alreadyInvoiced)
        return {
          ...item,
          invoicedQuantity: alreadyInvoiced,
          quantity: type === 'Partial' ? (remaining || originalQty) : (remaining > 0 ? remaining : originalQty),
          discount: item.discount || 0
        }
      })
    }
    
    return { items: newItems, paidAmount: newPaidAmount }
  }

  // Fetch the linked sales order once; do not refetch when invoice lookups arrive.
  useEffect(() => {
    if (!isOpen || isManual || readOnly || !formData.orderId || isEditMode) {
      setLinkedOrder(null)
      setItemsLoading(false)
      return
    }

    let cancelled = false
    setItemsLoading(true)

    const loadOrder = async () => {
      try {
        const res = await api.get(`/api/sales-orders/${formData.orderId}`)
        const order = mapSalesOrder(res?.data?.data || res?.data)
        if (cancelled) return
        setLinkedOrder(order)
        if (order) {
          setAvailableOrders(prev => {
            const idx = prev.findIndex(x => String(x.id) === String(order.id))
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...prev[idx], ...order }
              return next
            }
            return [order, ...prev]
          })
        }
      } catch (err) {
        console.error('Failed to load sales order items:', err)
        if (!cancelled) setLinkedOrder(null)
      } finally {
        if (!cancelled) setItemsLoading(false)
      }
    }

    loadOrder()
    return () => { cancelled = true }
  }, [isOpen, isManual, readOnly, isEditMode, formData.orderId])

  // Keep order products on screen. Remaining-qty may adjust quantities, but must not hide the rows.
  useEffect(() => {
    if (!isOpen || isManual || readOnly || isEditMode || !formData.orderId || !linkedOrder) return

    const orderItems = normalizeOrderItems(linkedOrder)
    if (!orderItems.length) return

    if (!lookupsReady) {
      setFormData(prev => {
        if (String(prev.orderId) !== String(formData.orderId)) return prev
        if (prev.items?.length) return prev
        return { ...prev, items: orderItems }
      })
      return
    }

    const { items: newItems, paidAmount: newPaidAmount } = calculateInvoiceItems(linkedOrder, formData.invoiceType || 'Full')
    setFormData(prev => {
      if (String(prev.orderId) !== String(formData.orderId)) return prev
      const nextItems = newItems.length > 0 ? newItems : orderItems
      const sameCount = (prev.items?.length || 0) === nextItems.length
      const samePaid = Number(prev.paidAmount || 0) === Number(newPaidAmount || 0)
      const sameNames = sameCount && prev.items.every((item, idx) => (
        String(item?.name || '') === String(nextItems[idx]?.name || '')
        && Number(item?.quantity || 0) === Number(nextItems[idx]?.quantity || 0)
      ))
      if (sameNames && samePaid) return prev
      return {
        ...prev,
        items: nextItems,
        paidAmount: newPaidAmount,
      }
    })
  }, [isOpen, isManual, readOnly, isEditMode, formData.orderId, formData.invoiceType, linkedOrder, lookupsReady, invoices])

  // Handle Invoice Type Change Logic
  const handleInvoiceTypeChange = (type) => {
    if (type === 'Full') {
      setInstallmentCustom(false)
      setInstallmentAmountOverrides({})
    }

    setFormData(prev => ({
      ...prev,
      invoiceType: type,
      paymentTerms: type === 'Full' ? '' : prev.paymentTerms,
      advanceAppliedAmount: type === 'Advance' ? 0 : prev.advanceAppliedAmount,
      markAsReceived: false,
      installmentEnabled: (type === 'Partial' || type === 'Advance') ? prev.installmentEnabled : false,
      installmentSchedule: (type === 'Partial' || type === 'Advance') ? prev.installmentSchedule : [],
      // Full Payment keeps document discount locked/cleared; Partial + Deferred keep discount editable.
      ...(type === 'Full'
        ? { discount: 0, discountRate: 0, discountType: prev.discountType || 'value' }
        : {}),
    }))
  }

  if (!isOpen) return null

  const validate = () => {
    const newErrors = {}
    if (!formData.customerName) newErrors.customerName = isRTL ? 'اسم العميل مطلوب' : 'Customer Name is required'
    if (!formData.dueDate) newErrors.dueDate = isRTL ? 'تاريخ الاستحقاق مطلوب' : 'Due Date is required'
    if (!isManual && !formData.orderId) newErrors.orderId = isRTL ? 'رقم طلب البيع مطلوب' : 'Reference Sales Order is required'
    if (!formData.invoiceType) newErrors.invoiceType = isRTL ? 'نوع الفاتورة مطلوب' : 'Invoice Type is required'
    if (formData.items.length === 0) newErrors.items = isRTL ? 'يجب إضافة عنصر واحد على الأقل' : 'At least one item is required'
    
    // Validate Paid/Advance Applied
    const paid = parseFloat(formData.paidAmount) || 0
    const adv = parseFloat(formData.advanceAppliedAmount) || 0
    if (paid + adv > total + 0.0001) {
      newErrors.paidAmount = isRTL ? 'إجمالي التسويات لا يمكن أن يتجاوز الإجمالي' : 'Settled amount cannot exceed Total'
    }

    if (allowsInstallments && formData.installmentEnabled) {
      if (Number(total) <= 0) {
        newErrors.installments = isRTL
          ? 'أضف بنودًا أولًا لحساب إجمالي الفاتورة قبل تفعيل الأقساط.'
          : 'Add line items first so the invoice total can be calculated before enabling installments.'
      } else if (installmentSchedule.length < 1) {
        newErrors.installments = isRTL ? 'أدخل عدد أقساط صالحًا.' : 'Enter a valid installment count.'
      } else if (installmentMissingDueDate) {
        newErrors.installments = isRTL
          ? 'كل قسط يحتاج تاريخ استحقاق.'
          : 'Each installment needs a due date.'
      } else if (installmentMismatch) {
        newErrors.installments = installmentRemaining > 0
          ? (isRTL
            ? `مجموع الأقساط أقل من الإجمالي. المتبقي: ${installmentRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `Installments do not cover the total. Remaining: ${installmentRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
          : (isRTL
            ? `مجموع الأقساط يتجاوز الإجمالي بمقدار ${Math.abs(installmentRemaining).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `Installments exceed the total by ${Math.abs(installmentRemaining).toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
      }
    }
    
    // Validate items
    formData.items.forEach((item, index) => {
      if (!item.name) newErrors[`item_name_${index}`] = true
      if (!item.quantity || item.quantity <= 0) newErrors[`item_qty_${index}`] = true
      // if (!item.price || item.price < 0) newErrors[`item_price_${index}`] = true // Allow zero price for some cases?
    })

    if (Object.keys(newErrors).length > 0) {
      const firstError = Object.values(newErrors)[0]
      if (typeof firstError === 'string') {
        alert(firstError)
      } else {
        alert(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (validate()) {
      // If new customer, save them first
      let finalCustomerCode = formData.customerCode
      if (isNewCustomer && !finalCustomerCode) {
         try {
             const tempCode = `CUST-${Math.floor(Math.random() * 10000)}`
             const res = await api.post('/api/customers', {
                company_name: formData.customerName,
                customer_code: tempCode
             })
             if (res.data?.data?.customer_code) {
                 finalCustomerCode = res.data.data.customer_code
             } else {
                 finalCustomerCode = tempCode
             }
         } catch (err) {
             console.error("Failed to create customer", err)
             return
         }
      }

      onSave({ 
        ...formData, 
        customerCode: finalCustomerCode,
        subtotal, 
        discountAmount: globalDiscountAmount,
        discountRate,
        discountType: formData.discountType || 'value',
        taxRate: formData.taxRate,
        isTaxEnabled: formData.isTaxEnabled,
        installments: allowsInstallments && formData.installmentEnabled
          ? {
              enabled: true,
              mode: installmentCustom ? 'custom' : 'equal',
              count: Number(formData.installmentCount) || 0,
              schedule: installmentSchedule,
              total: installmentPlanTotal,
            }
          : { enabled: false, mode: 'equal', count: 0, schedule: [] },
        total,
        balanceDue,
        advanceAppliedAmount: parseFloat(formData.advanceAppliedAmount) || 0,
        createdAt: new Date().toISOString()
      })
    }
  }

  // Item Management
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: Date.now(),
          type: 'Product',
          category: '',
          name: '',
          quantity: 1,
          price: 0,
          discount: 0,
          discountType: 'value',
          ...emptySalesLineAddons(),
        }
      ]
    }))
  }

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const updateItem = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item
        if (field === 'discountType') {
          const nextType = normalizeDiscountType(value)
          const prevType = normalizeDiscountType(item.discountType)
          if (nextType === prevType) return { ...item, discountType: nextType }
          const qty = Number(item.quantity) || 0
          const price = Number(item.price) || 0
          const lineGross = (qty * price) + getQuotationLineAddonsTotal(item)
          const raw = Math.max(0, Number(item.discount) || 0)
          let nextDiscount = 0
          if (lineGross > 0) {
            if (nextType === 'percent') {
              const amount = prevType === 'percent'
                ? Math.min(lineGross, (lineGross * Math.min(100, raw)) / 100)
                : Math.min(lineGross, raw)
              nextDiscount = Math.round((amount / lineGross) * 10000) / 100
            } else {
              nextDiscount = prevType === 'percent'
                ? Math.min(lineGross, (lineGross * Math.min(100, raw)) / 100)
                : Math.min(lineGross, raw)
            }
          }
          return { ...item, discountType: nextType, discount: nextDiscount }
        }
        return { ...item, [field]: value }
      })
    }))
  }

  const handleLineAddonsChange = (index, nextLine) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? nextLine : item)),
    }))
  }

  // Category / item cascading helpers (Type → Category → Item Name)
  const itemTypeOptions = [
    { value: 'Product', label: isRTL ? 'منتج' : 'Product' },
    { value: 'Service', label: isRTL ? 'خدمة' : 'Service' }
  ]

  const getCategoryOptionsForLine = (line) => {
    const wanted = resolveLineItemType(line?.type) === 'Service'
      ? CATEGORY_TYPE_SERVICES
      : CATEGORY_TYPE_PRODUCTS
    const filtered = (categories || []).filter((c) => !c.categoryType || c.categoryType === wanted)
    const options = filtered.length ? filtered : (categories || [])
    const current = String(line?.category || '').trim()
    if (current && !options.some((opt) => opt.value === current)) {
      return [...options, { value: current, label: current, categoryType: wanted }]
    }
    return options
  }

  const getProductOptionsForLine = (line) => {
    const lineType = resolveLineItemType(line?.type)
    const lineCategory = String(line?.category || '').trim()
    return (products || []).filter((product) => {
      if (product.type && product.type !== lineType) return false
      if (lineCategory && product.category !== lineCategory) return false
      return Boolean(product.name)
    })
  }

  const handleLineTypeChange = (index, newType) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (
        i === index ? resetLineForTypeChange(it, newType) : it
      )),
    }))
  }

  const handleLineCategoryChange = (index, newCategory) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (
        i === index ? resetLineForCategoryChange(it, newCategory) : it
      )),
    }))
  }

  const handleLineItemSelect = (index, selectedIdOrName) => {
    setFormData((prev) => {
      const current = prev.items[index] || {}
      const product = findCatalogProduct(products, {
        id: selectedIdOrName,
        name: selectedIdOrName,
        type: current.type,
        category: current.category,
      }) || findCatalogProduct(getProductOptionsForLine(current), {
        id: selectedIdOrName,
        name: selectedIdOrName,
        type: current.type,
        category: current.category,
      })
      const selectedName = product?.name || String(selectedIdOrName || '')
      return {
        ...prev,
        items: prev.items.map((it, i) => (
          i === index ? applyCatalogSelectionToLine(it, product, selectedName) : it
        )),
      }
    })
  }

  const lineLabels = getSalesLineLabels(isRTL)
  
  const paymentTypeOptions = [
    { value: 'Cash', label: isRTL ? 'نقدي' : 'Cash' },
    { value: 'Bank Transfer', label: isRTL ? 'تحويل بنكي' : 'Bank Transfer' },
    { value: 'Check', label: isRTL ? 'شيك' : 'Check' },
    { value: 'Credit Card', label: isRTL ? 'بطاقة ائتمان' : 'Credit Card' }
  ]
  
  // Line items from a linked Full order are locked; manual entry stays editable.
  const lineItemsLocked = Boolean(readOnly || (!isManual && formData.invoiceType === 'Full' && formData.orderId))

  const inputClass = `w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
    isDark 
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
      : 'bg-white border-gray-300 text-theme-text placeholder-gray-400'
  } ${readOnly ? 'opacity-70 cursor-not-allowed pointer-events-none' : ''}`

  const labelClass = `block text-sm font-medium mb-1 text-theme-text`
  const errorClass = "text-xs text-red-500 mt-1"

  return (
    <div className="fixed inset-0 z-[2050] flex items-center justify-center p-4 pointer-events-none">
      <div className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={onClose} aria-hidden="true" />
      
      <div
        className={`card relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col pointer-events-auto ${isDark ? 'bg-gray-900' : 'bg-white'}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <h2 className={`text-xl font-bold flex items-center gap-2 text-theme-text`}>
            <FaFileInvoiceDollar className="text-blue-600" />
            {readOnly 
              ? (isRTL ? 'عرض تفاصيل الفاتورة' : 'View Invoice Details')
              : initialData && !isPrefill
                ? (isRTL ? 'تعديل فاتورة مبيعات' : 'Edit Sales Invoice') 
                : (isRTL ? 'إضافة فاتورة مبيعات' : 'Add Sales Invoice')}
          </h2>
          <button 
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-theme-text hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Mode Selection */}
          {!initialData && (
            <div className="flex gap-4 p-4  rounded-lg">
            
               <label className={`flex items-center gap-2 cursor-pointer p-5 rounded-lg ${!isManual ? 'bg-orange-600 text-white' : ''}`}>
                 <input 
                    type="radio" 
                    name="entryMode" 
                    checked={!isManual} 
                    onChange={() => {
                        setIsManual(false)
                        setFormData(prev => ({ ...prev, orderId: '', items: [] }))
                    }} 
                    className="radio radio-primary  radio-sm" 
                 />
                 <span className="text-sm font-medium">{isRTL ? 'ربط بطلب بيع' : 'Link to Sales Order'}</span>
               </label>
               <label className={`flex items-center gap-2 cursor-pointer p-5 rounded-lg ${isManual ? 'bg-orange-600 text-white' : ''}`}>
                 <input 
                    type="radio" 
                    name="entryMode" 
                    checked={isManual} 
                    onChange={() => {
                        setIsManual(true)
                        setFormData(prev => ({ ...prev, orderId: '', items: [] }))
                    }} 
                    className="radio radio-primary radio-sm" 
                 />
                 <span className="text-sm font-medium">{isRTL ? 'إدخال يدوي (بدون طلب)' : 'Manual Entry (No Order)'}</span>
               </label>
            </div>
          )}

          {/* Section 1: Basic Info & Customer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Row 1: Invoice # & Customer Code */}
            <div>
              <label className={labelClass}>{isRTL ? 'رقم الفاتورة' : 'Invoice #'}</label>
              <div className="relative">
                <FaHashtag className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <input
                  type="text"
                  value={formData.id}
                  readOnly
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} opacity-70 cursor-not-allowed`}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                 <label className={labelClass}>{isRTL ? 'العميل' : 'Customer'}</label>
                 {isManual && (
                    <button 
                        type="button" 
                        onClick={() => {
                            setIsNewCustomer(!isNewCustomer)
                            setFormData(prev => ({ ...prev, customerCode: '', customerName: '', customerAddress: '' }))
                        }}
                        className="text-xs text-blue-600 hover:underline"
                    >
                        {isNewCustomer ? (isRTL ? 'اختيار عميل موجود' : 'Select Existing') : (isRTL ? 'عميل جديد' : 'New Customer')}
                    </button>
                 )}
              </div>
              
              {isNewCustomer ? (
                  <div className="relative">
                    <FaUser className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                    <input
                      type="text"
                      value={formData.customerName}
                      onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                      className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                      placeholder={isRTL ? 'أدخل اسم العميل الجديد' : 'Enter New Customer Name'}
                      autoFocus
                    />
                  </div>
              ) : (
                  <div className="relative">
                    <FaUser className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                    <SearchableSelect
                      options={customers.map(c => ({ value: c.code, label: `${c.name} (${c.code})` }))}
                      value={formData.customerCode}
                      onChange={val => {
                        const selectedCode = val;
                        const customer = customers.find(c => c.code === selectedCode);
                        
                        // Find sales person name if assignedSalesRep is an ID
                        let salesPersonName = customer?.assignedSalesRep || formData.salesPerson;
                        if (salesPersonName && !isNaN(salesPersonName)) {
                          const user = salesPersons.find(u => String(u.id) === String(salesPersonName) || u.value === salesPersonName);
                          if (user) salesPersonName = user.value;
                        }

                        setFormData({
                          ...formData,
                          customerCode: selectedCode,
                          customerName: customer ? customer.name : '',
                          customerAddress: buildCustomerAddress(customer),
                          salesPerson: salesPersonName,
                          orderId: ''
                        });
                      }}
                      placeholder={isRTL ? 'اختر العميل' : 'Select Customer'}
                      className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                      isRTL={isRTL}
                    />
                  </div>
              )}
              {errors.customerName && <p className={errorClass}>{errors.customerName}</p>}
            </div>

            {/* Sales Order - Only if not manual */}
            {!isManual && (
                <div>
                  <label className={labelClass}>{isRTL ? 'رقم طلب البيع' : 'Sales Order Code'}</label>
                  <div className="relative">
                    <FaBoxOpen className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                    <select
                      value={formData.orderId}
                      onChange={e => {
                        const selectedOId = e.target.value;
                        const order = availableOrders.find(o => String(o.id) === String(selectedOId));

                        if (!selectedOId) {
                          setFormData(prev => ({ ...prev, orderId: '', items: [] }))
                          return
                        }

                        setFormData(prev => ({
                          ...prev,
                          orderId: selectedOId,
                          customerCode: order?.customerCode || prev.customerCode,
                          customerName: order?.customerName || prev.customerName,
                          customerAddress: order?.customerAddress || prev.customerAddress,
                          salesPerson: order?.salesPerson || prev.salesPerson,
                          items: [],
                        }))
                      }}
                      className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                      disabled={!formData.customerCode} // Disable if no customer selected
                    >
                      <option value="">
                        {formData.customerCode 
                          ? (isRTL ? 'اختر الطلب' : 'Select Order') 
                          : (isRTL ? 'يرجى اختيار العميل أولاً' : 'Please select customer first')}
                      </option>
                      {availableOrders
                        .filter(o => {
                          if (String(o.id) === String(formData.orderId)) return true
                          return o.customerCode === formData.customerCode && ['Confirmed', 'Partially Invoiced', 'In Progress', 'Completed'].includes(o.status)
                        })
                        .map((o, idx) => (
                        <option key={o.id || idx} value={o.id}>{o.label || o.id} ({o.status})</option>
                      ))}
                    </select>
                  </div>
                  {errors.orderId && <p className={errorClass}>{errors.orderId}</p>}
                </div>
            )}
             
             <div>
              <label className={labelClass}>{isRTL ? 'مندوب المبيعات' : 'Sales Person'}</label>
              <div className="relative">
                <SearchableSelect
                  options={salesPersons}
                  value={formData.salesPerson}
                  onChange={(val) => setFormData({ ...formData, salesPerson: val })}
                  placeholder={isRTL ? 'اختر مندوب المبيعات' : 'Select Sales Person'}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                  isRTL={isRTL}
                  showAllOption={false}
                />
                {loadingData && (
                  <div className="absolute inset-y-0 right-10 flex items-center pr-3 pointer-events-none">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Row 3: Dates */}
            <div>
              <label className={labelClass}>{isRTL ? 'تاريخ الفاتورة' : 'Invoice Date'}</label>
              <div className="relative">
                <FaCalendarAlt className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                />
              </div>
            </div>
            
            <div className={formData.invoiceType === 'Advance' ? `rounded-xl border p-3 ${isDark ? 'border-amber-800/50 bg-amber-950/20' : 'border-amber-200 bg-amber-50/60'}` : ''}>
              <label className={labelClass}>
                {isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}
                {formData.invoiceType === 'Advance' ? (
                  <span className="ms-1 font-normal opacity-80">
                    ({isRTL ? 'متى يمكن التحصيل' : 'when you can collect'})
                  </span>
                ) : null}
              </label>
              <div className="relative">
                <FaCalendarAlt className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} ${errors.dueDate ? 'border-red-500' : ''}`}
                />
              </div>
              {formData.invoiceType === 'Advance' && (
                <p className="mt-1 text-xs text-theme-text opacity-75">
                  {isRTL
                    ? 'تاريخ الاستحقاق مهم للدفع المؤجل (موعد التحصيل). يمكن أيضًا إضافة شروط دفع وخطة أقساط.'
                    : 'Due Date is key for Deferred Payment (collection date). Payment Terms and Installments are also available.'}
                </p>
              )}
              {errors.dueDate && <p className={errorClass}>{errors.dueDate}</p>}
            </div>
            
            {/* Row 4: Invoice Type */}
             <div>
              <label className={labelClass}>{isRTL ? 'نوع الفاتورة' : 'Invoice Type'}</label>
              <div className="relative">
                <FaFileInvoiceDollar className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <select
                  value={formData.invoiceType}
                  onChange={(e) => handleInvoiceTypeChange(e.target.value)}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                >
                  <option value="Full">{isRTL ? 'دفع كامل' : 'Full Payment'}</option>
                  <option value="Partial">{isRTL ? 'دفع جزئي' : 'Partial Payment'}</option>
                  <option value="Advance">{isRTL ? 'دفع مؤجل' : 'Deferred Payment'}</option>
                </select>
              </div>
            </div>
          </div>

          <div className={`h-px w-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

          {/* Section 2: Items (Dynamic List) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-theme-text">{lineLabels.sectionTitle}</h3>
              {!readOnly && (isManual || formData.invoiceType !== 'Full' || formData.items.length === 0) && (
                <button
                  type="button"
                  onClick={addItem}
                  className="btn btn-sm btn-primary gap-2"
                >
                  <FaPlus size={12} />
                  {isRTL ? 'إضافة بند' : 'Add Item'}
                </button>
              )}
            </div>
            
            {errors.items && <p className="text-red-500 text-sm">{errors.items}</p>}

            <div className="overflow-x-auto rounded-lg border border-theme-border dark:border-gray-700">
              <table className="min-w-[900px] w-full text-sm text-left">
                <thead className="  text-xs uppercase text-theme-text">
                  <tr>
                    <th className="px-4 py-3 min-w-[120px]">{lineLabels.type}</th>
                    <th className="px-4 py-3 min-w-[120px]">{lineLabels.category}</th>
                    <th className="px-4 py-3 min-w-[200px]">{lineLabels.itemName}</th>
                    <th className="px-4 py-3 w-[120px]">{lineLabels.qtyOrBilling}</th>
                    <th className="px-4 py-3 w-[120px]">{lineLabels.amount}</th>
                    <th className="px-4 py-3 w-[180px]">{lineLabels.discount}</th>
                    <th className="px-4 py-3 w-[120px]">{lineLabels.total}</th>
                    <th className="px-4 py-3 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {formData.items.map((item, index) => {
                    const serviceLine = isServiceSalesLine(item)
                    const catalogMatch = findCatalogMatchForLine(item, products)
                    const identityMeta = getLineIdentityMeta({
                      ...item,
                      brand: item.brand || catalogMatch?.brand,
                      code: item.code || catalogMatch?.code,
                      serviceType: item.serviceType || catalogMatch?.serviceType,
                    })
                    const billingValue = item.billingCycle || item.billing_cycle || catalogMatch?.billingCycle
                    const availableAddons = resolveAvailableAddonsForLine(item, products)
                    return (
                    <Fragment key={item.id || index}>
                    <tr className="hover:bg-gray-700/50 ">
                      <td className="px-2 py-2">
                        <select 
                          className="input input-sm w-full"
                          value={item.type || 'Product'}
                          disabled={lineItemsLocked}
                          onChange={e => handleLineTypeChange(index, e.target.value)}
                        >
                          {itemTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                         <select 
                          className="input input-sm w-full"
                          value={item.category || ''}
                          disabled={lineItemsLocked}
                          onChange={e => handleLineCategoryChange(index, e.target.value)}
                        >
                          <option value="">{isRTL ? 'اختر...' : 'Select...'}</option>
                          {getCategoryOptionsForLine(item).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <SearchableSelect
                            placement="bottom"
                            options={getProductOptionsForLine(item).map(i => ({ value: String(i.id), label: i.name }))}
                            value={(item.item_id != null && item.item_id !== '' ? String(item.item_id) : (findCatalogProduct(products, { name: item.name, type: item.type, category: item.category })?.id != null ? String(findCatalogProduct(products, { name: item.name, type: item.type, category: item.category }).id) : ''))}
                            disabled={lineItemsLocked}
                            onChange={val => handleLineItemSelect(index, val)}
                            placeholder={serviceLine ? lineLabels.selectService : lineLabels.selectProduct}
                            className={`min-w-[180px] ${errors[`item_name_${index}`] ? 'border-red-500' : ''}`}
                            isRTL={isRTL}
                            showAllOption={false}
                        />
                        {identityMeta ? (
                          <div className="mt-1 text-[10px] text-theme-text/60 truncate" title={identityMeta}>
                            {identityMeta}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        {serviceLine ? (
                          <div className="input input-sm w-full opacity-80 cursor-default flex items-center" title={lineLabels.billing}>
                            {formatServiceBillingLabel(billingValue, isRTL) || lineLabels.notApplicable}
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            className={`input input-sm w-full ${errors[`item_qty_${index}`] ? 'border-red-500' : ''}`}
                            value={item.quantity}
                            readOnly={lineItemsLocked}
                            onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`input input-sm w-full ${errors[`item_price_${index}`] ? 'border-red-500' : ''}`}
                          value={item.price}
                          readOnly={lineItemsLocked}
                          onChange={e => updateItem(index, 'price', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <select
                            className="input input-sm w-[72px] shrink-0"
                            value={item.discountType || 'value'}
                            disabled={lineItemsLocked}
                            onChange={e => updateItem(index, 'discountType', e.target.value)}
                            title={isRTL ? 'نوع الخصم' : 'Discount type'}
                          >
                            <option value="value">{isRTL ? 'قيمة' : 'Value'}</option>
                            <option value="percent">%</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            max={(item.discountType || 'value') === 'percent' ? 100 : undefined}
                            step="0.01"
                            className="input input-sm w-full"
                            value={item.discount || 0}
                            readOnly={lineItemsLocked}
                            onChange={e => updateItem(index, 'discount', Number(e.target.value))}
                            placeholder={(item.discountType || 'value') === 'percent' ? '%' : isRTL ? 'قيمة' : 'Value'}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {getQuotationLineTotal(item).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!readOnly && (isManual || formData.invoiceType !== 'Full') && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <FaTrash size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={8} className="px-3 pb-3.5 pt-0">
                        <SalesLineAddonsPicker
                          line={item}
                          catalogAddons={availableAddons}
                          onChange={(next) => handleLineAddonsChange(index, next)}
                          isRTL={isRTL}
                          isDark={isDark}
                          disabled={lineItemsLocked}
                          compact
                        />
                      </td>
                    </tr>
                    </Fragment>
                    )
                  })}
                  {formData.items.length === 0 && (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-theme-text ">
                        {itemsLoading
                          ? (isRTL ? 'جاري تحميل البنود من أمر البيع...' : 'Loading items from sales order...')
                          : !isManual && formData.orderId
                            ? (isRTL ? 'لا توجد بنود متبقية على أمر البيع هذا.' : 'No remaining items on this sales order.')
                            : (isRTL ? 'لا توجد عناصر. أضف بند جديد.' : 'No items. Add a new item.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {allowsInstallments && (
              <div className={`mt-4 rounded-xl border ${isDark ? 'border-blue-900/40 bg-blue-950/20' : 'border-blue-100 bg-blue-50/40'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-theme-text">
                      {isRTL ? 'خطة التقسيط' : 'Installment Plan'}
                    </h4>
                    <p className="text-xs text-theme-text opacity-70 mt-0.5">
                      {isRTL
                        ? 'تقسيم متساوٍ لإجمالي الفاتورة مع تاريخ استحقاق لكل قسط.'
                        : 'Equal split of the invoice total with a due date per installment.'}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={Boolean(formData.installmentEnabled)}
                      disabled={readOnly}
                      onChange={(e) => {
                        const enabled = e.target.checked
                        setFormData(prev => ({
                          ...prev,
                          installmentEnabled: enabled,
                          installmentCount: prev.installmentCount > 0 ? prev.installmentCount : 2,
                        }))
                        if (!enabled) {
                          setInstallmentCustom(false)
                          setInstallmentAmountOverrides({})
                        }
                      }}
                    />
                    <span className="text-sm font-medium text-theme-text">
                      {isRTL ? 'تفعيل التقسيط' : 'Enable Installment'}
                    </span>
                  </label>
                </div>

                {formData.installmentEnabled && (
                  <div className={`px-4 pb-4 space-y-3 border-t ${isDark ? 'border-blue-900/40' : 'border-blue-100'}`}>
                    <div className="flex flex-wrap items-end gap-3 pt-3">
                      <div className="w-28">
                        <label className="text-xs font-medium text-theme-text opacity-80 mb-1 block">
                          {isRTL ? 'عدد الأقساط' : 'Installments'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input input-sm w-full text-center font-semibold"
                          value={formData.installmentCount || 1}
                          disabled={readOnly}
                          onChange={(e) => {
                            const count = Math.max(1, Math.floor(Number(e.target.value) || 1))
                            setFormData(prev => ({ ...prev, installmentCount: count }))
                            if (installmentCustom) {
                              setInstallmentAmountOverrides((prev) => {
                                const next = {}
                                for (let i = 1; i <= count; i += 1) {
                                  if (prev[i] !== undefined) next[i] = prev[i]
                                }
                                return next
                              })
                            }
                          }}
                          aria-label={isRTL ? 'عدد الأقساط' : 'Number of installments'}
                        />
                      </div>
                      <div className="flex-1 min-w-[10rem]">
                        <p className="text-xs text-theme-text opacity-70">
                          {Number(total) > 0
                            ? (!installmentCustom
                              ? (isRTL
                                ? `${Number(formData.installmentCount) || 1} × ${equalInstallmentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} = ${Number(total).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                : `${Number(formData.installmentCount) || 1} × ${equalInstallmentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} = ${Number(total).toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                              : (isRTL ? 'عدّل مبلغ كل قسط يدويًا — يجب أن يساوي الإجمالي.' : 'Edit each installment amount — must equal the total.'))
                            : (isRTL ? 'أضف بنودًا أولًا ليُحسب الإجمالي.' : 'Add line items first so the total can be calculated.')}
                        </p>
                        {!readOnly && Number(total) > 0 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs px-0 h-auto min-h-0 mt-1 text-blue-600"
                            onClick={() => {
                              const next = !installmentCustom
                              setInstallmentCustom(next)
                              if (next) {
                                const overrides = {}
                                installmentSchedule.forEach((row) => {
                                  overrides[row.number] = row.amount
                                })
                                setInstallmentAmountOverrides(overrides)
                              } else {
                                setInstallmentAmountOverrides({})
                              }
                            }}
                          >
                            {installmentCustom
                              ? (isRTL ? '← تقسيم متساوٍ' : '← Equal split')
                              : (isRTL ? 'مبالغ مخصصة…' : 'Custom amounts…')}
                          </button>
                        )}
                      </div>
                    </div>

                    {errors.installments && (
                      <p className="text-xs text-red-600">{errors.installments}</p>
                    )}

                    {installmentSchedule.length > 0 ? (
                      <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <table className="w-full text-sm">
                          <thead className={isDark ? 'bg-gray-900/70' : 'bg-white'}>
                            <tr className="text-[11px] uppercase tracking-wide text-theme-text opacity-70">
                              <th className="px-3 py-2 text-start font-semibold">{isRTL ? 'القسط' : '#'}</th>
                              <th className="px-3 py-2 text-end font-semibold">{isRTL ? 'المبلغ' : 'Amount'}</th>
                              <th className="px-3 py-2 text-start font-semibold min-w-[9rem]">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {installmentSchedule.map((row) => (
                              <tr key={row.number} className={`border-t ${isDark ? 'border-gray-700/80' : 'border-gray-100'}`}>
                                <td className="px-3 py-1.5 text-theme-text opacity-80">
                                  {isRTL ? `قسط ${row.number}` : `#${row.number}`}
                                </td>
                                <td className="px-3 py-1.5 text-end font-medium tabular-nums">
                                  {installmentCustom && !readOnly ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="input input-sm w-28 text-end ms-auto"
                                      value={installmentAmountOverrides[row.number] ?? row.amount}
                                      onChange={(e) => {
                                        const raw = e.target.value
                                        setInstallmentAmountOverrides((prev) => ({
                                          ...prev,
                                          [row.number]: raw === '' ? 0 : Math.max(0, Number(raw) || 0),
                                        }))
                                      }}
                                      aria-label={isRTL ? `مبلغ القسط ${row.number}` : `Installment ${row.number} amount`}
                                    />
                                  ) : (
                                    Number(row.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
                                  )}
                                </td>
                                <td className="px-3 py-1.5">
                                  <input
                                    type="date"
                                    className="input input-sm w-full min-w-[9rem]"
                                    value={toDateOnly(row.dueDate) || ''}
                                    disabled={readOnly}
                                    onChange={(e) => {
                                      const value = e.target.value
                                      setFormData((prev) => ({
                                        ...prev,
                                        installmentSchedule: (prev.installmentSchedule || []).map((item) => (
                                          Number(item.number) === Number(row.number)
                                            ? { ...item, dueDate: value }
                                            : item
                                        )),
                                      }))
                                    }}
                                    aria-label={isRTL ? `تاريخ استحقاق القسط ${row.number}` : `Installment ${row.number} due date`}
                                  />
                                </td>
                              </tr>
                            ))}
                            <tr className={`border-t ${isDark ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                              <td className="px-3 py-1.5 text-xs font-semibold opacity-80">
                                {isRTL ? 'الإجمالي' : 'Total'}
                              </td>
                              <td className="px-3 py-1.5 text-end text-xs font-bold text-blue-600 tabular-nums" colSpan={2}>
                                {installmentPlanTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                {' / '}
                                {Number(total).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                {installmentMismatch && (
                                  <span className={`ms-2 font-medium ${installmentRemaining > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {isRTL
                                      ? `(متبقي ${installmentRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })})`
                                      : `(rem. ${installmentRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })})`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-theme-text opacity-60">
                        {Number(total) > 0
                          ? (isRTL ? 'أدخل عدد أقساط صالحًا.' : 'Enter a valid installment count.')
                          : (isRTL
                            ? 'أضف بنودًا أولًا ليظهر إجمالي الفاتورة.'
                            : 'Add line items first so the invoice total can be calculated.')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`h-px w-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

          {/* Section 3: Financials & Attachments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Notes & Attachments */}
            <div className="space-y-4">
               <div>
                <label className={labelClass}>{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <div className="relative">
                  <FaStickyNote className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} min-h-[80px] py-3`}
                    placeholder={isRTL ? 'أضف ملاحظات...' : 'Add notes...'}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'المرفقات' : 'Attachment'}</label>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isDark ? 'border-gray-700' : 'border-gray-300'}`}>
                  <input type="file" className="hidden" id="file-upload" onChange={e => setFormData({...formData, attachment: e.target.files[0]})} />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <FaPaperclip className="text-gray-400" size={24} />
                    <span className="text-sm text-theme-text ">
                      {formData.attachment ? formData.attachment.name : (isRTL ? 'انقر لرفع ملف' : 'Click to upload file')}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right: Totals */}
            <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
              <div className="space-y-3">
                 {/* Payment Fields */}
                 <div className="mb-4 space-y-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                      <label className="text-xs font-medium text-theme-text mb-1 block">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</label>
                      <select
                        value={formData.paymentMethod}
                        onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                        className={`w-full text-sm px-3 py-2 rounded border bg-transparent ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                      >
                        <option value="">{isRTL ? 'اختر الطريقة' : 'Select Method'}</option>
                        {paymentTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    {(formData.invoiceType === 'Partial' || formData.invoiceType === 'Advance') && (
                    <div>
                      <label className="text-xs font-medium text-theme-text mb-1 block">{isRTL ? 'شروط الدفع' : 'Payment Terms'}</label>
                      <select
                        value={formData.paymentTerms}
                        onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                        className={`w-full text-sm px-3 py-2 rounded border bg-transparent ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                      >
                        <option value="">{isRTL ? 'اختر الشروط' : 'Select Terms'}</option>
                        {paymentTermsOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    )}
                 </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-theme-text">{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <span className="font-medium">{subtotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center text-sm gap-3">
                  <span className="text-theme-text whitespace-nowrap">{isRTL ? 'الخصم' : 'Discount'}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      className="input input-sm w-[72px]"
                      value={formData.discountType || 'value'}
                      disabled={readOnly || formData.invoiceType === 'Full'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        discountType: e.target.value,
                        discount: 0,
                      }))}
                      title={isRTL ? 'نوع الخصم' : 'Discount type'}
                    >
                      <option value="value">{isRTL ? 'قيمة' : 'Value'}</option>
                      <option value="percent">%</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      max={formData.discountType === 'percent' ? 100 : undefined}
                      step="0.01"
                      className="input input-sm w-24 text-end text-green-600 font-medium"
                      value={formData.discount || 0}
                      disabled={readOnly || formData.invoiceType === 'Full'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        discount: Number(e.target.value),
                      }))}
                      aria-label={isRTL ? 'قيمة الخصم' : 'Discount value'}
                    />
                    {formData.discountType === 'percent' && (
                      <span className="text-xs font-semibold text-gray-500 w-4 text-center">%</span>
                    )}
                  </div>
                </div>
                {formData.discountType === 'percent' && globalDiscountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs text-theme-text opacity-70">
                    <span>{isRTL ? 'قيمة الخصم' : 'Discount Value'}</span>
                    <span>{globalDiscountAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-theme-text whitespace-nowrap">{isRTL ? 'الضريبة' : 'Tax'}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        className="checkbox checkbox-xs checkbox-primary"
                        checked={coerceTaxEnabled(formData.isTaxEnabled)}
                        disabled={readOnly}
                        onChange={(e) => {
                           const isEnabled = e.target.checked
                           setFormData(prev => {
                             const rate = resolveActiveTaxRate(prev.taxRate)
                             return {
                               ...prev,
                               isTaxEnabled: isEnabled,
                               taxRate: rate,
                               tax: isEnabled ? taxableBase * (rate / 100) : 0,
                             }
                           })
                        }}
                      />
                      <span className="text-xs text-gray-500">{isRTL ? 'تطبيق' : 'Apply'}</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={resolveActiveTaxRate(formData.taxRate)}
                        onChange={(e) => {
                          const raw = e.target.value
                          const nextRate = raw === '' ? DEFAULT_TAX_RATE : Math.max(0, Number(raw) || 0)
                          setFormData(prev => ({
                            ...prev,
                            taxRate: nextRate,
                            tax: prev.isTaxEnabled ? taxableBase * (nextRate / 100) : 0,
                          }))
                        }}
                        className="input input-sm w-[4.5rem] text-center px-2"
                        disabled={readOnly || !coerceTaxEnabled(formData.isTaxEnabled)}
                        aria-label={isRTL ? 'نسبة الضريبة' : 'Tax rate'}
                      />
                      <span className="text-xs font-semibold text-gray-500 w-4 text-center">%</span>
                    </div>
                    <input
                      type="text"
                      value={(Number(formData.tax) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      className="input input-sm w-28 text-end opacity-80 cursor-not-allowed bg-gray-100 dark:bg-gray-700"
                      readOnly
                      aria-label={isRTL ? 'قيمة الضريبة' : 'Tax amount'}
                    />
                  </div>
                </div>
                
                <div className={`h-px w-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                
                <div className="flex justify-between items-center text-lg font-bold">
                  <span className="text-theme-text">{isRTL ? 'الإجمالي' : 'Total'}</span>
                  <span className="text-blue-600">{total.toLocaleString()}</span>
                </div>

                {advanceApplied > 0 && (
                  <div className="flex justify-between items-center text-sm mt-2">
                    <span className="text-theme-text">{isRTL ? 'مقدم مطبق' : 'Advance Applied'}</span>
                    <span className="font-medium text-amber-600">{advanceApplied.toLocaleString()}</span>
                  </div>
                )}
                
                 <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-theme-text">{isRTL ? 'المبلغ المدفوع' : 'Paid Amount'}</span>
                  <input
                    type="number"
                    min="0"
                    className={`input input-sm w-24 text-end opacity-80 cursor-not-allowed ${errors.paidAmount ? 'border-red-500' : ''}`}
                    value={formData.paidAmount}
                    readOnly
                    disabled
                  />
                </div>
                {!readOnly && (
                  <p className="text-[11px] text-theme-text opacity-70 text-end">
                    {isRTL ? 'يتم تسجيل المدفوعات من نافذة التحصيل فقط.' : 'Payments are recorded via the Payment modal only.'}
                  </p>
                )}
                {errors.paidAmount && <p className="text-xs text-red-500 text-end mt-1">{errors.paidAmount}</p>}
                
                 <div className="flex justify-between items-center text-sm text-red-500 font-medium">
                  <span>{isRTL ? 'المستحق (المتبقي)' : 'Balance Due'}</span>
                  <span>{balanceDue.toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost flex-1"
                >
                  {readOnly ? (isRTL ? 'إغلاق' : 'Close') : (isRTL ? 'إلغاء' : 'Cancel')}
                </button>
                {!readOnly && (
                  <button
                    type="submit"
                    className="btn btn-primary flex-1 gap-2"
                  >
                    <FaSave />
                    {isRTL ? 'حفظ الفاتورة' : 'Save Invoice'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SalesInvoicesFormModal
