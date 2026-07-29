import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  ShieldCheck,
  TestTube2,
} from 'lucide-react'

const StepCard = ({ icon: Icon, title, description, complete, helper, actionLabel, onAction }) => (
  <div className={`rounded-2xl border p-4 transition-colors ${
    complete
      ? 'border-green-200 bg-green-50/80 dark:border-green-800 dark:bg-green-900/10'
      : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/20'
  }`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          complete
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-theme">{title}</h4>
            {complete ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-300" /> : null}
          </div>
          <p className="mt-1 text-sm text-[var(--muted-text)]">{description}</p>
          {helper ? <p className="mt-2 text-xs text-[var(--muted-text)]">{helper}</p> : null}
        </div>
      </div>
    </div>

    {onAction && actionLabel ? (
      <div className="mt-4">
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-theme transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <ExternalLink className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
    ) : null}
  </div>
)

const ChecklistItem = ({ title, value, accent = 'default' }) => {
  const toneClasses = {
    default: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/20',
    blue: 'border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-900/10',
    amber: 'border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-900/10',
    green: 'border-green-200 bg-green-50/80 dark:border-green-800 dark:bg-green-900/10',
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses[accent] || toneClasses.default}`}>
      <div className="text-xs text-[var(--muted-text)]">{title}</div>
      <div className="mt-1 text-sm font-semibold text-theme break-all" dir="auto">{value}</div>
    </div>
  )
}

export default function WebsiteSetupGuide({
  connections,
  selectedConnection,
  stats,
  loading,
  apiKey,
  onSelectConnection,
  onCreate,
  onEdit,
  onOpenSnippet,
  onOpenLogs,
  onOpenStats,
  onTest,
  onRegenerate,
}) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')

  const originCount = Array.isArray(selectedConnection?.allowed_origins) ? selectedConnection.allowed_origins.length : 0
  const hasConnection = !!selectedConnection
  const hasUrl = !!selectedConnection?.url
  const hasOriginProtection = originCount > 0 || !!selectedConnection?.allow_all_origins_for_testing
  const hasTraffic = Number(stats?.total_requests || 0) > 0
  const hasLogVisibility = hasTraffic || !!stats?.last_failed_attempt
  const fullKeyVisible = !!apiKey
  const completedSteps = [hasConnection, hasUrl, hasOriginProtection, hasTraffic, hasLogVisibility].filter(Boolean).length
  const progressPercent = Math.round((completedSteps / 5) * 100)

  const nextAction = useMemo(() => {
    if (!hasConnection) {
      return {
        label: t('Create Connection'),
        description: t('Start by creating your first secure website connection inside the CRM.'),
        onClick: onCreate,
      }
    }

    if (!hasUrl || !hasOriginProtection) {
      return {
        label: t('Complete Connection Settings'),
        description: t('Add the real website URL and configure the allowed origins before going live.'),
        onClick: () => onEdit(selectedConnection),
      }
    }

    if (!hasTraffic) {
      return {
        label: t('Send Test Lead'),
        description: fullKeyVisible
          ? t('Copy the snippet or use the built-in test lead to confirm the full intake flow.')
          : t('Open the snippet or regenerate a key if you need a fresh production-ready copy before testing.'),
        onClick: () => onTest(selectedConnection),
      }
    }

    return {
      label: t('Review Logs & Stats'),
      description: t('You are live. Monitor rejected attempts, duplicates, and top-performing pages from one place.'),
      onClick: () => onOpenLogs(selectedConnection),
    }
  }, [
    fullKeyVisible,
    hasConnection,
    hasLogVisibility,
    hasOriginProtection,
    hasTraffic,
    hasUrl,
    onCreate,
    onEdit,
    onOpenLogs,
    onTest,
    selectedConnection,
    t,
  ])

  const setupSteps = [
    {
      icon: Link2,
      title: t('Create connection'),
      description: t('Create a named website intake connection so the CRM can isolate this website safely.'),
      helper: hasConnection ? t('Connection created and ready inside the CRM.') : t('No website connection exists yet.'),
      complete: hasConnection,
      actionLabel: hasConnection ? t('Edit Website Connection') : t('Create Connection'),
      onAction: hasConnection ? () => onEdit(selectedConnection) : onCreate,
    },
    {
      icon: Globe,
      title: t('Set website URL'),
      description: t('Add the public website URL so the team can identify where this connection is installed.'),
      helper: hasUrl ? selectedConnection.url : t('Website URL is still empty.'),
      complete: hasUrl,
      actionLabel: t('Open Connection Form'),
      onAction: hasConnection ? () => onEdit(selectedConnection) : onCreate,
    },
    {
      icon: ShieldCheck,
      title: t('Protect allowed origins'),
      description: t('Limit requests to approved domains, or use testing mode only for temporary development checks.'),
      helper: hasOriginProtection
        ? selectedConnection?.allow_all_origins_for_testing
          ? t('Testing mode is enabled. Switch to explicit origins before production launch.')
          : t('{{count}} allowed origins configured.', { count: originCount })
        : t('No allowed origins configured yet.'),
      complete: hasOriginProtection,
      actionLabel: t('Configure Origins'),
      onAction: hasConnection ? () => onEdit(selectedConnection) : onCreate,
    },
    {
      icon: TestTube2,
      title: t('Install snippet and test'),
      description: t('Install the snippet or send a CRM test lead to confirm routing, saving, and origin policy.'),
      helper: hasTraffic
        ? t('At least one website request has already reached this connection.')
        : fullKeyVisible
          ? t('The full API key is currently visible, so you can copy a working snippet right now.')
          : t('Open the snippet page or regenerate a key when you need a fresh copyable setup snippet.'),
      complete: hasTraffic,
      actionLabel: fullKeyVisible ? t('Open Snippet') : t('Send Test Lead'),
      onAction: hasConnection
        ? fullKeyVisible
          ? () => onOpenSnippet(selectedConnection)
          : () => onTest(selectedConnection)
        : onCreate,
    },
    {
      icon: BarChart3,
      title: t('Monitor logs and analytics'),
      description: t('Review intake logs, failure reasons, and trend analytics after launch or testing.'),
      helper: hasLogVisibility
        ? t('Traffic is now visible in logs and analytics.')
        : t('Run your first test lead to unlock logs and analytics visibility.'),
      complete: hasLogVisibility,
      actionLabel: hasLogVisibility ? t('Open Logs') : t('Open Statistics'),
      onAction: hasConnection
        ? hasLogVisibility
          ? () => onOpenLogs(selectedConnection)
          : () => onOpenStats(selectedConnection)
        : onCreate,
    },
  ]

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-6">
      <div className="card overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-theme">
                <BookOpen className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                {t('Website Setup Guide')}
              </h3>
              <p className="mt-1 text-sm text-[var(--muted-text)]">
                {t('Follow a practical onboarding path from connection creation to live lead verification.')}
              </p>
            </div>

            <div className="w-full lg:w-[22rem]">
              <label className="mb-1.5 block text-sm font-medium text-theme">{t('Setup Connection')}</label>
              <select
                className="select w-full"
                value={selectedConnection?.id || ''}
                onChange={(event) => onSelectConnection(event.target.value)}
              >
                <option value="">{t('Choose a connection')}</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {!hasConnection ? (
          <div className="p-6">
            <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
              <BookOpen className="mx-auto h-10 w-10 text-cyan-600/70 dark:text-cyan-300/70" />
              <h4 className="mt-4 text-lg font-semibold text-theme">{t('No website connections yet.')}</h4>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--muted-text)]">
                {t('Start by creating your first secure website connection, then this guide will walk you through origins, snippet installation, testing, and monitoring.')}
              </p>
              <button
                type="button"
                onClick={onCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
              >
                <Link2 className="h-4 w-4" />
                {t('Create Connection')}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-900/20">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-text)]">
                      {t('Guided Progress')}
                    </div>
                    <div className="mt-2 text-2xl font-bold text-theme">{t('{{completed}} of {{total}} steps completed', { completed: completedSteps, total: 5 })}</div>
                    <div className="mt-2 text-sm text-[var(--muted-text)]">{t('Use this checklist to move from setup to a verified live intake flow.')}</div>
                  </div>

                  <div className="min-w-[7rem] rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center dark:border-blue-800 dark:bg-blue-900/10">
                    <div className="text-xs text-blue-700 dark:text-blue-300">{t('Progress')}</div>
                    <div className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-200">{progressPercent}%</div>
                  </div>
                </div>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <ChecklistItem title={t('Connection Name')} value={selectedConnection.name || '-'} accent="default" />
                  <ChecklistItem title={t('Website URL')} value={selectedConnection.url || t('Website URL is still empty.')} accent={hasUrl ? 'green' : 'amber'} />
                  <ChecklistItem
                    title={t('Allowed Origins')}
                    value={
                      selectedConnection.allow_all_origins_for_testing
                        ? t('Testing mode enabled')
                        : originCount > 0
                          ? t('{{count}} origins configured', { count: originCount })
                          : t('No allowed origins configured yet.')
                    }
                    accent={hasOriginProtection ? 'green' : 'amber'}
                  />
                  <ChecklistItem
                    title={t('Snippet Status')}
                    value={fullKeyVisible ? t('Full API key currently available for copying.') : t('Full API key hidden after refresh. Regenerate when you need a fresh snippet copy.')}
                    accent={fullKeyVisible ? 'blue' : 'amber'}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-800 dark:bg-amber-900/10">
                  <div className="flex items-start gap-3">
                    <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
                    <div>
                      <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('API key visibility')}</div>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                        {fullKeyVisible
                          ? t('The full API key is currently visible. Copy the snippet now and store the key securely before you leave this screen.')
                          : t('The full API key is only shown once after create or regenerate. Use regenerate whenever you need a fresh copyable snippet.')}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenSnippet(selectedConnection)}
                          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/20"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {t('Open Snippet')}
                        </button>
                        {!fullKeyVisible ? (
                          <button
                            type="button"
                            onClick={() => onRegenerate(selectedConnection)}
                            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/20"
                          >
                            <KeyRound className="h-4 w-4" />
                            {t('Regenerate Key')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 dark:border-blue-800 dark:bg-blue-900/10">
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">{t('Next recommended action')}</div>
                  <p className="mt-2 text-sm text-blue-800 dark:text-blue-300">{nextAction.description}</p>
                  <button
                    type="button"
                    onClick={nextAction.onClick}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {nextAction.label}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {setupSteps.map((step) => (
                <StepCard key={step.title} {...step} />
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                  <h4 className="text-sm font-semibold text-theme">{t('Recommended lead payload')}</h4>
                </div>
                <p className="mt-2 text-sm text-[var(--muted-text)]">{t('These fields cover the minimum useful data for most landing pages and contact forms.')}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['name', 'phone', 'email', 'message', 'meta.form_name', 'meta.page_url'].map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-theme dark:border-gray-700 dark:bg-gray-900/20"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                  <h4 className="text-sm font-semibold text-theme">{t('Troubleshooting quick guide')}</h4>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[var(--muted-text)]">
                  <div><span className="font-medium text-theme">{t('Invalid Key')}:</span> {t('The snippet is using an old or incomplete public key. Regenerate a key and copy a fresh snippet.')}</div>
                  <div><span className="font-medium text-theme">{t('Blocked Origin')}:</span> {t('The page domain is not in the allowed origins list for this connection.')}</div>
                  <div><span className="font-medium text-theme">{t('Inactive Connection')}:</span> {t('The connection exists, but incoming website leads are disabled until you reactivate it.')}</div>
                  <div><span className="font-medium text-theme">{t('Validation Failed')}:</span> {t('Required lead fields are missing or malformed before the CRM can save the request.')}</div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-gray-200 p-4 text-sm text-[var(--muted-text)] dark:border-gray-700">
                {t('Loading stats...')}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
