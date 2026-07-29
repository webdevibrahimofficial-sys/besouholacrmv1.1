export function extractTenantCompanyProfile(rawTenant) {
  const tenant = rawTenant || {}
  const profile = tenant.profile || {}
  const metaData = tenant.meta_data || {}

  const addressLine1 = String(tenant.address_line_1 || '').trim()
  const addressLine2 = String(tenant.address_line_2 || '').trim()
  const city = String(tenant.city || '').trim()
  const state = String(tenant.state || '').trim()
  const country = String(tenant.country || '').trim()

  return {
    name: String(tenant.name || tenant.company_name || '').trim(),
    description: String(profile.description || '').trim(),
    logoUrl: String(profile.logo_url || tenant.logo_url || '').trim(),
    phone: String(profile.phone || tenant.phone || '').trim(),
    email: String(profile.email || metaData.email || tenant.email || '').trim(),
    taxId: String(profile.tax_id || tenant.tax_id || '').trim(),
    websiteUrl: String(tenant.website_url || profile.website_url || '').trim(),
    addressLine1,
    addressLine2,
    city,
    state,
    country,
    addrLines: [addressLine1, addressLine2].filter(Boolean),
    cityLine: [city, state, country].filter(Boolean).join(', '),
  }
}
