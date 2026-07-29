import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  Facebook,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  TestTube2,
  Zap,
} from 'lucide-react'

const StepCard = ({ icon: Icon, title, description, complete, helper, actionLabel, onAction, actionDisabled }) => (
  <div className={`rounded-2xl border p-4 transition-colors ${
    complete
      ? 'border-green-200 bg-green-50/80 dark:border-emerald-500/30 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.22),rgba(2,44,34,0.18))]'
      : 'border-gray-200 bg-white dark:border-blue-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(17,24,39,0.78))]'
  }`}>
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        complete
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      }`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-theme">{title}</h4>
          {complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-300" /> : null}
        </div>
        <p className="mt-1 text-sm text-[var(--muted-text)]">{description}</p>
        {helper ? <p className="mt-2 text-xs text-[var(--muted-text)]">{helper}</p> : null}
        {onAction && actionLabel ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-theme transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-500/20 dark:bg-slate-950/45 dark:hover:bg-slate-800"
            >
              <ExternalLink className="h-4 w-4" />
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  </div>
)

const ChecklistItem = ({ title, value, accent = 'default' }) => {
  const toneClasses = {
    default: 'border-gray-200 bg-white dark:border-blue-500/20 dark:bg-slate-900/65',
    blue: 'border-blue-200 bg-blue-50/80 dark:border-blue-500/30 dark:bg-blue-950/30',
    amber: 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-950/20',
    green: 'border-green-200 bg-green-50/80 dark:border-emerald-500/30 dark:bg-emerald-950/20',
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses[accent] || toneClasses.default}`}>
      <div className="text-xs text-[var(--muted-text)]">{title}</div>
      <div className="mt-1 text-sm font-semibold text-theme break-all" dir="auto">{value}</div>
    </div>
  )
}

