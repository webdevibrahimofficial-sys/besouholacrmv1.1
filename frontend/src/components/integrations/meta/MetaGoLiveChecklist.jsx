import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, ClipboardCheck, Server, User } from 'lucide-react'

const ITEM_LABELS = {
  shared_app: { en: 'Shared Meta App configured (Super Admin)', ar: 'تطبيق ميتا المشترك مُعدّ (مسؤول النظام)' },
  meta_connected: { en: 'Facebook account connected', ar: 'حساب فيسبوك مربوط' },
  active_pages: { en: 'At least one active lead page', ar: 'صفحة ليدز نشطة واحدة على الأقل' },
  webhook_subscribed: { en: 'Page webhook subscription active', ar: 'اشتراك ويب هوك الصفحة نشط' },
  auto_sync_enabled: { en: 'Lead auto-sync enabled', ar: 'مزامنة الليدز التلقائية مفعّلة' },
  field_mapping: { en: 'Lead form field mapping configured', ar: 'تعيين حقول نموذج الليدز مُعدّ' },
  no_attention_flags: { en: 'No connection warnings', ar: 'لا توجد تحذيرات على الاتصال' },
  first_lead_received: { en: 'First Meta lead received (verification)', ar: 'استلام أول ليد من ميتا (تحقق)' },
  meta_console_webhook: { en: 'Webhook URL + verify token set in Meta Developer Console', ar: 'رابط الويب هوك + verify token في Meta Developer Console' },
  queue_worker_meta: { en: 'Queue worker running for the meta queue', ar: 'عامل الطابور يعمل لطابور meta' },
  token_refresh_cron: { en: 'meta:refresh-tokens scheduled in cron', ar: 'جدولة meta:refresh-tokens في cron' },
}

const ChecklistRow = ({ item, isArabic }) => {
  const labels = ITEM_LABELS[item.id] || { en: item.id, ar: item.id }
  const label = isArabic ? labels.ar : labels.en

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
      item.complete
        ? 'border-green-200 bg-green-50/70 dark:border-green-800 dark:bg-green-900/10'
        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/20'
    }`}>
      {item.complete ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-300" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-theme">{label}</p>
        {!item.automated && (
          <p className="mt-1 text-xs text-[var(--muted-text)]">
            {isArabic ? 'تحقق يدوي — راجع مسؤول النظام / DevOps' : 'Manual check — confirm with system admin / DevOps'}
          </p>
        )}
      </div>
    </div>
  )
}

export default function MetaGoLiveChecklist({ goLive, onOpenTab }) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')

  if (!goLive?.items?.length) {
    return (
      <div className="rounded-xl border border-gray-200 p-6 text-sm text-[var(--muted-text)] dark:border-gray-700">
        {t('Loading go-live checklist...')}
      </div>
    )
  }

  const platformItems = goLive.items.filter((item) => item.group === 'platform')
  const tenantItems = goLive.items.filter((item) => item.group === 'tenant')
  const progress = goLive.total > 0 ? Math.round((goLive.completed / goLive.total) * 100) : 0

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-6">
      <div className="card overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-theme">
            <ClipboardCheck className="h-5 w-5 text-[#1877F2]" />
            {t('Meta Go-Live Checklist')}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            {t('Verify automated and manual steps before treating Meta lead intake as production-ready.')}
          </p>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-900/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-text)]">
                  {t('Readiness')}
                </div>
                <div className="mt-2 text-2xl font-bold text-theme">
                  {t('{{completed}} of {{total}} items complete', { completed: goLive.completed, total: goLive.total })}
                </div>
                <div className="mt-2 text-sm text-[var(--muted-text)]">
                  {goLive.ready
                    ? t('Automated checks passed — confirm manual platform items before launch.')
                    : t('Complete remaining items before go-live.')}
                </div>
              </div>
              <div className={`min-w-[7rem] rounded-2xl border px-4 py-3 text-center ${
                goLive.ready
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10'
              }`}>
                <div className="text-xs text-[var(--muted-text)]">{t('Progress')}</div>
                <div className="mt-1 text-2xl font-bold text-theme">{progress}%</div>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <div className="h-full rounded-full bg-[#1877F2] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {goLive.ready && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
              {t('All automated go-live checks passed. Confirm manual platform items, then monitor the first live leads.')}
            </div>
          )}

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-theme">
              <Server className="h-4 w-4" />
              {t('Platform / DevOps')}
            </h4>
            <div className="space-y-2">
              {platformItems.map((item) => (
                <ChecklistRow key={item.id} item={item} isArabic={isArabic} />
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-theme">
              <User className="h-4 w-4" />
              {t('Tenant setup')}
            </h4>
            <div className="space-y-2">
              {tenantItems.map((item) => (
                <ChecklistRow key={item.id} item={item} isArabic={isArabic} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onOpenTab('setup')}
              className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-theme hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('Open Setup Guide')}
            </button>
            <button
              type="button"
              onClick={() => onOpenTab('diagnostics')}
              className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-theme hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t('Open Diagnostics')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
