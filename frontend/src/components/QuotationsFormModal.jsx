import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../shared/context/ThemeProvider'
import { api } from '../utils/api'
import { FaFileInvoiceDollar, FaTimes, FaHashtag, FaUser, FaCalendarAlt, FaPlus, FaTrash, FaStickyNote, FaPaperclip, FaSave } from 'react-icons/fa'
import SearchableSelect from './SearchableSelect'
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
  formatServiceBillingLabel,
  getLineIdentityMeta,
  getSalesLineLabels,
  isServiceSalesLine,
  mapCatalogItem,
  resetLineForCategoryChange,
  resetLineForTypeChange,
  resolveAvailableAddonsForLine,
  resolveCategoryName,
  resolveLineItemType,
} from '../features/inventory/salesLineCatalog'
import SalesLineAddonsPicker from '../features/inventory/SalesLineAddonsPicker'

const DEFAULT_TAX_RATE = 14

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

const resolveActiveTaxRate = (taxRate) => {
  if (taxRate === undefined || taxRate === null || taxRate === '') return DEFAULT_TAX_RATE
  const n = Number(taxRate)
  return Number.isFinite(n) ? Math.max(0, n) : DEFAULT_TAX_RATE
}

export const getQuotationLineAddonsTotal = (item) => {
  if (Array.isArray(item?.addons) && item.addons.length > 0) {
    const isService = isServiceSalesLine(item)
    return item.addons.reduce((sum, addon) => {
      const explicit = Number(addon?.total)
      if (Number.isFinite(explicit)) return sum + Math.max(0, explicit)
      const price = Number(addon?.price ?? addon?.amount ?? 0) || 0
      if (isService) return sum + price
      const qty = Number(addon?.quantity ?? 0) || 0
      return sum + (qty * price)
    }, 0)
  }
  if (item?.addons_total != null && item.addons_total !== '') {
    const stored = Number(item.addons_total)
    if (Number.isFinite(stored)) return Math.max(0, stored)
  }
  return 0
}

export const getQuotationLineDiscountAmount = (item) => {
  const quantity = Number(item?.quantity ?? item?.qty ?? 0) || 0
  const price = Number(item?.price ?? item?.unit_price ?? item?.unitPrice ?? 0) || 0
  const raw = Number(item?.discount ?? 0) || 0
  const lineGross = (quantity * price) + getQuotationLineAddonsTotal(item)
  const type = String(item?.discountType ?? item?.discount_type ?? 'value').toLowerCase()
  if (type === 'percent' || type === 'percentage' || type === '%') {
    const pct = Math.max(0, Math.min(100, raw))
    return Math.min(lineGross, (lineGross * pct) / 100)
  }
  return Math.min(lineGross, Math.max(0, raw))
}

export const getQuotationLineTotal = (item) => {
  const quantity = Number(item?.quantity ?? item?.qty ?? 0) || 0
  const price = Number(item?.price ?? item?.unit_price ?? item?.unitPrice ?? 0) || 0
  return (quantity * price) + getQuotationLineAddonsTotal(item) - getQuotationLineDiscountAmount(item)
}

const normalizeQuotationItems = (items = []) => (
  (Array.isArray(items) ? items : []).map((item) => {
    const discountType = String(item?.discountType ?? item?.discount_type ?? 'value').toLowerCase() === 'percent'
      ? 'percent'
      : 'value'
    const addons = Array.isArray(item?.addons) ? item.addons : []
    const addon_ids = Array.isArray(item?.addon_ids)
      ? item.addon_ids
      : addons.map((addon) => addon?.id ?? addon?.addon_id).filter((id) => id != null && id !== '')
    const withAddons = {
      ...item,
      discountType,
      discount: Number(item?.discount ?? 0) || 0,
      addon_ids,
      addons,
      addons_total: getQuotationLineAddonsTotal({ ...item, addon_ids, addons }),
    }
    return {
      ...withAddons,
      discountAmount: getQuotationLineDiscountAmount(withAddons),
    }
  })
)