export default function MetaSetupGuide({
  sharedMetaConfigured,
  connections,
  pages,
  hasConnectionForActiveAgency,
  activeAgencyId,
  isTenantAdmin,
  agencies,
  selectedAgencyId,
  onSelectAgency,
  autoSync,
  enableCapi,
  pixelId,
  tenantHealth,
  formMap,
  leadFormsCount,
  loading,
  syncing,
  testingWebhook,
  detectingMapping,
  onConnect,
  onSync,
  onOpenTab,
  onTestWebhook,
  onAutoDetectMapping,
}) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')

  const activePages = pages.filter((page) => page?.is_active)
  const subscribedCount = Number(tenantHealth?.subscribe_summary?.subscribed ?? 0)
  const failedSubscribeCount = Number(tenantHealth?.subscribe_summary?.failed ?? 0)
  const hasMapping = Object.keys(formMap || {}).length > 0
  const hasFirstLead = !!tenantHealth?.last_lead_at
  const needsAgencySelection = isTenantAdmin && !activeAgencyId

  const scopedConnections = useMemo(() => {
    if (!activeAgencyId) return connections
    return connections.filter((conn) => String(conn.agency_id ?? '') === String(activeAgencyId))
  }, [connections, activeAgencyId])

  const scopedPages = useMemo(() => {
    if (!activeAgencyId) return pages
    const connectionIds = new Set(scopedConnections.map((conn) => String(conn.id)))
    return pages.filter((page) => connectionIds.has(String(page.connection_id)))
  }, [pages, activeAgencyId, scopedConnections])

  const scopedActivePages = scopedPages.filter((page) => page?.is_active)

  const setupStepsComplete = [
    sharedMetaConfigured,
    hasConnectionForActiveAgency,
    scopedActivePages.length > 0,
    autoSync && (hasMapping || leadFormsCount === 0),
    subscribedCount > 0,
    hasFirstLead,
  ]

  const completedSteps = setupStepsComplete.filter(Boolean).length
  const progressPercent = Math.round((completedSteps / setupStepsComplete.length) * 100)
  const allCoreStepsDone = setupStepsComplete.slice(0, 5).every(Boolean)

  const nextAction = useMemo(() => {
    if (!sharedMetaConfigured) {
      return {
        label: t('Contact System Admin'),
        description: t('Meta integration must be enabled centrally before you can connect a Facebook account.'),
        onClick: () => onOpenTab('overview'),
      }
    }

    if (needsAgencySelection) {
      return {
        label: t('Select Agency'),
        description: t('Choose the agency you want to set up before connecting Meta.'),
        onClick: () => onOpenTab('overview'),
      }
    }

    if (!hasConnectionForActiveAgency) {
      return {
        label: t('Connect Meta Account'),
        description: t('Connect your Facebook account to sync businesses, ad accounts, and pages.'),
        onClick: onConnect,
      }
    }

    if (scopedActivePages.length === 0) {
      return {
        label: syncing ? t('Syncing...') : t('Sync & Activate Pages'),
        description: t('Sync assets from Meta, then activate at least one page to receive Lead Ads.'),
        onClick: onSync,
      }
    }

    if (!autoSync || (!hasMapping && leadFormsCount > 0)) {
      return {
        label: detectingMapping ? t('Detecting...') : t('Auto-Detect Field Mapping'),
        description: t('Map your Facebook form fields to CRM fields automatically, then review in Lead Sync.'),
        onClick: onAutoDetectMapping,
      }
    }

    if (subscribedCount === 0 && scopedActivePages.length > 0) {
      return {
        label: testingWebhook ? t('Testing...') : t('Test Webhook'),
        description: t('Verify that the system webhook endpoint is reachable before waiting for live leads.'),
        onClick: onTestWebhook,
      }
    }

    if (!hasFirstLead) {
      return {
        label: t('Open Overview'),
        description: t('Submit a test lead from Facebook or wait for your first real Lead Ad submission.'),
        onClick: () => onOpenTab('overview'),
      }
    }

    return {
      label: t('Open Overview'),
      description: t('Meta lead intake is live. Monitor health and manage assets from the overview tab.'),
      onClick: () => onOpenTab('overview'),
    }
  }, [
    autoSync,
    detectingMapping,
    hasConnectionForActiveAgency,
    hasFirstLead,
    hasMapping,
    leadFormsCount,
    needsAgencySelection,
    onAutoDetectMapping,
    onConnect,
    onOpenTab,
    onSync,
    onTestWebhook,
    scopedActivePages.length,
    sharedMetaConfigured,
    subscribedCount,
    syncing,
    t,
    testingWebhook,
  ])

  const setupSteps = [
    {
      icon: ShieldCheck,
      title: t('System integration ready'),
      description: t('The shared Meta App must be configured by your system administrator.'),
      helper: sharedMetaConfigured
        ? t('Shared Meta App is configured and ready.')
        : t('Meta integration is not enabled yet. Contact support.'),
      complete: sharedMetaConfigured,
    },
    {
      icon: Facebook,
      title: t('Connect Facebook account'),
      description: t('Authorize the CRM to access your Meta business assets for the selected agency.'),
      helper: hasConnectionForActiveAgency
        ? t('{{count}} connection(s) linked for this agency.', { count: scopedConnections.length })
        : needsAgencySelection
          ? t('Select an agency first, then connect Facebook.')
          : t('No Meta connection for this agency yet.'),
      complete: hasConnectionForActiveAgency,
      actionLabel: hasConnectionForActiveAgency ? t('Manage Connection') : t('Connect Meta Account'),
      onAction: hasConnectionForActiveAgency ? () => onOpenTab('overview') : onConnect,
      actionDisabled: !sharedMetaConfigured || needsAgencySelection,
    },
    {
      icon: LayoutDashboard,
      title: t('Activate lead pages'),
      description: t('Sync assets and activate at least one Facebook page to receive Lead Ads.'),
      helper: scopedActivePages.length > 0
        ? t('{{count}} active page(s) ready for lead sync.', { count: scopedActivePages.length })
        : t('No active pages yet. Sync assets and toggle pages on.'),
      complete: scopedActivePages.length > 0,
      actionLabel: syncing ? t('Syncing...') : t('Sync Assets'),
      onAction: onSync,
      actionDisabled: !hasConnectionForActiveAgency || syncing,
    },
    {
      icon: Database,
      title: t('Configure lead field mapping'),
      description: t('Map Facebook form fields to CRM fields so leads are saved with the right data.'),
      helper: hasMapping
        ? t('Field mapping configured for {{count}} form(s).', { count: Object.keys(formMap || {}).length })
        : leadFormsCount > 0
          ? t('{{count}} lead form(s) found. Run auto-detect or map manually.', { count: leadFormsCount })
          : t('Enable auto-sync first; forms appear after pages are active.'),
      complete: autoSync && (hasMapping || leadFormsCount === 0),
      actionLabel: detectingMapping ? t('Detecting...') : (hasMapping ? t('Review Mapping') : t('Auto-Detect Mapping')),
      onAction: hasMapping ? () => onOpenTab('leads') : onAutoDetectMapping,
      actionDisabled: scopedActivePages.length === 0 || detectingMapping,
    },
    {
      icon: TestTube2,
      title: t('Verify webhook delivery'),
      description: t('Webhooks are managed centrally. Confirm the endpoint responds and pages are subscribed.'),
      helper: subscribedCount > 0
        ? t('{{subscribed}} page subscription(s) succeeded.', { subscribed: subscribedCount })
        : failedSubscribeCount > 0
          ? t('{{failed}} subscription attempt(s) failed. Run Test Webhook or contact support.', { failed: failedSubscribeCount })
          : t('Run a webhook test after activating pages.'),
      complete: subscribedCount > 0,
      actionLabel: testingWebhook ? t('Testing...') : t('Test Webhook'),
      onAction: onTestWebhook,
      actionDisabled: scopedActivePages.length === 0 || testingWebhook,
    },
    {
      icon: Zap,
      title: t('Receive your first lead'),
      description: t('Submit a Lead Ad or wait for a real submission to confirm end-to-end intake.'),
      helper: hasFirstLead
        ? t('Last lead received: {{date}}', { date: tenantHealth.last_lead_at })
        : t('No Meta leads received yet.'),
      complete: hasFirstLead,
      actionLabel: t('Open Overview'),
      onAction: () => onOpenTab('overview'),
    },
  ]

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-6">
      {hasFirstLead && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            {t('Your first Meta lead was received successfully!')}
          </div>
          <p className="mt-1">{t('Lead intake is working. You can monitor new leads from the CRM leads module.')}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-white/70 shadow-sm dark:border-blue-500/25 dark:bg-[linear-gradient(180deg,rgba(24,39,78,0.58),rgba(19,30,58,0.78))]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-blue-500/25">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-theme">
                <BookOpen className="h-5 w-5 text-[#1877F2]" />
                {t('Meta Setup Guide')}
              </h3>
              <p className="mt-1 text-sm text-[var(--muted-text)]">
                {t('Follow a practical onboarding path from Facebook connection to live lead verification.')}
              </p>
            </div>

            {isTenantAdmin && (
              <div className="w-full lg:w-[22rem]">
                <label className="mb-1.5 block text-sm font-medium text-theme">{t('Setup Agency')}</label>
                <select
                  className="block w-full rounded-xl border border-gray-300 bg-white/90 text-theme sm:text-sm py-2 px-3 dark:border-blue-500/20 dark:bg-slate-950/70"
                  value={selectedAgencyId}
                  onChange={(e) => onSelectAgency(e.target.value)}
                >
                  <option value="">{t('Choose an agency')}</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.key}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-blue-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(19,31,58,0.7))]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-text)]">
                    {t('Guided Progress')}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-theme">
                    {t('{{completed}} of {{total}} steps completed', { completed: completedSteps, total: setupStepsComplete.length })}
                  </div>
                  <div className="mt-2 text-sm text-[var(--muted-text)]">
                    {t('Use this checklist to move from Meta connection to verified live lead intake.')}
                  </div>
                </div>

                <div className="min-w-[7rem] rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center dark:border-blue-500/30 dark:bg-blue-950/35">
                  <div className="text-xs text-blue-700 dark:text-blue-300">{t('Progress')}</div>
                  <div className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-200">{progressPercent}%</div>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-[#1877F2] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <ChecklistItem
                  title={t('Shared App')}
                  value={sharedMetaConfigured ? t('Configured') : t('Not configured')}
                  accent={sharedMetaConfigured ? 'green' : 'amber'}
                />
                <ChecklistItem
                  title={t('Active Pages')}
                  value={String(scopedActivePages.length)}
                  accent={scopedActivePages.length > 0 ? 'green' : 'amber'}
                />
                <ChecklistItem
                  title={t('Webhook Subscriptions')}
                  value={subscribedCount > 0 ? t('{{count}} subscribed', { count: subscribedCount }) : t('None yet')}
                  accent={subscribedCount > 0 ? 'green' : 'amber'}
                />
                <ChecklistItem
                  title={t('Last Lead')}
                  value={tenantHealth?.last_lead_at || '—'}
                  accent={hasFirstLead ? 'green' : 'default'}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 dark:border-blue-500/30 dark:bg-[linear-gradient(180deg,rgba(29,78,216,0.22),rgba(30,41,59,0.7))]">
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">{t('Next recommended action')}</div>
                <p className="mt-2 text-sm text-blue-800 dark:text-blue-300">{nextAction.description}</p>
                <button
                  type="button"
                  onClick={nextAction.onClick}
                  disabled={loading || syncing || testingWebhook || detectingMapping}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#166fe5] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {nextAction.label}
                </button>
              </div>

              {allCoreStepsDone && !hasFirstLead && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-500/30 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <Activity className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
                    <div>
                      <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('Almost live')}</div>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                        {t('Everything is configured. Submit a Lead Ad test or wait for your first real lead.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {enableCapi && (
                <div className="rounded-2xl border border-gray-200 p-4 text-sm dark:border-blue-500/20 dark:bg-slate-950/45">
                  <div className="flex items-center gap-2 font-medium text-theme">
                    <Link2 className="h-4 w-4 text-[#1877F2]" />
                    {t('CAPI enabled')}
                  </div>
                  <p className="mt-1 text-[var(--muted-text)]">
                    {pixelId
                      ? t('Pixel {{id}} is configured for server-side events.', { id: pixelId })
                      : t('Enable a Pixel ID in the Pixel & CAPI tab for full tracking.')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {setupSteps.map((step) => (
              <StepCard key={step.title} {...step} />
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 dark:border-blue-500/20 dark:bg-slate-950/45">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
              <h4 className="text-sm font-semibold text-theme">{t('Troubleshooting quick guide')}</h4>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[var(--muted-text)]">
              <div><span className="font-medium text-theme">{t('No leads arriving')}:</span> {t('Confirm the page is active, auto-sync is on, and the Lead Ad form is published on Facebook.')}</div>
              <div><span className="font-medium text-theme">{t('Webhook failed')}:</span> {t('Webhooks are configured by your system administrator. Run Test Webhook and contact support if it fails.')}</div>
              <div><span className="font-medium text-theme">{t('Wrong field data')}:</span> {t('Use Auto-Detect Mapping or adjust fields manually in the Lead Sync tab.')}</div>
              <div><span className="font-medium text-theme">{t('Token expired')}:</span> {t('Reconnect Meta from the overview tab if you see a reconnection warning.')}</div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-200 p-4 text-sm text-[var(--muted-text)] dark:border-blue-500/20 dark:bg-slate-950/40">
              {t('Loading setup status...')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
