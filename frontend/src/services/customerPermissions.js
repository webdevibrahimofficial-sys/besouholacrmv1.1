import { isSuperAdminUser, isTenantAdminUser } from './leadPermissions'

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

const userRoles = (user) => {
  const roles = [normalizeRole(user?.role), normalizeRole(user?.job_title)]
  if (Array.isArray(user?.roles)) {
    user.roles.forEach((role) => roles.push(normalizeRole(role?.name || role)))
  }
  return roles.filter(Boolean)
}

const DELETE_CUSTOMER_ROLES = new Set(['director', 'operation manager', 'operations manager'])

export function canHoldDeleteCustomerPermission(user) {
  return userRoles(user).some((role) => DELETE_CUSTOMER_ROLES.has(role))
}

export function hasDeleteCustomerPermission(user) {
  const perms = user?.meta_data?.module_permissions?.Customers
  return Array.isArray(perms) && perms.includes('deleteCustomer')
}

export function canAccessCustomerRecycle(user) {
  if (!user) return false
  if (isSuperAdminUser(user) || isTenantAdminUser(user)) return true
  return canHoldDeleteCustomerPermission(user) && hasDeleteCustomerPermission(user)
}

export function canForceDeleteCustomer(user) {
  if (!user) return false
  return isSuperAdminUser(user) || isTenantAdminUser(user)
}
