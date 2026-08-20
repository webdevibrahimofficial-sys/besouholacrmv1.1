import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../shared/context/ThemeProvider'
import { api } from '../utils/api'
import { FaShoppingCart, FaTimes, FaHashtag, FaUser, FaFileInvoiceDollar, FaCalendarAlt, FaPlus, FaTrash, FaStickyNote, FaPaperclip, FaSave } from 'react-icons/fa'
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

const resolveOrderTaxRate = (data, taxableBase = 0) => {
  const stored = Number(data?.taxRate ?? data?.tax_rate ?? data?.meta_data?.tax_rate)
  if (Number.isFinite(stored) && stored > 0) return stored
  const tax = Number(data?.tax || 0)
  const base = Number(taxableBase) || Number(data?.subtotal || data?.amount || 0)
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
    if (Number.isFinite(storedRate) && storedRate > 0) {
      return { discountType, discount: storedRate > 1 ? storedRate : storedRate * 100 }
    }
    return { discountType, discount: 0 }
  }
  if (Number.isFinite(storedAmount) && storedAmount > 0) {
    return { discountType: 'value', discount: storedAmount }
  }
  if (Number.isFinite(storedRate) && storedRate > 0) {
    return { discountType: 'percent', discount: storedRate > 1 ? storedRate : storedRate * 100 }
  }
  return { discountType: 'value', discount: 0 }
}

