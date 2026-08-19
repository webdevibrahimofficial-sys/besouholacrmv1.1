import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDynamicFields } from '../../hooks/useDynamicFields'
import { api } from '../../utils/api'
import { useAppState } from '../../shared/context/AppStateProvider'
import { FaFileImport, FaPlus, FaFileExport, FaFileCsv, FaFilePdf, FaTimes, FaFilter, FaSearch, FaLayerGroup, FaCube, FaCheckCircle, FaEdit, FaTrash, FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp, FaInfoCircle, FaCalendarAlt } from 'react-icons/fa'
import ItemsImportModal from './ItemsImportModal'
import SearchableSelect from '../../components/SearchableSelect'
import DynamicFieldRenderer from '../../components/DynamicFieldRenderer'
import DateRangePicker from '../../shared/components/DateRangePicker'
import { CATEGORY_TYPE_PRODUCTS, CATEGORY_TYPE_SERVICES, categoryTypeFromRecord, normalizeCategoryType } from '../../features/inventory/categoryType'
import 'react-datepicker/dist/react-datepicker.css'

const mergeKnownValues = (prev, incoming) => {
  const source = Array.isArray(prev) ? prev : []
  const seen = new Set(source.map((value) => String(value).toLowerCase()))
  const next = [...source]
  incoming.forEach((raw) => {
    const value = String(raw || '').trim()
    if (!value || seen.has(value.toLowerCase())) return
    seen.add(value.toLowerCase())
    next.push(value)
  })
  return next
}

const uniqueSelectOptions = (...lists) => {
  const names = []
  const seen = new Set()
  lists.flat().forEach((raw) => {
    const name = String(raw || '').trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return
    seen.add(key)
    names.push(name)
  })
  return names.map((name) => ({ value: name, label: name }))
}

const emptyKnownNamesByTab = () => ({
  [CATEGORY_TYPE_PRODUCTS]: [],
  [CATEGORY_TYPE_SERVICES]: [],
})

const resolveItemImageSrc = (item) => {
  const raw = String(
    item?.image_url
    || item?.image
    || item?.meta_data?.general_inventory?.image
    || item?.meta_data?.image
    || ''
  ).trim()
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw

  const toPublicFiles = (pathname) => {
    const storageIdx = pathname.indexOf('/storage/')
    if (storageIdx !== -1) {
      return `/api/public-files/${pathname.slice(storageIdx + '/storage/'.length).replace(/^\/+/, '')}`
    }
    const publicIdx = pathname.indexOf('/api/public-files/')
    if (publicIdx !== -1) {
      return `/api/public-files/${pathname.slice(publicIdx + '/api/public-files/'.length).replace(/^\/+/, '')}`
    }
    return ''
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return toPublicFiles(new URL(raw).pathname) || raw
    } catch {
      return raw
    }
  }

  return toPublicFiles(raw.startsWith('/') ? raw : `/${raw}`) || `/api/public-files/${raw.replace(/^\/+/, '')}`
}

const ItemAvatar = ({ item, sizeClass = 'h-9 w-9' }) => {
  const src = resolveItemImageSrc(item)
  const [preview, setPreview] = useState(null)
  if (!src) return null

  const showPreview = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const showAbove = rect.top > 220
    setPreview({
      top: showAbove ? rect.top - 12 : rect.bottom + 12,
      left: rect.left + rect.width / 2,
      showAbove,
    })
  }

  return (
    <>
      <img
        src={src}
        alt={item?.name || ''}
        className={`${sizeClass} shrink-0 rounded-full object-cover border border-white/10 bg-white/5 cursor-zoom-in transition-transform duration-150 hover:scale-110`}
        onMouseEnter={showPreview}
        onMouseMove={showPreview}
        onMouseLeave={() => setPreview(null)}
      />
      {preview ? (
        <div
          className={`pointer-events-none fixed z-[9999] -translate-x-1/2 ${preview.showAbove ? '-translate-y-full' : ''}`}
          style={{ top: preview.top, left: preview.left }}
        >
          <img
            src={src}
            alt={item?.name || ''}
            className="h-44 w-44 rounded-2xl object-cover border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50"
          />
        </div>
      ) : null}
    </>
  )
}

const distinctFromItemCode = (value, code) => {
  const text = String(value || '').trim()
  const itemCode = String(code || '').trim()
  if (!text) return ''
  if (itemCode && text.toLowerCase() === itemCode.toLowerCase()) return ''
  return text
}

