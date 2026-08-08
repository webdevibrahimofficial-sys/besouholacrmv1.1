import { CheckCircle2, Copy, KeyRound, Link2, Loader2, Server, Sparkles, Shield } from 'lucide-react'

const inputClassName =
  'block w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-theme shadow-sm outline-none transition focus:border-[#1877F2] focus:ring-2 focus:ring-[#1877F2]/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500'

const ModeOption = ({
  selected,
  onSelect,
  title,
  description,
  badge,
  badgeTone = 'neutral',
  icon: Icon,
}) => {
  const badgeClasses = {
    ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    warn: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
    neutral: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-slate-300',
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full flex-col rounded-2xl border p-4 text-start transition-all ${
        selected
          ? 'border-[#1877F2] bg-[#1877F2]/10 shadow-sm dark:border-blue-400 dark:bg-blue-500/15'
          : 'border-gray-200 bg-transparent hover:border-blue-300 dark:border-white/10 dark:bg-transparent dark:hover:border-blue-400/40 dark:hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          selected
            ? 'bg-[#1877F2] text-white'
            : 'bg-[#1877F2]/10 text-[#1877F2] dark:bg-blue-400/15 dark:text-blue-300'
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-theme">{title}</span>
            {badge ? (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses[badgeTone] || badgeClasses.neutral}`}>
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted-text)]">{description}</p>
        </div>
        <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
          selected
            ? 'border-[#1877F2] bg-[#1877F2] shadow-[inset_0_0_0_3px_rgba(255,255,255,0.9)] dark:shadow-[inset_0_0_0_3px_rgba(30,58,138,1)]'
            : 'border-gray-300 dark:border-white/25'
        }`} />
      </div>
    </button>
  )
}

const CopyField = ({ label, value, onCopy, copyLabel }) => (
  <div className="rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-text)]">{label}</span>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1877F2] transition-colors hover:bg-[#1877F2]/10 dark:text-blue-300 dark:hover:bg-blue-500/15"
      >
        <Copy className="h-3 w-3" />
        {copyLabel}
      </button>
    </div>
    <div className="mt-1.5 break-all font-mono text-xs font-medium text-theme" dir="ltr">
      {value || '—'}
    </div>
  </div>
)

export default function MetaConnectionModePanel({
  isArabic,
  sharedMetaConfigured,
  connectionMode,
  tenantApp,
  oauthCallbackUrl,
  webhookUrl,
  appFormMode,
  setAppFormMode,
  appFormAppId,
  setAppFormAppId,
  appFormAppSecret,
  setAppFormAppSecret,
  appFormVerifyToken,
  setAppFormVerifyToken,
  savingApp,
  onSave,
  onReset,
  onCopy,
  canEdit = true,
}) {
  const customReady = connectionMode === 'custom' && !!tenantApp?.is_custom_ready
  const dirtyCustom = appFormMode === 'custom'
  const sharedBadge = sharedMetaConfigured
    ? (isArabic ? 'جاهز' : 'Ready')
    : (isArabic ? 'غير مضبوط' : 'Not set')
  const sharedTone = sharedMetaConfigured ? 'ready' : 'warn'
  const customBadge = customReady
    ? (isArabic ? 'مفعّل' : 'Active')
    : (isArabic ? 'اختياري' : 'Optional')
  const customTone = customReady ? 'ready' : 'neutral'

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 dark:bg-white/5">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-white/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#1877F2]" />
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted-text)]">
                {isArabic ? 'وضع الاتصال' : 'Connection Mode'}
              </h3>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted-text)]">
              {isArabic
                ? 'اختر التطبيق المشترك للمنصة أو اربط عبر تطبيق ميتا الخاص بك لاستقبال Lead Ads. واتساب يبقى دائماً على التطبيق المشترك.'
                : 'Choose the platform shared app, or connect with your own Meta App for Lead Ads. WhatsApp always stays on the shared app.'}
            </p>
          </div>
          <div className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold ${
            connectionMode === 'custom'
              ? 'bg-[#1877F2]/15 text-[#1877F2] dark:bg-blue-500/20 dark:text-blue-200'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
          }`}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {connectionMode === 'custom'
              ? (isArabic ? 'يعمل بتطبيقك' : 'Using your app')
              : (isArabic ? 'يعمل بالمشترك' : 'Using shared app')}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {!canEdit && (
          <div className="rounded-xl border border-amber-200 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100">
            {isArabic
              ? 'عرض فقط — تعديل بيانات تطبيق ميتا متاح لمسؤول التينانت.'
              : 'View only — Meta App credentials can be edited by a tenant admin.'}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ModeOption
            selected={appFormMode === 'shared'}
            onSelect={() => canEdit && setAppFormMode('shared')}
            icon={Server}
            title={isArabic ? 'التطبيق المشترك' : 'Shared Meta App'}
            description={isArabic
              ? 'الأسرع للبدء. يعتمد على إعدادات مسؤول النظام.'
              : 'Fastest to start. Uses system administrator configuration.'}
            badge={sharedBadge}
            badgeTone={sharedTone}
          />
          <ModeOption
            selected={appFormMode === 'custom'}
            onSelect={() => canEdit && setAppFormMode('custom')}
            icon={KeyRound}
            title={isArabic ? 'تطبيقي الخاص' : 'My Own Meta App'}
            description={isArabic
              ? 'مناسب للشركات التي لديها Meta App معتمد خاص بها.'
              : 'Best for teams with their own approved Meta Developer app.'}
            badge={customBadge}
            badgeTone={customTone}
          />
        </div>

        {dirtyCustom && (
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#1877F2]" />
              <h4 className="text-sm font-semibold text-theme">
                {isArabic ? 'بيانات تطبيق ميتا' : 'Meta App Credentials'}
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted-text)]">App ID</label>
                <input
                  type="text"
                  value={appFormAppId}
                  onChange={(e) => setAppFormAppId(e.target.value)}
                  disabled={!canEdit}
                  className={inputClassName}
                  placeholder="1234567890"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted-text)]">App Secret</label>
                <input
                  type="password"
                  value={appFormAppSecret}
                  onChange={(e) => setAppFormAppSecret(e.target.value)}
                  disabled={!canEdit}
                  className={inputClassName}
                  placeholder={tenantApp?.has_app_secret ? (tenantApp.app_secret_masked || '********') : '••••••••'}
                  dir="ltr"
                  autoComplete="new-password"
                />
                {tenantApp?.has_app_secret ? (
                  <p className="mt-1 text-[11px] text-[var(--muted-text)]">
                    {isArabic ? 'اتركه فارغاً للإبقاء على السر الحالي.' : 'Leave blank to keep the current secret.'}
                  </p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted-text)]">Verify Token</label>
                <input
                  type="text"
                  value={appFormVerifyToken}
                  onChange={(e) => setAppFormVerifyToken(e.target.value)}
                  disabled={!canEdit}
                  className={inputClassName}
                  placeholder={isArabic ? 'اختياري — يُولَّد تلقائياً إن تُرك فارغاً' : 'Optional — auto-generated if empty'}
                  dir="ltr"
                />
              </div>
            </div>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={savingApp}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#166fe5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingApp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {savingApp
                ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...')
                : (isArabic ? 'حفظ وضع الاتصال' : 'Save Connection Mode')}
            </button>
            {connectionMode === 'custom' && (
              <button
                type="button"
                onClick={onReset}
                disabled={savingApp}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-transparent px-4 py-2.5 text-sm font-medium text-theme transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/[0.05]"
              >
                <Server className="h-4 w-4" />
                {isArabic ? 'رجوع للمشترك' : 'Switch to Shared'}
              </button>
            )}
          </div>
        )}

        {customReady && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 p-4 dark:border-emerald-400/25 dark:bg-emerald-500/10">
            <div className="flex items-start gap-2">
              <Link2 className="mt-0.5 h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              <div>
                <h4 className="text-sm font-semibold text-theme">
                  {isArabic ? 'انسخ إلى Meta Developer Console' : 'Copy into Meta Developer Console'}
                </h4>
                <p className="mt-1 text-xs text-[var(--muted-text)]">
                  {isArabic
                    ? 'أضف روابط OAuth و Webhook في تطبيقك، ثم اربط حساب فيسبوك.'
                    : 'Add these OAuth and Webhook values to your app, then connect Facebook.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CopyField
                label="OAuth Callback URL"
                value={oauthCallbackUrl || tenantApp?.oauth_callback_url}
                copyLabel={isArabic ? 'نسخ' : 'Copy'}
                onCopy={() => onCopy(oauthCallbackUrl || tenantApp?.oauth_callback_url, 'Callback URL')}
              />
              <CopyField
                label="Webhook URL"
                value={webhookUrl || tenantApp?.webhook_url}
                copyLabel={isArabic ? 'نسخ' : 'Copy'}
                onCopy={() => onCopy(webhookUrl || tenantApp?.webhook_url, 'Webhook URL')}
              />
              <div className="sm:col-span-2">
                <CopyField
                  label="Verify Token"
                  value={tenantApp?.verify_token}
                  copyLabel={isArabic ? 'نسخ' : 'Copy'}
                  onCopy={() => onCopy(tenantApp?.verify_token, 'Verify Token')}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
