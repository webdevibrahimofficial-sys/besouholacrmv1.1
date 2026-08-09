export function getCrmTimeZone(crmSettings, fallback = 'Africa/Cairo') {
  return crmSettings?.timeZone || crmSettings?.time_zone || fallback
}

export function isCrmHour12(crmSettings) {
  const tf = String(crmSettings?.timeFormat || crmSettings?.time_format || '').toLowerCase().trim()
  if (tf === '24h') return false
  if (tf === '12h') return true
  return false
}

export function getCrmDateFormat(crmSettings, fallback = 'DD/MM/YYYY') {
  const raw = String(crmSettings?.dateFormat || crmSettings?.date_format || fallback)
    .toUpperCase()
    .trim()
  if (raw === 'MM/DD/YYYY' || raw === 'YYYY-MM-DD' || raw === 'DD/MM/YYYY') {
    return raw
  }
  return fallback
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function formatPartsByCrmDateFormat(parts, dateFormat = 'DD/MM/YYYY') {
  const year = String(parts?.year ?? '')
  const month = pad2(parts?.month ?? '')
  const day = pad2(parts?.day ?? '')
  if (!year || month === 'NaN' || day === 'NaN') return ''

  const fmt = String(dateFormat || 'DD/MM/YYYY').toUpperCase()
  if (fmt === 'MM/DD/YYYY') return `${month}/${day}/${year}`
  if (fmt === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return `${day}/${month}/${year}`
}

function readFormatPart(parts, type) {
  const hit = parts.find((part) => part.type === type)
  return hit ? hit.value : ''
}

export function getZonedDateTimeParts(isoString, timeZone) {
  if (!isoString) return null
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return null

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)

    return {
      year: readFormatPart(parts, 'year'),
      month: readFormatPart(parts, 'month'),
      day: readFormatPart(parts, 'day'),
      hour: readFormatPart(parts, 'hour'),
      minute: readFormatPart(parts, 'minute'),
    }
  } catch {
    return null
  }
}

function parseCalendarDateParts(dateRaw) {
  const value = String(dateRaw || '').trim()
  if (!value) return null

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return {
      year: iso[1],
      month: iso[2],
      day: iso[3],
    }
  }

  const slash = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (slash) {
    // Ambiguous without settings; prefer day-first when day > 12.
    let day = Number(slash[1])
    let month = Number(slash[2])
    const year = slash[3]
    if (day <= 12 && month > 12) {
      ;[day, month] = [month, day]
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        year,
        month: pad2(month),
        day: pad2(day),
      }
    }
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return {
    year: String(parsed.getFullYear()),
    month: pad2(parsed.getMonth() + 1),
    day: pad2(parsed.getDate()),
  }
}

function parseClockParts(timeRaw) {
  const value = String(timeRaw || '').trim()
  if (!value) return null
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const meridiem = String(match[3] || '').toLowerCase()
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  return { hour, minute }
}

export function formatCrmClockTime(timeRaw, { crmSettings } = {}) {
  const parts = parseClockParts(timeRaw)
  if (!parts) return ''

  const hour12 = isCrmHour12(crmSettings)
  if (!hour12) {
    return `${pad2(parts.hour)}:${pad2(parts.minute)}`
  }

  const meridiem = parts.hour >= 12 ? 'PM' : 'AM'
  let hour = parts.hour % 12
  if (hour === 0) hour = 12
  return `${hour}:${pad2(parts.minute)} ${meridiem}`
}

export function formatCrmCalendarDate(dateRaw, { crmSettings } = {}) {
  const parts = parseCalendarDateParts(dateRaw)
  if (!parts) return ''
  return formatPartsByCrmDateFormat(parts, getCrmDateFormat(crmSettings))
}

export function formatCrmCalendarDateTime(dateRaw, timeRaw, { crmSettings } = {}) {
  const date = formatCrmCalendarDate(dateRaw, { crmSettings })
  if (!date) return ''
  const time = formatCrmClockTime(timeRaw, { crmSettings })
  return time ? `${date}, ${time}` : date
}

export function formatCrmDateYMD(isoString, { crmSettings } = {}) {
  if (!isoString) return ''
  const parts = getZonedDateTimeParts(isoString, getCrmTimeZone(crmSettings))
  if (!parts) return ''
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

export function formatCrmDate(isoString, { crmSettings } = {}) {
  if (!isoString) return '-'
  const parts = getZonedDateTimeParts(isoString, getCrmTimeZone(crmSettings))
  if (!parts) return String(isoString)
  return formatPartsByCrmDateFormat(parts, getCrmDateFormat(crmSettings)) || String(isoString)
}

export function formatCrmTime(isoString, { crmSettings } = {}) {
  if (!isoString) return '-'
  const parts = getZonedDateTimeParts(isoString, getCrmTimeZone(crmSettings))
  if (!parts) return '-'
  return formatCrmClockTime(`${parts.hour}:${parts.minute}`, { crmSettings }) || '-'
}

export function formatCrmDateTime(isoString, { crmSettings } = {}) {
  if (!isoString) return '-'
  const parts = getZonedDateTimeParts(isoString, getCrmTimeZone(crmSettings))
  if (!parts) return String(isoString)

  const date = formatPartsByCrmDateFormat(parts, getCrmDateFormat(crmSettings))
  const time = formatCrmClockTime(`${parts.hour}:${parts.minute}`, { crmSettings })
  if (!date) return String(isoString)
  return time ? `${date}, ${time}` : date
}

export function formatUiDateTime(isoString, opts = {}) {
  return formatCrmDateTime(isoString, opts)
}