const getItemBarcodeValue = (item) => (
  distinctFromItemCode(item?.barcode, item?.code)
  || distinctFromItemCode(item?.sku, item?.code)
)

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
    productFilters: isArabic ? 'فلاتر المنتجات' : 'Product filters',
    serviceFilters: isArabic ? 'فلاتر الخدمات' : 'Service filters',
    search: isArabic ? 'بحث' : 'Search',
    clearFilters: isArabic ? 'مسح المرشحات' : 'Clear Filters',
    reset: isArabic ? 'إعادة تعيين' : 'Reset',
    name: isArabic ? 'اسم الصنف' : 'Item Name',
    itemOrServiceName: isArabic ? 'اسم الصنف / الخدمة' : 'Item / Service Name',
    productName: isArabic ? 'اسم المنتج' : 'Product Name',
    serviceName: isArabic ? 'اسم الخدمة' : 'Service Name',
    productsTab: isArabic ? 'منتجات' : 'Products',
    servicesTab: isArabic ? 'خدمات' : 'Services',
    productsListTitle: isArabic ? 'قائمة المنتجات' : 'Products List',
    servicesListTitle: isArabic ? 'قائمة الخدمات' : 'Services List',
    emptyProducts: isArabic ? 'لا توجد منتجات بعد' : 'No products yet',
    emptyServices: isArabic ? 'لا توجد خدمات بعد' : 'No services yet',
    identity: isArabic ? 'العلامة / نوع الخدمة' : 'Brand / Service Type',
    itemOrBillingType: isArabic ? 'نوع الصنف / الفوترة' : 'Item / Billing Type',
    notApplicable: '—',
    moreDetails: isArabic ? 'تفاصيل إضافية' : 'More details',
    family: isArabic ? 'العائلة' : 'Family',
    category: isArabic ? 'اسم التصنيف' : 'Category Name',
    group: isArabic ? 'المجموعة' : 'Group',
    brand: isArabic ? 'اسم العلامة التجارية' : 'Brand Name',
    model: isArabic ? 'الموديل' : 'Model',
    supplier: isArabic ? 'المورد' : 'Supplier / Vendor',
    type: isArabic ? 'النوع' : 'Type',
    categoryType: isArabic ? 'نوع التصنيف' : 'Category Type',
    itemType: isArabic ? 'نوع الصنف' : 'Item Type',
    price: isArabic ? 'المبلغ' : 'Amount',
    unitPrice: isArabic ? 'المبلغ' : 'Amount',
    serviceAmount: isArabic ? 'المبلغ' : 'Amount',
    quantity: isArabic ? 'الكمية' : 'Quantity',
    qtyAvailable: isArabic ? 'متاح' : 'Available',
    qtyReserved: isArabic ? 'محجوز' : 'Reserved',
    qtySold: isArabic ? 'مباع' : 'Sold',
    qtyTotal: isArabic ? 'إجمالي الكمية' : 'Qty Total',
    status: isArabic ? 'الحالة' : 'Status',
    stock: isArabic ? 'المخزون' : 'Stock',
    minStock: isArabic ? 'الحد الأدنى للكمية' : 'Minimum Quantity',
    unit: isArabic ? 'وحدة القياس' : 'Unit of Measure',
    barcode: isArabic ? 'باركود' : 'Barcode',
    itemCode: isArabic ? 'كود الصنف' : 'Item Code',
    additionalInfo: isArabic ? 'معلومات إضافية' : 'Additional Information',
    taxRate: isArabic ? 'نسبة الضريبة' : 'Tax Rate',
    taxIncluded: isArabic ? 'شامل الضريبة' : 'Tax Included',
    warehouse: isArabic ? 'الموقع / المستودع' : 'Location / Warehouse',
    notes: isArabic ? 'ملاحظات' : 'Notes',
    serviceType: isArabic ? 'نوع الخدمة' : 'Service Type',
    serviceTypePlaceholder: isArabic ? 'اختر أو اكتب نوع الخدمة' : 'Select or type a service type',
    serviceBillingType: isArabic ? 'نوع فوترة الخدمة' : 'Service Billing Type',
    serviceDuration: isArabic ? 'مدة الخدمة' : 'Service Duration',
    startDate: isArabic ? 'تاريخ البداية' : 'Start Date',
    endDate: isArabic ? 'تاريخ النهاية' : 'End Date',
    createdAt: isArabic ? 'تاريخ الإنشاء' : 'Creation Date',
    renewalRequired: isArabic ? 'يتطلب تجديد' : 'Renewal Required',
    lowStock: isArabic ? 'مخزون منخفض' : 'Low Stock',
    description: isArabic ? 'الوصف' : 'Description',
    save: isArabic ? 'حفظ' : 'Save',
    listTitle: isArabic ? 'قائمة الأصناف' : 'Items List',
    empty: isArabic ? 'لا توجد أصناف بعد' : 'No items yet',
    actions: isArabic ? 'الإجراءات' : 'Actions',
    active: isArabic ? 'نشط' : 'Active',
    inactive: isArabic ? 'غير نشط' : 'Inactive',
    delete: isArabic ? 'حذف' : 'Delete',
    edit: isArabic ? 'تعديل' : 'Edit',
    bulkActions: isArabic ? 'إجراءات جماعية' : 'Bulk actions',
    selectedItems: isArabic ? 'أصناف محددة' : 'selected items',
    deleteSelected: isArabic ? 'حذف المحدد' : 'Delete selected',
    clearSelection: isArabic ? 'إلغاء التحديد' : 'Clear selection',
    transferLinkedLeads: isArabic ? 'تحويل الليدز المرتبطة' : 'Transfer linked leads',
    replacementItem: isArabic ? 'الصنف البديل' : 'Replacement item',
    chooseReplacementItem: isArabic ? 'اختر صنف بديل' : 'Choose replacement item',
    confirmDelete: isArabic ? 'تأكيد الحذف' : 'Confirm delete',
    cancel: isArabic ? 'إلغاء' : 'Cancel',
    basicInfo: isArabic ? 'البيانات الأساسية' : 'Basic Info',
    pricing: isArabic ? 'التسعير' : 'Pricing',
    salesOptions: isArabic ? 'خيارات البيع' : 'Sales Options',
    fixed: isArabic ? 'ثابت' : 'Fixed',
    perUnit: isArabic ? 'لكل وحدة' : 'Per Unit',
    monthly: isArabic ? 'شهري' : 'Monthly',
    semiAnnually: isArabic ? 'نصف سنوي' : 'Semi Annually',
    annually: isArabic ? 'سنوي' : 'Annually',
    billingCycle: isArabic ? 'نوع فوترة الخدمة' : 'Service Billing Type',
    selectCategoryFirst: isArabic ? 'اختر التصنيف أولاً لفتح فورم المنتج أو الخدمة' : 'Select a category first to open the Products or Services form',
    isActive: isArabic ? 'نشط' : 'Is Active',
    on: isArabic ? 'On' : 'On',
    off: isArabic ? 'Off' : 'Off',
    import: isArabic ? 'استيراد' : 'Import',
    export: isArabic ? 'تصدير' : 'Export',
    exportCsv: isArabic ? 'تصدير CSV' : 'Export CSV',
    exportPdf: isArabic ? 'تصدير PDF' : 'Export PDF',
    code: isArabic ? 'كود الصنف' : 'Item Code',
    addonsSection: isArabic ? 'الإضافات' : 'Add-ons',
    addonName: isArabic ? 'اسم الإضافة' : 'Add-on Name',
    addonPeriod: isArabic ? 'الفترة' : 'Period',
    addonsName: isArabic ? 'أسماء الإضافات' : 'Add-ons Name',
    addAddon: isArabic ? 'إضافة إضافة' : 'Add Add-on',
    removeAddon: isArabic ? 'حذف' : 'Remove',
    addonsQty: isArabic ? 'كمية الإضافات' : 'Add-ons Qty',
    addonsPeriod: isArabic ? 'فترة الإضافات' : 'Add-ons Period',
    addonsQtyOrPeriod: isArabic ? 'كمية / فترة الإضافات' : 'Add-ons Qty / Period',
    addonsPrice: isArabic ? 'مبلغ الإضافات' : 'Add-ons Amount',
    totalPrice: isArabic ? 'الإجمالي' : 'Total Amount',
    addonsDetails: isArabic ? 'تفاصيل الإضافات' : 'Add-ons Details',
    noAddons: isArabic ? 'لا توجد إضافات' : 'No add-ons',
    itemImage: isArabic ? 'صورة الصنف' : 'Item Image',
    removeImage: isArabic ? 'إزالة الصورة' : 'Remove image',
  }), [isArabic])

  const emptyItemForm = () => ({
    id: null,
    name: '',
    image: '',
    remove_image: false,
    category: '',
    category_id: '',
    type: '',
    itemType: 'Fixed',
    sku: '',
    code: '',
    barcode: '',
    brand: '',
    model: '',
    price: '',
    pricingType: 'Fixed',
    billingCycle: 'Monthly',
    serviceType: '',
    serviceDuration: '',
    startDate: '',
    endDate: '',
    renewalRequired: false,
    warehouse: '',
    notes: '',
    stock: 0,
    minStock: 0,
    unit: 'Piece',
    status: 'Active',
    allowDiscount: false,
    maxDiscount: '',
    description: '',
    addons: [],
    custom_fields: {}
  })

  const applySelectedCategory = (prev, cat) => {
    const categoryType = categoryTypeFromRecord(cat)
    const isService = categoryType === CATEGORY_TYPE_SERVICES
    return {
      ...prev,
      category_id: cat?.id ? String(cat.id) : '',
      category: cat?.name || '',
      type: categoryType,
      itemType: isService
        ? (['Monthly', 'Semi Annually', 'Annually'].includes(prev.itemType) ? prev.itemType : 'Monthly')
        : (['Fixed', 'Per Unit'].includes(prev.itemType) ? prev.itemType : 'Fixed'),
      billingCycle: isService ? (prev.billingCycle || 'Monthly') : prev.billingCycle,
      stock: isService ? 0 : prev.stock,
      minStock: isService ? 0 : prev.minStock,
      addons: (normalizeCategoryType(prev.type) && normalizeCategoryType(prev.type) !== categoryType)
        ? []
        : (prev.addons || []),
    }
  }

  const emptyListFilters = () => ({
    search: '',
    name: '',
    category: '',
    sku: '',
    status: '',
    type: '',
    itemType: '',
    serviceType: '',
    brand: '',
    code: '',
    model: '',
    warehouse: '',
    supplier: '',
    unit: '',
    serviceDuration: '',
    renewalRequired: '',
    startDate: '',
    endDate: '',
    createdFrom: '',
    createdTo: '',
    lowStock: false,
  })

  const [form, setForm] = useState(emptyItemForm)

  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [showForm, setShowForm] = useState(false)

  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeAddonsTooltip, setActiveAddonsTooltip] = useState(null)
  const [activeNotesTooltip, setActiveNotesTooltip] = useState(null)
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState([])
  const [selectedAddonByItemId, setSelectedAddonByItemId] = useState({})
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [replacementItemId, setReplacementItemId] = useState('')

  const [filters, setFilters] = useState(emptyListFilters)
  const [listTab, setListTab] = useState(CATEGORY_TYPE_PRODUCTS)
  const [knownBrands, setKnownBrands] = useState([])
  const [knownNamesByTab, setKnownNamesByTab] = useState(emptyKnownNamesByTab)
  const [knownCodes, setKnownCodes] = useState([])
  const [knownModels, setKnownModels] = useState([])
  const [knownWarehouses, setKnownWarehouses] = useState([])
  const [knownSuppliers, setKnownSuppliers] = useState([])
  const [knownDurations, setKnownDurations] = useState([])
  const [knownSkus, setKnownSkus] = useState([])
  const [replacementCatalog, setReplacementCatalog] = useState([])
  const isProductsTab = listTab === CATEGORY_TYPE_PRODUCTS
  const isServicesTab = listTab === CATEGORY_TYPE_SERVICES

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const formatAmount = (value) => `${moneyFormatter.format(Number(value || 0))} ${currencySymbol}`
  const formatNumber = (value) => numberFormatter.format(Number(value || 0))
  const toDateInputValue = (value) => {
    if (!value) return ''
    const text = String(value).trim()
    if (!text || text.toLowerCase() === 'null') return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      const day = String(parsed.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : ''
  }
  const formatListDate = (value) => {
    const date = toDateInputValue(value)
    return date || labels.notApplicable
  }
  const previewText = (value, limit = 48) => {
    const text = String(value || '').trim()
    if (!text) return labels.notApplicable
    return text.length > limit ? `${text.slice(0, limit)}…` : text
  }
  const yesNo = (value) => (value ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No'))
  const normalizeQuantityType = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'piece' || normalized === 'pcs' || normalized === 'pc' || normalized === 'per unit' || normalized === 'per-unit') return 'Piece'
    if (normalized === 'box') return 'Box'
    if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') return 'Kg'
    if (normalized === 'set') return 'Set'
    if (normalized === 'other') return 'Other'
    if (normalized === 'liter' || normalized === 'litre' || normalized === 'l') return 'Liter'
    if (normalized === 'meter' || normalized === 'metre' || normalized === 'm') return 'Meter'
    if (normalized === 'hour' || normalized === 'hr' || normalized === 'h') return 'Hour'
    return 'Piece'
  }
  const isServiceItem = (item) => {
    if (String(item?.business_type || '').toLowerCase() === 'service') return true
    return categoryTypeFromRecord(item) === CATEGORY_TYPE_SERVICES
  }
  const normalizeProductItemType = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'per unit' || normalized === 'per-unit') return 'Per Unit'
    return 'Fixed'
  }
  const normalizeServiceBillingType = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (['one-time', 'onetime', 'one time'].includes(normalized)) return 'One-time'
    if (normalized === 'subscription') return 'Subscription'
    if (normalized === 'monthly') return 'Monthly'
    if (normalized === 'quarterly') return 'Quarterly'
    if (['semi-annual', 'semi annual', 'semi-annually', 'semi annually', 'semiannual'].includes(normalized)) return 'Semi-annual'
    if (['annually', 'annual', 'yearly'].includes(normalized)) return 'Annually'
    return String(value || '').trim()
  }
  const getServiceBillingType = (item) => {
    const fromBilling = normalizeServiceBillingType(item?.billingCycle || item?.billing_cycle || '')
    if (fromBilling) return fromBilling
    const fromItemType = String(item?.item_type || item?.itemType || '').trim()
    const normalizedItemType = normalizeServiceBillingType(fromItemType)
    if (['One-time', 'Subscription', 'Monthly', 'Quarterly', 'Semi-annual', 'Annually'].includes(normalizedItemType)) {
      return normalizedItemType
    }
    return ''
  }
  const getItemIdentityValue = (item) => {
    if (isServiceItem(item)) {
      return String(item.serviceType || item.service_type || '').trim()
    }
    return String(item.brand || '').trim()
  }
  const getItemCodeValue = (item) => String(item.code || item.sku || '').trim()
  const getCatalogAmount = (item) => {
    if (isServiceItem(item) && item.service_amount != null && item.service_amount !== '') {
      return item.service_amount
    }
    if (item.catalog_amount != null && item.catalog_amount !== '') {
      return item.catalog_amount
    }
    return item.price
  }
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
  const fieldText = (item, field) => String(item?.[field] || '').trim()
  const hasNotesOrDescription = (item) => Boolean(fieldText(item, 'notes') || fieldText(item, 'description'))
  const showNotesTooltip = (event, item, field = 'both') => {
    const notes = fieldText(item, 'notes')
    const description = fieldText(item, 'description')
    if (field === 'notes' && !notes) return
    if (field === 'description' && !description) return
    if (field === 'both' && !notes && !description) return
    const rect = event.currentTarget.getBoundingClientRect()
    setActiveNotesTooltip({
      item,
      field,
      top: rect.top - 14,
      left: rect.left + (rect.width / 2),
    })
  }
  const hideNotesTooltip = () => setActiveNotesTooltip(null)
  const getAddonNames = (item) => getAddonTooltipData(item).map(addon => addon.name).filter(Boolean)
  const formatAddonNames = (item) => {
    const names = getAddonNames(item)
    return names.length > 0 ? names.join(', ') : '-'
  }
  const getSelectedAddon = (item) => {
    const addons = getAddonTooltipData(item)
    if (addons.length === 0) return null
    const selectedId = selectedAddonByItemId[item.id]
    return addons.find(addon => String(addon.id) === String(selectedId)) || addons[0]
  }
  const getSelectedAddonAmount = (item) => {
    const addon = getSelectedAddon(item)
    if (!addon) return 0
    if (isServiceItem(item)) return Number(addon.price || 0)
    return Number(addon.quantity || 0) * Number(addon.price || 0)
  }
  const getSelectedAddonPeriod = (item) => {
    const addon = getSelectedAddon(item)
    return String(addon?.period || '').trim()
  }

  const buildItemListParams = (activeFilters = filters, activeTab = listTab) => {
    const params = { all: 1, category_type: activeTab }
    const assignText = (key, param = key) => {
      const value = String(activeFilters[key] ?? '').trim()
      if (value) params[param] = value
    }
    const isProducts = activeTab === CATEGORY_TYPE_PRODUCTS

    assignText('search')
    assignText('name')
    assignText('category')
    assignText('status')
    assignText('itemType', 'item_type')
    assignText('code')
    assignText('createdFrom', 'created_from')
    assignText('createdTo', 'created_to')
    if (isProducts) {
      assignText('sku')
      assignText('brand')
      assignText('model')
      assignText('warehouse')
      assignText('supplier')
      assignText('unit')
      if (activeFilters.lowStock) params.low_stock = 1
    } else {
      assignText('serviceType', 'service_type')
      assignText('serviceDuration', 'service_duration')
      assignText('startDate', 'start_date')
      assignText('endDate', 'end_date')
      if (activeFilters.renewalRequired === '1' || activeFilters.renewalRequired === '0') {
        params.renewal_required = activeFilters.renewalRequired
      }
    }

    return params
  }

  const skipItemFilterDebounceRef = useRef(true)
  const itemsFetchIdRef = useRef(0)
  const hasLoadedItemsRef = useRef(false)

  const fetchItems = async (activeFilters = filters, activeTab = listTab) => {
    const fetchId = ++itemsFetchIdRef.current
    if (!hasLoadedItemsRef.current) setLoading(true)
    try {
      const response = await api.get('/api/items', { params: buildItemListParams(activeFilters, activeTab) })
      if (fetchId !== itemsFetchIdRef.current) return
      let data = []
      if (Array.isArray(response.data)) {
        data = response.data
      } else if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data
      }

      const mappedData = data.map(item => {
        const categoryType = categoryTypeFromRecord(item.category)
          || categoryTypeFromRecord(item)
          || item.category_type
          || item.type
          || ''
        const isService = String(item.business_type || '').toLowerCase() === 'service'
          || normalizeCategoryType(categoryType) === CATEGORY_TYPE_SERVICES
        const billingCycle = getServiceBillingType(item) || (isService ? '' : (item.billing_cycle || item.billingCycle || ''))

        return {
          ...item,
          name: item.name || '',
          image: resolveItemImageSrc(item),
          image_url: resolveItemImageSrc(item),
          business_type: item.business_type || (isService ? 'service' : 'product'),
          category_type: item.category_type || (isService ? CATEGORY_TYPE_SERVICES : CATEGORY_TYPE_PRODUCTS),
          category: typeof item.category === 'object' ? item.category?.name || '' : item.category || '',
          category_id: item.category_id || '',
          type: categoryType,
          stock: item.quantity !== undefined ? item.quantity : (item.stock || 0),
          reservedQuantity: item.reserved_quantity ?? item.reservedQuantity ?? 0,
          soldQuantity: item.sold_quantity ?? item.soldQuantity ?? 0,
          totalQuantity: item.total_quantity ?? (
            (item.quantity || 0) + (item.reserved_quantity || 0) + (item.sold_quantity || 0)
          ),
          minStock: item.min_alert !== undefined ? item.min_alert : (item.minStock || 0),
          itemType: isService ? '' : normalizeProductItemType(item.item_type || item.itemType || ''),
          pricingType: item.pricing_type || item.pricingType || 'Fixed',
          billingCycle,
          unit: normalizeQuantityType(item.unit),
          code: item.code || '',
          barcode: getItemBarcodeValue(item),
          sku: getItemBarcodeValue(item),
          brand: item.brand || '',
          model: item.model || '',
          serviceType: item.service_type || item.serviceType || '',
          service_type: item.service_type || item.serviceType || '',
          billing_cycle: billingCycle || item.billing_cycle || item.billingCycle || '',
          serviceDuration: item.service_duration || item.serviceDuration || '',
          startDate: toDateInputValue(item.service_start_date || item.startDate),
          endDate: toDateInputValue(item.service_end_date || item.endDate),
          renewalRequired: Boolean(item.renewal_required ?? item.renewalRequired),
          taxRate: item.tax_rate ?? item.taxRate ?? '',
          taxIncluded: Boolean(item.tax_included ?? item.taxIncluded),
          warehouse: item.warehouse || '',
          supplier: item.supplier || '',
          notes: item.notes || '',
          description: item.description || '',
          catalog_amount: item.catalog_amount ?? item.price,
          service_amount: isService ? (item.service_amount ?? item.catalog_amount ?? item.price) : null,
          allowDiscount: item.allow_discount !== undefined ? Boolean(item.allow_discount) : (item.allowDiscount || false),
          maxDiscount: item.max_discount || item.maxDiscount || '',
          addons: Array.isArray(item.addons) ? item.addons.map(addon => ({
            id: addon.id,
            name: addon.name || '',
            quantity: addon.quantity ?? 1,
            price: addon.price ?? '',
            period: addon.period || '',
          })) : [],
          addonsTotalQuantity: Number(item.addons_total_quantity ?? item.addonsTotalQuantity ?? 0),
          addonsTotalPrice: Number(item.addons_total_price ?? item.addonsTotalPrice ?? 0),
          totalPrice: Number(item.total_price ?? item.totalPrice ?? 0),
        }
      })

      setItems(mappedData)
      hasLoadedItemsRef.current = true
      setKnownBrands((prev) => mergeKnownValues(prev, mappedData.map((item) => item.brand)))
      setKnownNamesByTab((prev) => {
        const current = prev && !Array.isArray(prev)
          ? prev
          : emptyKnownNamesByTab()
        return {
          ...emptyKnownNamesByTab(),
          ...current,
          [activeTab]: mergeKnownValues(current[activeTab] || [], mappedData.map((item) => item.name)),
        }
      })
      setKnownCodes((prev) => mergeKnownValues(prev, mappedData.map((item) => item.code)))
      setKnownModels((prev) => mergeKnownValues(prev, mappedData.map((item) => item.model)))
      setKnownWarehouses((prev) => mergeKnownValues(prev, mappedData.map((item) => item.warehouse)))
      setKnownSuppliers((prev) => mergeKnownValues(prev, mappedData.map((item) => item.supplier)))
      setKnownDurations((prev) => mergeKnownValues(prev, mappedData.map((item) => item.serviceDuration)))
      setKnownSkus((prev) => mergeKnownValues(prev, mappedData.map((item) => getItemBarcodeValue(item))))
    } catch (error) {
      if (fetchId !== itemsFetchIdRef.current) return
      console.error('Error fetching items:', error)
    } finally {
      if (fetchId === itemsFetchIdRef.current) {
        setLoading(false)
      }
    }
  }

  const extractCollection = (payload) => {
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.data)) return payload.data
    return []
  }

  const fetchServiceTypes = async () => {
    try {
      const serviceTypesRes = await api.get('/api/inventory-lookups/service-types', { params: { active_only: 1 } })
      setServiceTypes(extractCollection(serviceTypesRes.data))
    } catch (error) {
      console.error('Error fetching service types:', error)
      setServiceTypes([])
    }
  }

  const fetchAuxiliaryData = async () => {
    try {
      const categoriesRes = await api.get('/api/item-categories')
      setCategories(extractCollection(categoriesRes.data))
    } catch (error) {
      console.error('Error fetching categories:', error)
    }

    await fetchServiceTypes()
  }

  useEffect(() => {
    fetchAuxiliaryData()
  }, [])

  useEffect(() => {
    const delay = skipItemFilterDebounceRef.current ? 0 : 300
    skipItemFilterDebounceRef.current = false
    const timer = window.setTimeout(() => {
      fetchItems(filters, listTab)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [filters, listTab])

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

  const createEmptyAddon = () => ({ name: '', quantity: 1, price: '', period: '' })

  const addAddonRow = () => {
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
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleItemImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setForm(prev => ({ ...prev, image: String(reader.result || ''), remove_image: false }))
    }
    reader.readAsDataURL(file)
  }

  function clearItemImage() {
    setForm(prev => ({ ...prev, image: '', remove_image: true }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!canManageItems) {
      alert(isArabic ? 'لا تملك صلاحية تعديل الأصناف' : 'You do not have permission to modify items')
      return
    }
    if (!form.category_id) {
      alert(isArabic ? 'التصنيف مطلوب' : 'Category is required')
      return
    }
    const categoryType = normalizeCategoryType(form.type) || categoryTypeFromRecord(categories.find(c => String(c.id) === String(form.category_id)))
    const isService = categoryType === CATEGORY_TYPE_SERVICES
    if (!isService && !form.brand) {
      alert(isArabic ? 'اسم العلامة التجارية مطلوب' : 'Brand Name is required')
      return
    }
    if (!form.name) {
      alert(isArabic ? (isService ? 'اسم الخدمة مطلوب' : 'اسم المنتج مطلوب') : (isService ? 'Service Name is required' : 'Product Name is required'))
      return
    }
    if (!form.price) {
      alert(isArabic ? 'المبلغ مطلوب' : 'Amount is required')
      return
    }
    if (!isService && (form.stock === '' || form.stock === null || form.stock === undefined)) {
      alert(isArabic ? 'كمية المنتج مطلوبة' : 'Product quantity is required')
      return
    }
    if (isService && !String(form.serviceType || '').trim()) {
      alert(isArabic ? 'نوع الخدمة مطلوب' : 'Service Type is required')
      return
    }
    if (isService && !form.billingCycle) {
      alert(isArabic ? 'نوع فوترة الخدمة مطلوب' : 'Service Billing Type is required')
      return
    }

    const dataToSave = {
      name: form.name,
      category: form.category,
      category_id: form.category_id,
      type: categoryType,
      category_type: categoryType,
      code: form.code || form.itemCode || '',
      brand: form.brand || '',
      model: form.model || '',
      quantity: isService ? 0 : Number(form.stock),
      min_alert: isService ? 0 : (form.minStock === '' || form.minStock === null || form.minStock === undefined ? 0 : Number(form.minStock)),
      price: form.price,
      item_type: isService ? (form.billingCycle || 'Monthly') : (form.itemType || 'Fixed'),
      billingCycle: form.billingCycle || undefined,
      service_type: String(form.serviceType || '').trim() || undefined,
      service_duration: form.serviceDuration || undefined,
      service_start_date: toDateInputValue(form.startDate) || undefined,
      service_end_date: toDateInputValue(form.endDate) || undefined,
      renewal_required: Boolean(form.renewalRequired),
      barcode: form.barcode || undefined,
      sku: form.barcode || undefined,
      unit: isService ? 'Piece' : normalizeQuantityType(form.unit),
      warehouse: form.warehouse || undefined,
      supplier: form.supplier || undefined,
      notes: form.notes || undefined,
      description: form.description || undefined,
      image: form.remove_image ? '' : (form.image || undefined),
      remove_image: form.remove_image ? true : undefined,
      status: form.status || 'Active',
      addons: (form.addons || [])
        .filter(addon => String(addon.name || '').trim() !== '')
        .map(addon => (
          isService
            ? {
                name: String(addon.name || '').trim(),
                period: String(addon.period || '').trim() || undefined,
                quantity: 1,
                price: Number(addon.price || 0),
              }
            : {
                name: String(addon.name || '').trim(),
                quantity: Number(addon.quantity || 1),
                price: Number(addon.price || 0),
              }
        )),
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
      await fetchServiceTypes()
      setForm(emptyItemForm())
      setDynamicValues({})
      setShowForm(false)
    } catch (error) {
      console.error('Error saving item:', error)
      const status = error?.response?.status
      const msg = error?.response?.data?.message
                 || error?.response?.data?.error
                 || error?.response?.data?.errors?.code?.[0]
                 || error?.response?.data?.errors?.sku?.[0]
                 || error?.message
                 || (isArabic ? 'حدث خطأ أثناء الحفظ' : 'Error saving item')
      if (status === 409 || status === 422) {
        alert(isArabic ? `خطأ في البيانات: ${msg}` : `Validation error: ${msg}`)
      } else {
        alert(isArabic ? `فشل الحفظ: ${msg}` : `Save failed: ${msg}`)
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
        await api.delete(`/api/items/${id}`, { suppressErrorStatuses: [409] })
        await fetchItems()
      } catch (error) {
        handleDeleteError(error, { mode: 'single', itemIds: [id] })
      }
    }
  }

  const handleDeleteError = (error, context) => {
    const data = error?.response?.data || {}
    const status = error?.response?.status

    if (status === 409 && ['item_has_leads', 'items_have_leads'].includes(data.code)) {
      setReplacementItemId('')
      setDeleteDialog({
        mode: context.mode,
        itemIds: context.itemIds,
        message: data.message,
        blockers: Array.isArray(data.blockers) ? data.blockers : [data],
      })
      return
    }

    alert(data.message || (isArabic ? 'فشل الحذف' : 'Failed to delete'))
  }

  const toggleItemSelection = (itemId) => {
    setSelectedItemIds(prev => (
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    ))
  }

  const togglePageSelection = () => {
    setSelectedItemIds(prev => {
      if (isAllPageSelected) {
        return prev.filter(id => !allPageItemIds.includes(id))
      }

      return Array.from(new Set([...prev, ...allPageItemIds]))
    })
  }

  const clearSelection = () => setSelectedItemIds([])

  const deleteSelectedItems = async () => {
    if (!canManageItems) {
      alert(isArabic ? 'لا تملك صلاحية حذف الأصناف' : 'You do not have permission to delete items')
      return
    }
    if (selectedItemIds.length === 0) return
    if (!window.confirm(isArabic ? `هل تريد حذف ${selectedItemIds.length} صنف؟` : `Delete ${selectedItemIds.length} selected items?`)) return

    try {
      await api.post('/api/items/bulk-delete', { item_ids: selectedItemIds }, { suppressErrorStatuses: [409] })
      clearSelection()
      await fetchItems()
    } catch (error) {
      handleDeleteError(error, { mode: 'bulk', itemIds: selectedItemIds })
    }
  }

  const confirmDeleteWithReplacement = async () => {
    if (!deleteDialog || !replacementItemId) return

    try {
      if (deleteDialog.mode === 'bulk') {
        await api.post('/api/items/bulk-delete', {
          item_ids: deleteDialog.itemIds,
          replacement_item_id: Number(replacementItemId),
        })
      } else {
        await api.delete(`/api/items/${deleteDialog.itemIds[0]}`, {
          data: { replacement_item_id: Number(replacementItemId) },
        })
      }

      setDeleteDialog(null)
      setReplacementItemId('')
      clearSelection()
      await fetchItems()
    } catch (error) {
      console.error('Error deleting with replacement:', error)
      alert(error?.response?.data?.message || (isArabic ? 'فشل الحذف' : 'Failed to delete'))
    }
  }

  function onEdit(item) {
    const cat = categories.find(c => String(c.id) === String(item.category_id)) || {
      id: item.category_id,
      name: item.category,
      category_type: item.type || item.category_type,
      applies_to: item.type,
    }
    const existingImage = resolveItemImageSrc(item)
    setForm(applySelectedCategory({
      ...emptyItemForm(),
      ...item,
      category_id: item.category_id || '',
      itemType: normalizeProductItemType(item.itemType || item.item_type || ''),
      billingCycle: getServiceBillingType(item) || item.billingCycle || item.billing_cycle || 'Monthly',
      unit: normalizeQuantityType(item.unit),
      startDate: toDateInputValue(item.startDate || item.service_start_date),
      endDate: toDateInputValue(item.endDate || item.service_end_date),
      notes: item.notes || '',
      description: item.description || '',
      image: existingImage,
      image_url: existingImage,
      remove_image: false,
      addons: Array.isArray(item.addons) ? item.addons : [],
    }, cat))
    setShowForm(true)

    if (!item?.id) return
    api.get(`/api/items/${item.id}`)
      .then((response) => {
        const fresh = response?.data || {}
        const freshImage = resolveItemImageSrc(fresh)
        if (!freshImage) return
        setForm((prev) => (
          prev.id === item.id
            ? { ...prev, image: freshImage, image_url: freshImage, remove_image: false }
            : prev
        ))
      })
      .catch(() => {})
  }

  // Reset pagination when filters or tab change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, listTab])

  useEffect(() => {
    if (!deleteDialog) {
      setReplacementCatalog([])
      return
    }

    let cancelled = false
    api.get('/api/items', { params: { all: 1 } })
      .then((response) => {
        if (cancelled) return
        let data = []
        if (Array.isArray(response.data)) {
          data = response.data
        } else if (response.data && Array.isArray(response.data.data)) {
          data = response.data.data
        }
        setReplacementCatalog(data.map((item) => ({
          id: item.id,
          name: item.name || '',
          sku: item.sku || item.barcode || item.code || '',
        })))
      })
      .catch(() => {
        if (!cancelled) setReplacementCatalog([])
      })

    return () => {
      cancelled = true
    }
  }, [deleteDialog])

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

  const filtered = itemsWithComputedTotals

  function clearFilters() {
    setFilters(emptyListFilters())
    setShowAllFilters(false)
  }

  const categoryTypeForRecord = (record) => (
    categoryTypeFromRecord(record) || CATEGORY_TYPE_PRODUCTS
  )

  function switchListTab(tab) {
    if (tab === listTab) return
    setListTab(tab)
    setCurrentPage(1)
    setSelectedItemIds([])
    setFilters((prev) => {
      const next = emptyListFilters()
      next.search = prev.search
      next.status = prev.status
      next.createdFrom = prev.createdFrom
      next.createdTo = prev.createdTo
      const selectedCategory = categories.find((category) => category.name === prev.category)
      if (selectedCategory && categoryTypeForRecord(selectedCategory) === tab) {
        next.category = prev.category
      }
      if (tab === CATEGORY_TYPE_PRODUCTS) {
        next.brand = prev.brand
        next.code = prev.code
        next.sku = prev.sku
        next.model = prev.model
        next.warehouse = prev.warehouse
        next.supplier = prev.supplier
        next.unit = prev.unit
        next.lowStock = Boolean(prev.lowStock)
        if (['Fixed', 'Per Unit'].includes(prev.itemType)) next.itemType = prev.itemType
      } else if (['One-time', 'Subscription', 'Monthly', 'Quarterly', 'Semi-annual', 'Annually'].includes(prev.itemType)) {
        next.itemType = prev.itemType
        next.serviceType = prev.serviceType
        next.code = prev.code
        next.serviceDuration = prev.serviceDuration
        next.renewalRequired = prev.renewalRequired
        next.startDate = prev.startDate
        next.endDate = prev.endDate
      } else {
        next.serviceType = prev.serviceType
        next.code = prev.code
        next.serviceDuration = prev.serviceDuration
        next.renewalRequired = prev.renewalRequired
        next.startDate = prev.startDate
        next.endDate = prev.endDate
      }
      return next
    })
  }

  // Pagination Logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, currentPage, itemsPerPage])
  const allPageItemIds = paginatedItems.map(item => item.id)
  const isAllPageSelected = allPageItemIds.length > 0 && allPageItemIds.every(id => selectedItemIds.includes(id))
  const replacementOptions = useMemo(() => {
    const excluded = new Set((deleteDialog?.itemIds || []).map(id => String(id)))
    const source = replacementCatalog.length > 0 ? replacementCatalog : items
    return source
      .filter(item => !excluded.has(String(item.id)))
      .map(item => ({ value: item.id, label: `${item.name}${item.sku ? ` (${item.sku})` : ''}` }))
  }, [items, replacementCatalog, deleteDialog])

  const PRODUCT_ITEM_TYPE_OPTIONS = ['Fixed', 'Per Unit']
  const SERVICE_BILLING_OPTIONS = ['One-time', 'Subscription', 'Monthly', 'Quarterly', 'Semi-annual', 'Annually']
  const QUANTITY_TYPE_OPTIONS = ['Piece', 'Box', 'Set', 'Meter', 'Kg', 'Hour', 'Other']
  const selectedCategory = categories.find(c => String(c.id) === String(form.category_id))
  const selectedCategoryType = normalizeCategoryType(form.type) || categoryTypeFromRecord(selectedCategory)
  const isServiceForm = selectedCategoryType === CATEGORY_TYPE_SERVICES
  const isProductForm = selectedCategoryType === CATEGORY_TYPE_PRODUCTS

  useEffect(() => {
    if (showForm && isServiceForm) {
      fetchServiceTypes()
    }
  }, [showForm, isServiceForm])
  const showQuantityType = isProductForm
  const getCategoryTypeOptionLabel = (option) => {
    const normalized = normalizeCategoryType(option) || option
    if (normalized === CATEGORY_TYPE_PRODUCTS) return isArabic ? 'منتجات' : 'Products'
    if (normalized === CATEGORY_TYPE_SERVICES) return isArabic ? 'خدمات' : 'Services'
    return option
  }
  const getItemTypeOptionLabel = (option) => {
    if (!isArabic) return option
    if (option === 'Fixed') return 'ثابت'
    if (option === 'Per Unit') return 'لكل وحدة'
    if (option === 'One-time') return 'مرة واحدة'
    if (option === 'Subscription') return 'اشتراك'
    if (option === 'Monthly') return 'شهري'
    if (option === 'Quarterly') return 'ربع سنوي'
    if (option === 'Semi-annual' || option === 'Semi Annually') return 'نصف سنوي'
    if (option === 'Annually') return 'سنوي'
    return option
  }
  const getItemKindLabel = (item) => {
    if (isServiceItem(item)) {
      const billing = getServiceBillingType(item)
      return billing ? getItemTypeOptionLabel(billing) : labels.notApplicable
    }
    return getItemTypeOptionLabel(item.itemType || 'Fixed')
  }
  const getQuantityTypeOptionLabel = (option) => {
    if (!isArabic) return option
    if (option === 'Piece') return 'قطعة'
    if (option === 'Box') return 'بوكس'
    if (option === 'Set') return 'طقم'
    if (option === 'Kg') return 'كيلو'
    if (option === 'Liter') return 'لتر'
    if (option === 'Meter') return 'متر'
    if (option === 'Hour') return 'ساعة'
    if (option === 'Other') return 'أخرى'
    return option
  }

  const getAllSuffix = () => (isArabic ? '(الكل)' : '(All)')
  // Use full category objects for form
  const categoryOptionsForForm = useMemo(() => categories, [categories])
  const serviceTypeOptions = useMemo(() => {
    const names = []
    const seen = new Set()
    serviceTypes.forEach((type) => {
      const name = String(type?.name || '').trim()
      const key = name.toLowerCase()
      if (!name || seen.has(key)) return
      seen.add(key)
      names.push(name)
    })
    const current = String(form.serviceType || '').trim()
    if (current && !seen.has(current.toLowerCase())) {
      names.push(current)
    }
    return names.map((name) => ({ value: name, label: name }))
  }, [serviceTypes, form.serviceType])
  
  // Use names for filter for backward compatibility
  const categoryOptionsForFilter = useMemo(() => {
    return categories
      .filter(c => categoryTypeForRecord(c) === listTab)
      .map(c => ({ label: c.name, value: c.name }))
  }, [categories, listTab])

  const serviceTypeOptionsForFilter = useMemo(() => {
    const names = []
    const seen = new Set()
    const addName = (value) => {
      const name = String(value || '').trim()
      const key = name.toLowerCase()
      if (!name || seen.has(key)) return
      seen.add(key)
      names.push(name)
    }
    serviceTypes.forEach((type) => addName(type?.name))
    items.forEach((item) => addName(item.serviceType || item.service_type))
    addName(filters.serviceType)
    return names.map((name) => ({ value: name, label: name }))
  }, [serviceTypes, items, filters.serviceType])

  const brandOptionsForFilter = useMemo(() => {
    const names = []
    const seen = new Set()
    const addName = (value) => {
      const name = String(value || '').trim()
      const key = name.toLowerCase()
      if (!name || seen.has(key)) return
      seen.add(key)
      names.push(name)
    }
    knownBrands.forEach(addName)
    items.forEach((item) => addName(item.brand))
    addName(filters.brand)
    return names.map((name) => ({ value: name, label: name }))
  }, [knownBrands, items, filters.brand])

  const nameOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownNamesByTab?.[listTab] || [], items.map((item) => item.name), filters.name)
  }, [knownNamesByTab, listTab, items, filters.name])
  const codeOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownCodes, items.map((item) => item.code), filters.code)
  }, [knownCodes, items, filters.code])
  const modelOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownModels, items.map((item) => item.model), filters.model)
  }, [knownModels, items, filters.model])
  const warehouseOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownWarehouses, items.map((item) => item.warehouse), filters.warehouse)
  }, [knownWarehouses, items, filters.warehouse])
  const supplierOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownSuppliers, items.map((item) => item.supplier), filters.supplier)
  }, [knownSuppliers, items, filters.supplier])
  const durationOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownDurations, items.map((item) => item.serviceDuration), filters.serviceDuration)
  }, [knownDurations, items, filters.serviceDuration])
  const skuOptionsForFilter = useMemo(() => {
    return uniqueSelectOptions(knownSkus, items.map((item) => getItemBarcodeValue(item)), filters.sku)
  }, [knownSkus, items, filters.sku])
  const unitOptionsForFilter = QUANTITY_TYPE_OPTIONS.map(option => ({
    label: getQuantityTypeOptionLabel(option),
    value: option,
  }))
  const renewalOptionsForFilter = [
    { label: isArabic ? 'نعم' : 'Yes', value: '1' },
    { label: isArabic ? 'لا' : 'No', value: '0' },
  ]

  const itemTypeOptionsForFilter = (isProductsTab ? PRODUCT_ITEM_TYPE_OPTIONS : SERVICE_BILLING_OPTIONS).map(type => ({
    label: getItemTypeOptionLabel(type),
    value: type,
  }))
  const statusOptionsForFilter = [
    { label: labels.active, value: 'Active' },
    { label: labels.inactive, value: 'Inactive' },
  ]

  const exportItemsCsv = () => {
    const headers = isProductsTab
      ? [
          'Item Name',
          'Item Code',
          'Category Name',
          'Brand',
          'Item Type',
          'Amount',
          'Add-ons Name',
          'Add-ons Qty',
          'Add-ons Amount',
          'Total Amount',
          'Qty Total',
          'Reserved',
          'Sold',
          'Available',
          'Status',
        ]
      : [
          'Service Name',
          'Item Code',
          'Category Name',
          'Service Type',
          'Service Billing Type',
          'Amount',
          'Service Duration',
          'Start Date',
          'End Date',
          'Renewal Required',
          'Add-ons Name',
          'Add-ons Period',
          'Add-ons Amount',
          'Total Amount',
          'Status',
        ]
    const csvContent = [
      headers.join(','),
      ...filtered.map(item => {
        const selectedAddon = getSelectedAddon(item)
        const shared = [
          `"${item.name || ''}"`,
          `"${item.code || ''}"`,
          `"${item.category || ''}"`,
        ]
        const addonCols = [
          `"${formatAddonNames(item)}"`,
          `"${isProductsTab ? (selectedAddon?.quantity || item.addonsTotalQuantity || 0) : (selectedAddon?.period || '')}"`,
          `"${item.addonsTotalPrice || 0}"`,
          `"${item.totalPrice || getCatalogAmount(item) || 0}"`,
        ]
        const row = isProductsTab
          ? [
              ...shared,
              `"${item.brand || ''}"`,
              `"${item.itemType || ''}"`,
              `"${getCatalogAmount(item) || 0}"`,
              ...addonCols,
              `"${item.totalQuantity || 0}"`,
              `"${item.reservedQuantity || 0}"`,
              `"${item.soldQuantity || 0}"`,
              `"${item.stock || 0}"`,
              `"${item.status || ''}"`,
            ]
          : [
              ...shared,
              `"${item.serviceType || ''}"`,
              `"${getServiceBillingType(item) || ''}"`,
              `"${getCatalogAmount(item) || 0}"`,
              `"${item.serviceDuration || ''}"`,
              `"${formatListDate(item.startDate) === labels.notApplicable ? '' : formatListDate(item.startDate)}"`,
              `"${formatListDate(item.endDate) === labels.notApplicable ? '' : formatListDate(item.endDate)}"`,
              `"${yesNo(item.renewalRequired)}"`,
              ...addonCols,
              `"${item.status || ''}"`,
            ]
        return row.join(',')
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = isProductsTab ? 'products.csv' : 'services.csv'
    a.click(); URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  const exportItemsPdf = async (items) => {
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF()

      const tableColumn = isProductsTab
        ? [
            'Item Name',
            'Item Code',
            'Category Name',
            'Brand',
            'Item Type',
            'Amount',
            'Add-ons Name',
            'Total Amount',
            'Qty Total',
            'Reserved',
            'Sold',
            'Available',
            'Status',
          ]
        : [
            'Service Name',
            'Item Code',
            'Category Name',
            'Service Type',
            'Service Billing Type',
            'Amount',
            'Duration',
            'Start Date',
            'End Date',
            'Renewal',
            'Add-ons Name',
            'Total Amount',
            'Status',
          ]
      const tableRows = []

      items.forEach(item => {
        const rowData = isProductsTab
          ? [
              item.name || '',
              item.code || '',
              item.category || '',
              item.brand || '',
              item.itemType || '',
              getCatalogAmount(item) || 0,
              formatAddonNames(item),
              item.totalPrice || getCatalogAmount(item) || 0,
              item.totalQuantity || 0,
              item.reservedQuantity || 0,
              item.soldQuantity || 0,
              item.stock || 0,
              item.status || '',
            ]
          : [
              item.name || '',
              item.code || '',
              item.category || '',
              item.serviceType || '',
              getServiceBillingType(item) || '',
              getCatalogAmount(item) || 0,
              item.serviceDuration || '',
              formatListDate(item.startDate) === labels.notApplicable ? '' : formatListDate(item.startDate),
              formatListDate(item.endDate) === labels.notApplicable ? '' : formatListDate(item.endDate),
              yesNo(item.renewalRequired),
              formatAddonNames(item),
              item.totalPrice || getCatalogAmount(item) || 0,
              item.status || '',
            ]
        tableRows.push(rowData)
      })

      doc.text(isProductsTab ? 'Products List' : 'Services List', 14, 15)
      autoTable.default(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      })
      doc.save(isProductsTab ? 'products_list.pdf' : 'services_list.pdf')
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

  const createdDateRangeFilter = (
    <div>
      <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
        <FaCalendarAlt className="text-blue-500" /> {labels.createdAt}
      </label>
      <DateRangePicker
        from={filters.createdFrom}
        to={filters.createdTo}
        onChange={({ from, to }) => setFilters({ ...filters, createdFrom: from, createdTo: to })}
        isRTL={isArabic}
        className="input input-sm h-8 text-xs w-full border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  )

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
              setForm(emptyItemForm());
              setDynamicValues({});
              setShowForm(true);
              fetchAuxiliaryData();
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
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.category} <span className="text-red-500">*</span></label>
                    <select
                      name="category"
                      value={form.category_id || ''}
                      onChange={(e) => {
                        const cat = categories.find(c => String(c.id) === String(e.target.value))
                        setForm(prev => applySelectedCategory(prev, cat))
                      }}
                      className="select w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 min-h-0 rounded-md"
                      required
                    >
                      <option value="">{labels.category}</option>
                      {categoryOptionsForForm.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.categoryType} <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={selectedCategoryType ? getCategoryTypeOptionLabel(selectedCategoryType) : ''}
                      readOnly
                      className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md opacity-70 cursor-not-allowed"
                      placeholder={labels.selectCategoryFirst}
                    />
                  </div>

                  {!selectedCategoryType ? (
                    <div className="form-control xl:col-span-3">
                      <p className="text-sm text-theme/80">{labels.selectCategoryFirst}</p>
                    </div>
                  ) : (
                    <>
                  {isProductForm && (
                    <div className="form-control">
                      <label className="label text-xs font-semibold text-theme mb-1.5">{labels.brand} <span className="text-red-500">*</span></label>
                      <input type="text" name="brand" value={form.brand} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" required />
                    </div>
                  )}

                  {isProductForm && (
                    <div className="form-control">
                      <label className="label text-xs font-semibold text-theme mb-1.5">{labels.model}</label>
                      <input type="text" name="model" value={form.model} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" />
                    </div>
                  )}

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{isServiceForm ? labels.serviceName : labels.productName} <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 placeholder-gray-600 h-10 rounded-md"
                      placeholder={isServiceForm ? labels.serviceName : labels.productName}
                      required
                    />
                  </div>

                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.itemImage}</label>
                    <div className="flex items-center gap-3">
                      {resolveItemImageSrc(form) ? (
                        <img
                          src={resolveItemImageSrc(form)}
                          alt={form.name || labels.itemImage}
                          className="h-14 w-14 shrink-0 rounded-full object-cover border border-gray-600 bg-white/5"
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded-full border border-dashed border-gray-600 bg-transparent" />
                      )}
                      <div className="flex flex-col gap-2">
                        <input
                          key={form.id ? `item-image-${form.id}` : 'item-image-new'}
                          type="file"
                          accept="image/*"
                          onChange={handleItemImageChange}
                          className="block w-full text-sm text-theme file:mr-3 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300"
                        />
                        {resolveItemImageSrc(form) ? (
                          <button
                            type="button"
                            onClick={clearItemImage}
                            className="text-xs text-red-400 hover:text-red-300 text-start"
                          >
                            {labels.removeImage}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {isProductForm && (
                    <div className="form-control">
                      <label className="label text-xs font-semibold text-theme mb-1.5">{labels.itemCode} <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        name="code"
                        value={form.code}
                        onChange={onChange}
                        className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md"
                        placeholder={isArabic ? 'APPLE-IPH15-128 أو اتركه للتوليد' : 'APPLE-IPH15-128 or leave blank to auto-generate'}
                      />
                    </div>
                  )}

                  {isServiceForm && (
                    <div className="form-control">
                      <label className="label text-xs font-semibold text-theme mb-1.5">{labels.serviceType} <span className="text-red-500">*</span></label>
                      <SearchableSelect
                        options={serviceTypeOptions}
                        value={form.serviceType || ''}
                        onChange={(val) => setForm(prev => ({ ...prev, serviceType: val }))}
                        placeholder={labels.serviceTypePlaceholder}
                        className="h-10 min-h-0 rounded-md bg-transparent border border-gray-600 text-theme"
                        isRTL={isArabic}
                        showAllOption={false}
                        creatable
                        dropdownZIndex={30050}
                      />
                    </div>
                  )}

                  {isServiceForm && (
                    <div className="form-control">
                      <label className="label text-xs font-semibold text-theme mb-1.5">{labels.serviceBillingType} <span className="text-red-500">*</span></label>
                      <select
                        name="billingCycle"
                        value={form.billingCycle}
                        onChange={onChange}
                        className="select w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 min-h-0 rounded-md"
                        required
                      >
                        {SERVICE_BILLING_OPTIONS.map(option => (
                          <option key={option} value={option}>{getItemTypeOptionLabel(option)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {isProductForm && (
                  <div className="form-control">
                    <label className="label text-xs font-semibold text-theme mb-1.5">{labels.quantity} <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      name="stock"
                      value={form.stock}
                      onChange={onChange}
                      className="input w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 h-10 rounded-md"
                      placeholder="0"
                    />
                  </div>
                  )}

                  {isProductForm && (
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
                  )}

                  {isProductForm && form.id ? (
                    <>
                      <div className="form-control">
                        <label className="label text-xs font-semibold text-theme mb-1.5">{labels.qtyReserved}</label>
                        <input
                          type="number"
                          value={form.reservedQuantity ?? form.reserved_quantity ?? 0}
                          readOnly
                          className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md opacity-70 cursor-not-allowed"
                        />
                      </div>
                      <div className="form-control">
                        <label className="label text-xs font-semibold text-theme mb-1.5">{labels.qtySold}</label>
                        <input
                          type="number"
                          value={form.soldQuantity ?? form.sold_quantity ?? 0}
                          readOnly
                          className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md opacity-70 cursor-not-allowed"
                        />
                      </div>
                    </>
                  ) : null}

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

                  <div className="form-control xl:col-span-3">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-400">{labels.additionalInfo}</div>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                      {isProductForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.unit}</label>
                          <select name="unit" value={form.unit} onChange={onChange} className="select w-full bg-transparent border border-gray-600 text-theme h-10 min-h-0 rounded-md">
                            {QUANTITY_TYPE_OPTIONS.map(option => (
                              <option key={option} value={option}>{getQuantityTypeOptionLabel(option)}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {isProductForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.supplier}</label>
                          <input type="text" name="supplier" value={form.supplier || ''} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" />
                        </div>
                      )}
                      {isProductForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.barcode}</label>
                          <input type="text" name="barcode" value={form.barcode} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" />
                        </div>
                      )}
                      {isProductForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.warehouse}</label>
                          <input type="text" name="warehouse" value={form.warehouse} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" />
                        </div>
                      )}
                      {isServiceForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.serviceDuration}</label>
                          <input type="text" name="serviceDuration" value={form.serviceDuration} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" placeholder={isArabic ? 'مثال: 3 Months' : 'e.g. 3 Months'} />
                        </div>
                      )}
                      {isServiceForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.startDate}</label>
                          <input type="date" name="startDate" value={toDateInputValue(form.startDate)} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" />
                        </div>
                      )}
                      {isServiceForm && (
                        <div className="form-control">
                          <label className="label text-xs font-semibold text-theme mb-1.5">{labels.endDate}</label>
                          <input type="date" name="endDate" value={toDateInputValue(form.endDate)} onChange={onChange} className="input w-full bg-transparent border border-gray-600 text-theme h-10 rounded-md" />
                        </div>
                      )}
                      {isServiceForm && (
                        <div className="form-control flex flex-row items-center gap-3 pt-6">
                          <label className="label-text font-medium text-theme">{labels.renewalRequired}</label>
                          <input type="checkbox" className="checkbox" checked={Boolean(form.renewalRequired)} onChange={(e) => setForm(prev => ({ ...prev, renewalRequired: e.target.checked }))} />
                        </div>
                      )}
                      <div className="form-control xl:col-span-3">
                        <label className="label text-xs font-semibold text-theme mb-1.5">{labels.notes}</label>
                        <textarea
                          name="notes"
                          value={form.notes || ''}
                          onChange={onChange}
                          className="textarea w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 placeholder-gray-600 h-20 rounded-md"
                          placeholder={labels.notes}
                        />
                      </div>
                      <div className="form-control xl:col-span-3">
                        <label className="label text-xs font-semibold text-theme mb-1.5">{labels.description}</label>
                        <textarea
                          name="description"
                          value={form.description || ''}
                          onChange={onChange}
                          className="textarea w-full bg-transparent border border-gray-600 text-theme focus:ring-1 focus:ring-blue-500 placeholder-gray-600 h-24 rounded-md"
                          placeholder={labels.description}
                        />
                      </div>
                    </div>
                  </div>

                  {(isProductForm || isServiceForm) && (
                  <div className="form-control xl:col-span-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-white/10 p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-400">{labels.addonsSection}</span>
                      <button
                        type="button"
                        onClick={addAddonRow}
                        className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none"
                      >
                        <FaPlus className="text-white" /> {labels.addAddon}
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
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

                            {isServiceForm ? (
                              <div className="form-control">
                                <label className="label text-xs font-semibold text-theme mb-1.5">{labels.addonPeriod}</label>
                                <SearchableSelect
                                  options={SERVICE_BILLING_OPTIONS.map(option => ({ value: option, label: getItemTypeOptionLabel(option) }))}
                                  value={addon.period || ''}
                                  onChange={(val) => updateAddonRow(index, 'period', val)}
                                  placeholder={labels.addonPeriod}
                                  className="h-10 min-h-0 rounded-md bg-transparent border border-gray-600 text-theme"
                                  isRTL={isArabic}
                                  showAllOption={false}
                                  creatable
                                  dropdownZIndex={30050}
                                />
                              </div>
                            ) : (
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
                            )}

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
                  </div>
                  )}
                    </>
                  )}
                </div>
                </div>

                <div className="border border-white/10 rounded-xl p-5">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="form-control flex flex-row items-center gap-3">
                      <label className="label-text font-medium text-theme">{labels.isActive}</label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.status === 'Active'}
                        onClick={() => setForm({ ...form, status: form.status === 'Active' ? 'Inactive' : 'Active' })}
                        className={`relative h-6 w-11 overflow-hidden rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent ${
                          form.status === 'Active'
                            ? 'border-green-500 bg-green-500 focus:ring-green-300'
                            : 'border-gray-300 bg-gray-300 focus:ring-gray-300'
                        }`}
                      >
                        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.status === 'Active' ? 'translate-x-5' : 'translate-x-0'}`}></span>
                      </button>
                      <span className={`min-w-12 rounded-full px-2.5 py-1 text-center text-xs font-semibold ${
                        form.status === 'Active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {form.status === 'Active' ? labels.on : labels.off}
                      </span>
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

      {deleteDialog && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-theme">{labels.transferLinkedLeads}</h3>
                <p className="mt-1 text-sm text-theme">
                  {isArabic
                    ? 'قرار الحذف من السيرفر: يوجد ليدز مرتبطة. اختر صنف بديل لتحويلها ثم الحذف.'
                    : 'Backend decision: linked leads exist. Choose a replacement item to transfer them, then delete.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="rounded-full p-2 text-theme hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-3 text-sm text-theme dark:border-gray-700">
              {(deleteDialog.blockers || []).map((blocker) => (
                <div key={blocker.item_id} className="flex items-center justify-between gap-3 py-1">
                  <span>{blocker.item_name || `#${blocker.item_id}`}</span>
                  <span className="font-semibold">{formatNumber(blocker.leads_count || 0)}</span>
                </div>
              ))}
            </div>

            <label className="mb-2 block text-sm font-medium text-theme">{labels.replacementItem}</label>
            <SearchableSelect
              options={replacementOptions}
              value={replacementItemId}
              onChange={setReplacementItemId}
              placeholder={labels.chooseReplacementItem}
              isRTL={isArabic}
              showAllOption={false}
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-theme hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                onClick={confirmDeleteWithReplacement}
                disabled={!replacementItemId}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${replacementItemId ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400 cursor-not-allowed'}`}
              >
                {labels.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-3 text-lg font-medium text-theme">
              <FaFilter className="text-blue-500" />
              {labels.filter}
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                isProductsTab ? 'bg-blue-500/15 text-blue-400' : 'bg-indigo-500/15 text-indigo-400'
              }`}>
                {isProductsTab ? labels.productFilters : labels.serviceFilters}
              </span>
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

          {isProductsTab ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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
                  <FaSearch className="text-blue-500" /> {labels.productName}
                </label>
                <SearchableSelect
                  options={nameOptionsForFilter}
                  value={filters.name}
                  onChange={val => setFilters({ ...filters, name: val })}
                  placeholder={`${labels.productName} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                />
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
                  <FaLayerGroup className="text-blue-500" /> {labels.brand}
                </label>
                <SearchableSelect
                  options={brandOptionsForFilter}
                  value={filters.brand}
                  onChange={val => setFilters({ ...filters, brand: val })}
                  placeholder={`${labels.brand} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                  creatable
                />
              </div>
              <div>
                <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                  <FaCube className="text-blue-500" /> {labels.itemType}
                </label>
                <SearchableSelect
                  options={itemTypeOptionsForFilter}
                  value={filters.itemType}
                  onChange={val => setFilters({ ...filters, itemType: val })}
                  placeholder={`${labels.itemType} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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
                  <FaSearch className="text-blue-500" /> {labels.serviceName}
                </label>
                <SearchableSelect
                  options={nameOptionsForFilter}
                  value={filters.name}
                  onChange={val => setFilters({ ...filters, name: val })}
                  placeholder={`${labels.serviceName} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                />
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
                  <FaCube className="text-blue-500" /> {labels.serviceType}
                </label>
                <SearchableSelect
                  options={serviceTypeOptionsForFilter}
                  value={filters.serviceType}
                  onChange={val => setFilters({ ...filters, serviceType: val })}
                  placeholder={`${labels.serviceType} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                  creatable
                />
              </div>
              <div>
                <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                  <FaCube className="text-blue-500" /> {labels.serviceBillingType}
                </label>
                <SearchableSelect
                  options={itemTypeOptionsForFilter}
                  value={filters.itemType}
                  onChange={val => setFilters({ ...filters, itemType: val })}
                  placeholder={`${labels.serviceBillingType} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                />
              </div>
            </div>
          )}

          {showAllFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mt-4 pt-4 border-t border-white/10">
              <div>
                <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                  <FaCheckCircle className="text-blue-500" /> {labels.status}
                </label>
                <SearchableSelect
                  options={statusOptionsForFilter}
                  value={filters.status}
                  onChange={val => setFilters({ ...filters, status: val })}
                  placeholder={`${labels.status} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                  <FaSearch className="text-blue-500" /> {labels.itemCode}
                </label>
                <SearchableSelect
                  options={codeOptionsForFilter}
                  value={filters.code}
                  onChange={val => setFilters({ ...filters, code: val })}
                  placeholder={`${labels.itemCode} ${getAllSuffix()}`}
                  className="input-sm h-8 text-xs min-h-0"
                  isRTL={isArabic}
                />
              </div>
              {isProductsTab ? (
                <>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaCube className="text-blue-500" /> {labels.model}
                    </label>
                    <SearchableSelect
                      options={modelOptionsForFilter}
                      value={filters.model}
                      onChange={val => setFilters({ ...filters, model: val })}
                      placeholder={`${labels.model} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaSearch className="text-blue-500" /> {labels.barcode}
                    </label>
                    <SearchableSelect
                      options={skuOptionsForFilter}
                      value={filters.sku}
                      onChange={val => setFilters({ ...filters, sku: val })}
                      placeholder={`${labels.barcode} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaLayerGroup className="text-blue-500" /> {labels.warehouse}
                    </label>
                    <SearchableSelect
                      options={warehouseOptionsForFilter}
                      value={filters.warehouse}
                      onChange={val => setFilters({ ...filters, warehouse: val })}
                      placeholder={`${labels.warehouse} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaLayerGroup className="text-blue-500" /> {labels.supplier}
                    </label>
                    <SearchableSelect
                      options={supplierOptionsForFilter}
                      value={filters.supplier}
                      onChange={val => setFilters({ ...filters, supplier: val })}
                      placeholder={`${labels.supplier} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaCube className="text-blue-500" /> {labels.unit}
                    </label>
                    <SearchableSelect
                      options={unitOptionsForFilter}
                      value={filters.unit}
                      onChange={val => setFilters({ ...filters, unit: val })}
                      placeholder={`${labels.unit} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  {createdDateRangeFilter}
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 h-8 text-xs font-bold text-theme cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={Boolean(filters.lowStock)}
                        onChange={(e) => setFilters(prev => ({ ...prev, lowStock: e.target.checked }))}
                      />
                      {labels.lowStock}
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaCube className="text-blue-500" /> {labels.serviceDuration}
                    </label>
                    <SearchableSelect
                      options={durationOptionsForFilter}
                      value={filters.serviceDuration}
                      onChange={val => setFilters({ ...filters, serviceDuration: val })}
                      placeholder={`${labels.serviceDuration} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaCheckCircle className="text-blue-500" /> {labels.renewalRequired}
                    </label>
                    <SearchableSelect
                      options={renewalOptionsForFilter}
                      value={filters.renewalRequired}
                      onChange={val => setFilters({ ...filters, renewalRequired: val })}
                      placeholder={`${labels.renewalRequired} ${getAllSuffix()}`}
                      className="input-sm h-8 text-xs min-h-0"
                      isRTL={isArabic}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaCalendarAlt className="text-blue-500" /> {labels.startDate}
                    </label>
                    <input
                      type="date"
                      className="input input-sm h-8 text-xs w-full border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold mb-1 flex items-center gap-1.5 text-theme">
                      <FaCalendarAlt className="text-blue-500" /> {labels.endDate}
                    </label>
                    <input
                      type="date"
                      className="input input-sm h-8 text-xs w-full border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    />
                  </div>
                  {createdDateRangeFilter}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-visible">

        {/* Table Title */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <h2 className="text-lg font-semibold text-theme">
                {isProductsTab ? labels.productsListTitle : labels.servicesListTitle}
              </h2>
              <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl inline-flex">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 ${
                    isProductsTab
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-transparent border-transparent text-theme hover:bg-white/5 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => switchListTab(CATEGORY_TYPE_PRODUCTS)}
                >
                  {labels.productsTab}
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 ${
                    isServicesTab
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-transparent border-transparent text-theme hover:bg-white/5 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => switchListTab(CATEGORY_TYPE_SERVICES)}
                >
                  {labels.servicesTab}
                </button>
              </div>
            </div>
            {canManageItems && selectedItemIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-theme">
                  {formatNumber(selectedItemIds.length)} {labels.selectedItems}
                </span>
                <button
                  type="button"
                  onClick={deleteSelectedItems}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  <FaTrash /> {labels.deleteSelected}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-theme hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <FaTimes /> {labels.clearSelection}
                </button>
              </div>
            )}
          </div>
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
              <p>{isProductsTab ? labels.emptyProducts : labels.emptyServices}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto overflow-y-visible relative z-0">
                <table className="nova-table categories-table w-full">
                  <thead className="thead-soft relative z-10">
                    <tr>
                      {canManageItems && (
                        <th className="px-4 py-3 text-start">
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            onChange={togglePageSelection}
                            aria-label={labels.bulkActions}
                          />
                        </th>
                      )}
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{isProductsTab ? labels.name : labels.serviceName}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.category}</th>
                      {isProductsTab ? (
                        <>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.brand}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.itemType}</th>
                        </>
                      ) : (
                        <>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.serviceType}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.serviceBillingType}</th>
                        </>
                      )}
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.price}</th>
                      {isServicesTab ? (
                        <>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.serviceDuration}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.startDate}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.endDate}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.renewalRequired}</th>
                        </>
                      ) : null}
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.addonsName}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{isProductsTab ? labels.addonsQty : labels.addonPeriod}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.addonsPrice}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.totalPrice}</th>
                      {isProductsTab ? (
                        <>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.qtyTotal}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.qtyReserved}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.qtySold}</th>
                          <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.qtyAvailable}</th>
                        </>
                      ) : null}
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.notes}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.description}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider">{labels.status}</th>
                      <th className="text-end px-4 py-3 text-xs font-semibold text-theme uppercase tracking-wider pr-6">{labels.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item) => {
                      const service = isServiceItem(item)
                      const identity = getItemIdentityValue(item)
                      const itemCode = getItemCodeValue(item)
                      return (
                      <tr key={item.id} className="group cursor-pointer transition-colors duration-150 hover:bg-blue-50/80 dark:hover:bg-blue-900/20">
                        {canManageItems && (
                          <td className="px-4 py-3 text-start">
                            <input
                              type="checkbox"
                              checked={selectedItemIds.includes(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                              aria-label={`${labels.bulkActions}: ${item.name}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-start font-medium text-theme">
                          <div className="flex items-center gap-2">
                            <ItemAvatar item={item} />
                            <div className="flex flex-col">
                              <span>{item.name || labels.notApplicable}</span>
                              {itemCode ? <span className="font-mono text-[10px] opacity-70">{itemCode}</span> : null}
                            </div>
                            {hasNotesOrDescription(item) ? (
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent text-blue-400 hover:bg-blue-500/10"
                                title={labels.moreDetails}
                                onMouseEnter={(event) => showNotesTooltip(event, item, 'both')}
                                onMouseLeave={hideNotesTooltip}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (activeNotesTooltip?.item?.id === item.id && activeNotesTooltip?.field === 'both') {
                                    hideNotesTooltip()
                                    return
                                  }
                                  showNotesTooltip(event, item, 'both')
                                }}
                              >
                                <FaInfoCircle size={12} />
                              </button>
                            ) : null}
                            {isProductsTab && item.is_low_stock ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{labels.lowStock}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-start text-theme">
                          <span className="text-xs text-nowrap">{item.category || labels.notApplicable}</span>
                        </td>
                        {isProductsTab ? (
                          <>
                            <td className="px-4 py-3 text-start text-theme text-xs">
                              <span className="text-nowrap">{identity || labels.notApplicable}</span>
                            </td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">
                              {getItemKindLabel(item)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-start text-theme text-xs">
                              <span className="text-nowrap">{identity || labels.notApplicable}</span>
                            </td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">
                              {getItemKindLabel(item)}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-start font-medium text-theme">{formatAmount(getCatalogAmount(item))}</td>
                        {isServicesTab ? (
                          <>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{item.serviceDuration || labels.notApplicable}</td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatListDate(item.startDate)}</td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatListDate(item.endDate)}</td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{yesNo(item.renewalRequired)}</td>
                          </>
                        ) : null}
                        <td className="px-4 py-3 text-start text-theme">
                          {getAddonNames(item).length > 0 ? (
                            <select
                              className="select select-xs h-8 min-h-0 w-40 max-w-full rounded-md border border-gray-300 bg-transparent text-xs text-theme"
                              value={String(getSelectedAddon(item)?.id || '')}
                              onChange={(e) => setSelectedAddonByItemId(prev => ({ ...prev, [item.id]: e.target.value }))}
                              title={formatAddonNames(item)}
                              onMouseEnter={(event) => showAddonsTooltip(event, item)}
                              onMouseLeave={hideAddonsTooltip}
                            >
                              {getAddonTooltipData(item).map((addon, index) => (
                                <option key={`${item.id}-addon-name-${index}`} value={addon.id}>{addon.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">{labels.notApplicable}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-start">
                          {service ? (
                            <span className="text-xs text-theme">{getSelectedAddonPeriod(item) ? getItemTypeOptionLabel(getSelectedAddonPeriod(item)) : labels.notApplicable}</span>
                          ) : getAddonNames(item).length > 0 ? (
                            <span
                              className="badge badge-sm border-0 bg-blue-100 text-blue-700 cursor-default"
                              onMouseEnter={(event) => showAddonsTooltip(event, item)}
                              onMouseLeave={hideAddonsTooltip}
                            >
                              {formatNumber(getSelectedAddon(item)?.quantity || 0)}
                            </span>
                          ) : (
                            <span className="text-xs text-theme">{labels.notApplicable}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-start font-medium text-theme">
                          {getAddonNames(item).length > 0 ? formatAmount(getSelectedAddonAmount(item)) : labels.notApplicable}
                        </td>
                        <td className="px-4 py-3 text-start font-semibold text-theme">{formatAmount(item.totalPrice || getCatalogAmount(item))}</td>
                        {isProductsTab ? (
                          <>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatNumber(item.totalQuantity ?? ((item.stock || 0) + (item.reservedQuantity || 0) + (item.soldQuantity || 0)))}</td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatNumber(item.reservedQuantity ?? 0)}</td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatNumber(item.soldQuantity ?? 0)}</td>
                            <td className="px-4 py-3 text-start text-theme text-xs text-nowrap">{formatNumber(item.stock ?? 0)}</td>
                          </>
                        ) : null}
                        <td
                          className="px-4 py-3 text-start text-theme text-xs max-w-[180px]"
                          onMouseEnter={(event) => showNotesTooltip(event, item, 'notes')}
                          onMouseLeave={hideNotesTooltip}
                        >
                          <span className="block truncate">{previewText(item.notes)}</span>
                        </td>
                        <td
                          className="px-4 py-3 text-start text-theme text-xs max-w-[180px]"
                          onMouseEnter={(event) => showNotesTooltip(event, item, 'description')}
                          onMouseLeave={hideNotesTooltip}
                        >
                          <span className="block truncate">{previewText(item.description)}</span>
                        </td>
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
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden grid grid-cols-1 gap-3 p-3">
                {paginatedItems.map((item) => {
                  const service = isServiceItem(item)
                  const identity = getItemIdentityValue(item)
                  const itemCode = getItemCodeValue(item)
                  return (
                  <div key={item.id} className="card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 relative">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-start gap-2">
                        {canManageItems && (
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            aria-label={`${labels.bulkActions}: ${item.name}`}
                          />
                        )}
                        {item.image_url || item.image ? (
                          <ItemAvatar item={item} sizeClass="h-10 w-10" />
                        ) : null}
                        <div className="flex flex-col">
                          <span className="font-semibold text-theme text-base">{item.name || labels.notApplicable}</span>
                          {!service && item.is_low_stock ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{labels.lowStock}</span>
                          ) : null}
                          {itemCode ? (
                            <span className="text-xs text-theme font-mono">{itemCode}</span>
                          ) : null}
                        </div>
                      </div>
                      <span className={`badge badge-sm border-0 ${item.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-theme'}`}>
                        {item.status === 'Active' ? labels.active : labels.inactive}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-theme mb-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.category}</span>
                        <span>{item.category || labels.notApplicable}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{isProductsTab ? labels.brand : labels.serviceType}</span>
                        <span>{identity || labels.notApplicable}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{isProductsTab ? labels.itemType : labels.serviceBillingType}</span>
                        <span>{getItemKindLabel(item)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.price}</span>
                        <span className="font-medium">{formatAmount(getCatalogAmount(item))}</span>
                      </div>
                      {isServicesTab ? (
                        <>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.serviceDuration}</span>
                            <span>{item.serviceDuration || labels.notApplicable}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.startDate}</span>
                            <span>{formatListDate(item.startDate)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.endDate}</span>
                            <span>{formatListDate(item.endDate)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.renewalRequired}</span>
                            <span>{yesNo(item.renewalRequired)}</span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.addonsName}</span>
                        {getAddonNames(item).length > 0 ? (
                          <select
                            className="select select-xs h-8 min-h-0 rounded-md border border-gray-300 bg-transparent text-xs text-theme"
                            value={String(getSelectedAddon(item)?.id || '')}
                            onChange={(e) => setSelectedAddonByItemId(prev => ({ ...prev, [item.id]: e.target.value }))}
                            title={formatAddonNames(item)}
                          >
                            {getAddonTooltipData(item).map((addon, index) => (
                              <option key={`${item.id}-mobile-addon-name-${index}`} value={addon.id}>{addon.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span>{labels.notApplicable}</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{isProductsTab ? labels.addonsQty : labels.addonPeriod}</span>
                        <span>
                          {isProductsTab
                            ? (getAddonNames(item).length > 0 ? formatNumber(getSelectedAddon(item)?.quantity || 0) : labels.notApplicable)
                            : (getSelectedAddonPeriod(item) ? getItemTypeOptionLabel(getSelectedAddonPeriod(item)) : labels.notApplicable)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.addonsPrice}</span>
                        <span>{getAddonNames(item).length > 0 ? formatAmount(getSelectedAddonAmount(item)) : labels.notApplicable}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-theme">{labels.totalPrice}</span>
                        <span className="font-semibold">{formatAmount(item.totalPrice || getCatalogAmount(item))}</span>
                      </div>
                      {isProductsTab ? (
                        <>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.qtyTotal}</span>
                            <span>{formatNumber(item.totalQuantity ?? ((item.stock || 0) + (item.reservedQuantity || 0) + (item.soldQuantity || 0)))}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.qtyReserved}</span>
                            <span>{formatNumber(item.reservedQuantity ?? 0)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.qtySold}</span>
                            <span>{formatNumber(item.soldQuantity ?? 0)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.qtyAvailable}</span>
                            <span>{formatNumber(item.stock ?? 0)}</span>
                          </div>
                        </>
                      ) : null}
                    </div>

                    {hasNotesOrDescription(item) ? (
                      <div className="mb-3 space-y-2 text-sm text-theme">
                        {item.notes ? (
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.notes}</span>
                            <span>{item.notes}</span>
                          </div>
                        ) : null}
                        {item.description ? (
                          <div className="flex flex-col">
                            <span className="text-xs text-theme">{labels.description}</span>
                            <span>{item.description}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

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
                  )
                })}
              </div>
              </>
          )}
        </div>

        {/* Pagination Footer */}
        {filtered.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between rounded-xl p-2 border border-gray-100 dark:border-gray-700  gap-4">
            <div className="text-xs text-theme">
              {isArabic
                ? `عرض ${formatNumber((currentPage - 1) * itemsPerPage + 1)} إلى ${formatNumber(Math.min(currentPage * itemsPerPage, filtered.length))} من ${formatNumber(filtered.length)} ${isProductsTab ? 'منتج' : 'خدمة'}`
                : `Showing ${formatNumber((currentPage - 1) * itemsPerPage + 1)} to ${formatNumber(Math.min(currentPage * itemsPerPage, filtered.length))} of ${formatNumber(filtered.length)} ${isProductsTab ? 'products' : 'services'}`
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

      {activeNotesTooltip && (
        <div
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full"
          style={{ top: activeNotesTooltip.top, left: activeNotesTooltip.left }}
        >
          <div className="relative w-max min-w-[220px] max-w-[280px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-start shadow-2xl shadow-black/40">
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-blue-300">
              {activeNotesTooltip.field === 'notes'
                ? labels.notes
                : activeNotesTooltip.field === 'description'
                  ? labels.description
                  : labels.moreDetails}
            </div>
            <div className="space-y-2 text-xs text-slate-200">
              {(activeNotesTooltip.field === 'both' || activeNotesTooltip.field === 'notes') && fieldText(activeNotesTooltip.item, 'notes') ? (
                <div>
                  {activeNotesTooltip.field === 'both' ? <div className="opacity-70">{labels.notes}</div> : null}
                  <div className="whitespace-pre-wrap break-words">{activeNotesTooltip.item.notes}</div>
                </div>
              ) : null}
              {(activeNotesTooltip.field === 'both' || activeNotesTooltip.field === 'description') && fieldText(activeNotesTooltip.item, 'description') ? (
                <div>
                  {activeNotesTooltip.field === 'both' ? <div className="opacity-70">{labels.description}</div> : null}
                  <div className="whitespace-pre-wrap break-words">{activeNotesTooltip.item.description}</div>
                </div>
              ) : null}
            </div>
            <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-slate-700 bg-slate-950"></div>
          </div>
        </div>
      )}

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
                      {isServiceItem(activeAddonsTooltip.item) ? (
                        <span>{labels.addonPeriod}: {addon.period ? getItemTypeOptionLabel(addon.period) : labels.notApplicable}</span>
                      ) : (
                        <span>{labels.quantity}: {formatNumber(addon.quantity || 0)}</span>
                      )}
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
