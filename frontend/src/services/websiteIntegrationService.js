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

const getWebsiteIntakeEndpoint = (apiKey) => {
  if (!apiKey) return ''

  const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || window.location.origin).trim()
  const endpointBase = rawApiBase.replace(/\/+$/, '').replace(/\/api$/, '')
  return `${endpointBase}/api/intake/website/${apiKey}`
}

const generateBasicJsSnippet = (apiKey) => {
  const endpoint = getWebsiteIntakeEndpoint(apiKey)
  if (!endpoint) return ''

  return `async function submitWebsiteLead(lead) {
  const payload = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    message: lead.message,
    meta: {
      ...(lead.meta || {}),
      page_url: window.location.href,
      submitted_from: 'website_snippet_basic_js'
    }
  };

  try {
    const response = await fetch('${endpoint}', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.websiteLeadFormCallbacks?.onError?.(data, response);
      return { ok: false, data, response };
    }

    window.websiteLeadFormCallbacks?.onSuccess?.(data, response);
    return { ok: true, data, response };
  } catch (error) {
    const failure = { message: error?.message || 'Network error' };
    window.websiteLeadFormCallbacks?.onError?.(failure, null);
    return { ok: false, data: failure, response: null };
  }
}

submitWebsiteLead({
  name: 'John Doe',
  phone: '+201000000000',
  email: 'john@example.com',
  message: 'I want more details about this project.',
  meta: {
    source: 'website',
    form_name: 'Landing Page Form'
  }
});`
}

const generateHtmlFormSnippet = (apiKey) => {
  const endpoint = getWebsiteIntakeEndpoint(apiKey)
  if (!endpoint) return ''

  return `<form id="website-lead-form">
  <input type="text" name="name" placeholder="Your name" required />
  <input type="tel" name="phone" placeholder="Phone number" required />
  <input type="email" name="email" placeholder="Email address" />
  <textarea name="message" placeholder="How can we help?"></textarea>
  <button type="submit">Send</button>
</form>

<p id="website-lead-status"></p>

<script>
  const form = document.getElementById('website-lead-form');
  const statusEl = document.getElementById('website-lead-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = 'Sending...';

    const payload = {
      name: form.name.value,
      phone: form.phone.value,
      email: form.email.value,
      message: form.message.value,
      meta: {
        source: 'website',
        form_name: 'HTML Embed Form',
        page_url: window.location.href
      }
    };

    try {
      const response = await fetch('${endpoint}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        statusEl.textContent = data.message || 'Submission failed.';
        window.websiteLeadFormCallbacks?.onError?.(data, response);
        return;
      }

      statusEl.textContent = 'Lead sent successfully.';
      form.reset();
      window.websiteLeadFormCallbacks?.onSuccess?.(data, response);
    } catch (error) {
      statusEl.textContent = error?.message || 'Network error.';
      window.websiteLeadFormCallbacks?.onError?.({ message: error?.message || 'Network error' }, null);
    }
  });
</script>`
}

const generateReactSnippet = (apiKey) => {
  const endpoint = getWebsiteIntakeEndpoint(apiKey)
  if (!endpoint) return ''

  return `import { useState } from 'react';

export default function WebsiteLeadForm() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleChange = (event) => {
    setForm((prev) => ({
      ...prev,
      [event.target.name]: event.target.value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('${endpoint}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          ...form,
          meta: {
            source: 'website',
            form_name: 'React Website Form',
            page_url: window.location.href
          }
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message || 'Failed to submit lead.');
        window.websiteLeadFormCallbacks?.onError?.(data, response);
        return;
      }

      setSuccess('Lead submitted successfully.');
      setForm({ name: '', phone: '', email: '', message: '' });
      window.websiteLeadFormCallbacks?.onSuccess?.(data, response);
    } catch (submitError) {
      setError(submitError?.message || 'Network error.');
      window.websiteLeadFormCallbacks?.onError?.({ message: submitError?.message || 'Network error' }, null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" value={form.name} onChange={handleChange} placeholder="Your name" required />
      <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone number" required />
      <input name="email" value={form.email} onChange={handleChange} placeholder="Email address" />
      <textarea name="message" value={form.message} onChange={handleChange} placeholder="Message" />
      <button type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Submit'}
      </button>
      {success ? <p>{success}</p> : null}
      {error ? <p>{error}</p> : null}
    </form>
  );
}`
}

const generateCurlSnippet = (apiKey) => {
  const endpoint = getWebsiteIntakeEndpoint(apiKey)
  if (!endpoint) return ''

  return `curl -X POST '${endpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json' \\
  -d '{
    "name": "John Doe",
    "phone": "+201000000000",
    "email": "john@example.com",
    "message": "Testing website intake endpoint",
    "meta": {
      "source": "postman",
      "form_name": "cURL Test",
      "page_url": "https://example.com/test"
    }
  }'`
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

  async testConnection(id) {
    const res = await api.post(`/api/website-connections/${id}/test`)
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

  generateBasicJsSnippet(apiKey) {
    return generateBasicJsSnippet(apiKey)
  },

  generateHtmlFormSnippet(apiKey) {
    return generateHtmlFormSnippet(apiKey)
  },

  generateReactSnippet(apiKey) {
    return generateReactSnippet(apiKey)
  },

  generateCurlSnippet(apiKey) {
    return generateCurlSnippet(apiKey)
  },

  generateSnippet(apiKey, type = 'basic-js') {
    if (!apiKey) return ''

    switch (type) {
      case 'html-form':
        return generateHtmlFormSnippet(apiKey)
      case 'react':
        return generateReactSnippet(apiKey)
      case 'curl':
        return generateCurlSnippet(apiKey)
      case 'basic-js':
      default:
        return generateBasicJsSnippet(apiKey)
    }
  },
}
