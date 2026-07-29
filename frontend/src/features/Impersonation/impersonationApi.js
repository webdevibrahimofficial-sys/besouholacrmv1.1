import { api } from '@utils/api'

export const impersonationApi = {
  quickSwitchTenants(params = {}) {
    return api.get('/api/super-admin/tenants/quick-switch', { params })
  },
  start(tenantId, payload = {}) {
    return api.post(`/api/super-admin/tenants/${tenantId}/impersonation`, payload)
  },
  currentSystem() {
    return api.get('/api/super-admin/impersonation/current', {
      skipAuthRedirect: true,
      suppressErrorStatuses: [403],
    })
  },
  exitSystem() {
    return api.delete('/api/super-admin/impersonation/current', {
      skipAuthRedirect: true,
      suppressErrorStatuses: [403],
    })
  },
  exchange(token) {
    return api.post('/api/impersonation/exchange', { token }, { skipAuthRedirect: true })
  },
  currentTenant() {
    return api.get('/api/impersonation/current', {
      skipAuthRedirect: true,
      suppressErrorStatuses: [403],
    })
  },
  exitTenant() {
    return api.delete('/api/impersonation/current', {
      skipAuthRedirect: true,
      suppressErrorStatuses: [403],
    })
  },
}
