import { COUNTRY_CODES } from '@hooks/usePhoneValidation'

export function isMobileMaskEnabled(crmSettings) {
  const mask = crmSettings?.maskMobileNumber
  if (typeof mask === 'boolean') return mask

  const legacyShowFull = crmSettings?.showMobileNumber
  if (typeof legacyShowFull === 'boolean') return !legacyShowFull

  return true
}

export function getDefaultDialCode(crmSettings, fallbackDialCode = '+20') {
  const raw = String(crmSettings?.defaultCountryCode || '').trim()
  if (!raw) return fallbackDialCode
  if (raw.startsWith('+') || raw.startsWith('00')) return raw
  const found = COUNTRY_CODES.find(c => String(c.iso2).toUpperCase() === raw.toUpperCase())
  return found?.dialCode || fallbackDialCode
}

