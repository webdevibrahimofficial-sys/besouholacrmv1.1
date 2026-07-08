import axios from 'axios'
import { api } from '@utils/api'

export const impersonationApi = {
  quickSwitchTenants(params = {}) {
    return api.get('/api/super-admin/tenants/quick-switch', { params })
  },
  start(tenantId, payload = {}) {
    return api.post(`/api/super-admin/tenants/${tenantId}/impersonation`, payload)
  },
  currentSystem() {
    return api.get('/api/super-admin/impersonation/current', { skipAuthRedirect: true })
  },
  exitSystem() {
    return api.delete('/api/super-admin/impersonation/current', { skipAuthRedirect: true })
  },
  exchange(token) {
    return axios.post('/api/impersonation/exchange', { token }, {
      baseURL: api.defaults.baseURL,
      headers: { Accept: 'application/json' },
    })
  },
  currentTenant() {
    return api.get('/api/impersonation/current', { skipAuthRedirect: true })
  },
  exitTenant() {
    return api.delete('/api/impersonation/current', { skipAuthRedirect: true })
  },
}
