export function hasActiveImpersonation(impersonation) {
  return !!impersonation?.active
}

function normalizeRole(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isTelesalesOnlyUser(subject) {
  const user = subject?.user ?? subject
  const role = normalizeRole(user?.role || user?.job_title)
  return ['telesales agent', 'telesales team leader', 'telesales manager'].includes(role)
}

function resolvePanelMode(subject, options = {}) {
  return options.panelMode ?? subject?.panelMode ?? subject?.panel_mode ?? null
}

function resolveIsSystemAdminFlag(subject, options = {}) {
  const explicit = options.isSystemAdmin ?? subject?.isSystemAdmin ?? subject?.is_system_admin
  if (explicit === true) return true
  if (explicit === false) return false
  return null
}

export function isSystemAdminContext(subject, options = {}) {
  const panelMode = resolvePanelMode(subject, options)
  if (panelMode === 'system') return true
  if (panelMode === 'tenant') return false

  const explicitSystemAdmin = resolveIsSystemAdminFlag(subject, options)
  if (explicitSystemAdmin === true) return true
  if (explicitSystemAdmin === false) return false

  const user = subject?.user ?? subject
  const permissions = options.permissions ?? subject?.permissions ?? subject?.user_permissions ?? []
  const subscriptionPlan = options.subscriptionPlan ?? subject?.subscriptionPlan ?? subject?.subscription_plan ?? null

  if (user?.is_super_admin) return true
  if (String(subscriptionPlan || '').toLowerCase() === 'super_admin') return true
  if (Array.isArray(permissions) && permissions.some((permission) => String(permission).startsWith('system.'))) {
    return true
  }

  return false
}

export function isSuperAdminUser(user, options = {}) {
  return isSystemAdminContext(user, options)
}

/** Super admin panel — only when not in an active support-access session. */
export function shouldUseAdminPanel(subject, impersonation, options = {}) {
  const panelMode = resolvePanelMode(subject, options)
  if (hasActiveImpersonation(impersonation)) return false
  if (panelMode === 'system') return true
  if (panelMode === 'tenant') return false

  return isSystemAdminContext(subject, options)
}

/** Default post-login route for the authenticated user. */
export function resolvePostLoginPath(subject, impersonation, options = {}) {
  if (isTelesalesOnlyUser(subject)) {
    return '/telesales'
  }
  return shouldUseAdminPanel(subject, impersonation, options)
    ? '/system/dashboard'
    : '/dashboard'
}

export function resolveTenantHomePath(subject) {
  return isTelesalesOnlyUser(subject) ? '/telesales' : '/dashboard'
}

/** Navigate after login; HashRouter fallback if SPA routing does not commit. */
export function redirectAfterLogin(navigate, path) {
  const normalizedPath = String(path || '/dashboard').startsWith('/')
    ? String(path || '/dashboard')
    : `/${String(path || 'dashboard')}`
  const targetHash = `#${normalizedPath}`

  try {
    navigate(normalizedPath, { replace: true })
  } catch {}

  window.setTimeout(() => {
    const currentPath = (window.location.hash || '#/').replace(/^#/, '').split('?')[0] || '/'
    if (currentPath === '/login' || currentPath === '/') {
      const base = `${window.location.origin}${window.location.pathname}${window.location.search}`
      window.location.replace(`${base}${targetHash}`)
    }
  }, 0)
}

/** Tenant workspace — regular users, or super admin during support access. */
export function shouldUseTenantWorkspace(subject, impersonation, options = {}) {
  const user = subject?.user ?? subject
  if (!user) return false
  if (hasActiveImpersonation(impersonation)) return true

  const panelMode = resolvePanelMode(subject, options)
  if (panelMode === 'tenant') return true
  if (panelMode === 'system') return false

  return !isSystemAdminContext(subject, options)
}
