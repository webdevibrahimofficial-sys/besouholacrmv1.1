export function hasActiveImpersonation(impersonation) {
  return !!impersonation?.active
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
