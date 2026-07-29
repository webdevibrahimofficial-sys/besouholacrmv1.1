export function persistAuthToken(token, { rememberMe = true } = {}) {
  if (!token || typeof window === 'undefined') return

  if (rememberMe) {
    window.localStorage.setItem('token', token)
    window.sessionStorage.removeItem('token')
  } else {
    window.sessionStorage.setItem('token', token)
    window.localStorage.removeItem('token')
  }

  try {
    const host = window.location.hostname
    const parts = host.split('.')
    if (parts[0] === 'www') parts.shift()
    const domain = parts.includes('localhost')
      ? '.localhost'
      : (parts.length > 1 ? '.' + parts.slice(-2).join('.') : '')
    if (domain) {
      const maxAge = rememberMe ? 7 * 24 * 60 * 60 : ''
      document.cookie = `token=${encodeURIComponent(token)};path=/;domain=${domain};${maxAge ? `max-age=${maxAge};` : ''}SameSite=Lax`
    }
  } catch {
    // ignore cookie errors
  }
}

export function clearImpersonationHints() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('impersonateTenantSlug')
  window.sessionStorage.removeItem('impersonation_bootstrap')
}
