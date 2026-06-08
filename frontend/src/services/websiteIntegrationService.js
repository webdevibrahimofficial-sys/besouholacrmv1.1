import { api } from '@utils/api'

const normalizeCollection = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const parseOriginsInput = (value) => {
  if (!value) return []
  return Array.from(
    new Set(
      String(value)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

const isValidOrigin = (value) => {
  if (!value) return false
  try {
    const url = new URL(String(value).trim())
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname
  } catch {
    return false
  }
}

export const websiteIntegrationService = {
  parseOriginsInput,

  validateOriginsInput(value) {
    const parsedOrigins = parseOriginsInput(value)
    const invalidOrigins = parsedOrigins.filter((origin) => !isValidOrigin(origin))

    return {
      parsedOrigins,
      invalidOrigins,
      isValid: invalidOrigins.length === 0,
    }
  },

  async listConnections() {
    const res = await api.get('/api/website-connections')
    return normalizeCollection(res.data)
  },

  async createConnection(payload) {
    const res = await api.post('/api/website-connections', {
      ...payload,
      allowed_origins: parseOriginsInput(payload.allowed_origins),
    })
    return res.data
  },

  async updateConnection(id, payload) {
    const res = await api.put(`/api/website-connections/${id}`, {
      ...payload,
      allowed_origins: parseOriginsInput(payload.allowed_origins),
    })
    return res.data
  },

  async deleteConnection(id) {
    await api.delete(`/api/website-connections/${id}`)
  },

  async regenerateKey(id) {
    const res = await api.post(`/api/website-connections/${id}/regenerate-key`)
    return res.data
  },

  async getStats(id) {
    const res = await api.get(`/api/website-connections/${id}/stats`)
    return res.data
  },

  async getLogs(params = {}) {
    const res = await api.get('/api/website-intake-logs', { params })
    return res.data
  },

  async getCampaigns() {
    const res = await api.get('/api/campaigns')
    return normalizeCollection(res.data)
  },

  async getSources() {
    const res = await api.get('/api/sources?active=1')
    return normalizeCollection(res.data)
  },

  buildSnippet({ apiKey }) {
    if (!apiKey) return ''

    const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || window.location.origin).trim()
    const endpointBase = rawApiBase.replace(/\/+$/, '').replace(/\/api$/, '')
    const endpoint = `${endpointBase}/api/intake/website/${apiKey || 'YOUR_API_KEY'}`

    return `<form id="website-lead-form">
  <input name="name" placeholder="Name" />
  <input name="phone" placeholder="Phone" />
  <input name="email" placeholder="Email" />
  <textarea name="message" placeholder="Message"></textarea>
  <button type="submit">Send</button>
</form>
<script>
document.getElementById('website-lead-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = e.currentTarget;
  const callbacks = window.websiteLeadFormCallbacks || {};
  const payload = {
    name: form.name.value,
    phone: form.phone.value,
    email: form.email.value,
    message: form.message.value,
    source: 'website-form',
    meta: {
      form_name: 'Website Lead Form',
      page_url: window.location.href,
      utm_source: new URLSearchParams(window.location.search).get('utm_source'),
      utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
      utm_medium: new URLSearchParams(window.location.search).get('utm_medium')
    }
  };

  try {
    const response = await fetch('${endpoint}', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': window.location.origin
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      callbacks.onError?.(data, response);
      return;
    }

    callbacks.onSuccess?.(data, response);
    form.reset();
  } catch (error) {
    callbacks.onError?.({ message: error?.message || 'Network error' }, null);
  }
});
</script>`
  },
}
