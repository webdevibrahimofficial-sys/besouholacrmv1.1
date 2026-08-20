/**
 * Build a display address from customer / document fields.
 * Customers store the street line as `address` (API) or `addressLine` (UI).
 */
export function buildCustomerAddress(source) {
  if (!source || typeof source !== 'object') return ''

  const streetCandidates = [
    source.customerAddress,
    source.customer_address,
    source.addressLine1,
    source.address_line1,
    source.addressLine,
    source.address_line,
    source.address,
  ]

  const street = streetCandidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || ''

  const parts = [
    street,
    source.city,
    source.state,
    source.country,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  // De-dupe while preserving order (e.g. city repeated in address line)
  const unique = []
  for (const part of parts) {
    if (!unique.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      unique.push(part)
    }
  }

  return unique.join(', ')
}

function customerMatchKeys(customer) {
  if (!customer || typeof customer !== 'object') return []
  return [
    customer.id,
    customer.customer_id,
    customer.customerId,
    customer.customer_code,
    customer.customerCode,
    customer.code,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

/**
 * Resolve address for quotation / order / invoice previews.
 * Prefer embedded document address, then nested customer, then customers list lookup.
 */
export function resolveDocumentCustomerAddress(document, customers = []) {
  if (!document || typeof document !== 'object') return ''

  const fromDocument = buildCustomerAddress(document)
  if (fromDocument) return fromDocument

  const nestedCustomer = document.customer
  const fromNested = buildCustomerAddress(nestedCustomer)
  if (fromNested) return fromNested

  if (!Array.isArray(customers) || customers.length === 0) return ''

  const lookupKeys = [
    document.customerCode,
    document.customer_code,
    document.customerId,
    document.customer_id,
    nestedCustomer?.id,
    nestedCustomer?.customer_code,
    nestedCustomer?.customerCode,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)

  if (lookupKeys.length === 0) return ''

  const matched = customers.find((customer) => {
    const keys = customerMatchKeys(customer)
    return lookupKeys.some((key) => keys.includes(key))
  })

  return buildCustomerAddress(matched)
}
