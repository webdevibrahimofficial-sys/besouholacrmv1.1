/**
 * Map lead geo fields onto customer create payload.
 * Leads store free-text address in `location` (not `address`).
 * Older data sometimes put the country name in `location` — skip that as address.
 */
export function pickLeadAddressFields(lead) {
  if (!lead || typeof lead !== 'object') {
    return { country: '', city: '', addressLine: '' }
  }

  const meta =
    lead.meta_data && typeof lead.meta_data === 'object'
      ? lead.meta_data
      : lead.metaData && typeof lead.metaData === 'object'
        ? lead.metaData
        : {}

  const custom =
    lead.custom_fields && typeof lead.custom_fields === 'object'
      ? lead.custom_fields
      : lead.customFields && typeof lead.customFields === 'object'
        ? lead.customFields
        : {}

  const countryRaw =
    lead.country?.name ??
    lead.country_name ??
    lead.countryName ??
    lead.country ??
    meta.country ??
    custom.country ??
    ''
  const country = String(countryRaw || '').trim()
  const city = String(lead.city ?? meta.city ?? custom.city ?? '').trim()

  const explicitAddress = String(
    lead.address ?? lead.addressLine ?? meta.address ?? custom.address ?? ''
  ).trim()
  const location = String(lead.location ?? '').trim()

  let addressLine = explicitAddress
  if (!addressLine && location && location.toLowerCase() !== country.toLowerCase()) {
    addressLine = location
  }

  return { country, city, addressLine }
}
