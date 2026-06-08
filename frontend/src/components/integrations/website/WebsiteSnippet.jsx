import { useTranslation } from 'react-i18next'

export default function WebsiteSnippet({ connection, apiKey, snippet, onClose, onCopy }) {
  const { t } = useTranslation()
  const hasFullKey = !!apiKey

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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

      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200">
            <strong>{t('Important:')}</strong> {t('The full API key is only shown right after create/regenerate.')}
            {hasFullKey ? (
              <> {t('Copy this snippet now and store the key securely.')}</>
            ) : (
              <> {t('Full API key is no longer available after reload. Regenerate the key to copy a new ready-to-use snippet.')}</>
            )}
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
            <div className="text-[var(--muted-text)] mb-1">{t('Connection')}</div>
            <div className="font-medium text-theme">{connection?.name || '-'}</div>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
            <div className="text-[var(--muted-text)] mb-1">{t('API Key')}</div>
            <div className="font-mono text-theme break-all">{hasFullKey ? apiKey : t('Regenerate key to copy a new snippet')}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-theme">{t('Copy/paste snippet')}</h4>
            <button
              onClick={() => onCopy(snippet)}
              disabled={!hasFullKey}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!hasFullKey ? t('Regenerate the key first to copy a ready-to-use snippet.') : ''}
            >
              {t('Copy Snippet')}
            </button>
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
              {t('Full key is no longer available for this connection. Regenerate the key to copy a fresh production-ready snippet.')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
