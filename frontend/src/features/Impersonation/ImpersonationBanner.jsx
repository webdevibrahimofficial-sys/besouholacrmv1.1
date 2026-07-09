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
    <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {t('Support Access - Acting as Super Admin')}
          </p>
          <p className="text-xs opacity-90">
            {t('Signed in as tenant admin for {{tenant}}.', {
              tenant: session.tenant_name || session.tenant_slug || 'tenant',
            })}
            {session.admin_name ? ` - ${t('Original admin: {{name}}', { name: session.admin_name })}` : ''}
            {session.reason ? ` - ${t('Reason: {{reason}}', { reason: session.reason })}` : ''}
            {remaining ? ` - ${t('Ends in {{time}}', { time: remaining })}` : ''}
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

              window.location.href = data?.redirect_url || '/system/tenants'
            } finally {
              setExiting(false)
            }
          }}
          className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {exiting ? t('Exiting...') : t('Exit Support Access')}
        </button>
      </div>
    </div>
  )
}