const resolveQuotationTaxRate = (data) => {
  const stored = Number(data?.taxRate ?? data?.tax_rate ?? data?.meta_data?.tax_rate)
  if (Number.isFinite(stored) && stored > 0) return stored
  const subtotal = Number(data?.subtotal || 0)
  const tax = Number(data?.tax || 0)
  if (subtotal > 0 && tax > 0) return Math.round((tax / subtotal) * 10000) / 100
  return DEFAULT_TAX_RATE
}

const QuotationsFormModal = ({ isOpen, onClose, onSave, initialData = null, isRTL }) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  
  const [formData, setFormData] = useState({
    id: '',
    customerCode: '',
    customerName: '',
    status: 'Draft',
    date: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [], // Array of line items
    tax: 0,
    taxRate: DEFAULT_TAX_RATE,
    notes: '',
    attachment: null,
    salesPerson: '',
    isTaxEnabled: true
  })

  const [errors, setErrors] = useState({})
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [salesPersons, setSalesPersons] = useState([])
  const [categories, setCategories] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      try {
        setLoadingData(true)
        const [customersRes, productsRes, usersRes, categoriesRes] = await Promise.all([
          api.get('/api/customers', { params: { all: 1 } }),
          api.get('/api/items', { params: { all: 1 } }),
          api.get('/api/users', { params: { all: 1 } }),
          api.get('/api/item-categories', { params: { all: 1 } })
        ])

        const customersData = customersRes.data?.data || customersRes.data || []
        if (Array.isArray(customersData)) {
          const mappedCustomers = customersData.map(c => ({
            ...c,
            code: c.customer_code,
            name: c.name || c.customer_name || c.company_name || (isRTL ? 'بدون اسم' : 'No Name'),
            assignedSalesRep: c.assignee?.name || c.assigned_to
          }))
          setCustomers(mappedCustomers)
        }

        const productsData = extractItemsCollection(productsRes.data)
        setProducts(productsData.map(mapCatalogItem).filter((item) => item.name))
        
        const cats = Array.isArray(categoriesRes.data)
          ? categoriesRes.data
          : (categoriesRes.data?.data || [])
        setCategories(
          (Array.isArray(cats) ? cats : []).map((c) => ({
            value: c.name,
            label: c.name,
            categoryType: normalizeCategoryType(c.applies_to || c.category_type || c.type) || CATEGORY_TYPE_PRODUCTS,
          })).filter((c) => c.value)
        )

        const rawUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.data || [])
        const filteredSales = rawUsers.filter(u => {
          const role = String(u.role || (Array.isArray(u.roles) && u.roles[0]?.name) || u.job_title || '').toLowerCase()
          const status = String(u.status || '').toLowerCase()
          const isSalesRole = role.includes('sales') || role.includes('agent') || role.includes('broker')
          const isActive = status === 'active' || status === '' // assuming empty is active
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
      }
    }

    fetchData()
  }, [isOpen])

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        id: initialData.quotationCode || initialData.id || '',
        customerCode: initialData.customerCode || '',
        customerName: initialData.customerName || '',
        status: initialData.status || 'Draft',
        date: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        expiryDate: initialData.expiryDate ? new Date(initialData.expiryDate).toISOString().split('T')[0] : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: normalizeQuotationItems((initialData.items || []).map((item) => ({
          ...item,
          type: resolveLineItemType(item.type),
          category: resolveCategoryName(item) || String(item.category || '').trim(),
        }))),
        tax: Number(initialData.tax || 0),
        taxRate: resolveQuotationTaxRate(initialData),
        notes: initialData.notes || '',
        attachment: initialData.attachment || null,
        salesPerson: initialData.salesPerson || '',
        isTaxEnabled: coerceTaxEnabled(
          initialData.isTaxEnabled ?? initialData.meta_data?.is_tax_enabled,
          Array.isArray(initialData.items) ? Number(initialData.tax || 0) > 0 : true
        )
      })
    } else {
      setFormData({
        id: `QUO-${Math.floor(Math.random() * 10000)}`, // Auto-generate ID for new
        customerCode: '',
        customerName: '',
        status: 'Draft',
        date: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [],
        tax: 0,
        taxRate: DEFAULT_TAX_RATE,
        notes: '',
        attachment: null,
        salesPerson: '',
        isTaxEnabled: true
      })
    }
    setErrors({})
  }, [initialData, isOpen])

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
  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + getQuotationLineTotal(item), 0)
  }

  const subtotal = calculateSubtotal()
  
  // Auto-calculate tax effect
  useEffect(() => {
    if (formData.isTaxEnabled) {
      const rate = resolveActiveTaxRate(formData.taxRate)
      const calculatedTax = subtotal * (rate / 100)
      setFormData(prev => {
        const needsRateFix = prev.taxRate === undefined || prev.taxRate === null || prev.taxRate === ''
        if (Math.abs(Number(prev.tax) - calculatedTax) <= 0.01 && !needsRateFix) return prev
        return {
          ...prev,
          tax: calculatedTax,
          ...(needsRateFix ? { taxRate: resolveActiveTaxRate(prev.taxRate) } : {}),
        }
      })
    } else if (Number(formData.tax) !== 0) {
      setFormData(prev => ({ ...prev, tax: 0 }))
    }
  }, [subtotal, formData.isTaxEnabled, formData.taxRate])

  const taxAmount = parseFloat(formData.tax) || 0
  const total = subtotal + taxAmount

  if (!isOpen) return null

  const validate = () => {
    const newErrors = {}
    // if (!formData.customerId && !initialData) newErrors.customerId = isRTL ? 'العميل مطلوب' : 'Customer is required' // Removed customerId validation
    if (!formData.customerName) newErrors.customerName = isRTL ? 'اسم العميل مطلوب' : 'Customer Name is required'
    if (formData.items.length === 0) newErrors.items = isRTL ? 'يجب إضافة عنصر واحد على الأقل' : 'At least one item is required'
    
    // Validate items
    formData.items.forEach((item, index) => {
      if (!item.name) newErrors[`item_name_${index}`] = true
      if (!item.quantity || item.quantity <= 0) newErrors[`item_qty_${index}`] = true
      if (item.price === undefined || item.price === null || item.price < 0) newErrors[`item_price_${index}`] = true
      const discountType = item.discountType || 'value'
      const discount = Number(item.discount) || 0
      if (discount < 0) newErrors[`item_discount_${index}`] = true
      if (discountType === 'percent' && discount > 100) newErrors[`item_discount_${index}`] = true
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (validate()) {
      onSave({ ...formData, items: normalizeQuotationItems(formData.items), subtotal, total })
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
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }))
  }

  const handleLineAddonsChange = (index, nextLine) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? nextLine : item)),
    }))
  }

  // Category / item cascading helpers (must stay in sync with Type → Category → Item Name)
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

  const inputClass = `w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
    isDark 
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
      : 'bg-white border-gray-300 text-theme-text placeholder-gray-400'
  }`

  const labelClass = `block text-sm font-medium mb-1.5 text-theme-text`
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
            {initialData 
              ? (isRTL ? 'تعديل عرض سعر' : 'Edit Quotation') 
              : (isRTL ? 'إضافة عرض سعر' : 'Add Quotation')}
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
          
          {/* Section 1: Basic Info & Customer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {/* Row 1: Quotation # & Customer Code */}
            <div>
              <label className={labelClass}>{isRTL ? 'رقم العرض' : 'Quotation #'}</label>
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
              <label className={labelClass}>{isRTL ? 'كود العميل' : 'Customer Code'}</label>
              <div className="relative">
                <SearchableSelect
                  options={customers.map(c => ({ value: c.id || c.code, label: `${c.id || c.code} - ${c.name}` }))}
                  value={formData.customerCode}
                  onChange={(val) => {
                    const selectedCode = val;
                    const customer = customers.find(c => (c.id || c.code) === selectedCode);
                    
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
                      salesPerson: salesPersonName
                    });
                  }}
                  placeholder={isRTL ? 'اختر الكود' : 'Select Code'}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                  isRTL={isRTL}
                  showAllOption={false}
                />
              </div>
            </div>

            {/* Row 2: Customer Name & Expired Date */}
            <div>
              <label className={labelClass}>{isRTL ? 'اسم العميل' : 'Customer Name'}</label>
              <div className="relative">
                <FaUser className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <input
                  type="text"
                  value={formData.customerName}
                  readOnly
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} opacity-70 cursor-not-allowed`}
                  placeholder={isRTL ? 'اسم العميل' : 'Customer Name'}
                />
              </div>
              {errors.customerName && <p className={errorClass}>{errors.customerName}</p>}
            </div>

            {/* Row 3: Sales Person */}
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
            {/* Row 3: Dates & Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-4 md:col-span-2">
              <div>
                <label className={labelClass}>{isRTL ? 'تاريخ العرض' : 'Quotation Date'}</label>
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

              <div>
                <label className={labelClass}>{isRTL ? 'صالح حتى' : 'Valid Until'}</label>
                <div className="relative">
                  <FaCalendarAlt className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'الحالة' : 'Status'}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={inputClass}
                >
                  <option value="Draft">{isRTL ? 'مسودة' : 'Draft'}</option>
                  <option value="Sent">{isRTL ? 'تم الإرسال' : 'Sent'}</option>
                  <option value="Approved">{isRTL ? 'موافق عليه' : 'Approved'}</option>
                  <option value="Rejected">{isRTL ? 'مرفوض' : 'Rejected'}</option>
                </select>
              </div>
            </div>
          </div>

          <div className={`h-px w-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

          {/* Section 2: Items (Dynamic List) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-theme-text">{lineLabels.sectionTitle}</h3>
              <button
                type="button"
                onClick={addItem}
                className="btn btn-sm btn-primary gap-2"
              >
                <FaPlus size={12} />
                {isRTL ? 'إضافة عنصر' : 'Add Item'}
              </button>
            </div>
            
            {errors.items && <p className="text-red-500 text-sm mb-2">{errors.items}</p>}

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-theme-border dark:border-gray-700">
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase tracking-wide text-theme-text ${isDark ? 'bg-gray-800/60' : 'bg-slate-50'}`}>
                  <tr>
                    <th className="px-3 py-3 min-w-[120px]">{lineLabels.type}</th>
                    <th className="px-3 py-3 min-w-[120px]">{lineLabels.category}</th>
                    <th className="px-3 py-3 min-w-[200px]">{lineLabels.itemName}</th>
                    <th className="px-3 py-3 w-[120px]">{lineLabels.qtyOrBilling}</th>
                    <th className="px-3 py-3 w-[120px]">{lineLabels.amount}</th>
                    <th className="px-3 py-3 w-[180px]">{lineLabels.discount}</th>
                    <th className="px-3 py-3 w-[120px]">{lineLabels.total}</th>
                    <th className="px-3 py-3 w-[52px]"></th>
                  </tr>
                </thead>
                <tbody>
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
                    const rowBorder = isDark ? 'border-gray-800' : 'border-gray-100'
                    return (
                    <Fragment key={item.id || index}>
                    <tr className={`border-t ${rowBorder} ${isDark ? 'hover:bg-gray-800/40' : 'hover:bg-slate-50/80'} transition-colors`}>
                      <td className="px-2 py-3 align-top">
                        <select 
                          className="input input-sm w-full"
                          value={item.type || 'Product'}
                          onChange={e => handleLineTypeChange(index, e.target.value)}
                        >
                          {itemTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-3 align-top">
                         <select 
                          className="input input-sm w-full"
                          value={item.category || ''}
                          onChange={e => handleLineCategoryChange(index, e.target.value)}
                        >
                          <option value="">{isRTL ? 'اختر...' : 'Select...'}</option>
                          {getCategoryOptionsForLine(item).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-3 align-top">
                        <SearchableSelect
                          options={getProductOptionsForLine(item).map(i => ({ value: String(i.id), label: i.name }))}
                          value={(item.item_id != null && item.item_id !== '' ? String(item.item_id) : (findCatalogProduct(products, { name: item.name, type: item.type, category: item.category })?.id != null ? String(findCatalogProduct(products, { name: item.name, type: item.type, category: item.category }).id) : ''))}
                          onChange={val => handleLineItemSelect(index, val)}
                          placeholder={serviceLine ? lineLabels.selectService : lineLabels.selectProduct}
                          className={`min-w-[180px] ${errors[`item_name_${index}`] ? 'border-red-500' : ''}`}
                          isRTL={isRTL}
                          showAllOption={false}
                        />
                        {identityMeta ? (
                          <div className="mt-1.5 text-[10px] text-theme-text/60 truncate" title={identityMeta}>
                            {identityMeta}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 align-top">
                        {serviceLine ? (
                          <div
                            className="input input-sm w-full opacity-80 cursor-default flex items-center"
                            title={lineLabels.billing}
                          >
                            {formatServiceBillingLabel(billingValue, isRTL) || lineLabels.notApplicable}
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            className={`input input-sm w-full ${errors[`item_qty_${index}`] ? 'border-red-500' : ''}`}
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                          />
                        )}
                      </td>
                      <td className="px-2 py-3 align-top">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`input input-sm w-full ${errors[`item_price_${index}`] ? 'border-red-500' : ''}`}
                          value={item.price}
                          onChange={e => updateItem(index, 'price', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <select
                            className="input input-sm w-[72px] shrink-0"
                            value={item.discountType || 'value'}
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
                            className={`input input-sm w-full ${errors[`item_discount_${index}`] ? 'border-red-500' : ''}`}
                            value={item.discount}
                            onChange={e => updateItem(index, 'discount', Number(e.target.value))}
                            placeholder={(item.discountType || 'value') === 'percent' ? '%' : isRTL ? 'قيمة' : 'Value'}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="inline-block min-w-[4.5rem] font-semibold tabular-nums text-theme-text">
                          {getQuotationLineTotal(item).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-2 py-3 align-top text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors ${isDark ? 'hover:bg-red-950/40' : 'hover:bg-red-50'}`}
                          title={isRTL ? 'حذف' : 'Remove'}
                        >
                          <FaTrash size={13} />
                        </button>
                      </td>
                    </tr>
                    <tr className={rowBorder}>
                      <td colSpan={8} className="px-3 pb-3.5 pt-0">
                        <SalesLineAddonsPicker
                          line={item}
                          catalogAddons={availableAddons}
                          onChange={(next) => handleLineAddonsChange(index, next)}
                          isRTL={isRTL}
                          isDark={isDark}
                          compact
                        />
                      </td>
                    </tr>
                    </Fragment>
                    )
                  })}
                  {formData.items.length === 0 && (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-theme-text opacity-50 italic">
                        {isRTL ? 'لا توجد عناصر. أضف بند جديد.' : 'No items. Add a new item.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-4">
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
                <div key={item.id || index} className={`p-4 rounded-xl border relative ${isDark ? 'bg-gray-900/40 border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className={`text-sm font-semibold px-2.5 py-1 rounded-md ${isDark ? 'text-blue-300 bg-blue-950/40' : 'text-blue-700 bg-blue-50'}`}>
                      {isRTL ? `بند #${index + 1}` : `Item #${index + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors ${isDark ? 'hover:bg-red-950/40' : 'hover:bg-red-50'}`}
                      title={isRTL ? 'حذف' : 'Remove'}
                    >
                      <FaTrash size={13} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.type}</label>
                      <select 
                        className="input input-sm w-full"
                        value={item.type || 'Product'}
                        onChange={e => handleLineTypeChange(index, e.target.value)}
                      >
                        {itemTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>

                    <div className="col-span-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.category}</label>
                      <select 
                        className="input input-sm w-full"
                        value={item.category || ''}
                        onChange={e => handleLineCategoryChange(index, e.target.value)}
                      >
                        <option value="">{isRTL ? 'اختر...' : 'Select...'}</option>
                        {getCategoryOptionsForLine(item).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">
                        {serviceLine ? lineLabels.serviceName : lineLabels.productName}
                      </label>
                      <SearchableSelect
                          options={getProductOptionsForLine(item).map(i => ({ value: String(i.id), label: i.name }))}
                          value={(item.item_id != null && item.item_id !== '' ? String(item.item_id) : (findCatalogProduct(products, { name: item.name, type: item.type, category: item.category })?.id != null ? String(findCatalogProduct(products, { name: item.name, type: item.type, category: item.category }).id) : ''))}
                          onChange={val => handleLineItemSelect(index, val)}
                          placeholder={serviceLine ? lineLabels.selectService : lineLabels.selectProduct}
                          className={`w-full ${errors[`item_name_${index}`] ? 'border-red-500' : ''}`}
                          isRTL={isRTL}
                          showAllOption={false}
                        />
                      {identityMeta ? (
                        <div className="mt-1 text-[10px] text-theme-text/60 truncate">{identityMeta}</div>
                      ) : null}
                    </div>

                    <div className="col-span-2">
                      <SalesLineAddonsPicker
                        line={item}
                        catalogAddons={availableAddons}
                        onChange={(next) => handleLineAddonsChange(index, next)}
                        isRTL={isRTL}
                        isDark={isDark}
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">
                        {serviceLine ? lineLabels.billing : lineLabels.qty}
                      </label>
                      {serviceLine ? (
                        <div className="input input-sm w-full opacity-80 cursor-default flex items-center">
                          {formatServiceBillingLabel(billingValue, isRTL) || lineLabels.notApplicable}
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="1"
                          className={`input input-sm w-full ${errors[`item_qty_${index}`] ? 'border-red-500' : ''}`}
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                        />
                      )}
                    </div>

                    <div className="col-span-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.amount}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`input input-sm w-full ${errors[`item_price_${index}`] ? 'border-red-500' : ''}`}
                        value={item.price}
                        onChange={e => updateItem(index, 'price', Number(e.target.value))}
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.discount}</label>
                      <div className="flex items-center gap-1">
                        <select
                          className="input input-sm w-[72px] shrink-0"
                          value={item.discountType || 'value'}
                          onChange={e => updateItem(index, 'discountType', e.target.value)}
                        >
                          <option value="value">{isRTL ? 'قيمة' : 'Value'}</option>
                          <option value="percent">%</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          max={(item.discountType || 'value') === 'percent' ? 100 : undefined}
                          step="0.01"
                          className={`input input-sm w-full ${errors[`item_discount_${index}`] ? 'border-red-500' : ''}`}
                          value={item.discount}
                          onChange={e => updateItem(index, 'discount', Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="col-span-1 flex flex-col justify-end items-end">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.total}</label>
                      <span className="font-bold text-lg text-blue-600">
                        {getQuotationLineTotal(item).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                )
              })}
              {formData.items.length === 0 && (
                <div className="p-8 text-center text-theme-text opacity-50 italic border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                  {isRTL ? 'لا توجد عناصر. أضف بند جديد.' : 'No items. Add a new item.'}
                </div>
              )}
            </div>
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
                  <input
                    type="file"
                    className="hidden"
                    id="quotation-file-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setFormData((prev) => ({ ...prev, attachment: file }))
                    }}
                  />
                  <label htmlFor="quotation-file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <FaPaperclip className="text-gray-400" size={24} />
                    <span className="text-sm text-gray-500">
                      {formData.attachment instanceof File
                        ? formData.attachment.name
                        : (typeof formData.attachment === 'string' && formData.attachment
                          ? formData.attachment.split('/').pop()
                          : (isRTL ? 'انقر لرفع ملف' : 'Click to upload file'))}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right: Totals */}
            <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-theme-text">{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <span className="font-medium">{subtotal.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-theme-text whitespace-nowrap">{isRTL ? 'الضريبة' : 'Tax'}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        className="checkbox checkbox-xs checkbox-primary"
                        checked={coerceTaxEnabled(formData.isTaxEnabled)}
                        onChange={(e) => {
                           const isEnabled = e.target.checked
                           setFormData(prev => {
                             const rate = resolveActiveTaxRate(prev.taxRate)
                             return {
                               ...prev,
                               isTaxEnabled: isEnabled,
                               taxRate: rate,
                               tax: isEnabled ? subtotal * (rate / 100) : 0,
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
                            tax: prev.isTaxEnabled ? subtotal * (nextRate / 100) : 0,
                          }))
                        }}
                        className="input input-sm w-[4.5rem] text-center px-2"
                        disabled={!coerceTaxEnabled(formData.isTaxEnabled)}
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

                <div className="flex justify-between items-center text-lg font-bold text-blue-600">
                  <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                  <span>{total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        
          {/* Footer - Moved inside form for submit handling */}
          <div className={`flex justify-end gap-3 px-6 py-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'} rounded-b-2xl mt-6 -mx-6 -mb-6`}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost text-theme-text hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="btn bg-blue-600 hover:bg-blue-700 text-white border-none flex items-center gap-2"
            >
              <FaSave />
              {isRTL ? 'حفظ البيانات' : 'Save Data'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuotationsFormModal
