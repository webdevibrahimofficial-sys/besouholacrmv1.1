import {
  hasActiveImpersonation,
  isSuperAdminUser,
  isSystemAdminContext,
  resolvePostLoginPath,
  shouldUseAdminPanel,
  shouldUseTenantWorkspace,
} from './authRouting'

describe('authRouting', () => {
  const superAdmin = { is_super_admin: true }
  const tenantUser = { is_super_admin: false }

  test('identifies super admin users', () => {
    expect(isSuperAdminUser(superAdmin)).toBe(true)
    expect(isSuperAdminUser(tenantUser)).toBe(false)
  })

  test('detects system admin from subscription plan and permissions', () => {
    expect(isSystemAdminContext({ is_super_admin: false }, { subscriptionPlan: 'super_admin' })).toBe(true)
    expect(isSystemAdminContext({ is_super_admin: false }, { permissions: ['system.tenants.impersonate'] })).toBe(true)
    expect(isSystemAdminContext({ is_super_admin: false }, { panelMode: 'system' })).toBe(true)
    expect(isSystemAdminContext({ is_super_admin: true }, { panelMode: 'tenant' })).toBe(false)
  })

  test('panel_mode from API drives routing decisions', () => {
    const superAdmin = { is_super_admin: true }
    expect(shouldUseAdminPanel(superAdmin, null, { panelMode: 'system' })).toBe(true)
    expect(shouldUseAdminPanel(superAdmin, { active: true }, { panelMode: 'tenant' })).toBe(false)
    expect(shouldUseTenantWorkspace(superAdmin, null, { panelMode: 'tenant' })).toBe(true)
  })

  test('normal super admin login uses admin panel', () => {
    expect(shouldUseAdminPanel(superAdmin, null)).toBe(true)
    expect(shouldUseTenantWorkspace(superAdmin, null)).toBe(false)
  })

  test('super admin with active impersonation uses tenant workspace', () => {
    const impersonation = { active: true, session_id: 1 }
    expect(shouldUseAdminPanel(superAdmin, impersonation)).toBe(false)
    expect(shouldUseTenantWorkspace(superAdmin, impersonation)).toBe(true)
    expect(hasActiveImpersonation(impersonation)).toBe(true)
  })

  test('regular tenant users always use tenant workspace', () => {
    expect(shouldUseAdminPanel(tenantUser, null)).toBe(false)
    expect(shouldUseTenantWorkspace(tenantUser, null)).toBe(true)
  })

  test('resolvePostLoginPath returns dashboard routes', () => {
    expect(resolvePostLoginPath(superAdmin, null)).toBe('/system/dashboard')
    expect(resolvePostLoginPath(tenantUser, null)).toBe('/dashboard')
    expect(resolvePostLoginPath(superAdmin, { active: true })).toBe('/dashboard')
  })
})
