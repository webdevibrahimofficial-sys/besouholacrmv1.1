export function getCrmTimeZone(crmSettings, fallback = 'Africa/Cairo') {
  return crmSettings?.timeZone || crmSettings?.time_zone || fallback
}

export function isCrmHour12(crmSettings) {
  const tf = String(crmSettings?.timeFormat || crmSettings?.time_format || '').toLowerCase().trim()
  if (tf === '24h') return false
  if (tf === '12h') return true
  return false
}

export function formatCrmDateYMD(isoString, { crmSettings } = {}) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const timeZone = getCrmTimeZone(crmSettings)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return ''
  }
}

export function formatCrmDateTime(isoString, { crmSettings, language } = {}) {
  if (!isoString) return '-'
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return String(isoString)

  const locale = String(language || '').toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-GB'
  const timeZone = getCrmTimeZone(crmSettings)
  const hour12 = isCrmHour12(crmSettings)

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    }).format(d)
  } catch {
    return String(isoString)
  }
}

export function formatCrmDate(isoString, { crmSettings, language } = {}) {
  if (!isoString) return '-'
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return String(isoString)

  const locale = String(language || '').toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-US'
  const timeZone = getCrmTimeZone(crmSettings)
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return String(isoString)
  }
}

export function formatCrmTime(isoString, { crmSettings, language } = {}) {
  if (!isoString) return '-'
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return '-'

  const locale = String(language || '').toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-US'
  const timeZone = getCrmTimeZone(crmSettings)
  const hour12 = isCrmHour12(crmSettings)
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12 }).format(d)
  } catch {
    return '-'
  }
}

export function formatUiDateTime(isoString, opts = {}) {
  return formatCrmDateTime(isoString, opts)
}

