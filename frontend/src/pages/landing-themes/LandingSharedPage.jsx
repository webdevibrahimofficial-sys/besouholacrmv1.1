import { Navigate, useParams } from 'react-router-dom'

export default function LandingSharedPage() {
  const { slug, token } = useParams()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const safeSlug = encodeURIComponent(String(slug || '').trim() || 'project')
  return <Navigate to={`/landing-preview/${safeSlug}?token=${encodeURIComponent(token)}`} replace />
}
