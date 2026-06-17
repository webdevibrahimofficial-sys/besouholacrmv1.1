import { COUNTRY_CODES } from '@hooks/usePhoneValidation'

const getCountryByCode = (code) => {
  const raw = String(code || '').trim()
  if (!raw) return null
  const normalized = raw.startsWith('00') ? `+${raw.slice(2)}` : raw
  return COUNTRY_CODES.find((country) =>
    country.dialCode === normalized ||
    String(country.iso2 || '').toUpperCase() === raw.toUpperCase()
  ) || null
}

const splitConcatenatedLocalNumbers = (segment, defaultCountryCode) => {
  const s = String(segment || '').trim()
  const country = getCountryByCode(defaultCountryCode)
  if (!country) return [s]

  const digits = s.replace(/[^0-9]/g, '')
  if (!digits || (digits.length === s.length && digits.length <= country.maxLen)) return [s]

  if (country.iso2 === 'EG' && digits.length > 11 && digits.length % 11 === 0) {
    const chunks = digits.match(/.{11}/g) || []
    if (chunks.length > 1 && chunks.every((chunk) => /^01[0125][0-9]{8}$/.test(chunk))) {
      return chunks
    }
  }

  return [s]
}

const splitPhoneSegments = (value, defaultCountryCode = '+20') => {
  const raw = String(value || '').trim()
  if (!raw) return []

  const leadingCountryMatch = raw.match(/^([A-Za-z]{2})\s+(.+)$/)
  const countryAwareRaw = leadingCountryMatch && getCountryByCode(leadingCountryMatch[1])
    ? leadingCountryMatch[2]
    : raw

  return countryAwareRaw
    .split(/[\/,;|\n\r]+/)
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .flatMap((segment) => splitConcatenatedLocalNumbers(segment, defaultCountryCode))
}

const stripMetaSuffix = (segment) => {
  const s = String(segment || '').trim()
  if (!s) return ''
  const parts = s.split('_')
  if (parts.length < 2) return s
  const last = parts[parts.length - 1]
  if (/^\d{6,}$/.test(String(last || ''))) {
    return parts.slice(0, -1).join('_').trim()
  }
  return s
}

const normalizeCountryCode = (code) => {
  const raw = String(code || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return raw
  if (raw.startsWith('00')) return '+' + raw.slice(2)
  const country = getCountryByCode(raw)
  if (country?.dialCode) return country.dialCode
  if (/^\d+$/.test(raw)) return '+' + raw
  return raw
}

const getCountryDigits = (code) => {
  const c = normalizeCountryCode(code)
  const digits = String(c).replace(/[^0-9]/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) return digits.slice(2)
  return digits
}

const stripEgyptTrunkZero = (digits, defaultCountryCode) => {
  const cc = getCountryDigits(defaultCountryCode)
  const raw = String(digits || '').replace(/[^0-9]/g, '')
  if (cc === '20') {
    if (raw.startsWith('20') && raw.length > 2 && raw[2] === '0') {
      return `20${raw.slice(3)}`
    }
    if (/^01[0125][0-9]{8}$/.test(raw)) {
      return raw.slice(1)
    }
  }
  return raw
}

const normalizeSegmentForDisplay = (segment, defaultCountryCode) => {
  const s0 = stripMetaSuffix(segment)
  const s = String(s0 || '').trim()
  if (!s) return ''

  const digits = String(s).replace(/[^0-9]/g, '')
  const cc = getCountryDigits(defaultCountryCode)
  if (s.startsWith('+') || s.startsWith('00')) {
    const intlDigits = stripEgyptTrunkZero(digits, defaultCountryCode)
    if (cc && intlDigits.startsWith(cc) && intlDigits.length >= cc.length + 7) {
      return `+${cc} ${intlDigits.slice(cc.length)}`
    }
    if (s.startsWith('00')) return `+${digits.replace(/^00/, '')}`
    return s
  }

  if (cc && digits.startsWith(cc) && digits.length >= cc.length + 7) {
    const localPart = stripEgyptTrunkZero(digits, defaultCountryCode).slice(cc.length)
    return `+${cc} ${localPart}`
  }

  const code = normalizeCountryCode(defaultCountryCode)
  if (!code) return s
  const normalizedLocal = stripEgyptTrunkZero(digits, defaultCountryCode) || s
  return `${code} ${normalizedLocal.replace(new RegExp(`^${cc}`), '').trim() || s}`
}

function maskDigits(digits) {
  const d = String(digits || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.length <= 3) return d
  return d.slice(0, 3) + '*'.repeat(Math.max(0, d.length - 3))
}

function maskSegment(segment) {
  const s = String(segment || '').trim()
  if (!s) return ''

  const tokens = s.split(/\s+/).filter(Boolean)
  const first = tokens[0] || ''
  const rest = tokens.slice(1).join(' ')

  if ((first.startsWith('+') || first.startsWith('00')) && rest) {
    return `${first} ${maskDigits(rest)}`
  }

  return maskDigits(s)
}

export const getPhoneDigits = (value, { defaultCountryCode = '+20' } = {}) => {
  const seg = splitPhoneSegments(value, defaultCountryCode)[0] || ''
  const normalized = normalizeSegmentForDisplay(seg, defaultCountryCode)
  if (!normalized) return ''

  let digits = String(normalized).replace(/[^0-9]/g, '')
  if (!digits) return ''
  if (String(normalized).trim().startsWith('00')) digits = digits.replace(/^00/, '')

  const cc = getCountryDigits(defaultCountryCode)
  if (cc && !String(normalized).trim().startsWith('+') && !String(normalized).trim().startsWith('00')) {
    const localDigits = String(stripMetaSuffix(seg)).replace(/[^0-9]/g, '')
    if (localDigits.startsWith('0')) return cc + localDigits.slice(1)
    return cc + localDigits
  }

  if (cc && String(normalized).trim().startsWith(`+${cc}`) && digits.startsWith(cc) && digits.length > cc.length && digits[cc.length] === '0') {
    return cc + digits.slice(cc.length + 1)
  }

  return digits
}

export const getPhoneLines = (value, { showFull = false, defaultCountryCode = '+20' } = {}) => {
  const segments = splitPhoneSegments(value, defaultCountryCode)
  return segments.map((seg) => {
    const normalized = normalizeSegmentForDisplay(seg, defaultCountryCode)
    const display = showFull ? normalized : maskSegment(normalized)
    const digits = getPhoneDigits(seg, { defaultCountryCode })
    return { display, digits }
  }).filter((x) => x.display)
}

export const maskPhoneForDisplay = (value) => {
  const segments = splitPhoneSegments(value)
  if (segments.length === 0) return ''
  return segments.map(maskSegment).join(' / ')
}

export const formatPhoneForDisplay = (value, { showFull = false, defaultCountryCode = '+20' } = {}) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const normalized = splitPhoneSegments(raw, defaultCountryCode).map((s) => normalizeSegmentForDisplay(s, defaultCountryCode)).filter(Boolean).join(' / ')
  if (showFull) return normalized
  return maskPhoneForDisplay(normalized)
}
