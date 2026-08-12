const COPILOT_LEAD_OPENED_EVENT = 'copilot:lead-opened'

export function emitCopilotLeadOpened(lead) {
  if (typeof window === 'undefined') return
  const leadId = Number(lead?.id)
  if (!leadId) return

  window.dispatchEvent(new CustomEvent(COPILOT_LEAD_OPENED_EVENT, {
    detail: {
      lead: {
        id: leadId,
        name: lead?.name || lead?.lead_name || null,
        stage: lead?.stage || lead?.visible_stage || null,
        status: lead?.status || null,
      },
    },
  }))
}

export function onCopilotLeadOpened(handler) {
  if (typeof window === 'undefined') return () => {}

  const listener = (event) => {
    handler(event?.detail?.lead || null, event)
  }

  window.addEventListener(COPILOT_LEAD_OPENED_EVENT, listener)
  return () => window.removeEventListener(COPILOT_LEAD_OPENED_EVENT, listener)
}
