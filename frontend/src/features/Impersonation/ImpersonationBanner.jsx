import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImpersonation } from './useImpersonation'
import { clearImpersonationHints, persistAuthToken } from '@utils/authToken'

export default function ImpersonationBanner() {
  const { t } = useTranslation()
  const { active, session, exit } = useImpersonation(true)
  const [exiting, setExiting] = useState(false)

  const remaining = useMemo(() => {
    const seconds = Number(session?.remaining_seconds || 0)
    if (!seconds) return null
    const minutes = Math.max(1, Math.ceil(seconds / 60))
    return `${minutes}m`
  }, [session?.remaining_seconds])

  if (!active || !session) return null

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {t('You are in support access for {{tenant}}', { tenant: session.tenant_name || session.tenant_slug || 'tenant' })}
          </p>
          <p className="text-xs opacity-90">
            {session.reason ? t('Reason: {{reason}}', { reason: session.reason }) : t('Support access session is active.')}
            {remaining ? ` • ${t('Ends in {{time}}', { time: remaining })}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={exiting}
          onClick={async () => {
            try {
              setExiting(true)
              const data = await exit()
              clearImpersonationHints()
              if (data?.token) {
                persistAuthToken(data.token)
              }
              const redirectUrl = data?.redirect_url || '/system/tenants'
              window.location.href = redirectUrl
            } finally {
              setExiting(false)
            }
          }}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {exiting ? t('Exiting...') : t('Exit impersonation')}
        </button>
      </div>
    </div>
  )
}
