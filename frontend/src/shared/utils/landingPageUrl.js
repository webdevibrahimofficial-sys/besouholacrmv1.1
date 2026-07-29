export const toPublicSlugSegment = (value, fallback = 'landing-page') => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return fallback

  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || fallback
}

export const buildPublicLandingPath = (slug) => `/p/${encodeURIComponent(String(slug || '').trim())}`

export const buildPublicLandingUrl = ({ origin, slug }) => {
  const baseOrigin = String(origin || '').replace(/\/$/, '')
  return `${baseOrigin}${buildPublicLandingPath(slug)}`
}

export const buildShareLandingUrl = ({ origin, token, title, type }) => {
  const baseOrigin = String(origin || '').replace(/\/$/, '')
  const safeToken = encodeURIComponent(String(token || '').trim())
  const slug = toPublicSlugSegment(title, type === 'item' ? 'item' : 'project')
  return `${baseOrigin}/l/${slug}/${safeToken}`
}
