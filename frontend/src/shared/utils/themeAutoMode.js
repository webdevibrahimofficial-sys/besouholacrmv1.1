/** Auto theme: light during day, dark at night (CRM timezone). */
export const AUTO_DARK_START_HOUR = 18 // 6 PM
export const AUTO_DARK_END_HOUR = 6    // 6 AM
export const DEFAULT_CRM_TIMEZONE = 'Africa/Cairo'

export function getHourInTimezone(timezone, date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })
    return Number(formatter.format(date))
  } catch {
    return date.getHours()
  }
}

export function isNightHour(
  hour,
  darkStart = AUTO_DARK_START_HOUR,
  darkEnd = AUTO_DARK_END_HOUR,
) {
  return hour >= darkStart || hour < darkEnd
}

export function getStoredCrmTimeZone() {
  try {
    const prefs = JSON.parse(localStorage.getItem('systemPrefs') || '{}')
    if (prefs?.crmTimeZone) return prefs.crmTimeZone
  } catch {}
  return null
}

export function persistCrmTimeZone(timezone) {
  if (!timezone) return
  try {
    const prefsRaw = localStorage.getItem('systemPrefs')
    const prefs = prefsRaw ? JSON.parse(prefsRaw) : {}
    prefs.crmTimeZone = timezone
    localStorage.setItem('systemPrefs', JSON.stringify(prefs))
  } catch {}
}

export function resolveAutoModeByTime(timezone) {
  const tz = timezone || getStoredCrmTimeZone() || DEFAULT_CRM_TIMEZONE
  const hour = getHourInTimezone(tz)
  return isNightHour(hour) ? 'dark' : 'light'
}
