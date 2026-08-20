import {
  CATEGORY_TYPE_PRODUCTS,
  CATEGORY_TYPE_SERVICES,
  normalizeCategoryType,
} from './categoryType'

const SERVICE_BILLING_ALIASES = {
  'one-time': 'One-time',
  onetime: 'One-time',
  'one time': 'One-time',
  subscription: 'Subscription',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-annual',
  'semi annual': 'Semi-annual',
  'semi-annually': 'Semi-annual',
  'semi annually': 'Semi-annual',
  semiannual: 'Semi-annual',
  annual: 'Annually',
  annually: 'Annually',
  yearly: 'Annually',
}

export function resolveLineItemType(value) {
  const normalized = normalizeCategoryType(value)
  if (normalized === CATEGORY_TYPE_SERVICES) return 'Service'
  if (normalized === CATEGORY_TYPE_PRODUCTS) return 'Product'
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'service' || raw === 'services') return 'Service'
  return 'Product'
}

export function isServiceSalesLine(line) {
  return resolveLineItemType(line?.type || line?.business_type || line?.categoryType) === 'Service'
}

export function resolveCategoryName(item) {
  if (!item) return ''
  if (typeof item.category === 'string') return item.category.trim()
  return String(
    item.category?.name
    || item.category_name
    || item.categoryName
    || ''
  ).trim()
}

export function normalizeServiceBillingType(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const mapped = SERVICE_BILLING_ALIASES[raw.toLowerCase()]
  if (mapped) return mapped
  if (['One-time', 'Subscription', 'Monthly', 'Quarterly', 'Semi-annual', 'Annually'].includes(raw)) {
    return raw
  }
  return raw
}

export function resolveServiceBillingType(item) {
  const fromBilling = normalizeServiceBillingType(
    item?.billingCycle
    || item?.billing_cycle
    || item?.serviceBillingType
    || item?.service_billing_type
    || ''
  )
  if (fromBilling) return fromBilling
  return normalizeServiceBillingType(item?.item_type || item?.itemType || '')
}

export function resolveCatalogAmount(item) {
  const isService = isServiceSalesLine(item)
    || normalizeCategoryType(item?.business_type || item?.category_type) === CATEGORY_TYPE_SERVICES
  if (isService && item?.service_amount != null && item.service_amount !== '') {
    return Number(item.service_amount) || 0
  }
  if (item?.catalog_amount != null && item.catalog_amount !== '') {
    return Number(item.catalog_amount) || 0
  }
  return Number(item?.price ?? item?.unit_price ?? item?.unitPrice ?? 0) || 0
}

export function mapCatalogAddon(addon) {
  if (!addon) return null
  const name = String(addon.name || '').trim()
  if (!name) return null
  const id = addon.id ?? addon.addon_id
  if (id == null || id === '') return null
  return {
    id,
    name,
    quantity: Math.max(1, Number(addon.quantity ?? 1) || 1),
    price: Number(addon.price ?? addon.amount ?? 0) || 0,
    period: String(addon.period || '').trim(),
  }
}

/** Pull addons from API / mapped item shapes (same sources reservation uses). */
export function extractCatalogAddons(item) {
  if (!item || typeof item !== 'object') return []
  const raw = Array.isArray(item.addons)
    ? item.addons
    : (Array.isArray(item.item_addons)
      ? item.item_addons
      : (Array.isArray(item.available_addons) ? item.available_addons : []))
  return raw.map(mapCatalogAddon).filter(Boolean)
}

