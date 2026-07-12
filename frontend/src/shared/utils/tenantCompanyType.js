export function normalizeTenantCompanyType(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (!normalized) continue

    const lower = normalized.toLowerCase().replace(/[_-]+/g, ' ')
    if (lower.includes('real')) return 'realestate'
    if (lower.includes('general')) return 'general'
  }

  return 'general'
}

export function isRealEstateCompanyType(...values) {
  return normalizeTenantCompanyType(...values) === 'realestate'
}

export function resolveTenantCompanyTypeSources(company, crmSettings) {
  return [
    company?.company_type,
    company?.companyType,
    company?.type,
    crmSettings?.company_type,
    crmSettings?.companyType,
  ]
}
