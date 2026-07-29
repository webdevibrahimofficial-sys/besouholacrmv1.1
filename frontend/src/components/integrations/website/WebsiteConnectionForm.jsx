import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { websiteIntegrationService } from '../../../services/websiteIntegrationService'
import { getSourceDisplayName } from '../../../shared/utils/sourceDisplay'

const toOriginsText = (value) => {
  if (Array.isArray(value)) return value.join('\n')
  return value || ''
}

export default function WebsiteConnectionForm({
  mode = 'create',
  form,
  campaigns,
  sources,
  saving,
  onChange,
  onSubmit,
  onCancel,
}) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.language || '').startsWith('ar')
  const title = mode === 'edit' ? t('Edit Website Connection') : t('Create Website Connection')

  const availableSources = useMemo(() => sources || [], [sources])
  const availableCampaigns = useMemo(() => campaigns || [], [campaigns])
  const originValidation = useMemo(
    () => websiteIntegrationService.validateOriginsInput(form.allowed_origins),
    [form.allowed_origins]
  )

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-theme">{title}</h3>
        <p className="text-sm text-[var(--muted-text)]">{t('Configure CRM routing, source, origin policy, and activation state.')}</p>
      </div>

      <form onSubmit={onSubmit} className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme mb-1">{t('Connection Name')}</label>
            <input
              className="input w-full"
              value={form.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder={t('Main Website')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme mb-1">{t('Website URL')}</label>
            <input
              className="input w-full"
              value={form.url || ''}
              onChange={(e) => onChange('url', e.target.value)}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme mb-1">{t('Default Campaign')}</label>
            <select
              className="select w-full"
              value={form.default_campaign_id ?? ''}
              onChange={(e) => onChange('default_campaign_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('No default campaign')}</option>
              {availableCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme mb-1">{t('Default Source')}</label>
            <select
              className="select w-full"
              value={form.default_source_id ?? ''}
              onChange={(e) => onChange('default_source_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('Auto Website source')}</option>
              {availableSources.map((source) => (
                <option key={source.id} value={source.id}>{getSourceDisplayName(source, isArabic)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme mb-1">{t('Allowed Origins')}</label>
          <textarea
            className="textarea w-full h-28"
            value={toOriginsText(form.allowed_origins)}
            onChange={(e) => onChange('allowed_origins', e.target.value)}
            placeholder={'https://example.com\nhttps://www.example.com'}
          />
          <p className="mt-1 text-xs text-[var(--muted-text)]">{t('Add full origins with protocol, one per line or separated by commas.')}</p>
          {originValidation.parsedOrigins.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {originValidation.parsedOrigins.map((origin) => (
                <span
                  key={origin}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${
                    originValidation.invalidOrigins.includes(origin)
                      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                      : 'bg-gray-50 text-theme border-gray-200 dark:bg-gray-900/20 dark:border-gray-700'
                  }`}
                >
                  {origin}
                </span>
              ))}
            </div>
          ) : null}
          {originValidation.invalidOrigins.length > 0 ? (
            <div className="mt-2 text-sm text-red-600 dark:text-red-300">
              {t('Invalid origins: {{origins}}', { origins: originValidation.invalidOrigins.join(', ') })}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              checked={!!form.allow_all_origins_for_testing}
              onChange={(e) => onChange('allow_all_origins_for_testing', e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-theme">{t('Allow all origins for testing')}</span>
              <span className="block text-xs text-[var(--muted-text)]">{t('Use only in development or temporary testing scenarios.')}</span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              checked={form.is_active !== false}
              onChange={(e) => onChange('is_active', e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-theme">{t('Connection is active')}</span>
              <span className="block text-xs text-[var(--muted-text)]">{t('Inactive connections reject incoming website leads.')}</span>
            </span>
          </label>
        </div>

        {form.allow_all_origins_for_testing ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">{t('Testing mode reduces origin protection')}</div>
              <div className="mt-1">{t('Disable this option in production and configure explicit allowed origins instead.')}</div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-theme">
            {t('Cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || !originValidation.isValid}
            className="px-4 py-2 rounded-lg bg-[var(--primary-color)] text-white font-medium hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {saving ? t('Saving...') : mode === 'edit' ? t('Save Changes') : t('Create Connection')}
          </button>
        </div>
      </form>
    </div>
  )
}
