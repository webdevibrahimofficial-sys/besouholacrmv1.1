import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDynamicFields } from '../../hooks/useDynamicFields'
import { api } from '../../utils/api'
import { useAppState } from '../../shared/context/AppStateProvider'
import { FaFileImport, FaPlus, FaFileExport, FaFileCsv, FaFilePdf, FaTimes, FaFilter, FaSearch, FaLayerGroup, FaCube, FaCheckCircle, FaEdit, FaTrash, FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp } from 'react-icons/fa'
import ItemsImportModal from './ItemsImportModal'
import SearchableSelect from '../../components/SearchableSelect'
import DynamicFieldRenderer from '../../components/DynamicFieldRenderer'

export default function ItemsPage() {
  const { i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'
  const { fields: dynamicFields } = useDynamicFields('items')
  const { user, crmSettings, company } = useAppState()
  const currencyCode = crmSettings?.defaultCurrency || crmSettings?.default_currency || 'USD'
  const currencySymbol = ({
    EGP: 'E£',
    USD: '$',
    SAR: 'SAR',
    AED: 'AED',
  })[String(currencyCode || '').toUpperCase()] || String(currencyCode || 'USD').toUpperCase()
  const numberFormatter = useMemo(() => new Intl.NumberFormat('en-US'), [])
  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  )

  const modulePermissions = (user?.meta_data && user.meta_data.module_permissions) || {}
  const hasExplicitInventoryPerms = Object.prototype.hasOwnProperty.call(modulePermissions, 'Inventory')
  const inventoryModulePerms = hasExplicitInventoryPerms && Array.isArray(modulePermissions.Inventory) ? modulePermissions.Inventory : []
  const effectiveInventoryPerms = hasExplicitInventoryPerms ? inventoryModulePerms : []
  const roleLower = String(user?.role || '').toLowerCase()
  const tenantTypeNorm = String(company?.company_type || company?.type || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '')
    .trim()
  const isGeneralTenant = tenantTypeNorm === 'general'
  const allowAllTenantTypes = !tenantTypeNorm
  const isTenantAdmin =
    roleLower === 'admin' ||
    roleLower === 'tenant admin' ||
    roleLower === 'tenant-admin'
  const canManageItems =
    (allowAllTenantTypes || isGeneralTenant) && (
      effectiveInventoryPerms.includes('addItems') ||
      user?.is_super_admin ||
      isTenantAdmin
    )

  const canExportItem =
    (allowAllTenantTypes || isGeneralTenant) && (
      effectiveInventoryPerms.includes('exportItem') ||
      user?.is_super_admin ||
      isTenantAdmin
    )

  const labels = useMemo(() => ({
    title: isArabic ? 'إدارة الأصناف' : 'Items Management',
    formTitle: isArabic ? 'بيانات الصنف' : 'Item Details',
    add: isArabic ? 'إضافة صنف' : 'Add Item',
    close: isArabic ? 'إغلاق' : 'Close',
    filter: isArabic ? 'تصفية' : 'Filter',
    search: isArabic ? 'بحث' : 'Search',
    clearFilters: isArabic ? 'مسح المرشحات' : 'Clear Filters',
    reset: isArabic ? 'إعادة تعيين' : 'Reset',
    name: isArabic ? 'اسم الصنف' : 'Item Name',
    family: isArabic ? 'العائلة' : 'Family',
    category: isArabic ? 'التصنيف' : 'Category',
    group: isArabic ? 'المجموعة' : 'Group',
    brand: isArabic ? 'العلامة التجارية' : 'Brand',
    supplier: isArabic ? 'المورد' : 'Supplier',
    type: isArabic ? 'النوع' : 'Type',
    categoryType: isArabic ? 'نوع التصنيف' : 'Category Type',
    itemType: isArabic ? 'نوع الصنف' : 'Item Type',
    price: isArabic ? 'السعر' : 'Price',
    quantity: isArabic ? 'الكمية' : 'Quantity',
    status: isArabic ? 'الحالة' : 'Status',
    stock: isArabic ? 'المخزون' : 'Stock',
    minStock: isArabic ? 'الحد الأدنى' : 'Min Stock',
    unit: isArabic ? 'الوحدة' : 'Unit',
    sku: isArabic ? 'رمز الصنف' : 'SKU',
    description: isArabic ? 'الوصف' : 'Description',
    save: isArabic ? 'حفظ' : 'Save',
    listTitle: isArabic ? 'قائمة الأصناف' : 'Items List',
    empty: isArabic ? 'لا توجد أصناف بعد' : 'No items yet',
    actions: isArabic ? 'الإجراءات' : 'Actions',
    active: isArabic ? 'نشط' : 'Active',
    inactive: isArabic ? 'غير نشط' : 'Inactive',
    delete: isArabic ? 'حذف' : 'Delete',
    edit: isArabic ? 'تعديل' : 'Edit',
    basicInfo: isArabic ? 'البيانات الأساسية' : 'Basic Info',
    pricing: isArabic ? 'التسعير' : 'Pricing',
    salesOptions: isArabic ? 'خيارات البيع' : 'Sales Options',
    fixed: isArabic ? 'ثابت' : 'Fixed',
    perUnit: isArabic ? 'لكل وحدة' : 'Per Unit',
    monthly: isArabic ? 'شهري' : 'Monthly',
    yearly: isArabic ? 'سنوي' : 'Yearly',
    billingCycle: isArabic ? 'دورة الفوترة' : 'Billing Cycle',
    isActive: isArabic ? 'نشط' : 'Is Active',
    import: isArabic ? 'استيراد' : 'Import',
    export: isArabic ? 'تصدير' : 'Export',
    exportCsv: isArabic ? 'تصدير CSV' : 'Export CSV',
    exportPdf: isArabic ? 'تصدير PDF' : 'Export PDF',
    code: isArabic ? 'الكود' : 'Code',
    openAddons: isArabic ? 'فتح الإضافات +' : 'Open Add-ons +',
    addonName: isArabic ? 'اسم الإضافة' : 'Add-on Name',
    addAddon: isArabic ? 'إضافة إضافة' : 'Add Add-on',
    removeAddon: isArabic ? 'حذف' : 'Remove',
    addonsQty: isArabic ? 'كمية الإضافات' : 'Add-ons Qty',
    addonsPrice: isArabic ? 'سعر الإضافات' : 'Add-ons Price',
    totalPrice: isArabic ? 'الإجمالي' : 'Total Price',
    addonsDetails: isArabic ? 'تفاصيل الإضافات' : 'Add-ons Details',
    noAddons: isArabic ? 'لا توجد إضافات' : 'No add-ons',
  }), [isArabic])

  const [form, setForm] = useState({
    id: null,
    name: '',
    category: '',
    category_id: '',
    type: 'Product',
    itemType: 'Fixed',
    sku: '',
    price: '',
    pricingType: 'Fixed',
    billingCycle: 'Monthly',
    stock: 0,
    minStock: 0,
    unit: 'pcs',
    status: 'Active',
    allowDiscount: false,
    maxDiscount: '',
    description: '',
    addons: [],
    custom_fields: {}
  })

  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm] = useState(false)

  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAddons, setShowAddons] = useState(false)
  const [activeAddonsTooltip, setActiveAddonsTooltip] = useState(null)
  const [showAllFilters, setShowAllFilters] = useState(false)

  const [filters, setFilters] = useState({
    search: '',
    category: '',
    sku: '',
    status: '',
    type: '',
    itemType: '',
  })

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const formatAmount = (value) => `${moneyFormatter.format(Number(value || 0))} ${currencySymbol}`
  const formatNumber = (value) => numberFormatter.format(Number(value || 0))
  const getAddonTooltipData = (item) => Array.isArray(item.addons) ? item.addons.filter(addon => String(addon.name || '').trim() !== '') : []
  const showAddonsTooltip = (event, item) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setActiveAddonsTooltip({
      item,
      top: rect.top - 14,
      left: rect.left + (rect.width / 2),
    })
  }
  const hideAddonsTooltip = () => setActiveAddonsTooltip(null)

  const fetchItems = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/items')
      let data = []
      if (Array.isArray(response.data)) {
        data = response.data
      } else if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data
      }

      const mappedData = data.map(item => ({
        ...item,
        category: typeof item.category === 'object' ? item.category?.name || '' : item.category || '',
        category_id: item.category_id || '',
        stock: item.quantity !== undefined ? item.quantity : (item.stock || 0),
        minStock: item.min_alert !== undefined ? item.min_alert : (item.minStock || 0),
        itemType: item.item_type || item.itemType || '',
        pricingType: item.pricing_type || item.pricingType || 'Fixed',
        billingCycle: item.billing_cycle || item.billingCycle || 'Monthly',
        allowDiscount: item.allow_discount !== undefined ? Boolean(item.allow_discount) : (item.allowDiscount || false),
        maxDiscount: item.max_discount || item.maxDiscount || '',
        addons: Array.isArray(item.addons) ? item.addons.map(addon => ({
          id: addon.id,
          name: addon.name || '',
          quantity: addon.quantity ?? 1,
          price: addon.price ?? '',
        })) : [],
        addonsTotalQuantity: Number(item.addons_total_quantity ?? item.addonsTotalQuantity ?? 0),
        addonsTotalPrice: Number(item.addons_total_price ?? item.addonsTotalPrice ?? 0),
        totalPrice: Number(item.total_price ?? item.totalPrice ?? 0),
      }))

      setItems(mappedData)
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
    fetchAuxiliaryData()
  }, [])

  const fetchAuxiliaryData = async () => {
    try {
      const categoriesRes = await api.get('/api/item-categories')
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : [])
    } catch (error) {
      console.error('Error fetching auxiliary data:', error)
    }
  }

  // Dynamic fields state for Items
  const [dynamicValues, setDynamicValues] = useState({})

  // Sync form with dynamic values when editing
  useEffect(() => {
    if (form.id && form.custom_fields) {
      setDynamicValues(form.custom_fields)
    } else {
      setDynamicValues({})
    }
  }, [form.id, form.custom_fields])

  // Handle dynamic field changes
  const handleDynamicChange = (key, value) => {
    setDynamicValues(prev => ({ ...prev, [key]: value }))
  }

  const createEmptyAddon = () => ({ name: '', quantity: 1, price: '' })

  const addAddonRow = () => {
    setShowAddons(true)
    setForm(prev => ({ ...prev, addons: [...(prev.addons || []), createEmptyAddon()] }))
  }

  const updateAddonRow = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      addons: (prev.addons || []).map((addon, addonIndex) => (
        addonIndex === index ? { ...addon, [field]: value } : addon
      )),
    }))
  }

  const removeAddonRow = (index) => {
    setForm(prev => ({
      ...prev,
      addons: (prev.addons || []).filter((_, addonIndex) => addonIndex !== index),
    }))
  }

  function onChange(e) {
    const { name, value } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'type') {
        // Reset category if not compatible with selected type
        const ok = categories.some(c => c.name === next.category && (!c.applies_to || c.applies_to === value))
        if (!ok) {
          next.category = ''
          next.category_id = ''
        }
      }
      return next
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!canManageItems) {
      alert(isArabic ? 'لا تملك صلاحية تعديل الأصناف' : 'You do not have permission to modify items')
      return
    }
    if (!form.name) {
      alert(isArabic ? 'اسم الصنف مطلوب' : 'Item Name is required')
      return
    }
    if (!form.price) {
      alert(isArabic ? 'السعر مطلوب' : 'Price is required')
      return
    }
    // Pricing Type is now optional
    // if (!form.pricingType) {
    //   alert(isArabic ? 'نوع التسعير مطلوب' : 'Pricing Type is required')
    //   return
    // }

    const dataToSave = {
      ...form,
      quantity: Number(form.stock),
      min_alert: Number(form.minStock),
      item_type: form.itemType || '',
      addons: (form.addons || [])
        .filter(addon => String(addon.name || '').trim() !== '')
        .map(addon => ({
          name: String(addon.name || '').trim(),
          quantity: Number(addon.quantity || 1),
          price: Number(addon.price || 0),
        })),
      custom_fields: dynamicValues
    }

    setLoading(true)
    try {
      if (form.id) {
        await api.put(`/api/items/${form.id}`, dataToSave)
      } else {
        await api.post('/api/items', dataToSave)
      }
      await fetchItems()
      setForm({
        id: null, name: '', category: '', category_id: '', type: 'Product', itemType: 'Fixed', sku: '', price: '', pricingType: 'Fixed', billingCycle: 'Monthly', stock: 0, minStock: 0, unit: 'pcs', status: 'Active', allowDiscount: false, maxDiscount: '', description: '', addons: [], custom_fields: {}
      })
      setDynamicValues({})
      setShowAddons(false)
      setShowForm(false)
    } catch (error) {
      console.error('Error saving item:', error)
      const status = error?.response?.status
      const msg = error?.response?.data?.message
                 || error?.response?.data?.errors?.sku?.[0]
                 || error?.message
                 || (isArabic ? 'حدث خطأ أثناء الحفظ' : 'Error saving item')
      if (status === 409 || status === 422) {
        alert(isArabic ? `خطأ في البيانات: ${msg}` : `Validation error: ${msg}`)
      } else {
        alert(isArabic ? 'فشل الاتصال بالخادم أو إعدادات قاعدة البيانات' : 'Server/DB error. Please try again later.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function onDelete(id) {
    if (!canManageItems) {
      alert(isArabic ? 'لا تملك صلاحية حذف الأصناف' : 'You do not have permission to delete items')
      return
    }
    if (window.confirm(isArabic ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete this item?')) {
      try {
        await api.delete(`/api/items/${id}`)
        await fetchItems()
      } catch (error) {
        console.error('Error deleting item:', error)
        alert(isArabic ? 'فشل الحذف' : 'Failed to delete')
      }
    }
  }

  function onEdit(item) {
    setForm({
      ...item,
      category_id: item.category_id || '',
      itemType: item.itemType || item.item_type || '',
      addons: Array.isArray(item.addons) ? item.addons : [],
    })
    setShowAddons(Array.isArray(item.addons) && item.addons.length > 0)
    setShowForm(true)
  }

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const itemsWithComputedTotals = useMemo(() => {
    return items.map(item => {
      const addons = Array.isArray(item.addons) ? item.addons : []
      const fallbackAddonsQty = addons.reduce((sum, addon) => sum + Number(addon.quantity || 0), 0)
      const fallbackAddonsPrice = addons.reduce((sum, addon) => sum + (Number(addon.quantity || 0) * Number(addon.price || 0)), 0)
      const basePrice = Number(item.price || 0)
      const addonsTotalQuantity = Number(item.addonsTotalQuantity || 0) || fallbackAddonsQty
      const addonsTotalPrice = Number(item.addonsTotalPrice || 0) || fallbackAddonsPrice
      const totalPrice = Number(item.totalPrice || 0) || (basePrice + addonsTotalPrice)

      return {
        ...item,
        addonsTotalQuantity,
        addonsTotalPrice,
        totalPrice,
      }
    })
  }, [items])

  const filtered = useMemo(() => {
    return itemsWithComputedTotals.filter(item => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!item.name.toLowerCase().includes(q)) return false
      }
      if (filters.sku) {
        const skuQuery = filters.sku.toLowerCase()
        if (!(item.sku || '').toLowerCase().includes(skuQuery)) return false
      }
      if (filters.status && item.status !== filters.status) return false
      if (filters.type && item.type !== filters.type) return false
      if (filters.itemType && (item.itemType || '') !== filters.itemType) return false
      if (filters.category && item.category !== filters.category) return false
      return true
    })
  }, [itemsWithComputedTotals, filters])

  function clearFilters() {
    setFilters({ search: '', category: '', sku: '', status: '', type: '', itemType: '' })
    setShowAllFilters(false)
  }

  // Pagination Logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, currentPage, itemsPerPage])

  const TYPE_OPTIONS = ['Product', 'Service', 'Subscription', 'Package']
  const ITEM_TYPE_OPTIONS = ['Fixed', 'Per Unit', 'Monthly', 'Yearly']
  const getCategoryTypeOptionLabel = (option) => {
    if (!isArabic) return option
    if (option === 'Product') return 'منتج'
    if (option === 'Service') return 'خدمة'
    if (option === 'Subscription') return 'اشتراك'
    if (option === 'Package') return 'باقة'
    return option
  }
  const getItemTypeOptionLabel = (option) => {
    if (!isArabic) return option
    if (option === 'Fixed') return 'ثابت'
    if (option === 'Per Unit') return 'لكل وحدة'
    if (option === 'Monthly') return 'شهري'
    if (option === 'Yearly') return 'سنوي'
    return option
  }

  const getAllSuffix = () => (isArabic ? '(الكل)' : '(All)')
  // Use full category objects for form
  const categoryOptionsForForm = useMemo(() => {
    return categories
      .filter(c => !form.type || !c.applies_to || c.applies_to === form.type)
  }, [categories, form.type])
  
  // Use names for filter for backward compatibility
  const categoryOptionsForFilter = useMemo(() => {
    return categories
      .filter(c => !filters.type || !c.applies_to || c.applies_to === filters.type)
      .map(c => ({ label: c.name, value: c.name }))
  }, [categories, filters.type])

  const exportItemsCsv = () => {
    const headers = ['SKU', 'Item Name', 'Category Name', 'Category Type', 'Item Type', 'Price', 'Quantity', 'Add-ons Qty', 'Add-ons Price', 'Total Price', 'Status']
    const csvContent = [
      headers.join(','),
      ...filtered.map(item => [
        `"${item.sku || ''}"`,
        `"${item.name}"`,
        `"${item.category || ''}"`,
        `"${item.type}"`,
        `"${item.itemType || ''}"`,
        `"${item.price || 0}"`,
        `"${item.stock || 0}"`,
        `"${item.addonsTotalQuantity || 0}"`,
        `"${item.addonsTotalPrice || 0}"`,
        `"${item.totalPrice || 0}"`,
        `"${item.status}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'items.csv'
    a.click(); URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  const exportItemsPdf = async (items) => {
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF()

      const tableColumn = ["SKU", "Name", "Category", "Category Type", "Item Type", "Price", "Qty", "Add-ons Qty", "Add-ons Price", "Total", "Status"]
      const tableRows = []

      items.forEach(item => {
        const rowData = [
          item.sku || '',
          item.name,
          item.category || '',
          item.type,
          item.itemType || '',
          item.price || 0,
          item.stock || 0
          ,
          item.addonsTotalQuantity || 0,
          item.addonsTotalPrice || 0,
          item.totalPrice || 0,
          item.status,
        ]
        tableRows.push(rowData)
      })

      doc.text("Items List", 14, 15)
      autoTable.default(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      })
      doc.save("items_list.pdf")
      setShowExportMenu(false)
    } catch (error) {
      console.error("Export PDF Error:", error)
    }
  }

  const handleImport = async (importedData) => {
    setLoading(true)
    let successCount = 0
    let firstErrorMessage = null
    for (const item of importedData) {
      try {
        const name = item?.name ?? item?.Name
        if (!name) {
          if (!firstErrorMessage) firstErrorMessage = isArabic ? 'عمود الاسم مفقود' : 'Missing name column'
          continue
        }
        await api.post('/api/items', {
          ...item,
          name: String(name).trim(),
          quantity: Number(item.stock) || 0,
          price: Number(item.price) || 0,
          min_alert: Number(item.minStock) || 0,
          status: item.status || 'Active'
        })
        successCount++
      } catch (e) {
        console.error('Import error for item:', item, e)
        if (!firstErrorMessage) {
          firstErrorMessage = e?.response?.data?.message || (isArabic ? 'فشل حفظ بعض السجلات' : 'Some rows failed to save')
        }
      }
    }
    setLoading(false)
    setShowImportModal(false)
    if (successCount > 0) {
      alert(isArabic ? `تم استيراد ${successCount} صنف بنجاح` : `Successfully imported ${successCount} items`)
      await fetchItems()
    } else {
      const msg = firstErrorMessage || (isArabic ? 'فشل الاستيراد' : 'Import failed')
      alert(msg)
    }
  }

  return (
    <div className="space-y-6 pt-4 px-4 sm:px-6">
      <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative inline-block">
          <h1 className="page-title text-2xl font-semibold  text-theme">{labels.title}</h1>
          <span aria-hidden className="absolute block h-[1px] rounded bg-gradient-to-r from-blue-500 via-purple-500 to-transparent" style={{ width: 'calc(100% + 8px)', left: isArabic ? 'auto' : '-4px', right: isArabic ? '-4px' : 'auto', bottom: '-4px' }}></span>
        </div>

        <div className=" w-full lg:w-auto flex flex-wrap lg:flex-row items-stretch lg:items-center gap-2 lg:gap-3">

          <button
            className="btn btn-sm w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white border-none flex items-center justify-center gap-2"
            onClick={() => setShowImportModal(true)}
          >
            <FaFileImport className='text-white' /> <span className="text-white">{isArabic ? 'استيراد' : 'Import'}</span>
          </button>
          {canManageItems && (
            <button className="btn btn-sm w-full lg:w-auto bg-green-600 hover:bg-green-500 text-white border-none gap-2" onClick={() => {
              setForm({
                id: null,
                name: '',
                category: '',
                category_id: '',
                type: 'Product',
                itemType: 'Fixed',
                sku: '',
                price: '',
                pricingType: 'Fixed',
                billingCycle: 'Monthly',
                stock: 0,
                minStock: 0,
                unit: 'pcs',
                status: 'Active',
                allowDiscount: false,
                maxDiscount: '',
                description: '',
                addons: [],
                custom_fields: {}
              });
              setDynamicValues({});
              setShowAddons(false);
              setShowForm(true);
            }}>
              <FaPlus className='text-white' /><span className="text-white">{labels.add}</span>
            </button>
          )}
          {canExportItem && (
          <div className="relative  dropdown-container w-full lg:w-auto">
            <button
              className="btn btn-sm w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white border-none flex items-center justify-center gap-2"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <FaFileExport className='text-white' /> <span className="text-white">{isArabic ? 'تصدير' : 'Export'}</span>
            </button>

            {showExportMenu && (
              <div className={`absolute top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 py-2 border border-gray-100 dark:border-gray-700 ${isArabic ? 'left-0' : 'right-0'}`}>
                <button onClick={exportItemsCsv} className="w-full text-start px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200">
                  <FaFileCsv className="text-green-500" /> {labels.exportCsv}
                </button>
                <button onClick={() => exportItemsPdf(filtered)} className="w-full text-start px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200">
                  <FaFilePdf className="text-red-500" /> {labels.exportPdf}
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="card w-full max-w-5xl rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-blue-800">
            <div className="flex justify-between items-center px-6 py-4 border-b border-blue-800/50">
              <h2 className="text-xl font-bold text-theme">
                {labels.add}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-theme hover:text-white transition-colors bg-transparent p-1.5 rounded-md">
                <FaTimes size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar ">
              <form onSubmit={onSubmit} className="space-y-6">
                <div className="rounded-xl border border-white/10 p-5">
                  <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                    {labels.basicInfo}
                  </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.name} <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 placeholder-gray-600 h-10 rounded-md"
                      placeholder="Item Name"
                      required
                    />
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.quantity}</label>
                    <input
                      type="number"
                      name="stock"
                      value={form.stock}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                      placeholder="0"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.price} <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      name="price"
                      value={form.price}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.categoryType}</label>
                    <select
                      name="type"
                      value={form.type}
                      onChange={onChange}
                      className="select w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 min-h-0 rounded-md"
                    >
                      {TYPE_OPTIONS.map(t => (
                        <option key={t} value={t}>{getCategoryTypeOptionLabel(t)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.category}</label>
                    <select
                      name="category"
                      value={form.category_id || ''}
                      onChange={(e) => {
                        const catId = e.target.value
                        const cat = categories.find(c => String(c.id) === String(catId))
                        setForm(prev => ({
                          ...prev,
                          category_id: catId,
                          category: cat ? cat.name : '',
                          group: ''
                        }))
                      }}
                      className="select w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 min-h-0 rounded-md"
                    >
                      <option value="">{labels.category}</option>
                      {categoryOptionsForForm.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.itemType}</label>
                    <select
                      name="itemType"
                      value={form.itemType}
                      onChange={onChange}
                      className="select w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 min-h-0 rounded-md"
                    >
                      {ITEM_TYPE_OPTIONS.map(option => (
                        <option key={option} value={option}>{getItemTypeOptionLabel(option)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.sku}</label>
                    <input
                      type="text"
                      name="sku"
                      value={form.sku}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 placeholder-gray-600 h-10 rounded-md"
                      placeholder={isArabic ? 'اتركه فارغًا للتوليد التلقائي' : 'Leave blank to auto-generate'}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.minStock}</label>
                    <input
                      type="number"
                      name="minStock"
                      value={form.minStock}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                      placeholder="0"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.unit}</label>
                    <input
                      type="text"
                      name="unit"
                      value={form.unit}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                      placeholder="pcs"
                    />
                  </div>

                  <div className="form-control xl:col-span-3">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.description}</label>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={onChange}
                      className="textarea w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 placeholder-gray-600 h-24 rounded-md"
                      placeholder="Description"
                    ></textarea>
                  </div>
                </div>
                </div>

                <div className="border border-white/10 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                    {labels.addonsSection}
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (!showAddons && (!form.addons || form.addons.length === 0)) {
                          setForm(prev => ({ ...prev, addons: [createEmptyAddon()] }))
                        }
                        setShowAddons(prev => !prev)
                      }}
                      className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none"
                    >
                      {labels.openAddons}
                    </button>

                    {showAddons && (
                      <button
                        type="button"
                        onClick={addAddonRow}
                        className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none"
                      >
                        <FaPlus className="text-white" /> {labels.addAddon}
                      </button>
                    )}
                  </div>

                  {showAddons && (
                    <div className="space-y-3">
                      {(form.addons || []).map((addon, index) => (
                        <div key={`addon-${index}`} className="rounded-lg border border-white/10 p-4 grid grid-cols-1 xl:grid-cols-4 gap-3 items-end">
                          <div className="form-control xl:col-span-2">
                            <label className="label text-xs font-semibold text-theme mb-1.5">{labels.addonName}</label>
                            <input
                              type="text"
                              value={addon.name || ''}
                              onChange={(e) => updateAddonRow(index, 'name', e.target.value)}
                              className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                              placeholder={labels.addonName}
                            />
                          </div>

                          <div className="form-control">
                            <label className="label text-xs font-semibold text-theme mb-1.5">{labels.quantity}</label>
                            <input
                              type="number"
                              min="1"
                              value={addon.quantity ?? 1}
                              onChange={(e) => updateAddonRow(index, 'quantity', e.target.value)}
                              className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                              placeholder="1"
                            />
                          </div>

                          <div className="flex items-end gap-2">
                            <div className="form-control flex-1">
                              <label className="label text-xs font-semibold text-theme mb-1.5">{labels.price}</label>
                              <input
                                type="number"
                                min="0"
                                value={addon.price ?? ''}
                                onChange={(e) => updateAddonRow(index, 'price', e.target.value)}
                                className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                                placeholder="0.00"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => removeAddonRow(index)}
                              className="btn btn-sm btn-ghost text-red-500 hover:bg-red-50"
                            >
                              {labels.removeAddon}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-white/10 rounded-xl p-5">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="form-control flex flex-row items-center gap-4">
                      <input
                        type="checkbox"
                        className="toggle toggle-success toggle-sm"
                        checked={form.status === 'Active'}
                        onChange={e => setForm({ ...form, status: e.target.checked ? 'Active' : 'Inactive' })}
                      />
                      <label className="label-text font-medium text-theme">{labels.isActive}</label>
                    </div>
                  </div>
                </div>

                {dynamicFields.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">{isArabic ? 'حقول مخصصة' : 'Custom Fields'}</h4>
                    <DynamicFieldRenderer
                      fields={dynamicFields}
                      values={dynamicValues}
                      onChange={handleDynamicChange}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                  <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 rounded-md text-sm font-medium text-theme hover:text-white hover:bg-white/10 transition-colors">{labels.close}</button>
                  <button type="submit" className="px-6 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-500 text-theme shadow-lg shadow-blue-900/50" disabled={loading}>
                    {loading ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : labels.save}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <ItemsImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      <div className="card rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-lg font-medium text-theme">
              <FaFilter className="text-blue-500" />
              {labels.filter}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllFilters(prev => !prev)}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600/20 px-5 py-3 text-base font-medium text-blue-400 transition-colors hover:bg-blue-600/30"
              >
                {showAllFilters ? (isArabic ? 'إخفاء' : 'Hide') : (isArabic ? 'عرض الكل' : 'Show All')}
                {showAllFilters ? <FaChevronUp /> : <FaChevronDown />}
              </button>
              <button onClick={clearFilters} className="px-3 py-1.5 text-sm text-theme hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                {labels.reset}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                <FaSearch className="text-blue-500" /> {labels.search}
              </label>
              <div className="relative">
                <FaSearch className={`absolute top-1/2 -translate-y-1/2 text-gray-400 text-xs ${isArabic ? 'right-3' : 'left-3'}`} />
                <input
                  type="text"
                  placeholder={labels.search}
                  className={`input input-sm h-8 text-xs w-full border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isArabic ? 'pr-8' : 'pl-8'}`}
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                <FaLayerGroup className="text-blue-500" /> {labels.category}
              </label>
              <SearchableSelect
                options={categoryOptionsForFilter}
                value={filters.category}
                onChange={val => setFilters({ ...filters, category: val })}
                placeholder={labels.category}
                className="input-sm h-8 text-xs min-h-0"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                <FaCube className="text-blue-500" /> {labels.categoryType}
              </label>
              <select className="select select-sm h-8 text-xs w-full min-h-0" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value, category: '' })}>
                <option value="">{`${labels.categoryType} ${getAllSuffix()}`}</option>
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{getCategoryTypeOptionLabel(t)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                <FaSearch className="text-blue-500" /> {labels.sku}
              </label>
              <input
                type="text"
                placeholder={labels.sku}
                className="input input-sm h-8 text-xs w-full border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={filters.sku}
                onChange={(e) => setFilters(prev => ({ ...prev, sku: e.target.value }))}
              />
            </div>
          </div>

          {showAllFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
              <div>
                <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                  <FaCube className="text-blue-500" /> {labels.itemType}
                </label>
                <select
                  className="select select-sm h-8 text-xs w-full min-h-0"
                  value={filters.itemType}
                  onChange={e => setFilters({ ...filters, itemType: e.target.value })}
                >
                  <option value="">{`${labels.itemType} ${getAllSuffix()}`}</option>
                  {ITEM_TYPE_OPTIONS.map(option => (
                    <option key={option} value={option}>{getItemTypeOptionLabel(option)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                  <FaCheckCircle className="text-blue-500" /> {labels.status}
                </label>
                <select className="select select-sm h-8 text-xs w-full min-h-0" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
                  <option value="">{`${labels.status} ${getAllSuffix()}`}</option>
                  <option value="Active">{labels.active}</option>
                  <option value="Inactive">{labels.inactive}</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-visible">

        {/* Table Title */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-theme">{labels.listTitle}</h2>
        </div>

        {/* Table & Cards */}
        <div>
          {loading ? (
            <div className="p-8 text-center text-theme">{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <div className="bg-gray-50 rounded-full p-4 mb-3">
                <FaSearch size={24} className="text-theme" />
              </div>
              <p>{labels.empty}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto overflow-y-visible relative z-0">
                <table className="table w-full">
                  <thead className=" bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 relative z-10">
                    <tr>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.code}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.name}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.category}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.categoryType}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.itemType}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.price}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.quantity}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.addonsQty}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.addonsPrice}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.totalPrice}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.status}</th>
                      <th className="text-end px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider pr-6">{labels.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {paginatedItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-700/50 transition-colors group">
                        <td className="px-4 py-3 text-start text-theme font-mono text-xs text-nowrap">
                          {item.sku || '-'}
                        </td>
                        <td className="px-4 py-3 text-start font-medium text-theme">
                          <span>{item.name}</span>
                        </td>
                        <td className="px-4 py-3 text-start text-theme">
                          <span className="text-xs text-nowrap">{item.category || '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{getCategoryTypeOptionLabel(item.type || '-')}</td>
                        <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{getItemTypeOptionLabel(item.itemType || '-')}</td>
                        <td className="px-4 py-3 text-start font-medium text-theme">{formatAmount(item.price)}</td>
                        <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatNumber(item.stock ?? 0)}</td>
                        <td className="px-4 py-3 text-start">
                          <div className="inline-flex items-center">
                            <span
                              className="badge badge-sm border-0 bg-blue-100 text-blue-700 cursor-default"
                              onMouseEnter={(event) => showAddonsTooltip(event, item)}
                              onMouseLeave={hideAddonsTooltip}
                            >
                              {formatNumber(item.addonsTotalQuantity || 0)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-start font-medium text-theme">{formatAmount(item.addonsTotalPrice)}</td>
                        <td className="px-4 py-3 text-start font-semibold text-theme">{formatAmount(item.totalPrice)}</td>
                        <td className="px-4 py-3 text-start">
                          <span className={`badge badge-sm border-0 ${item.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-theme'}`}>
                            {item.status === 'Active' ? labels.active : labels.inactive}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end pr-4">
                          <div className="flex items-center justify-end gap-2 m-1">
                            {canManageItems && (
                              <>
                                <button
                                  onClick={() => onEdit(item)}
                                  title={labels.edit}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent p-0 text-blue-500 transition-colors hover:bg-blue-500/10 hover:text-blue-400"
                                >
                                  <FaEdit className="text-xl" />
                                </button>
                                <button
                                  onClick={() => onDelete(item.id)}
                                  title={labels.delete}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent p-0 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                >
                                  <FaTrash className="text-xl" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden grid grid-cols-1 gap-3 p-3">
                {paginatedItems.map((item) => (
                  <div key={item.id} className="card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 relative">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-theme text-base">{item.name}</span>
                        <span className="text-xs text-theme">{item.sku || '-'}</span>
                      </div>
                      <span className={`badge badge-sm border-0 ${item.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-theme'}`}>
                        {item.status === 'Active' ? labels.active : labels.inactive}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-theme mb-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.category}</span>
                        <span>{item.category || '-'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.categoryType}</span>
                        <span>{getCategoryTypeOptionLabel(item.type || '-')}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.price}</span>
                        <span className="font-medium">{formatAmount(item.price)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.quantity}</span>
                        <span>{formatNumber(item.stock ?? 0)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.itemType}</span>
                      <span>{getItemTypeOptionLabel(item.itemType || '-')}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.addonsPrice}</span>
                        <span>{formatAmount(item.addonsTotalPrice)}</span>
                      </div>
                      <div className="flex flex-col col-span-2">
                        <span className="text-xs text-theme">{labels.totalPrice}</span>
                        <span className="font-semibold">{formatAmount(item.totalPrice)}</span>
                      </div>
                    </div>

                    <div className="flex justify-end items-center gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                      {canManageItems && (
                        <>
                          <button onClick={() => onEdit(item)} className="btn btn-sm btn-ghost text-blue-600 bg-blue-50 hover:bg-blue-100 flex-1">
                            <FaEdit className="mr-1" /> {labels.edit}
                          </button>
                          <button onClick={() => onDelete(item.id)} className="btn btn-sm btn-ghost text-red-600 bg-red-50 hover:bg-red-100 flex-1">
                            <FaTrash className="mr-1" /> {labels.delete}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination Footer */}
        {filtered.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between rounded-xl p-2 border border-gray-100 dark:border-gray-700  gap-4">
            <div className="text-xs text-theme">
              {isArabic
                ? `عرض ${formatNumber((currentPage - 1) * itemsPerPage + 1)} إلى ${formatNumber(Math.min(currentPage * itemsPerPage, filtered.length))} من ${formatNumber(filtered.length)} صنف`
                : `Showing ${formatNumber((currentPage - 1) * itemsPerPage + 1)} to ${formatNumber(Math.min(currentPage * itemsPerPage, filtered.length))} of ${formatNumber(filtered.length)} items`
              }
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                title={isArabic ? 'السابق' : 'Prev'}
              >
                <FaChevronLeft className={isArabic ? 'scale-x-[-1]' : ''} />
              </button>
              <span className="text-sm whitespace-nowrap text-theme">{isArabic ? `الصفحة ${currentPage} من ${totalPages}` : `Page ${currentPage} of ${totalPages}`}</span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                title={isArabic ? 'التالي' : 'Next'}
              >
                <FaChevronRight className={isArabic ? 'scale-x-[-1]' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{isArabic ? 'لكل صفحة:' : 'Per page:'}</span>
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
      </div>

      {activeAddonsTooltip && (
        <div
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full"
          style={{ top: activeAddonsTooltip.top, left: activeAddonsTooltip.left }}
        >
          <div className="relative w-max min-w-[220px] max-w-[260px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-start shadow-2xl shadow-black/40">
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-blue-300">{labels.addonsDetails}</div>
            {getAddonTooltipData(activeAddonsTooltip.item).length > 0 ? (
              <div className="space-y-2">
                {getAddonTooltipData(activeAddonsTooltip.item).map((addon, index) => (
                  <div key={`${activeAddonsTooltip.item.id}-addon-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
                    <div className="truncate font-medium text-white">{addon.name}</div>
                    <div className="mt-1 flex items-center justify-between gap-4 text-slate-300">
                      <span>{labels.quantity}: {formatNumber(addon.quantity || 0)}</span>
                      <span>{labels.price}: {formatAmount(addon.price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-300">{labels.noAddons}</div>
            )}
            <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-slate-700 bg-slate-950"></div>
          </div>
        </div>
      )}
    </div>
  )
}
