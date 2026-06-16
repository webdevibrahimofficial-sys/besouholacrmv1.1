import axios from 'axios'

const apiDebugEnabled = String(import.meta.env.VITE_API_DEBUG || 'false').toLowerCase() === 'true'

const resolveTenantSlugFromHost = () => {
  if (typeof window === 'undefined') return null
  const host = String(window.location.hostname || '').toLowerCase()
  const parts = host.split('.')
  if (parts.length <= 2 && parts[1] !== 'localhost') return null
  const candidate = parts[0]
  if (!candidate || candidate === 'www' || candidate === 'api' || candidate === 'localhost') return null
  return candidate
}

const getApiBaseUrl = () => {
  const raw = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '').trim()
  if (raw) return raw.replace(/\/+$/, '')
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/api`
}

const getCookie = (name) => {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift())
  return null
}

const clearAuthTokens = () => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token')
      window.sessionStorage.removeItem('token')
    }
  } catch {
  }

  try {
    if (typeof document === 'undefined') return
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const parts = String(host || '').split('.')
    if (parts[0] === 'www') parts.shift()

    document.cookie = `token=;path=/;max-age=0;SameSite=Lax`

    const rootDomain = parts.length > 1 ? '.' + parts.slice(-2).join('.') : null
    if (rootDomain) {
      document.cookie = `token=;path=/;domain=${rootDomain};max-age=0;SameSite=Lax`
    }

    const currentDomain = parts.length ? '.' + parts.join('.') : null
    if (currentDomain && currentDomain !== rootDomain) {
      document.cookie = `token=;path=/;domain=${currentDomain};max-age=0;SameSite=Lax`
    }
  } catch {
  }
}

const sanitizePayload = (data) => {
  if (data == null) return data
  try {
    const cloned = JSON.parse(JSON.stringify(data))
    const redactKeys = ['password', 'token', 'authorization']
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return
      for (const key of Object.keys(obj)) {
        if (redactKeys.includes(String(key).toLowerCase())) {
          obj[key] = '[REDACTED]'
        } else {
          walk(obj[key])
        }
      }
    }
    walk(cloned)
    return cloned
  } catch {
    return '[Unserializable]'
  }
}

const buildAxiosLikeUrl = (baseURL, url) => {
  const base = String(baseURL || '')
  const path = String(url || '')
  if (!base) return path
  if (!path) return base
  if (/^[a-z]+:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  if (config.url) {
    const hasApiSuffixInBase = /\/api\/?$/.test(String(config.baseURL || ''))
    const isAbsoluteUrl = /^[a-z]+:\/\//i.test(String(config.url))

    if (!isAbsoluteUrl) {
      let normalizedUrl = String(config.url)

      // Prevent /api/api double prefix when callers use "/api/..." while baseURL already ends with /api.
      // Keep the result relative so axios preserves the "/api" path segment from baseURL.
      if (hasApiSuffixInBase && normalizedUrl.startsWith('/api/')) {
        normalizedUrl = normalizedUrl.substring(5)
      } else if (hasApiSuffixInBase && normalizedUrl.startsWith('api/')) {
        normalizedUrl = normalizedUrl.substring(4)
      } else if (hasApiSuffixInBase && normalizedUrl === '/api') {
        normalizedUrl = ''
      } else if (hasApiSuffixInBase && normalizedUrl === 'api') {
        normalizedUrl = ''
      }

      if (hasApiSuffixInBase) {
        normalizedUrl = normalizedUrl.replace(/^\/+/, '')
        config.url = normalizedUrl || '/'
      } else {
        if (!normalizedUrl.startsWith('/')) {
          normalizedUrl = '/' + normalizedUrl
        }
        config.url = normalizedUrl
      }
    }
  }

  const token =
    window.localStorage.getItem('token') ||
    window.sessionStorage.getItem('token') ||
    getCookie('token')

  if (token && !window.localStorage.getItem('token') && !window.sessionStorage.getItem('token')) {
    try {
      window.sessionStorage.setItem('token', token)
    } catch {
    }
  }

  if (token && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const tenantSlug = resolveTenantSlugFromHost()
  if (tenantSlug && !config.headers?.['X-Tenant-Id'] && !config.headers?.['X-Tenant']) {
    config.headers['X-Tenant-Id'] = tenantSlug
  }

  const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData
  if (isFormData) {
    try {
      if (typeof config.headers?.delete === 'function') {
        config.headers.delete('Content-Type')
        config.headers.delete('content-type')
      } else if (config.headers) {
        delete config.headers['Content-Type']
        delete config.headers['content-type']
      }
    } catch {
    }
  }

  if (apiDebugEnabled) {
    const fullUrl = buildAxiosLikeUrl(config.baseURL, config.url)
    console.info('API REQUEST', {
      url: fullUrl,
      method: config.method,
      headers: config.headers,
      data: isFormData ? '[FormData]' : sanitizePayload(config.data),
      origin: window.location.origin,
      apiBase: config.baseURL,
    })
  }

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status
    if (status === 401 && typeof window !== 'undefined') {
      const hash = String(window.location.hash || '')
      const isOnLogin = hash.includes('/login')
      const isOnAuthCallback = hash.includes('/auth/callback')
      if (!isOnLogin && !isOnAuthCallback) {
        clearAuthTokens()
        try {
          window.location.href = '/#/login'
        } catch {
        }
      }
    }

    if (apiDebugEnabled) {
      console.warn('API ERROR', {
        url: err?.config?.url,
        method: err?.config?.method,
        status,
        data: sanitizePayload(err?.response?.data),
      })
    }
    return Promise.reject(err)
  }
)

export const logExportEvent = async ({ module, fileName, format }) => {
  try {
    await api.post('/api/exports', {
      module: module || 'Unknown',
      action: 'export',
      file_name: fileName || 'export',
      format: format || 'unknown',
    })
  } catch {
  }
}

export const logImportEvent = async ({ module, fileName, format, count, status, errorMessage, metaData }) => {
  try {
    const derivedMeta = {
      ...(typeof metaData === 'object' && metaData ? metaData : {}),
    }
    if (typeof count === 'number') {
      derivedMeta.count = count
    }
    // Imports report reads from legacy exports log with `action=import`.
    await api.post('/api/exports', {
      module: module || 'Unknown',
      action: 'import',
      file_name: fileName || 'import',
      format: format || 'unknown',
      status: status || undefined,
      error_message: errorMessage || undefined,
      meta_data: Object.keys(derivedMeta).length ? derivedMeta : undefined,
    })
  } catch {
  }
}

export const getApiUrl = () => api.defaults.baseURL || getApiBaseUrl()
