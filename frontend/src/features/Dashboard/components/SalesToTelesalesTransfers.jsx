import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@shared/context/ThemeProvider'
import EnhancedLeadDetailsModal from '@shared/components/EnhancedLeadDetailsModal'

const SCROLLBAR_CSS = `
  .scrollbar-thin-blue { scrollbar-width: thin; scrollbar-color: #2563eb transparent; }
  .scrollbar-thin-blue::-webkit-scrollbar { width: 8px; height: 8px; }
  .scrollbar-thin-blue::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin-blue::-webkit-scrollbar-thumb { background-color: #2563eb; border-radius: 9999px; }
  .scrollbar-thin-blue:hover::-webkit-scrollbar-thumb { background-color: #1d4ed8; }
`

const formatDateTimeSafe = (iso, locale) => {
  try {
    const value = new Date(iso)
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  } catch {
    return iso || '-'
  }
}

const mapAssignRoleLabel = (assignRole, isArabic) => {
  const normalized = String(assignRole || '').toLowerCase().trim()
  if (normalized === 'manager') {
    return isArabic ? 'مدير تيليسيلز' : 'Telesales Manager'
  }

  return isArabic ? 'وكيل تيليسيلز' : 'Telesales Agent'
}

export default function SalesToTelesalesTransfers({ rows = [], loading = false }) {
  const { t, i18n } = useTranslation()
  const { theme, resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  const isArabic = i18n.language === 'ar'
  const locale = isArabic ? 'ar-EG' : 'en-US'
  const [selectedLead, setSelectedLead] = useState(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)

  const normalizedRows = useMemo(() => (
    Array.isArray(rows) ? rows : []
  ), [rows])

  const emptyLabel = loading
    ? (isArabic ? 'جارٍ تحميل التحويلات...' : 'Loading transfers...')
    : (isArabic ? 'لا توجد تحويلات من السيلز إلى التيليسيلز' : 'No sales to telesales transfers found')

  return (
    <>
      <style>{SCROLLBAR_CSS}</style>

      <div className="sm:hidden space-y-3 max-h-[28rem] overflow-y-auto scrollbar-thin-blue">
        {normalizedRows.length ? normalizedRows.map((row) => (
          <div
            key={row.id}
            className={`rounded-xl border p-3 transition-shadow ${
              isLight
                ? 'border-gray-200 bg-white hover:shadow-md'
                : 'border-gray-700 bg-gray-800/80 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="text-sm font-semibold text-blue-500 hover:underline"
                onClick={() => {
                  setSelectedLead({ id: row.leadId, fullName: row.leadName })
                  setIsLeadModalOpen(true)
                }}
              >
                {row.leadName}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDateTimeSafe(row.transferredAt, locale)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div><span className="font-medium">{isArabic ? 'من السيلز:' : 'From Sales:'}</span> {row.fromSalesName || '-'}</div>
              <div><span className="font-medium">{isArabic ? 'إلى التيليسيلز:' : 'To Telesales:'}</span> {row.toTelesalesName || '-'}</div>
              <div><span className="font-medium">{isArabic ? 'نوع التعيين:' : 'Assignment Type:'}</span> {mapAssignRoleLabel(row.assignRole, isArabic)}</div>
              <div><span className="font-medium">{isArabic ? 'المرحلة بعد التحويل:' : 'Stage After Transfer:'}</span> {row.stageAfter || '-'}</div>
              <div><span className="font-medium">{t('Source')}:</span> {row.source || '-'}</div>
            </div>
          </div>
        )) : (
          <div className={`rounded-xl border p-4 text-sm ${isLight ? 'border-gray-200 bg-white text-gray-500' : 'border-gray-700 bg-gray-800/80 text-gray-300'}`}>
            {emptyLabel}
          </div>
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto scrollbar-thin-blue">
        <table className="w-full min-w-[960px] text-sm">
          <thead className={isLight ? 'bg-gray-200 text-gray-800' : 'bg-gray-900 text-gray-200'}>
            <tr>
              <th className="px-4 py-3 text-start">{isArabic ? 'العميل المحتمل' : 'Lead'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'المصدر' : 'Source'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'من السيلز' : 'From Sales'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'إلى التيليسيلز' : 'To Telesales'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'نوع التعيين' : 'Assignment Type'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'المرحلة قبل' : 'Stage Before'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'المرحلة بعد' : 'Stage After'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'تم التحويل بواسطة' : 'Transferred By'}</th>
              <th className="px-4 py-3 text-start">{isArabic ? 'تاريخ التحويل' : 'Transfer Date'}</th>
            </tr>
          </thead>
          <tbody>
            {normalizedRows.length ? normalizedRows.map((row) => (
              <tr
                key={row.id}
                className={`border-b ${
                  isLight
                    ? 'border-gray-200 bg-white hover:bg-gray-50'
                    : 'border-gray-700 bg-gray-800 hover:bg-blue-900/20'
                }`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-blue-500 hover:underline"
                    onClick={() => {
                      setSelectedLead({ id: row.leadId, fullName: row.leadName })
                      setIsLeadModalOpen(true)
                    }}
                  >
                    {row.leadName}
                  </button>
                </td>
                <td className="px-4 py-3">{row.source || '-'}</td>
                <td className="px-4 py-3">{row.fromSalesName || '-'}</td>
                <td className="px-4 py-3">{row.toTelesalesName || row.toManagerName || '-'}</td>
                <td className="px-4 py-3">{mapAssignRoleLabel(row.assignRole, isArabic)}</td>
                <td className="px-4 py-3">{row.stageBefore || '-'}</td>
                <td className="px-4 py-3">{row.stageAfter || '-'}</td>
                <td className="px-4 py-3">{row.transferredBy || '-'}</td>
                <td className="px-4 py-3">{formatDateTimeSafe(row.transferredAt, locale)}</td>
              </tr>
            )) : (
              <tr className={isLight ? 'bg-white' : 'bg-gray-800'}>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-300" colSpan={9}>
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EnhancedLeadDetailsModal
        isOpen={isLeadModalOpen}
        lead={selectedLead}
        onClose={() => setIsLeadModalOpen(false)}
        isArabic={isArabic}
        theme={theme}
        initialTab="all-actions"
      />
    </>
  )
}