const SalesOrdersFormModal = ({ isOpen, onClose, onSave, initialData = null, isRTL, readOnly = false }) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  
  const [formData, setFormData] = useState({
    id: '',
    quotationId: '',
    customerId: '',
    customerCode: '',
    customerName: '',
    status: 'Draft',
    date: new Date().toISOString().split('T')[0],
    deliveryDate: '',
    items: [], // Array of line items
    tax: 0,
    taxRate: DEFAULT_TAX_RATE,
    isTaxEnabled: true,
    notes: '',
    attachment: null,
    salesPerson: '',
    discountType: 'value',
    discount: 0,
    discountRate: 0
  })

  const [errors, setErrors] = useState({})
  const [customers, setCustomers] = useState([])
  const [quotations, setQuotations] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [salesPersons, setSalesPersons] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      try {
        setLoadingData(true)
        const [customersRes, itemsRes, quotationsRes, usersRes, categoriesRes] = await Promise.all([
          api.get('/api/customers?all=1'),
          api.get('/api/items?all=1'),
          api.get('/api/quotations?all=1'),
          api.get('/api/users?all=1'),
          api.get('/api/item-categories?all=1')
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

        // Fetch categories from API
        const categoriesData = categoriesRes.data?.data || categoriesRes.data || []
        if (Array.isArray(categoriesData)) {
          setCategories(
            categoriesData.map((c) => ({
              value: c.name,
              label: c.name,
              categoryType: normalizeCategoryType(c.applies_to || c.category_type || c.type) || CATEGORY_TYPE_PRODUCTS,
            })).filter((c) => c.value)
          )
        } else {
          setCategories([])
        }

        const itemsData = extractItemsCollection(itemsRes.data)
        setProducts(itemsData.map(mapCatalogItem).filter((item) => item.name))

        const qData = quotationsRes.data.data || quotationsRes.data || []
        if (Array.isArray(qData)) {
          const mappedQuotations = qData.map(q => ({
            ...q,
            customerId: q.customer_id, // Ensure we have the ID for filtering
            customerCode: q.customer?.customer_code || q.customer_id || q.customer_code || q.customerCode,
            customerName: q.customer_name || q.customerName,
            salesPerson: q.sales_person || q.salesPerson,
            quotationCode: q.meta_data?.quotation_code || q.id // Map quotation code for display
          }))
          setQuotations(mappedQuotations)
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
      }
    }

    fetchData()
  }, [isOpen])

  useEffect(() => {
    if (initialData) {
      const docDiscount = resolveDocumentDiscount(initialData)
      const meta = initialData.meta_data || initialData.metaData || {}
      const normalizedItems = (initialData.items || []).map((item, idx) => ({
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
      const taxRate = resolveOrderTaxRate(initialData, taxableBase)
      const isTaxEnabled = coerceTaxEnabled(
        initialData.isTaxEnabled ?? meta.is_tax_enabled,
        Number(initialData.tax || 0) > 0
      )

      setFormData({
        ...initialData,
        id: initialData.id || '',
        quotationId: initialData.quotationId || '',
        customerId: initialData.customerId || initialData.customer_id || '',
        customerCode: initialData.customerCode || '',
        customerName: initialData.customerName || '',
        status: Number.isFinite(Number(initialData.id)) ? (initialData.status || 'Draft') : 'Draft',
        date: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        deliveryDate: initialData.deliveryDate ? new Date(initialData.deliveryDate).toISOString().split('T')[0] : '',
        items: normalizedItems,
        tax: Number(initialData.tax || 0),
        taxRate,
        isTaxEnabled,
        notes: initialData.notes || '',
        attachment: initialData.attachment || null,
        salesPerson: initialData.salesPerson || '',
        discountType: docDiscount.discountType,
        discount: docDiscount.discount,
        discountRate: itemsSubtotal > 0 ? provisionalDiscount / itemsSubtotal : (initialData.discountRate || 0)
      })
    } else {
      setFormData({
        id: `SO-${Math.floor(Math.random() * 10000)}`, // Auto-generate ID for new
        quotationId: '',
        customerId: '',
        customerCode: '',
        customerName: '',
        status: 'Draft',
        date: new Date().toISOString().split('T')[0],
        deliveryDate: '',
        items: [],
        tax: 0,
        taxRate: DEFAULT_TAX_RATE,
        isTaxEnabled: true,
        discountType: 'value',
        discount: 0,
        discountRate: 0,
        notes: '',
        attachment: null,
        salesPerson: ''
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

  // Calculations — match Quotations line helpers + document discount before tax
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

  // Auto-calculate tax from taxable base × rate
  useEffect(() => {
    if (formData.isTaxEnabled) {
      const rate = resolveActiveTaxRate(formData.taxRate)
      const calculatedTax = taxableBase * (rate / 100)
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
  }, [taxableBase, formData.isTaxEnabled, formData.taxRate])

  if (!isOpen) return null

  const validate = () => {
    const newErrors = {}
    if (!formData.customerName) newErrors.customerName = isRTL ? 'اسم العميل مطلوب' : 'Customer Name is required'
    if (!formData.deliveryDate) newErrors.deliveryDate = isRTL ? 'تاريخ التسليم مطلوب' : 'Delivery Date is required'
    if (formData.items.length === 0) newErrors.items = isRTL ? 'يجب إضافة عنصر واحد على الأقل' : 'At least one item is required'
    
    // Validate items
    formData.items.forEach((item, index) => {
      if (!item.name) newErrors[`item_name_${index}`] = true
      if (!item.quantity || item.quantity <= 0) newErrors[`item_qty_${index}`] = true
      if (!item.price || item.price < 0) newErrors[`item_price_${index}`] = true
      const discount = Number(item.discount) || 0
      const discountType = item.discountType || 'value'
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
      onSave({ 
        ...formData, 
        subtotal, 
        discountAmount: globalDiscountAmount,
        discountRate,
        discountType: formData.discountType || 'value',
        taxRate: formData.taxRate,
        isTaxEnabled: formData.isTaxEnabled,
        total,
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
            <FaShoppingCart className="text-blue-600" />
            {readOnly 
              ? (isRTL ? 'عرض تفاصيل الطلب' : 'View Order Details')
              : initialData 
                ? (isRTL ? 'تعديل طلب مبيعات' : 'Edit Sales Order') 
                : (isRTL ? 'إضافة طلب مبيعات' : 'Add Sales Order')}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Row 1: Order # & Customer Code */}
            <div>
              <label className={labelClass}>{isRTL ? 'رقم الطلب' : 'Order #'}</label>
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
                <FaUser className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <SearchableSelect
                  options={customers.map(c => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
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
                      customerId: customer?.id || '',
                      customerCode: selectedCode,
                      customerName: customer ? customer.name : '',
                      salesPerson: salesPersonName,
                      quotationId: ''
                    });
                  }}
                  placeholder={isRTL ? 'اختر الكود' : 'Select Code'}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'}`}
                  isRTL={isRTL}
                />
              </div>
            </div>

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

            <div>
              <label className={labelClass}>{isRTL ? 'كود عرض السعر' : 'Quotation Code'}</label>
              <div className="relative">
                <FaFileInvoiceDollar className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                <select
                  value={formData.quotationId}
                  onChange={e => {
                    const selectedQId = e.target.value;
                    const quotation = quotations.find(q => String(q.id) === String(selectedQId));
                    
                    const applyQuotation = (qData) => {
                      const items = Array.isArray(qData?.items) ? qData.items : [];
                      setFormData(prev => ({
                        ...prev,
                        quotationId: selectedQId,
                        customerId: qData.customerId || qData.customer_id || prev.customerId,
                        customerCode: qData.customer_code || qData.customerCode || prev.customerCode,
                        customerName: qData.customerName || qData.customer_name || prev.customerName,
                        salesPerson: qData.salesPerson || qData.sales_person || prev.salesPerson,
                        items: items.map(item => {
                          const addons = Array.isArray(item.addons) ? item.addons : []
                          const addon_ids = Array.isArray(item.addon_ids)
                            ? item.addon_ids
                            : addons.map((addon) => addon?.id ?? addon?.addon_id).filter((id) => id != null && id !== '')
                          return {
                            id: item.id || Date.now(),
                            item_id: item.item_id ?? item.itemId ?? item.product_id,
                            type: resolveLineItemType(item.type),
                            category: resolveCategoryName(item) || String(item.category || item.product_category || '').trim(),
                            name: item.name || item.item_name || item.product_name || '',
                            quantity: item.quantity || item.qty || 1,
                            price: item.price || item.unit_price || 0,
                            discount: item.discount || item.discount_amount || 0,
                            discountType: normalizeDiscountType(item.discountType ?? item.discount_type),
                            brand: item.brand || '',
                            code: item.code || '',
                            serviceType: item.serviceType || item.service_type || '',
                            billingCycle: item.billingCycle || item.billing_cycle || '',
                            addon_ids,
                            addons,
                            addons_total: getQuotationLineAddonsTotal({ ...item, addon_ids, addons }),
                          }
                        })
                      }));
                    }
                    
                    if (quotation) {
                      applyQuotation(quotation);
                    } else {
                      setFormData(prev => ({ ...prev, quotationId: selectedQId }));
                      // Fallback: fetch quotation details to get items
                      api.get(`/api/quotations/${selectedQId}`).then(res => {
                        const data = res.data?.data || res.data || {};
                        applyQuotation({
                          ...data,
                          items: data.items || [],
                          customer_id: data.customer_id,
                          customer_code: data.customer?.customer_code || data.customer_code,
                          customerName: data.customer_name,
                          salesPerson: data.sales_person_name || data.sales_person
                        });
                      }).catch(() => {})
                    }
                  }}
                  className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} ${!formData.customerCode ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!formData.customerCode}
                >
                  <option value="">{isRTL ? 'اختر العرض' : 'Select Quotation'}</option>
                  {quotations
                    .filter(q => {
                      const code = String(formData.customerCode || '')
                      return !code || String(q.customerId) === code || String(q.customerCode) === code
                    })
                    .map(q => (
                    <option key={q.id} value={q.id}>{q.quotationCode || q.id} - {q.customerName}</option>
                  ))}
                </select>
              </div>
            </div>

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>{isRTL ? 'تاريخ الطلب' : 'Order Date'}</label>
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
                <label className={labelClass}>{isRTL ? 'تاريخ التسليم' : 'Delivery Date'}</label>
                <div className="relative">
                  <FaCalendarAlt className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 text-theme-text`} />
                  <input
                    type="date"
                    value={formData.deliveryDate}
                    onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                    className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} ${errors.deliveryDate ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.deliveryDate && <p className={errorClass}>{errors.deliveryDate}</p>}
              </div>
            </div>
          </div>

          <div className={`h-px w-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

          {/* Section 2: Items (Dynamic List) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-theme-text">{lineLabels.sectionTitle}</h3>
              {!readOnly && (
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
                          disabled={readOnly}
                        >
                          {itemTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-3 align-top">
                         <select 
                          className="input input-sm w-full"
                          value={item.category || ''}
                          onChange={e => handleLineCategoryChange(index, e.target.value)}
                          disabled={readOnly}
                        >
                          <option value="">{isRTL ? 'اختر...' : 'Select...'}</option>
                          {getCategoryOptionsForLine(item).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-3 align-top">
                        <SearchableSelect
                          placement="bottom"
                          options={getProductOptionsForLine(item).map(i => ({ value: String(i.id), label: i.name }))}
                          value={(item.item_id != null && item.item_id !== '' ? String(item.item_id) : (findCatalogProduct(products, { name: item.name, type: item.type, category: item.category })?.id != null ? String(findCatalogProduct(products, { name: item.name, type: item.type, category: item.category }).id) : ''))}
                          onChange={val => handleLineItemSelect(index, val)}
                          placeholder={serviceLine ? lineLabels.selectService : lineLabels.selectProduct}
                          className={`min-w-[180px] ${errors[`item_name_${index}`] ? 'border-red-500' : ''}`}
                          isRTL={isRTL}
                          showAllOption={false}
                          disabled={readOnly}
                        />
                        {identityMeta ? (
                          <div className="mt-1.5 text-[10px] text-theme-text/60 truncate" title={identityMeta}>
                            {identityMeta}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 align-top">
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
                            readOnly={readOnly}
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
                          readOnly={readOnly}
                          onChange={e => updateItem(index, 'price', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <select
                            className="input input-sm w-[72px] shrink-0"
                            value={item.discountType || 'value'}
                            disabled={readOnly}
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
                            readOnly={readOnly}
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
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors ${isDark ? 'hover:bg-red-950/40' : 'hover:bg-red-50'}`}
                            title={isRTL ? 'حذف' : 'Remove'}
                          >
                            <FaTrash size={13} />
                          </button>
                        )}
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
                          disabled={readOnly}
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
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors ${isDark ? 'hover:bg-red-950/40' : 'hover:bg-red-50'}`}
                        title={isRTL ? 'حذف' : 'Remove'}
                      >
                        <FaTrash size={13} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.type}</label>
                      <select 
                        className="input input-sm w-full"
                        value={item.type || 'Product'}
                        onChange={e => handleLineTypeChange(index, e.target.value)}
                        disabled={readOnly}
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
                        disabled={readOnly}
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
                          placement="bottom"
                          options={getProductOptionsForLine(item).map(i => ({ value: String(i.id), label: i.name }))}
                          value={(item.item_id != null && item.item_id !== '' ? String(item.item_id) : (findCatalogProduct(products, { name: item.name, type: item.type, category: item.category })?.id != null ? String(findCatalogProduct(products, { name: item.name, type: item.type, category: item.category }).id) : ''))}
                          onChange={val => handleLineItemSelect(index, val)}
                          placeholder={serviceLine ? lineLabels.selectService : lineLabels.selectProduct}
                          className={`w-full ${errors[`item_name_${index}`] ? 'border-red-500' : ''}`}
                          isRTL={isRTL}
                          showAllOption={false}
                          disabled={readOnly}
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
                        disabled={readOnly}
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
                          readOnly={readOnly}
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
                        readOnly={readOnly}
                        onChange={e => updateItem(index, 'price', Number(e.target.value))}
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{lineLabels.discount}</label>
                      <div className="flex items-center gap-1">
                        <select
                          className="input input-sm w-[72px] shrink-0"
                          value={item.discountType || 'value'}
                          disabled={readOnly}
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
                          readOnly={readOnly}
                          onChange={e => updateItem(index, 'discount', Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="col-span-2 flex justify-between items-end pt-1">
                      <label className="text-[10px] font-bold uppercase text-gray-500 mb-0.5 block">{lineLabels.total}</label>
                      <span className="font-bold text-lg tabular-nums text-blue-600">
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
            <div className={`space-y-4 rounded-xl border p-4 ${isDark ? 'border-gray-700/80 bg-gray-900/30' : 'border-gray-200 bg-slate-50/60'}`}>
               <div>
                <label className={labelClass}>{isRTL ? 'ملاحظات' : 'Notes'}</label>
                <div className="relative">
                  <FaStickyNote className={`pointer-events-none absolute ${isRTL ? 'right-3' : 'left-3'} top-3 ${isDark ? 'text-gray-500' : 'text-slate-400'}`} />
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    className={`${inputClass} ${isRTL ? 'pr-10' : 'pl-10'} min-h-[88px] py-3`}
                    placeholder={isRTL ? 'أضف ملاحظات...' : 'Add notes...'}
                    readOnly={readOnly}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'المرفقات' : 'Attachment'}</label>
                <div className={`border border-dashed rounded-xl p-4 text-center transition-colors ${
                  isDark
                    ? 'border-gray-600 bg-gray-800/40 hover:bg-gray-800/70'
                    : 'border-gray-300 bg-white hover:bg-slate-50'
                } ${readOnly ? 'opacity-70 pointer-events-none' : 'cursor-pointer'}`}>
                  <input
                    type="file"
                    className="hidden"
                    id="sales-order-file-upload"
                    disabled={readOnly}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setFormData((prev) => ({ ...prev, attachment: file }))
                    }}
                  />
                  <label htmlFor="sales-order-file-upload" className={`flex flex-col items-center gap-2 ${readOnly ? '' : 'cursor-pointer'}`}>
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${isDark ? 'bg-gray-700/80 text-gray-300' : 'bg-slate-100 text-slate-500'}`}>
                      <FaPaperclip size={16} />
                    </span>
                    <span className={`text-sm max-w-full truncate px-2 ${formData.attachment ? (isDark ? 'text-gray-200 font-medium' : 'text-slate-700 font-medium') : 'text-gray-500'}`}>
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
            <div className={`p-5 rounded-xl border ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-slate-50 border-gray-200'}`}>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-sm">
                  <span className={`${isDark ? 'text-gray-300' : 'text-slate-600'}`}>{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <span className="font-medium tabular-nums text-theme-text">{subtotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center text-sm gap-3">
                  <span className={`${isDark ? 'text-gray-300' : 'text-slate-600'}`}>{isRTL ? 'قيمة الخصم' : 'Discount Value'}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    readOnly={readOnly}
                    className="input input-sm w-28 text-end text-green-600 font-medium tabular-nums"
                    value={globalDiscountAmount ? parseFloat(globalDiscountAmount.toFixed(2)) : 0}
                    onChange={e => {
                       const val = parseFloat(e.target.value);
                       const amount = isNaN(val) ? 0 : val;
                       const rate = subtotal > 0 ? amount / subtotal : 0;
                       setFormData({...formData, discountRate: rate});
                    }}
                  />
                </div>
                
                <div className="flex justify-between items-center text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`whitespace-nowrap ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>{isRTL ? 'الضريبة' : 'Tax'}</span>
                    <label className={`flex items-center gap-1.5 select-none ${readOnly ? 'opacity-70' : 'cursor-pointer'}`}>
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
                        className="input input-sm w-[4.5rem] text-center px-2 tabular-nums"
                        disabled={readOnly || !coerceTaxEnabled(formData.isTaxEnabled)}
                        aria-label={isRTL ? 'نسبة الضريبة' : 'Tax rate'}
                      />
                      <span className="text-xs font-semibold text-gray-500 w-4 text-center">%</span>
                    </div>
                    <input
                      type="text"
                      value={(Number(formData.tax) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      className="input input-sm w-28 text-end opacity-80 cursor-not-allowed bg-gray-100 dark:bg-gray-700 tabular-nums"
                      readOnly
                      aria-label={isRTL ? 'قيمة الضريبة' : 'Tax amount'}
                    />
                  </div>
                </div>
                
                <div className={`h-px w-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                
                <div className="flex justify-between items-center text-lg font-bold text-blue-600">
                  <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                  <span className="tabular-nums">{total.toLocaleString()}</span>
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
                    {isRTL ? 'حفظ الطلب' : 'Save Order'}
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

export default SalesOrdersFormModal
