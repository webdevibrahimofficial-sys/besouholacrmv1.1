import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { websiteIntegrationService } from '../../../services/websiteIntegrationService'

const TEMPLATE_TYPES = [
  {
    id: 'basic-js',
    labelKey: 'Basic JavaScript Fetch',
    descriptionKey: 'Simple fetch helper for plain websites with success and error callbacks.',
  },
  {
    id: 'html-form',
    labelKey: 'HTML Form Example',
    descriptionKey: 'Complete HTML form with inline script, submit prevention, and status messages.',
  },
  {
    id: 'react',
    labelKey: 'React Example',
    descriptionKey: 'React component using useState, loading state, and submit handling.',
  },
  {
    id: 'curl',
    labelKey: 'cURL / Postman Example',
    descriptionKey: 'Ready-to-run request for terminal or Postman endpoint testing.',
  },
]

export default function WebsiteSnippet({ connection, apiKey, onClose, onCopy }) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')
  const hasFullKey = !!apiKey
  const [selectedTemplate, setSelectedTemplate] = useState('basic-js')

  const snippet = useMemo(() => {
    if (!hasFullKey) return ''
    return websiteIntegrationService.generateSnippet(apiKey, selectedTemplate)
  }, [apiKey, hasFullKey, selectedTemplate])

  const selectedTemplateMeta = TEMPLATE_TYPES.find((item) => item.id === selectedTemplate) || TEMPLATE_TYPES[0]

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-theme">{t('Website Snippet')}</h3>
          <p className="text-sm text-[var(--muted-text)]">
            {connection?.name ? t('Embed this snippet on {{name}}.', { name: connection.name }) : t('Embed this snippet on your website.')}
          </p>
        </div>
        <button onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme">
          {t('Close')}
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200">
          <strong>{t('Important:')}</strong> {t('The full API key is only shown right after create/regenerate.')}
          {hasFullKey ? (
            <> {t('Copy this snippet now and store the key securely.')}</>
          ) : (
            <> {t('Full API key is only shown once. Regenerate key to copy a new snippet.')}</>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
            <div className="text-[var(--muted-text)] mb-1">{t('Connection')}</div>
            <div className="font-medium text-theme">{connection?.name || '-'}</div>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
            <div className="text-[var(--muted-text)] mb-1">{t('API Key')}</div>
            <div className="font-mono text-theme break-all">
              {hasFullKey ? apiKey : t('Regenerate key to copy a new snippet')}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-theme">{t('Snippet Templates')}</h4>
            <p className="text-xs text-[var(--muted-text)] mt-1">{t('Choose the example that best matches your website stack.')}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {TEMPLATE_TYPES.map((template) => {
              const active = template.id === selectedTemplate
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    active
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-700'
                      : 'border-gray-200 dark:border-gray-700 text-theme hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {t(template.labelKey)}
                </button>
              )
            })}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-theme">{t(selectedTemplateMeta.labelKey)}</div>
                <div className="text-xs text-[var(--muted-text)] mt-1">{t(selectedTemplateMeta.descriptionKey)}</div>
              </div>
              <button
                onClick={() => onCopy(snippet)}
                disabled={!hasFullKey}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!hasFullKey ? t('Regenerate the key first to copy a ready-to-use snippet.') : ''}
              >
                {t('Copy Template')}
              </button>
            </div>
          </div>
        </div>

        {hasFullKey ? (
          <>
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-4 text-sm text-blue-900 dark:text-blue-200">
              <strong>{t('Callbacks:')}</strong> {t('Use window.websiteLeadFormCallbacks.onSuccess and window.websiteLeadFormCallbacks.onError for basic success/error handling.')}
            </div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-gray-950 text-gray-100 p-4 border border-gray-800">
              {snippet}
            </pre>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 p-4 text-sm text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/10">
            <div className="font-semibold mb-1">{t('No snippet can be generated without the full API key.')}</div>
            <div>{t('Full API key is only shown once. Regenerate key to copy a new snippet.')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
