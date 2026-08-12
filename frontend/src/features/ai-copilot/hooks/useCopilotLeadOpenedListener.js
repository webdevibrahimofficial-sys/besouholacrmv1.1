import { useEffect, useRef } from 'react'
import { api } from '@utils/api'
import { onCopilotLeadOpened } from '../utils/copilotLeadOpened'

function isLostLeadSnapshot(lead) {
  const stage = String(lead?.stage || '').toLowerCase()
  const status = String(lead?.status || '').toLowerCase()
  const needles = ['lost', 'cancel', 'canceled', 'cancelled', 'not interested', 'refused']
  return needles.some((needle) => stage.includes(needle) || status.includes(needle))
}

export function useCopilotLeadOpenedListener({
  enabled = true,
  locale = 'en',
  onEnqueued,
} = {}) {
  const pendingLeadIdsRef = useRef(new Set())

  useEffect(() => {
    if (!enabled) return undefined

    return onCopilotLeadOpened(async (lead) => {
      const leadId = Number(lead?.id)
      if (!leadId || pendingLeadIdsRef.current.has(leadId)) return

      pendingLeadIdsRef.current.add(leadId)

      try {
        const requests = [
          api.post('/api/ai/copilot/notifications/enqueue-lead-intelligence', {
            lead_id: leadId,
            source: 'copilot:lead-opened',
            locale,
          }),
        ]

        if (isLostLeadSnapshot(lead)) {
          requests.push(api.post('/api/ai/copilot/notifications/enqueue-lead-lost-detective', {
            lead_id: leadId,
            source: 'copilot:lead-opened-lost',
            locale,
          }))
        }

        const [intelligenceResponse] = await Promise.all(requests)
        onEnqueued?.(intelligenceResponse?.data?.data || null)
      } catch {
        // Out of scope, feature disabled, or transient API error — no UI noise.
      } finally {
        window.setTimeout(() => {
          pendingLeadIdsRef.current.delete(leadId)
        }, 60_000)
      }
    })
  }, [enabled, locale, onEnqueued])
}
