import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { impersonationApi } from './impersonationApi'

import { persistAuthToken } from '@utils/authToken'



export default function ImpersonationCallback() {
  const navigate = useNavigate()

  useEffect(() => {
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

        const guardKey = 'impersonation_exchange_token'
        try {
          if (window.sessionStorage.getItem(guardKey) === token) {
            return
          }

          window.sessionStorage.setItem(guardKey, token)
        } catch {
          // ignore storage errors
        }

        const response = await impersonationApi.exchange(token)
        const supportToken = response?.data?.token
        const impersonation = response?.data?.impersonation
        const tenant = response?.data?.tenant

        if (!supportToken) {
          window.sessionStorage.removeItem('impersonation_exchange_token')
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

        const currentHost = String(window.location.hostname || '').toLowerCase()
        const expectedHost = String(tenant?.domain || '').toLowerCase()
        const redirectOrigin = expectedHost && expectedHost !== currentHost
          ? `${window.location.protocol}//${expectedHost}`
          : window.location.origin

        // Force a fresh document load after support access exchange so the app
        // reboots with the tenant token and fetches enabled modules/permissions
        // from scratch instead of reusing the callback page's in-memory state.
        window.location.replace(`${redirectOrigin}/?support_bootstrap=${Date.now()}#/dashboard`)
      } catch {
        try {
          window.sessionStorage.removeItem('impersonation_exchange_token')
        } catch {
          // ignore storage errors
        }

        navigate('/login', { replace: true })
      }
    }


    run()
  }, [navigate])



  return (

    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">

      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>

    </div>

  )

}

