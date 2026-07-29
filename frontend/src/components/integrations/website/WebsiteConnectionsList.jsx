import { useTranslation } from 'react-i18next'
import { Copy, Edit3, KeyRound, BarChart3, Trash2, Code2, Globe, CheckCircle2, XCircle } from 'lucide-react'
import { getSourceDisplayName } from '../../../shared/utils/sourceDisplay'

export default function WebsiteConnectionsList({
  connections,
  loading,
  onCreate,
  onEdit,
  onStats,
  onRegenerate,
  onDelete,
  onSnippet,
  onGuide,
  onCopyMasked,
  onTestConnection,
}) {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.language || '').startsWith('ar')

  if (loading) {
    return <div className="p-6 text-sm text-[var(--muted-text)]">{t('Loading website connections...')}</div>
  }

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-theme">{t('Website Connections')}</h3>
          <p className="text-sm text-[var(--muted-text)]">{t('Manage websites that can send leads into the CRM.')}</p>
        </div>
        <button
          onClick={onCreate}
          className="px-4 py-2 rounded-lg bg-[var(--primary-color)] text-white text-sm font-medium hover:bg-[var(--primary-hover)] transition-colors"
        >
          {t('Add Connection')}
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="p-8 text-center text-[var(--muted-text)]">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>{t('No website connections yet.')}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {connections.map((connection) => (
            <div key={connection.id} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-semibold text-theme">{connection.name}</h4>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                      connection.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {connection.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {connection.is_active ? t('Active') : t('Inactive')}
                    </span>
                  </div>

                  <div className="text-sm text-[var(--muted-text)] break-all">
                    {connection.url || 'No URL provided'}
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-text)]">
                    <span>{t('Key')}: <span className="font-mono text-theme">{connection.masked_key}</span></span>
                    <span>{t('Prefix')}: <span className="font-mono text-theme">{connection.key_prefix}</span></span>
                    <span>{t('Leads')}: <span className="text-theme font-medium">{connection.leads_count || 0}</span></span>
                    <span>{t('Requests')}: <span className="text-theme font-medium">{connection.requests_count || 0}</span></span>
                    {connection.source?.name ? <span>{t('Source')}: <span className="text-theme font-medium">{getSourceDisplayName(connection.source, isArabic)}</span></span> : null}
                    {connection.campaign?.name ? <span>{t('Campaign')}: <span className="text-theme font-medium">{connection.campaign.name}</span></span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onEdit(connection)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Edit3 className="w-4 h-4" /> {t('Edit')}
                  </button>
                  <button onClick={() => onStats(connection)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <BarChart3 className="w-4 h-4" /> {t('Stats')}
                  </button>
                  <button onClick={() => onSnippet(connection)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Code2 className="w-4 h-4" /> {t('Snippet')}
                  </button>
                  {onGuide ? (
                    <button onClick={() => onGuide(connection)} className="px-3 py-2 rounded-lg border border-cyan-200 text-cyan-700 dark:border-cyan-800 dark:text-cyan-300 text-sm flex items-center gap-2 hover:bg-cyan-50 dark:hover:bg-cyan-900/20">
                      <Globe className="w-4 h-4" /> {t('Setup Guide')}
                    </button>
                  ) : null}
                  {onTestConnection && (
                    <button onClick={() => onTestConnection(connection)} className="px-3 py-2 rounded-lg border border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300 text-sm flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <Globe className="w-4 h-4" /> {t('Test Connection')}
                    </button>
                  )}
                  <button onClick={() => onRegenerate(connection)} className="px-3 py-2 rounded-lg border border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300 text-sm flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                    <KeyRound className="w-4 h-4" /> {t('Regenerate')}
                  </button>
                  <button onClick={() => onCopyMasked(connection)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Copy className="w-4 h-4" /> {t('Copy Prefix')}
                  </button>
                  <button onClick={() => onDelete(connection)} className="px-3 py-2 rounded-lg border border-red-200 text-red-700 dark:border-red-800 dark:text-red-300 text-sm flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" /> {t('Delete')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
