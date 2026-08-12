import { useEffect, useRef } from 'react'
import { api } from '@utils/api'

const ESCALATION_SCAN_INTERVAL_MS = 60 * 60 * 1000
const ESCALATION_SCAN_STORAGE_KEY = 'copilot:last-escalation-scan'

function isManagerLikeRole(role = '') {
  const lower = String(role || '').toLowerCase()
  return (
    lower.includes('manager')
    || lower.includes('leader')
    || lower.includes('director')
    || lower.includes('admin')
    || lower.includes('owner')
  )
}

export function useCopilotEscalationScan({
  enabled = true,
  locale = 'en',
  userRole = '',
  onScanned,
} = {}) {
  const scanningRef = useRef(false)
  const managerLike = isManagerLikeRole(userRole)

  useEffect(() => {
    if (!enabled || !managerLike) return undefined

    const shouldScanNow = () => {
      try {
        const lastScan = Number(window.localStorage.getItem(ESCALATION_SCAN_STORAGE_KEY) || 0)
        return !lastScan || Date.now() - lastScan >= ESCALATION_SCAN_INTERVAL_MS
      } catch {
        return true
      }
    }

    const markScanned = () => {
      try {
        window.localStorage.setItem(ESCALATION_SCAN_STORAGE_KEY, String(Date.now()))
      } catch {
        // ignore storage errors
      }
    }

    const runScan = async () => {
      if (scanningRef.current || !shouldScanNow()) return
      scanningRef.current = true

      try {
        const response = await api.post('/api/ai/copilot/notifications/scan-lead-escalation', {
          limit: 5,
          workflow: 'sales',
          locale,
        })
        markScanned()
        onScanned?.(response?.data?.data || null)
      } catch {
        // silent — escalation scan is best-effort background work
      } finally {
        scanningRef.current = false
      }
    }

    runScan()
    const timer = window.setInterval(runScan, ESCALATION_SCAN_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [enabled, locale, managerLike, onScanned])
}
