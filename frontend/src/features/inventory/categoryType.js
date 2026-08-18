export const CATEGORY_TYPE_PRODUCTS = 'Products'
export const CATEGORY_TYPE_SERVICES = 'Services'

export const CATEGORY_TYPE_OPTIONS = [CATEGORY_TYPE_PRODUCTS, CATEGORY_TYPE_SERVICES]

export function normalizeCategoryType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['service', 'services', 'subscription', 'package'].includes(normalized)) {
    return CATEGORY_TYPE_SERVICES
  }
  if (['product', 'products'].includes(normalized)) {
    return CATEGORY_TYPE_PRODUCTS
  }
  return ''
}

export function isServiceCategoryType(value) {
  return normalizeCategoryType(value) === CATEGORY_TYPE_SERVICES
}

export function categoryTypeFromRecord(record) {
  if (!record || typeof record !== 'object') return ''
  return normalizeCategoryType(
    record.category_type
    || record.applies_to
    || record.appliesTo
    || record.type
    || record.business_type
  )
}
