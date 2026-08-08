
import { api } from '@utils/api'

const serverURL = import.meta.env.VITE_SERVER_URL || 'http://crm.test:8000'

const buildWebhookVerificationUrl = (token, webhookUrl) => {
  const fallbackUrl = `${serverURL}/api/meta/webhook`
  const targetUrl = webhookUrl || fallbackUrl
  const url = new URL(targetUrl, window.location.origin)

  url.searchParams.set('hub.mode', 'subscribe')
  url.searchParams.set('hub.verify_token', token || '')
  url.searchParams.set('hub.challenge', 'TEST')

  return url.toString()
}

export const metaService = {
  // Local Storage Management (Keep for fallback/cache if needed, but primary is API)
  loadSettings: async (agencyId = null) => {
    try {
      const params = agencyId ? { agency_id: agencyId } : {}
      const res = await api.get('/api/auth/meta/status', { params })
      return res.data
    } catch {
      return {}
    }
  },

  saveSettings: async (settings) => {
    try {
      // For multi-account, we might not have a single settings endpoint anymore
      // or we use it for global settings like fieldMap/autoSync
      const payload = {
        settings: {
          events: settings.events,
          enableCapi: settings.enableCapi,
          autoSync: settings.autoSync,
          fieldMap: settings.fieldMap
        }
      }
      await api.post('/api/auth/meta/settings', payload)
    } catch (e) {
      console.error("Failed to save meta settings", e)
    }
  },

  disconnectConnection: async (connectionId) => {
    try {
      await api.post('/api/auth/meta/disconnect', { connection_id: connectionId })
    } catch (e) {
      console.error("Failed to disconnect meta connection", e)
      throw e
    }
  },

  resetSettings: async () => {
    try {
      await api.post('/api/auth/meta/disconnect')
    } catch (e) {
      console.error("Failed to reset meta settings", e)
      throw e
    }
  },

  // Auth Helpers
  connectMeta: async (agencyId = null) => {
    try {
      localStorage.setItem('pending_integration_provider', 'meta')
      if (agencyId) {
        localStorage.setItem('pending_meta_agency_id', agencyId)
      } else {
        localStorage.removeItem('pending_meta_agency_id')
      }
      const params = agencyId ? { agency_id: agencyId } : {}
      const res = await api.get('/api/auth/meta/redirect', { params })
      if (res.data && res.data.url) {
        window.location.href = res.data.url
      }
    } catch (e) {
      console.error("Failed to get meta redirect url", e)
      localStorage.removeItem('pending_integration_provider')
      throw e
    }
  },

  handleCallback: async (code) => {
    try {
      const res = await api.post('/api/auth/meta/callback', { code })
      return res.data
    } catch (e) {
      console.error("Failed to handle meta callback", e)
      throw e
    }
  },

  toggleAsset: async (type, id, isActive) => {
    try {
      const res = await api.post('/api/auth/meta/asset/toggle', { type, id, is_active: isActive })
      return res.data
    } catch (e) {
      console.error("Failed to toggle asset", e)
      throw e
    }
  },

  linkPage: async (pageId, adAccountId) => {
    try {
      const res = await api.post('/api/auth/meta/page/link', { page_id: pageId, ad_account_id: adAccountId })
      return res.data
    } catch (e) {
      console.error("Failed to link page", e)
      throw e
    }
  },

  deleteAsset: async (type, id) => {
    try {
      const res = await api.post('/api/auth/meta/asset/delete', { type, id })
      return res.data
    } catch (e) {
      console.error("Failed to delete asset", e)
      throw e
    }
  },

  // Simulation & Testing
  simulatePixelEvent: (settings, events, enableCapi) => {
    return {
      pixel_id: settings.pixelId || 'PIXEL_ID',
      event_name: Object.keys(events).find(k => events[k]) || 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: window.location.href,
      action_source: enableCapi ? 'website+capi' : 'website',
      user_data: { email: 'lead@example.com', phone: '+201234567890' },
      custom_data: { value: 0, currency: 'USD' }
    }
  },

  sendCapiTest: async (payload) => {
    const res = await api.post(`/api/meta/capi/test`, payload)
    return res.data
  },

  loadLeadForms: async (agencyId = null) => {
    const params = agencyId ? { agency_id: agencyId } : {}
    const res = await api.get('/api/auth/meta/forms', { params })
    return res.data
  },

  saveFormMapping: async (formId, mapping) => {
    const res = await api.post('/api/auth/meta/forms/map', { form_id: formId, mapping })
    return res.data
  },

  suggestFormMapping: async (formId, agencyId = null) => {
    const params = agencyId ? { agency_id: agencyId } : {}
    const res = await api.get(`/api/auth/meta/forms/${formId}/suggest-mapping`, { params })
    return res.data
  },

  testWebhook: async () => {
    const res = await api.post('/api/auth/meta/test-webhook')
    return res.data
  },

  loadTenantHealth: async () => {
    const res = await api.get('/api/auth/meta/health')
    return res.data
  },

  getMetaApp: async () => {
    const res = await api.get('/api/auth/meta/app')
    return res.data
  },

  saveMetaApp: async (payload) => {
    const res = await api.put('/api/auth/meta/app', payload)
    return res.data
  },

  resetMetaApp: async () => {
    const res = await api.delete('/api/auth/meta/app')
    return res.data
  },

  verifyWebhook: async (token, webhookUrl) => {
    const url = buildWebhookVerificationUrl(token, webhookUrl)
    const r = await api.get(url)
    return { ok: r.status === 200, text: r.data }
  },

  defaultCallback: null
}