export function extractItemsCollection(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export function mapCatalogItem(item) {
  const categoryName = resolveCategoryName(item)
  const categoryType = normalizeCategoryType(
    item.business_type
    || item.category_type
    || item.type
    || item.category?.applies_to
    || item.category?.category_type
  ) || CATEGORY_TYPE_PRODUCTS
  const isService = categoryType === CATEGORY_TYPE_SERVICES

  return {
    id: item.id,
    name: item.name || item.title || item.code || '',
    price: resolveCatalogAmount({ ...item, business_type: isService ? 'service' : 'product' }),
    type: isService ? 'Service' : 'Product',
    category: categoryName,
    categoryType,
    brand: String(item.brand || '').trim(),
    itemType: String(item.item_type || item.itemType || '').trim(),
    code: String(item.code || item.sku || '').trim(),
    serviceType: String(item.service_type || item.serviceType || '').trim(),
    billingCycle: resolveServiceBillingType(item),
    addons: extractCatalogAddons(item),
  }
}

export function emptySalesLineAddons() {
  return { addon_ids: [], addons: [], addons_total: 0, available_addons: [] }
}

export function resetLineForTypeChange(line, newType) {
  const isService = resolveLineItemType(newType) === 'Service'
  return {
    ...line,
    type: newType,
    category: '',
    name: '',
    price: 0,
    quantity: isService ? 1 : (Number(line?.quantity) > 0 ? Number(line.quantity) : 1),
    item_id: undefined,
    brand: '',
    itemType: '',
    code: '',
    serviceType: '',
    billingCycle: '',
    ...emptySalesLineAddons(),
  }
}

export function resetLineForCategoryChange(line, newCategory) {
  const isService = isServiceSalesLine(line)
  return {
    ...line,
    category: newCategory,
    name: '',
    price: 0,
    quantity: isService ? 1 : (Number(line?.quantity) > 0 ? Number(line.quantity) : 1),
    item_id: undefined,
    brand: '',
    itemType: '',
    code: '',
    serviceType: '',
    billingCycle: '',
    ...emptySalesLineAddons(),
  }
}

export function getAddonLineAmount(addon, isService = false) {
  const price = Number(addon?.price ?? addon?.amount ?? 0) || 0
  if (isService) return price
  if (addon?.total != null && addon.total !== '') {
    const total = Number(addon.total)
    if (Number.isFinite(total)) return total
  }
  const quantity = Number(addon?.quantity ?? 0) || 0
  return quantity * price
}

export function resolveLineAddonIds(line) {
  if (Array.isArray(line?.addon_ids)) {
    return line.addon_ids
      .map((id) => (id != null && id !== '' ? id : null))
      .filter((id) => id != null)
  }
  if (Array.isArray(line?.addons)) {
    return line.addons
      .map((addon) => addon?.id ?? addon?.addon_id)
      .filter((id) => id != null && id !== '')
  }
  return []
}

export function resolveSelectedAddons(line, catalogAddons = []) {
  const selectedIds = new Set(resolveLineAddonIds(line).map((id) => String(id)))
  if (selectedIds.size === 0) return []

  const fromCatalog = (Array.isArray(catalogAddons) ? catalogAddons : [])
    .map(mapCatalogAddon)
    .filter(Boolean)
    .filter((addon) => selectedIds.has(String(addon.id)))

  if (fromCatalog.length > 0) return fromCatalog

  return (Array.isArray(line?.addons) ? line.addons : [])
    .map(mapCatalogAddon)
    .filter(Boolean)
    .filter((addon) => selectedIds.has(String(addon.id)))
}

export function computeLineAddonsTotal(line, catalogAddons = []) {
  if (line?.addons_total != null && line.addons_total !== '' && !catalogAddons?.length) {
    const stored = Number(line.addons_total)
    if (Number.isFinite(stored)) return stored
  }
  const isService = isServiceSalesLine(line)
  return resolveSelectedAddons(line, catalogAddons)
    .reduce((sum, addon) => sum + getAddonLineAmount(addon, isService), 0)
}

export function applyAddonSelectionToLine(line, selectedIds, catalogAddons = []) {
  const ids = (Array.isArray(selectedIds) ? selectedIds : [])
    .map((id) => (id != null && id !== '' ? id : null))
    .filter((id) => id != null)
  const isService = isServiceSalesLine(line)
  const selected = resolveSelectedAddons({ ...line, addon_ids: ids }, catalogAddons)
  const addons = selected.map((addon) => {
    const total = getAddonLineAmount(addon, isService)
    return {
      id: addon.id,
      name: addon.name,
      quantity: isService ? 1 : Math.max(1, Number(addon.quantity) || 1),
      price: Number(addon.price) || 0,
      period: isService ? (addon.period || null) : null,
      total,
    }
  })
  const addons_total = addons.reduce((sum, addon) => sum + (Number(addon.total) || 0), 0)
  return {
    ...line,
    addon_ids: ids,
    addons,
    addons_total,
  }
}

export function applyCatalogSelectionToLine(line, catalog, selectedName) {
  if (!catalog) {
    return {
      ...line,
      name: selectedName,
      item_id: undefined,
      ...emptySalesLineAddons(),
    }
  }
  const isService = resolveLineItemType(catalog.type) === 'Service'
  const available_addons = extractCatalogAddons(catalog)
  return {
    ...line,
    name: selectedName || catalog.name || line.name,
    item_id: catalog.id ?? catalog.item_id ?? line.item_id,
    price: catalog.price,
    type: catalog.type || line.type,
    category: catalog.category || line.category,
    quantity: isService ? 1 : (Number(line?.quantity) > 0 ? Number(line.quantity) : 1),
    brand: catalog.brand || '',
    itemType: catalog.itemType || '',
    code: catalog.code || '',
    serviceType: catalog.serviceType || '',
    billingCycle: catalog.billingCycle || '',
    ...emptySalesLineAddons(),
    available_addons,
  }
}

export function findCatalogProduct(catalog = [], { id, name, type, category } = {}) {
  const list = Array.isArray(catalog) ? catalog : []
  if (id != null && id !== '') {
    const byId = list.find((item) => String(item.id) === String(id))
    if (byId) return byId
  }
  const wantedName = String(name || '').trim()
  if (!wantedName) return null
  const wantedType = type ? resolveLineItemType(type) : ''
  const wantedCategory = String(category || '').trim()
  const scoped = list.filter((item) => {
    if (item.name !== wantedName) return false
    if (wantedType && item.type && item.type !== wantedType) return false
    if (wantedCategory && item.category && item.category !== wantedCategory) return false
    return true
  })
  return scoped[0] || list.find((item) => item.name === wantedName) || null
}

export function findCatalogMatchForLine(line, catalog = []) {
  return findCatalogProduct(catalog, {
    id: line?.item_id ?? line?.itemId ?? line?.product_id,
    name: line?.name,
    type: line?.type,
    category: line?.category,
  })
}

export function resolveAvailableAddonsForLine(line, catalog = []) {
  const fromLine = extractCatalogAddons({ addons: line?.available_addons })
  if (fromLine.length > 0) return fromLine

  const match = findCatalogMatchForLine(line, catalog)
  const fromCatalog = extractCatalogAddons(match)
  if (fromCatalog.length > 0) return fromCatalog

  // Selected addons only — never treat as the catalog option list.
  return []
}

export function getLineIdentityMeta(line) {
  if (isServiceSalesLine(line)) {
    return String(line?.serviceType || line?.service_type || '').trim()
  }
  const brand = String(line?.brand || '').trim()
  const code = String(line?.code || '').trim()
  if (brand && code) return `${brand} · ${code}`
  return brand || code
}

export function formatServiceBillingLabel(value, isRTL = false) {
  const normalized = normalizeServiceBillingType(value)
  if (!normalized) return ''
  if (!isRTL) return normalized
  if (normalized === 'One-time') return 'مرة واحدة'
  if (normalized === 'Subscription') return 'اشتراك'
  if (normalized === 'Monthly') return 'شهري'
  if (normalized === 'Quarterly') return 'ربع سنوي'
  if (normalized === 'Semi-annual' || normalized === 'Semi Annually') return 'نصف سنوي'
  if (normalized === 'Annually') return 'سنوي'
  return normalized
}

export function getSalesLineLabels(isRTL = false) {
  return {
    sectionTitle: isRTL ? 'البنود' : 'Items',
    type: isRTL ? 'النوع' : 'Type',
    category: isRTL ? 'الفئة' : 'Category',
    itemName: isRTL ? 'اسم المنتج / الخدمة' : 'Product / Service Name',
    productName: isRTL ? 'اسم المنتج' : 'Product Name',
    serviceName: isRTL ? 'اسم الخدمة' : 'Service Name',
    selectProduct: isRTL ? 'اختر المنتج' : 'Select Product',
    selectService: isRTL ? 'اختر الخدمة' : 'Select Service',
    qtyOrBilling: isRTL ? 'الكمية / الفوترة' : 'Qty / Billing',
    qty: isRTL ? 'الكمية' : 'Qty',
    billing: isRTL ? 'نوع الفوترة' : 'Billing',
    amount: isRTL ? 'المبلغ' : 'Amount',
    discount: isRTL ? 'الخصم' : 'Discount',
    total: isRTL ? 'المجموع' : 'Total',
    notApplicable: '—',
    addons: isRTL ? 'الإضافات' : 'Add-ons',
    addonsDetails: isRTL ? 'تفاصيل الإضافات' : 'Add-ons Details',
    selectAddons: isRTL ? 'اختر الإضافات' : 'Select add-ons',
    selectItemFirst: isRTL ? 'اختر العنصر أولاً' : 'Select item first',
    noAddonsSelected: isRTL ? 'لا توجد إضافات مختارة' : 'No add-ons selected',
    noAddonsForItem: isRTL ? 'لا توجد إضافات لهذا العنصر' : 'No add-ons for this item',
    addonsAmount: isRTL ? 'مبلغ الإضافات' : 'Add-ons Amount',
    addonPeriod: isRTL ? 'الفترة' : 'Period',
    addonQty: isRTL ? 'الكمية' : 'Qty',
    addonPrice: isRTL ? 'السعر' : 'Price',
    addonTotal: isRTL ? 'الإجمالي' : 'Total',
  }
}
