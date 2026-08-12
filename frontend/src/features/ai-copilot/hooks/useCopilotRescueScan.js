import { useEffect, useRef } from 'react'
import { api } from '@utils/api'

const RESCUE_SCAN_INTERVAL_MS = 30 * 60 * 1000
const RESCUE_SCAN_STORAGE_KEY = 'copilot:last-rescue-scan'

export function useCopilotRescueScan({
  enabled = true,
  locale = 'en',
  onScanned,
} = {}) {
  const scanningRef = useRef(false)

  useEffect(() => {
    if (!enabled) return undefined

    const shouldScanNow = () => {
      try {
        const lastScan = Number(window.localStorage.getItem(RESCUE_SCAN_STORAGE_KEY) || 0)
        return !lastScan || Date.now() - lastScan >= RESCUE_SCAN_INTERVAL_MS
      } catch {
        return true
      }
    }

    const markScanned = () => {
      try {
        window.localStorage.setItem(RESCUE_SCAN_STORAGE_KEY, String(Date.now()))
      } catch {
        // ignore storage errors
      }
    }

    const runScan = async () => {
      if (scanningRef.current || !shouldScanNow()) return
      scanningRef.current = true

      try {
        const response = await api.post('/api/ai/copilot/notifications/scan-lead-rescue', {
          limit: 5,
          workflow: 'sales',
          locale,
        })
        markScanned()
        onScanned?.(response?.data?.data || null)
      } catch {
        // silent — rescue scan is best-effort background work
      } finally {
        scanningRef.current = false
      }
    }

    runScan()
    const timer = window.setInterval(runScan, RESCUE_SCAN_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [enabled, locale, onScanned])
}
