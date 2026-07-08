import { useCallback, useEffect, useState } from 'react'
import { impersonationApi } from './impersonationApi'

export function useImpersonation(enabled = true) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const canCheckSession = enabled
    && typeof window !== 'undefined'
    && !String(window.location.hash || '').includes('/login')
    && !!(
      window.localStorage.getItem('token')
      || window.sessionStorage.getItem('token')
      || document.cookie.split('; ').find((row) => row.startsWith('token='))
    )

  const refresh = useCallback(async () => {
    if (!canCheckSession) {
      setSession(null)
      return null
    }

    setLoading(true)
    try {
      const { data } = await impersonationApi.currentTenant()
      const next = data?.active ? data?.session || null : null
      setSession(next)
      return next
    } catch (error) {
      if (error?.response?.status === 401) {
        setSession(null)
        return null
      }
      throw error
    } finally {
      setLoading(false)
    }
  }, [canCheckSession])

  const exit = useCallback(async () => {
    const { data } = await impersonationApi.exitTenant()
    setSession(null)
    try { window.sessionStorage.removeItem('impersonation_bootstrap') } catch {}
    return data
  }, [])

  useEffect(() => {
    if (!canCheckSession) return
    refresh().catch(() => {})
  }, [canCheckSession, refresh])

  return {
    loading,
    session,
    active: !!session,
    refresh,
    exit,
  }
}
