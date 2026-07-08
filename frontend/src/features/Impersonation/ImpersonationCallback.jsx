import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { impersonationApi } from './impersonationApi'
import { persistAuthToken } from '@utils/authToken'

export default function ImpersonationCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const qs = window.location.search && window.location.search.length > 1
          ? window.location.search
          : (window.location.hash && window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '')
        const params = new URLSearchParams(qs)
        const token = params.get('token')

        if (!token) {
          navigate('/login', { replace: true })
          return
        }

        const response = await impersonationApi.exchange(token)
        const supportToken = response?.data?.token
        const impersonation = response?.data?.impersonation

        if (!supportToken) {
          navigate('/login', { replace: true })
          return
        }

        persistAuthToken(supportToken)

        if (impersonation?.active) {
          try {
            window.sessionStorage.setItem('impersonation_bootstrap', JSON.stringify(impersonation))
          } catch {
            // ignore storage errors
          }
        }

        if (active) {
          window.location.replace(`${window.location.origin}/#/dashboard`)
        }
      } catch {
        if (active) {
          navigate('/login', { replace: true })
        }
      }
    }

    run()
    return () => {
      active = false
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
    </div>
  )
}
