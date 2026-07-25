﻿import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import "react-datepicker/dist/react-datepicker.css"
import { api } from '../../utils/api'
import { useThemeClasses } from '../../utils/themeClasses'
import { 
  FaFileImport, 
  FaFileExport,
  FaPlus, 
  FaShoppingCart, 
  FaEye, 
  FaCheck, 
  FaBan, 
  FaEllipsisV, 
  FaExchangeAlt, 
  FaTrash,
  FaTimes,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa'
import { 
  Filter, 
  ChevronDown, 
  Search, 
  User, 
  DollarSign, 
  Calendar 
} from 'lucide-react'

import SearchableSelect from '../../components/SearchableSelect'
import DateRangePicker from '../../shared/components/DateRangePicker'
import RequestPreviewModal from '../../components/RequestPreviewModal'
import RequestsImportModal from './RequestsImportModal'
import { useAppState } from '../../shared/context/AppStateProvider'

const CURRENCY_SYMBOLS = {
  EGP: 'E£', USD: '$', SAR: 'SAR', AED: 'AED',
}
const getCurrencySymbol = (code) =>
  CURRENCY_SYMBOLS[String(code || '').trim().toUpperCase()] || code || '$'

const getUniqueTextList = (values = []) =>
  [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))]

export default function RequestsPage() {
  const { t, i18n } = useTranslation()
  const th = useThemeClasses()
  const { isLight } = th
  const isRTL = String(i18n.language || '').startsWith('ar')

  const { user, crmSettings } = useAppState()
  const currencySymbol = getCurrencySymbol(
    crmSettings?.defaultCurrency || crmSettings?.default_currency || '$'
  )

  const modulePermissions = (user?.meta_data && user.meta_data.module_permissions) || {}
  const hasExplicitInventoryPerms = Object.prototype.hasOwnProperty.call(modulePermissions, 'Inventory')
  const inventoryModulePerms = hasExplicitInventoryPerms && Array.isArray(modulePermissions.Inventory)
    ? modulePermissions.Inventory : []
  const effectiveInventoryPerms = hasExplicitInventoryPerms ? inventoryModulePerms : []
  const roleLower = String(user?.role || '').toLowerCase()
  const isTenantAdmin = roleLower === 'admin' || roleLower === 'tenant admin' || roleLower === 'tenant-admin'
  const canManageRequests =
    effectiveInventoryPerms.includes('showRequests') || user?.is_super_admin || isTenantAdmin

  // ── State ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    customer_name: '', customer_phone: '', product: '',
    quantity: 1, price: 0, type: 'Inquiry', priority: 'Medium',
    description: '', payment_plan: ''
  })
  const [saving, setSaving] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        openMenuId &&
        !event.target.closest('.action-menu-dropdown') &&
        !event.target.closest('.action-menu-btn')
      ) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  // ── Filters ───────────────────────────────────────────────────────────────
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({
    item: '', category: '', categoryType: '', status: '',
    dateFrom: '', dateTo: '', datePeriod: '', createdBy: '',
    salesPerson: '', minTotal: '', maxTotal: '', minQuantity: '', maxQuantity: ''
  })
  const [showAllFilters, setShowAllFilters] = useState(false)

  // ── Pagination & sort ─────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedItems, setSelectedItems] = useState([])

  const formatAmount = (value) =>
    `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`

  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  // ── Load Data (unchanged business logic) ─────────────────────────────────
  const load = async () => {
    try {
      setLoading(true); setError('')
      const [requestsRes, usersRes, itemsRes] = await Promise.allSettled([
        api.get('/api/inventory-requests'),
        api.get('/api/users'),
        api.get('/api/items?all=true')
      ])
      if (requestsRes.status !== 'fulfilled') throw requestsRes.reason
      if (usersRes.status !== 'fulfilled') throw usersRes.reason

      const requestsData = requestsRes.value.data
      const usersData = usersRes.value.data.data || usersRes.value.data || []
      const itemsDbData = itemsRes.status === 'fulfilled'
        ? (itemsRes.value.data.data || itemsRes.value.data || []) : []

      if (itemsRes.status !== 'fulfilled')
        console.warn('Optional items enrichment failed:', itemsRes.reason)

      const itemByName = new Map(
        itemsDbData.filter(item => String(item?.name || '').trim() !== '')
          .map(item => [String(item.name).trim().toLowerCase(), item])
      )
      const userNameById = new Map(
        usersData.map(u => [String(u?.id), u?.name || u?.full_name || u?.email || `User #${u?.id}`])
      )

      const mappedItems = (requestsData.data || []).map(item => {
        let requestItems = []
        if (item.meta_data?.items && Array.isArray(item.meta_data.items)) {
          requestItems = item.meta_data.items.map(reqItem => {
            const matched = itemByName.get(String(reqItem?.name || '').trim().toLowerCase())
            const finalCategory = matched?.category || reqItem.category || '-'
            const quantity = Number(reqItem?.quantity || 1)
            const price = Number(reqItem?.price ?? matched?.price ?? 0)
            const addonSource = Array.isArray(reqItem?.addons) && reqItem.addons.length > 0
              ? reqItem.addons : (Array.isArray(matched?.addons) ? matched.addons : [])
            return {
              ...reqItem, quantity, price,
              type: matched?.type || reqItem.type || '-',
              itemType: matched?.item_type || matched?.itemType || reqItem.itemType || '-',
              category: typeof finalCategory === 'object' ? finalCategory?.name || '-' : finalCategory,
              addons: addonSource.map(a => ({
                name: a?.name || '', quantity: Number(a?.quantity || 0), price: Number(a?.price || 0),
              }))
            }
          })
        } else if (item.product) {
          const matchedItem = itemByName.get(String(item.product || '').trim().toLowerCase())
          const finalCategory = matchedItem?.category || '-'
          requestItems = [{
            id: 1, name: item.product,
            type: matchedItem?.type || '-',
            itemType: matchedItem?.item_type || matchedItem?.itemType || '-',
            category: typeof finalCategory === 'object' ? finalCategory?.name || '-' : finalCategory,
            quantity: item.quantity || 0, price: item.meta_data?.price || 0,
            addons: Array.isArray(matchedItem?.addons)
              ? matchedItem.addons.map(a => ({ name: a?.name || '', quantity: Number(a?.quantity || 0), price: Number(a?.price || 0) }))
              : [],
          }]
        }

        const itemNames = getUniqueTextList(requestItems.map(r => r.name))
        const categoryNames = getUniqueTextList(requestItems.map(r => r.category))
        const categoryTypes = getUniqueTextList(requestItems.map(r => r.type))
        const itemTypes = getUniqueTextList(requestItems.map(r => r.itemType))
        const totalQuantity = requestItems.reduce((s, r) => s + Number(r.quantity || 0), 0)
        const baseItemsPrice = requestItems.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.price || 0), 0)

        const expandedAddons = requestItems.flatMap(r =>
          (Array.isArray(r.addons) ? r.addons : [])
            .filter(a => String(a?.name || '').trim() !== '')
            .map(a => {
              const qty = Number(a.quantity || 0) * Number(r.quantity || 0)
              return { name: String(a.name).trim(), quantity: qty, price: Number(a.price || 0), totalPrice: qty * Number(a.price || 0) }
            })
        )

        const addonNames = getUniqueTextList(expandedAddons.map(a => a.name))
        const addonsTotalQty = expandedAddons.reduce((s, a) => s + Number(a.quantity || 0), 0)
        const addonsTotalPrice = expandedAddons.reduce((s, a) => s + Number(a.totalPrice || 0), 0)
        const resolvedSalesPerson = userNameById.get(String(item.assigned_to)) || item.assigned_to_name || item.meta_data?.assigned_to_name || item.assigned_to || '-'
        const resolvedCreatedBy = item.meta_data?.created_by_name || item.created_by_name || userNameById.get(String(item.meta_data?.created_by_id)) || '-'

        return {
          ...item,
          customerCode: item.customer_name, customerName: item.customer_name,
          customerPhone: item.meta_data?.customer_phone || '',
          items: requestItems,
          itemNames, itemNamesDisplay: itemNames.join(', ') || '-',
          categoryNames, categoryNamesDisplay: categoryNames.join(', ') || '-',
          categoryTypes, categoryTypesDisplay: categoryTypes.join(', ') || '-',
          itemTypes, itemTypesDisplay: itemTypes.join(', ') || '-',
          quantityTotal: totalQuantity, itemsPriceTotal: baseItemsPrice,
          addonsNames: addonNames, addonsNamesDisplay: addonNames.join(', ') || '-',
          addonsTotalQuantity: addonsTotalQty, addonsTotalPrice,
          total: baseItemsPrice + addonsTotalPrice || Number(item.meta_data?.total || 0),
          notes: item.description, salesPerson: resolvedSalesPerson,
          createdBy: resolvedCreatedBy, orderBy: resolvedCreatedBy,
          createdAt: item.created_at || new Date().toISOString()
        }
      })
      setItems(mappedItems)
    } catch (e) {
      console.error(e); setError('Failed to load requests'); setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [q, filters])

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmitForm = async (e) => {
    e.preventDefault()
    if (!formData.customer_name && !formData.product) {
      alert(isRTL ? 'اسم العميل أو المنتج مطلوب' : 'Customer name or product is required')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/inventory-requests', {
        ...formData,
        quantity: formData.quantity ? Number(formData.quantity) : null,
        meta_data: { price: Number(formData.price || 0), total: Number(formData.quantity || 1) * Number(formData.price || 0) }
      })
      await load()
      showSuccess(isRTL ? 'تم حفظ الطلب بنجاح' : 'Request saved successfully')
      setShowForm(false)
      setFormData({ customer_name: '', customer_phone: '', product: '', quantity: 1, price: 0, type: 'Inquiry', priority: 'Medium', description: '', payment_plan: '' })
    } catch (e) {
      console.error('Failed to save request', e)
      alert(isRTL ? 'فشل حفظ الطلب' : 'Failed to save request')
    } finally { setSaving(false) }
  }

  // ── Derived filter options ─────────────────────────────────────────────────
  const itemOptions = useMemo(() =>
    getUniqueTextList(items.flatMap(r => r.itemNames || [])).map(n => ({ value: n, label: n })), [items])
  const categoryOptions = useMemo(() =>
    getUniqueTextList(items.flatMap(r => r.categoryNames || [])).map(n => ({ value: n, label: n })), [items])
  const categoryTypeOptions = useMemo(() =>
    getUniqueTextList(items.flatMap(r => r.categoryTypes || [])).map(n => ({ value: n, label: n })), [items])
  const statusOptions = useMemo(() =>
    getUniqueTextList(items.map(r => r.status)).map(n => ({ value: n, label: n })), [items])
  const createdByOptions = useMemo(() =>
    [...new Set(items.map(i => i.createdBy).filter(Boolean))].map(n => ({ value: n, label: n })), [items])
  const salesPersonOptions = useMemo(() =>
    getUniqueTextList(items.map(r => r.salesPerson)).map(n => ({ value: n, label: n })), [items])

  // ── Filtered items (unchanged logic) ──────────────────────────────────────
  const filteredItems = useMemo(() => items.filter(item => {
    if (q) {
      const query = q.toLowerCase()
      const match =
        String(item.id || '').toLowerCase().includes(query) ||
        String(item.customerCode || '').toLowerCase().includes(query) ||
        String(item.customerName || '').toLowerCase().includes(query) ||
        String(item.itemNamesDisplay || '').toLowerCase().includes(query) ||
        String(item.categoryNamesDisplay || '').toLowerCase().includes(query) ||
        String(item.categoryTypesDisplay || '').toLowerCase().includes(query) ||
        String(item.salesPerson || '').toLowerCase().includes(query) ||
        String(item.orderBy || '').toLowerCase().includes(query)
      if (!match) return false
    }
    if (filters.dateFrom && new Date(item.createdAt) < new Date(filters.dateFrom)) return false
    if (filters.dateTo) {
      const end = new Date(filters.dateTo); end.setDate(end.getDate() + 1)
      if (new Date(item.createdAt) >= end) return false
    }
    if (filters.item && !(item.itemNames || []).includes(filters.item)) return false
    if (filters.category && !(item.categoryNames || []).includes(filters.category)) return false
    if (filters.categoryType && !(item.categoryTypes || []).includes(filters.categoryType)) return false
    if (filters.createdBy && item.createdBy !== filters.createdBy) return false
    if (filters.salesPerson && item.salesPerson !== filters.salesPerson) return false
    if (filters.status && item.status !== filters.status) return false
    if (filters.minTotal && Number(item.total) < Number(filters.minTotal)) return false
    if (filters.maxTotal && Number(item.total) > Number(filters.maxTotal)) return false
    if (filters.minQuantity && Number(item.quantityTotal || 0) < Number(filters.minQuantity)) return false
    if (filters.maxQuantity && Number(item.quantityTotal || 0) > Number(filters.maxQuantity)) return false
    return true
  }), [items, q, filters])

  const paginatedItems = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy]
      if (av === bv) return 0
      return sortOrder === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
    return sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  }, [filteredItems, sortBy, sortOrder, currentPage, itemsPerPage])

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('desc') }
  }
  const handleSelectAll = (e) =>
    setSelectedItems(e.target.checked ? paginatedItems.map(i => i.id) : [])
  const handleSelectRow = (id) =>
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const handleApprove = async (id) => {
    if (!window.confirm(isRTL ? 'هل أنت متأكد من الموافقة على هذا الطلب؟' : 'Are you sure you want to approve this request?')) return
    try {
      await api.put(`/api/inventory-requests/${id}`, { status: 'Approved' })
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Approved' } : i))
      showSuccess(isRTL ? 'تمت الموافقة على الطلب بنجاح' : 'Request approved successfully')
    } catch (e) { console.error(e); alert('Failed to approve request') }
  }

  const handleReject = async (id) => {
    if (!window.confirm(isRTL ? 'هل أنت متأكد من رفض هذا الطلب؟' : 'Are you sure you want to reject this request?')) return
    try {
      await api.put(`/api/inventory-requests/${id}`, { status: 'Rejected' })
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Rejected' } : i))
      showSuccess(isRTL ? 'تم رفض الطلب بنجاح' : 'Request rejected successfully')
    } catch (e) { console.error(e); alert('Failed to reject request') }
  }

  const handleDelete = async (id) => {
    if (!canManageRequests) {
      alert(isRTL ? 'لا تملك صلاحية حذف الطلبات' : 'You do not have permission to delete requests')
      return
    }
    if (!window.confirm(isRTL ? 'هل أنت متأكد من حذف هذا الطلب؟' : 'Are you sure you want to delete this request?')) return
    try {
      await api.delete(`/api/inventory-requests/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
      showSuccess(isRTL ? 'تم حذف الطلب بنجاح' : 'Request deleted successfully')
    } catch (e) { console.error(e); alert('Failed to delete request') }
  }

  const handleConvertToQuotation = async (item) => {
    if (!window.confirm(isRTL ? 'هل تريد تحويل هذا الطلب إلى عرض سعر؟' : 'Convert this request to quotation?')) return
    try {
      setLoading(true)
      let customerId = null
      try {
        const searchName = String(item.customerName || '').trim()
        const { data: customersData } = await api.get('/api/customers', { params: { q: searchName, per_page: 1 } })
        const existing = Array.isArray(customersData?.data)
          ? (customersData.data[0] || null)
          : (Array.isArray(customersData) ? (customersData[0] || null) : null)
        if (existing) {
          customerId = String(existing.id)
        } else {
          let phone = String(item.customerPhone || '').trim()
          if (!phone) {
            const v = window.prompt(isRTL ? 'رقم هاتف العميل مطلوب. ادخل رقم الهاتف:' : 'Customer phone is required. Enter phone:')
            phone = String(v || '').trim()
          }
          if (!phone) { alert(isRTL ? 'تم إلغاء التحويل' : 'Conversion canceled'); setLoading(false); return }
          let leadEmail = '', leadAssignedTo = null
          try {
            const lr = await api.get('/api/leads', { params: { q: phone, per_page: 1 } })
            const lf = Array.isArray(lr?.data?.data) ? (lr.data.data[0] || null) : (Array.isArray(lr?.data) ? (lr.data[0] || null) : null)
            leadEmail = String(lf?.email || '').trim()
            leadAssignedTo = lf?.assigned_to || (typeof lf?.assignedTo === 'object' ? lf.assignedTo?.id : null)
          } catch {}
          const nr = await api.post('/api/customers', {
            name: item.customerName, phone, email: leadEmail || undefined,
            assigned_to: leadAssignedTo ? String(leadAssignedTo) : undefined,
            source: 'Converted Request', type: 'Individual', notes: `Auto-created from Request ${item.id}`
          })
          customerId = String(nr.data.id)
        }
      } catch (err) {
        const msg = err?.response?.data?.errors
          ? (isRTL ? 'فشل إنشاء/جلب العميل (بيانات غير مكتملة)' : 'Failed to find/create customer (invalid data)')
          : (isRTL ? 'فشل إنشاء/جلب العميل' : 'Failed to find or create customer')
        alert(msg); setLoading(false); return
      }
      const subtotal = (item.items || []).reduce((a, i) => a + (i.quantity * i.price), 0)
      const tax = subtotal * 0.14
      await api.post('/api/quotations', {
        customer_id: String(customerId || ''), customer_name: item.customerName,
        status: 'Draft', date: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: item.items || [], notes: `Converted from Request ${item.id}. ${item.notes || ''}`,
        subtotal, tax, total: subtotal + tax, sales_person: item.salesPerson || user?.name || '',
        meta_data: { converted_from_request_id: item.id, customer_phone: item.customerPhone }
      })
      await api.put(`/api/inventory-requests/${item.id}`, { status: 'Converted' })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'Converted' } : i))
      showSuccess(isRTL ? 'تم التحويل إلى عرض سعر بنجاح' : 'Converted to Quotation successfully')
    } catch (e) {
      console.error(e)
      const msg = e?.response?.data?.message
        || (e?.response?.data?.errors ? JSON.stringify(e.response.data.errors) : null)
        || (isRTL ? 'فشل التحويل إلى عرض سعر' : 'Failed to convert to quotation')
      alert(msg)
    } finally { setLoading(false) }
  }

  const handleImport = async (rows) => {
    setLoading(true)
    let successCount = 0
    for (const row of rows) {
      try {
        const price = Number(row['Price'] || row['السعر']) || 0
        const quantity = Number(row['Quantity'] || row['الكمية']) || 1
        const payload = {
          customer_name: row['Customer Name'] || row['اسم العميل'],
          customer_phone: row['Customer Phone'] || row['رقم الهاتف'],
          product: row['Product'] || row['المنتج'],
          quantity, price,
          priority: row['Priority'] || row['الأولوية'] || 'Medium',
          type: row['Type'] || row['نوع الطلب'] || 'Inquiry',
          payment_plan: row['Payment Plan'] || row['خطة الدفع'] || '',
          description: row['Notes'] || row['ملاحظات'] || '',
          meta_data: { price, total: quantity * price }
        }
        if (!payload.customer_name) continue
        await api.post('/api/inventory-requests', payload)
        successCount++
      } catch (e) { console.error('Import error', e) }
    }
    setLoading(false); setShowImportModal(false)
    if (successCount > 0) {
      showSuccess(isRTL ? `تم استيراد ${successCount} طلب بنجاح` : `Successfully imported ${successCount} requests`)
      await load()
    } else { alert(isRTL ? 'فشل الاستيراد' : 'Import failed') }
  }

  const handleExportSelected = () => {
    const selected = items.filter(i => selectedItems.includes(i.id))
    if (!selected.length) { alert(isRTL ? 'اختر طلبًا واحدًا على الأقل' : 'Select at least one request'); return }
    const L = isRTL
    const header = [L?'رقم الطلب':'Order ID',L?'اسم العميل':'Customer Name',L?'العناصر':'Items',L?'الكمية':'Quantity',L?'اسم الفئة':'Category Name',L?'نوع الفئة':'Category Type',L?'السعر':'Price',L?'أسماء الإضافات':'Add-ons Name',L?'كمية الإضافات':'Add-ons Quantity',L?'سعر الإضافات':'Add-ons Price',L?'الإجمالي':'Total Price',L?'مندوب المبيعات':'Sales Person',L?'بواسطة':'Order By',L?'التاريخ':'Order Date',L?'الحالة':'Status',L?'ملاحظات':'Notes']
    const rows = selected.map(i => [i.id,i.customerName||'',i.itemNamesDisplay||'',i.quantityTotal||0,i.categoryNamesDisplay||'',i.categoryTypesDisplay||'',Number(i.itemsPriceTotal||0).toFixed(2),i.addonsNamesDisplay||'',i.addonsTotalQuantity||0,Number(i.addonsTotalPrice||0).toFixed(2),Number(i.total||0).toFixed(2),i.salesPerson||'',i.orderBy||'',new Date(i.createdAt).toLocaleDateString(),i.status||'',i.notes||''])
    const csv = [header,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `order-requests-${new Date().toISOString().slice(0,10)}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setQ('')
    setFilters({ item:'',category:'',categoryType:'',status:'',dateFrom:'',dateTo:'',datePeriod:'',createdBy:'',salesPerson:'',minTotal:'',maxTotal:'',minQuantity:'',maxQuantity:'' })
    setShowAllFilters(false)
  }

  // ── Status badge helper ───────────────────────────────────────────────────
  const statusBadge = (status) => {
    if (status === 'Approved')  return 'border border-green-300 text-green-700'
    if (status === 'Converted') return 'border border-purple-300 text-purple-700'
    if (status === 'Rejected')  return 'border border-red-300 text-red-700'
    return 'border border-yellow-300 text-yellow-700'
  }
  const statusBadgeMobile = (status) => {
    if (status === 'Approved')  return 'bg-green-100 text-green-700'
    if (status === 'Converted') return 'bg-purple-100 text-purple-700'
    if (status === 'Rejected')  return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={`p-4 md:p-6 space-y-6 min-h-screen ${th.page}`}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-4 md:p-6 relative mb-6">
        <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-start gap-3">
            <div className="relative flex flex-col items-start gap-1">
              <h1 className={`text-xl md:text-2xl font-bold text-start ${th.title} flex items-center gap-2`}>
                {t('Order Requests')}
                <span className={`text-sm font-normal px-2 py-1 rounded-full ${th.badgeNeutral}`}>
                  {filteredItems.length}
                </span>
              </h1>
              <span aria-hidden="true" className="inline-block h-[2px] w-full rounded bg-gradient-to-r from-blue-500 to-purple-600" />
              <p className={`text-sm mt-1 ${th.muted}`}>
                {isRTL ? 'إدارة طلبات الشراء' : 'Manage your order requests'}
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
            {canManageRequests && (
              <button
                onClick={() => setShowForm(true)}
                className="btn btn-sm w-full lg:w-auto bg-green-600 hover:bg-green-500 !text-white border-none flex items-center justify-center gap-2"
              >
                <FaPlus /> {isRTL ? 'إضافة طلب' : 'Add Request'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {successMessage && (
        <div className="mb-3 p-3 rounded border border-green-300 bg-green-50 text-green-700">{successMessage}</div>
      )}
      {error && (
        <div className="mb-3 p-3 rounded border border-red-300 bg-red-50 text-red-700">{error}</div>
      )}

      {/* Filter Section - Identical structure to SalesQuotations */}
      <div className={`${th.cardGlass} p-4 rounded-xl mb-6`}>
        <div className="flex justify-between items-center mb-3">
          <h2 className={`text-sm font-semibold flex items-center gap-2 ${th.title}`}>
            <Filter className="text-blue-500" size={16} /> {isRTL ? 'تصفية' : 'Filter'}
          </h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setShowAllFilters(prev => !prev)}
              className={`flex items-center gap-1.2 px-2.5 py-1.5 text-[11px] md:text-sm font-medium text-blue-600 ${isLight ? 'bg-blue-50 hover:bg-blue-100 border-blue-100' : 'bg-blue-900/30 hover:bg-blue-900/40 border-blue-800'} rounded-lg transition-all border`}
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <ChevronDown size={14} className={`transform transition-transform ${showAllFilters ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={clearFilters}
              className={`px-2.5 py-1.5 text-[11px] md:text-sm font-medium ${th.muted} hover:text-red-600 ${isLight ? 'hover:bg-red-50' : 'hover:bg-red-900/20'} rounded-lg transition-all`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Search className="text-blue-500" size={10} /> {isRTL ? 'بحث عام' : 'Search'}
            </label>
            <input
              className="input w-full"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={isRTL ? 'ابحث في الطلبات...' : 'Search requests...'}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <FaShoppingCart className="text-blue-500" size={10} /> {isRTL ? 'العنصر' : 'Item'}
            </label>
            <SearchableSelect
              options={itemOptions}
              value={filters.item}
              onChange={(val) => setFilters(prev => ({ ...prev, item: val }))}
              placeholder={isRTL ? 'اختر عنصرا...' : 'Select Item...'}
              isRTL={isRTL}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Filter className="text-blue-500" size={10} /> {isRTL ? 'اسم الفئة' : 'Category Name'}
            </label>
            <SearchableSelect
              options={categoryOptions}
              value={filters.category}
              onChange={(val) => setFilters(prev => ({ ...prev, category: val }))}
              placeholder={isRTL ? 'اختر فئة...' : 'Select Category...'}
              isRTL={isRTL}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Filter className="text-blue-500" size={10} /> {isRTL ? 'نوع الفئة' : 'Category Type'}
            </label>
            <SearchableSelect
              options={categoryTypeOptions}
              value={filters.categoryType}
              onChange={(val) => setFilters(prev => ({ ...prev, categoryType: val }))}
              placeholder={isRTL ? 'اختر نوعا...' : 'Select Type...'}
              isRTL={isRTL}
            />
          </div>
        </div>

        {showAllFilters && (
          <div className="space-y-4 mt-4 pt-4 border-t border-[var(--card-border)]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <User className="text-blue-500" size={10} /> {isRTL ? 'مندوب المبيعات' : 'Sales Person'}
                </label>
                <SearchableSelect
                  options={salesPersonOptions}
                  value={filters.salesPerson}
                  onChange={(val) => setFilters(prev => ({ ...prev, salesPerson: val }))}
                  placeholder={isRTL ? 'اختر...' : 'Select...'}
                  isRTL={isRTL}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <User className="text-blue-500" size={10} /> {isRTL ? 'تم الإنشاء بواسطة' : 'Created By'}
                </label>
                <SearchableSelect
                  options={createdByOptions}
                  value={filters.createdBy}
                  onChange={(val) => setFilters(prev => ({ ...prev, createdBy: val }))}
                  placeholder={isRTL ? 'اختر...' : 'Select...'}
                  isRTL={isRTL}
                />
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <Calendar className="text-blue-500" size={10} /> {isRTL ? 'تاريخ الطلب' : 'Order Date'}
                </label>
                <DateRangePicker
                  from={filters.dateFrom}
                  to={filters.dateTo}
                  onChange={({ from, to }) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }))}
                  isRTL={isRTL}
                  className="input w-full"
                  wrapperClassName="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <FaShoppingCart className="text-blue-500" size={10} /> {isRTL ? 'عدد الكمية' : 'No. of Quantity'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'من' : 'Min'}
                    value={filters.minQuantity}
                    onChange={e => setFilters(prev => ({ ...prev, minQuantity: e.target.value }))}
                  />
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'إلى' : 'Max'}
                    value={filters.maxQuantity}
                    onChange={e => setFilters(prev => ({ ...prev, maxQuantity: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <DollarSign className="text-blue-500" size={10} /> {isRTL ? 'إجمالي المبلغ' : 'Total Amount'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'من' : 'From'}
                    value={filters.minTotal}
                    onChange={e => setFilters(prev => ({ ...prev, minTotal: e.target.value }))}
                  />
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'إلى' : 'To'}
                    value={filters.maxTotal}
                    onChange={e => setFilters(prev => ({ ...prev, maxTotal: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <Filter className="text-blue-500" size={10} /> {isRTL ? 'الحالة' : 'Status'}
                </label>
                <SearchableSelect
                  options={statusOptions}
                  value={filters.status}
                  onChange={(val) => setFilters(prev => ({ ...prev, status: val }))}
                  placeholder={isRTL ? 'اختر حالة...' : 'Select Status...'}
                  isRTL={isRTL}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden md:block card p-0 overflow-hidden border border-[var(--card-border)]">
        {selectedItems.length > 0 && (
          <div className="flex justify-end px-4 py-3 border-b border-[var(--card-border)] bg-[var(--body-background)]">
            <button
              onClick={handleExportSelected}
              className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 !text-white border-none flex items-center justify-center gap-2"
            >
              <FaFileExport />
              {isRTL ? 'تصدير المحدد' : 'Export Selected'}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className={`${th.tableHeader} font-medium`}>
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={paginatedItems.length > 0 && selectedItems.length === paginatedItems.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleSort('id')}>{isRTL ? 'رقم الطلب' : 'Order ID'}</th>
                <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleSort('customerName')}>{isRTL ? 'اسم العميل' : 'Customer Name'}</th>
                <th className="p-4 min-w-[180px]">{isRTL ? 'العناصر' : 'Items'}</th>
                <th className="p-4 text-center">{isRTL ? 'الكمية' : 'Quantity'}</th>
                <th className="p-4 min-w-[160px]">{isRTL ? 'اسم الفئة' : 'Category Name'}</th>
                <th className="p-4 min-w-[140px]">{isRTL ? 'نوع الفئة' : 'Category Type'}</th>
                <th className="p-4 text-end">{isRTL ? 'السعر' : 'Price'}</th>
                <th className="p-4 min-w-[160px]">{isRTL ? 'أسماء الإضافات' : 'Add-ons Name'}</th>
                <th className="p-4 text-center">{isRTL ? 'كمية الإضافات' : 'Add-ons Qty'}</th>
                <th className="p-4 text-end">{isRTL ? 'سعر الإضافات' : 'Add-ons Price'}</th>
                <th className="p-4 text-end cursor-pointer hover:text-blue-600" onClick={() => handleSort('total')}>{isRTL ? 'إجمالي السعر' : 'Total Price'}</th>
                <th className="p-4 min-w-[140px]">{isRTL ? 'مندوب المبيعات' : 'Sales Person'}</th>
                <th className="p-4 min-w-[140px]">{isRTL ? 'تم بواسطة' : 'Order By'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'تاريخ الطلب' : 'Order Date'}</th>
                <th className="p-4 text-center">{isRTL ? 'الحالة' : 'Status'}</th>
                <th className="p-4 whitespace-nowrap min-w-[280px]">{isRTL ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {loading ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-[var(--muted-text)]">
                    {isRTL ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-[var(--muted-text)]">
                    {isRTL ? 'لا توجد طلبات مطابقة' : 'No matching requests found'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className={`${th.tableRow} transition-colors group`}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectRow(item.id)}
                      />
                    </td>
                    <td className="p-4 font-medium text-blue-600">
                      {item.id}
                    </td>
                    <td className="p-4 font-medium">
                      {item.customerName}
                    </td>
                    <td className="p-4 font-medium">
                      <div className="max-w-[180px] truncate" title={item.itemNamesDisplay}>{item.itemNamesDisplay}</div>
                    </td>
                    <td className="p-4 text-center font-medium">
                      {item.quantityTotal || 0}
                    </td>
                    <td className="p-4">
                      <div className="max-w-[160px] truncate" title={item.categoryNamesDisplay}>{item.categoryNamesDisplay}</div>
                    </td>
                    <td className="p-4">
                      <div className="max-w-[140px] truncate" title={item.categoryTypesDisplay}>{item.categoryTypesDisplay}</div>
                    </td>
                    <td className="p-4 text-end font-mono font-medium">
                      {formatAmount(item.itemsPriceTotal)}
                    </td>
                    <td className="p-4">
                      <div className="max-w-[160px] truncate" title={item.addonsNamesDisplay}>{item.addonsNamesDisplay}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`${th.badgeNeutral} px-2 py-1 rounded text-xs`}>
                        {item.addonsTotalQuantity || 0}
                      </span>
                    </td>
                    <td className="p-4 text-end font-mono font-medium">
                      {formatAmount(item.addonsTotalPrice)}
                    </td>
                    <td className="p-4 text-end font-mono font-semibold">
                      {formatAmount(item.total)}
                    </td>
                    <td className="p-4 text-sm">
                      {item.salesPerson || '-'}
                    </td>
                    <td className="p-4 text-sm">
                      {item.orderBy || '-'}
                    </td>
                    <td className="p-4 text-sm text-[var(--muted-text)] whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border bg-transparent ${statusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2 relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewItem(item)
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${isLight ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-blue-900/20 text-blue-400 hover:bg-blue-900/40'} transition-colors shadow-sm`}
                          title={isRTL ? 'معاينة' : 'Preview'}
                        >
                          <FaEye size={14} />
                          <span className="hidden xl:inline">{isRTL ? 'معاينة' : 'Preview'}</span>
                        </button>

                        {item.status === 'Pending' ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleApprove(item.id)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors shadow-sm"
                              title={isRTL ? 'موافقة' : 'Approve'}
                            >
                              <FaCheck size={14} />
                              <span className="hidden xl:inline">{isRTL ? 'موافقة' : 'Approve'}</span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReject(item.id)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40 transition-colors shadow-sm"
                              title={isRTL ? 'رفض' : 'Reject'}
                            >
                              <FaBan size={14} />
                              <span className="hidden xl:inline">{isRTL ? 'رفض' : 'Reject'}</span>
                            </button>

                            <div className="relative shrink-0">
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (openMenuId === item.id) {
                                    setOpenMenuId(null)
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setMenuPos({
                                      top: rect.bottom + 5,
                                      left: isRTL ? rect.left : rect.right - 192
                                    })
                                    setOpenMenuId(item.id)
                                  }
                                }}
                                className={`action-menu-btn flex items-center justify-center w-8 h-8 rounded-full ${th.btnMore} transition-colors`}
                              >
                                <FaEllipsisV size={14} />
                              </button>

                              {openMenuId === item.id && createPortal(
                                <div
                                  className={`action-menu-dropdown fixed z-[9999] w-48 ${th.dropdown} rounded-lg overflow-hidden`}
                                  style={{
                                    top: menuPos.top,
                                    left: menuPos.left
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleConvertToQuotation(item)
                                      setOpenMenuId(null)
                                    }}
                                    className={`w-full text-start px-4 py-3 text-sm text-purple-600 ${isLight ? 'hover:bg-purple-50' : 'hover:bg-purple-900/20'} flex items-center gap-3 transition-colors`}
                                  >
                                    <FaExchangeAlt size={16} />
                                    <span className="font-medium">{isRTL ? 'تحويل إلى عرض سعر' : 'Convert to Quotation'}</span>
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(item.id)
                                      setOpenMenuId(null)
                                    }}
                                    className={`w-full text-start px-4 py-3 text-sm text-red-600 ${isLight ? 'hover:bg-red-50' : 'hover:bg-red-900/20'} flex items-center gap-3 ${th.border} border-t transition-colors`}
                                  >
                                    <FaTrash size={16} />
                                    <span className="font-medium">{isRTL ? 'حذف' : 'Delete'}</span>
                                  </button>
                                </div>,
                                document.body
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {item.status === 'Approved' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleConvertToQuotation(item)
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40 transition-colors shadow-sm"
                                title={isRTL ? 'تحويل إلى عرض سعر' : 'Convert to Quotation'}
                              >
                                <FaExchangeAlt size={14} />
                                <span className="hidden xl:inline">{isRTL ? 'تحويل' : 'Convert'}</span>
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(item.id)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors shadow-sm"
                              title={isRTL ? 'حذف' : 'Delete'}
                            >
                              <FaTrash size={14} />
                              <span className="hidden xl:inline">{isRTL ? 'حذف' : 'Delete'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden grid grid-cols-1 gap-4 mt-4">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted-text)]">
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted-text)]">
            {isRTL ? 'لا توجد طلبات مطابقة' : 'No matching requests found'}
          </div>
        ) : (
          paginatedItems.map((item) => (
            <div key={item.id} className={`${th.card} p-4 rounded-xl shadow-sm space-y-3`}>
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-xs text-blue-600 font-mono">#{item.id}</span>
                  <h3 className={`font-bold ${th.title}`}>{item.customerName}</h3>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadgeMobile(item.status)}`}>
                  {item.status}
                </span>
              </div>

              <div className={`grid grid-cols-2 gap-2 text-sm ${th.text}`}>
                <div className="flex flex-col col-span-2">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'العناصر' : 'Items'}</span>
                  <span className="font-medium truncate" title={item.itemNamesDisplay}>{item.itemNamesDisplay}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'إجمالي السعر' : 'Total Price'}</span>
                  <span className="font-mono font-medium">{formatAmount(item.total)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'الكمية' : 'Quantity'}</span>
                  <span>{item.quantityTotal || 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'الفئة' : 'Category'}</span>
                  <span className="truncate" title={item.categoryNamesDisplay}>{item.categoryNamesDisplay}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'نوع الفئة' : 'Category Type'}</span>
                  <span className="truncate" title={item.categoryTypesDisplay}>{item.categoryTypesDisplay}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'سعر الإضافات' : 'Add-ons Price'}</span>
                  <span className="font-mono">{formatAmount(item.addonsTotalPrice)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'التاريخ' : 'Date'}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'تم بواسطة' : 'Order By'}</span>
                  <span>{item.orderBy}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'مندوب المبيعات' : 'Sales Person'}</span>
                  <span>{item.salesPerson}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--card-border)] mt-auto">
                <button
                  onClick={() => setPreviewItem(item)}
                  className="flex-1 btn btn-xs h-9 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 dark:bg-blue-900/10 dark:text-blue-400 dark:border-blue-900/30 flex items-center justify-center gap-1.5 rounded-lg transition-colors"
                >
                  <FaEye size={12} /> {isRTL ? 'معاينة' : 'Preview'}
                </button>
                {(item.status === 'Pending' || item.status === 'Inquiry') && (
                  <>
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="w-10 h-9 flex items-center justify-center bg-green-50 text-green-600 border border-green-100 hover:bg-green-100 dark:bg-green-900/10 dark:text-green-400 dark:border-green-900/30 rounded-lg transition-colors"
                      title={isRTL ? 'موافقة' : 'Approve'}
                    >
                      <FaCheck size={12} />
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      className="w-10 h-9 flex items-center justify-center bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:border-red-900/30 rounded-lg transition-colors"
                      title={isRTL ? 'رفض' : 'Reject'}
                    >
                      <FaBan size={12} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleConvertToQuotation(item)}
                  className="w-10 h-9 flex items-center justify-center bg-purple-50 text-purple-600 border border-purple-100 hover:bg-purple-100 dark:bg-purple-900/10 dark:text-purple-400 dark:border-purple-900/30 rounded-lg transition-colors"
                  title={isRTL ? 'تحويل إلى عرض سعر' : 'Convert to Quotation'}
                >
                  <FaExchangeAlt size={12} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="w-10 h-9 flex items-center justify-center bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:border-red-900/30 rounded-lg transition-colors"
                  title={isRTL ? 'حذف' : 'Delete'}
                >
                  <FaTrash size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {filteredItems.length > 0 && (
        <div className={`mt-4 flex flex-wrap items-center justify-between rounded-xl p-2 border ${th.border} gap-4`}>
          <div className="text-xs text-theme">
            {isRTL
              ? `عرض ${(currentPage - 1) * itemsPerPage + 1} إلى ${Math.min(currentPage * itemsPerPage, filteredItems.length)} من ${filteredItems.length} صنف`
              : `Showing ${(currentPage - 1) * itemsPerPage + 1} to ${Math.min(currentPage * itemsPerPage, filteredItems.length)} of ${filteredItems.length} items`
            }
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              title={isRTL ? 'السابق' : 'Prev'}
            >
              <FaChevronLeft className={isRTL ? 'scale-x-[-1]' : ''} />
            </button>
            <span className="text-sm whitespace-nowrap text-theme">
              {isRTL
                ? `الصفحة ${currentPage} من ${Math.ceil(filteredItems.length / itemsPerPage)}`
                : `Page ${currentPage} of ${Math.ceil(filteredItems.length / itemsPerPage)}`
              }
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredItems.length / itemsPerPage), p + 1))}
              disabled={currentPage >= Math.ceil(filteredItems.length / itemsPerPage)}
              title={isRTL ? 'التالي' : 'Next'}
            >
              <FaChevronRight className={isRTL ? 'scale-x-[-1]' : ''} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-xs ${th.muted} whitespace-nowrap`}>{isRTL ? 'لكل صفحة:' : 'Per page:'}</span>
            <select
              className="select select-bordered select-sm w-18 text-xs py-0 px-2 h-8 min-h-0"
              value={itemsPerPage}
              onChange={e => setItemsPerPage(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[200]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <div className="absolute inset-0 flex items-start justify-center p-4 md:p-6">
            <div className="card w-full max-w-xl mt-10 max-h-[85vh] overflow-y-auto">
              <div className={`sticky top-0 z-10 flex items-center justify-between px-4 py-3 ${th.modalHeader}`}>
                <h2 className={`text-lg font-semibold ${th.title}`}>
                  {isRTL ? 'إضافة طلب جديد' : 'Add New Request'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${isLight ? 'bg-white' : 'bg-gray-700'} text-red-600 hover:bg-red-50 shadow-md`}
                >
                  <FaTimes size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmitForm} className="p-4 space-y-4">
                <div className={`rounded-xl p-4 ${th.infoPanel}`}>
                  <p className={`text-sm ${th.muted}`}>
                    {isRTL
                      ? 'املأ الحقول التالية لإضافة طلب جديد. الحقول الأساسية مثل اسم العميل أو المنتج والكمية والسعر مطلوبة.'
                      : 'Fill in the form below to add a new request. Required fields include customer name or product, quantity, and price.'
                    }
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'اسم العميل' : 'Customer Name'}
                    </label>
                    <input
                      name="customer_name"
                      value={formData.customer_name}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                      placeholder={isRTL ? 'اكتب اسم العميل هنا' : 'Enter customer name'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'رقم الهاتف' : 'Customer Phone'}
                    </label>
                    <input
                      name="customer_phone"
                      value={formData.customer_phone}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                      placeholder={isRTL ? '0100xxxxxxx' : 'e.g. +2010xxxxxxx'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'المنتج / البند' : 'Product / Item'}
                    </label>
                    <input
                      name="product"
                      value={formData.product}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                      placeholder={isRTL ? 'اكتب اسم المنتج أو البند' : 'Enter product or item'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'الكمية' : 'Quantity'}
                    </label>
                    <input
                      type="number"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                      min="1"
                      placeholder={isRTL ? '1' : '1'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'السعر' : 'Price'}
                    </label>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                      min="0"
                      placeholder={isRTL ? '0.00' : '0.00'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'الأولوية' : 'Priority'}
                    </label>
                    <select
                      name="priority"
                      value={formData.priority}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                    >
                      <option value="Low">{isRTL ? 'منخفضة' : 'Low'}</option>
                      <option value="Medium">{isRTL ? 'متوسطة' : 'Medium'}</option>
                      <option value="High">{isRTL ? 'مرتفعة' : 'High'}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'نوع الطلب' : 'Request Type'}
                    </label>
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                    >
                      <option value="Inquiry">{isRTL ? 'استعلام' : 'Inquiry'}</option>
                      <option value="Booking">{isRTL ? 'حجز' : 'Booking'}</option>
                      <option value="Maintenance">{isRTL ? 'صيانة' : 'Maintenance'}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={`text-xs font-medium ${th.label}`}>
                      {isRTL ? 'خطة الدفع' : 'Payment Plan'}
                    </label>
                    <input
                      name="payment_plan"
                      value={formData.payment_plan}
                      onChange={handleFormChange}
                      className={`input w-full ${th.input}`}
                      placeholder={isRTL ? 'مثال: دفعة أولى، شهري' : 'e.g. Upfront, Monthly'}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={`text-xs font-medium ${th.label}`}>
                    {isRTL ? 'ملاحظات' : 'Notes'}
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleFormChange}
                    className={`textarea w-full h-20 ${th.input}`}
                    placeholder={isRTL ? 'اكتب أي ملاحظات إضافية هنا' : 'Enter any additional notes here'}
                  />
                </div>
                <div className={`flex justify-end gap-3 pt-2 border-t ${th.border} mt-2`}>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    {isRTL ? 'إغلاق' : 'Close'}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm bg-green-600 hover:bg-green-500 text-white border-none"
                    disabled={saving}
                  >
                    {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ الطلب' : 'Save Request')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <RequestsImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
      />

      <RequestPreviewModal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        request={previewItem}
      />
    </div>
  )
}

