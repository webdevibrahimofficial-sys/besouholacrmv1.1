import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@shared/context/ThemeProvider'
import * as XLSX from 'xlsx'
import { api } from '../utils/api'
import { FaDownload, FaFileExcel, FaHistory, FaTimes } from 'react-icons/fa'

const TEMPLATE_ROWS = [
  {
    'Client Name': 'Noha ibrahim lotfy',
    Mobile: '01228000000',
    Stage: '',
    'Action Type': '',
    'Follow Date': '',
    'Sales Rep': '',
    Comment: '',
  },
  {
    'Client Name': '',
    Mobile: '',
    Stage: 'No Answer',
    'Action Type': '',
    'Follow Date': '2025-07-26 17:37:17',
    'Sales Rep': 'moataz hamdy',
    Comment: 'first call',
  },
  {
    'Client Name': '',
    Mobile: '',
    Stage: 'Follow up',
    'Action Type': '',
    'Follow Date': '2025-07-27 12:35:29',
    'Sales Rep': 'moataz hamdy',
    Comment: 'asked to call later',
  },
]

export default function ImportLeadHistoryModal({
  isOpen,
  onClose,
  targetLead,
  historyFile,
  setHistoryFile,
  selectedSheet,
  setSelectedSheet,
  importing,
  importError,
  importSummary,
  onImport,
}) {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [sheetNames, setSheetNames] = useState([])
  const [previewRows, setPreviewRows] = useState([])
  const [previewHeaders, setPreviewHeaders] = useState([])
  const [showJobDetails, setShowJobDetails] = useState(false)
  const [downloadingReviewed, setDownloadingReviewed] = useState(false)

  const jobId = importSummary?.jobId ? Number(importSummary.jobId) : null
  const jobRows = Array.isArray(importSummary?.jobRows) ? importSummary.jobRows : []

  const issueRows = useMemo(() => {
    if (!Array.isArray(jobRows) || jobRows.length === 0) return []
    const rows = jobRows.filter((r) => {
      const status = String(r?.status || '').toLowerCase()
      const hasWarnings = Array.isArray(r?.warnings) && r.warnings.length > 0
      return status === 'failed' || status === 'skipped' || status === 'duplicate' || hasWarnings
    })
    rows.sort((a, b) => (Number(a?.row_number ?? 0) || 0) - (Number(b?.row_number ?? 0) || 0))
    return rows.slice(0, 50)
  }, [jobRows])

  const targetLeadName = String(targetLead?.name || targetLead?.fullName || targetLead?.leadName || '').trim()
  const targetLeadPhone = String(targetLead?.phone || targetLead?.mobile || '').trim()

  useEffect(() => {
    setShowJobDetails(false)
  }, [jobId])

  useEffect(() => {
    if (!historyFile) {
      setSheetNames([])
      setPreviewHeaders([])
      setPreviewRows([])
      return
    }

    let cancelled = false

    const loadWorkbook = async () => {
      try {
        const buffer = await historyFile.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const names = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []
        if (cancelled) return

        setSheetNames(names)
        const activeSheet = selectedSheet && names.includes(selectedSheet) ? selectedSheet : (names[0] || '')
        if (activeSheet && activeSheet !== selectedSheet) {
          setSelectedSheet(activeSheet)
        }

        if (!activeSheet) {
          setPreviewHeaders([])
          setPreviewRows([])
          return
        }

        const worksheet = workbook.Sheets[activeSheet]
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
        const headers = rows.length > 0 ? Object.keys(rows[0]) : []
        setPreviewHeaders(headers.slice(0, 6))
        setPreviewRows(rows.slice(0, 5))
      } catch {
        if (cancelled) return
        setSheetNames([])
        setPreviewHeaders([])
        setPreviewRows([])
      }
    }

    loadWorkbook()
    return () => {
      cancelled = true
    }
  }, [historyFile, selectedSheet, setSelectedSheet])

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet(TEMPLATE_ROWS)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lead History')
    XLSX.writeFile(workbook, 'lead_history_template.xlsx')
  }

  const downloadReviewedFile = async ({ issuesOnly }) => {
    if (!jobId) return
    try {
      setDownloadingReviewed(true)
      const res = await api.get(`/api/import-jobs/${jobId}/reviewed-file`, {
        params: issuesOnly ? { issues_only: 1 } : undefined,
        responseType: 'blob',
      })

      const blob = new Blob([res.data], {
        type:
          res.headers?.['content-type'] ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const baseName = (historyFile?.name || `import_job_${jobId}`).replace(/\.(xlsx|xls)$/i, '')
      link.download = `${baseName}${issuesOnly ? '_issues' : '_reviewed'}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } finally {
      setDownloadingReviewed(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-[2000] ${i18n.language === 'ar' ? 'rtl' : 'ltr'} flex items-start justify-center pt-20`}>
      <div className={`absolute inset-0 ${isDark ? 'bg-black/75 backdrop-blur-sm' : 'bg-black/50'}`} onClick={onClose} />
      <div
        className={`relative max-w-3xl w-full mx-4 rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden transition-colors duration-200 ${
          isDark ? 'bg-[#0f172a] border-[#1d4ed8]' : 'bg-white border-gray-200'
        }`}
      >
        <div className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-[#1e3a8a] bg-[#0f172a]' : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
              <FaHistory className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                {i18n.language === 'ar' ? 'استيراد هيستوري الليدز' : 'Import Lead History'}
              </h3>
              <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                {i18n.language === 'ar'
                  ? 'يرفع الأكشنز التاريخية فقط بدون تغيير المرحلة الحالية لليد.'
                  : 'Imports historical actions only without changing the lead current stage.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`btn btn-sm btn-circle btn-ghost ${isDark ? 'text-white hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className={`px-6 py-6 overflow-y-auto custom-scrollbar space-y-5 ${isDark ? 'bg-[#0f172a]' : 'bg-white'}`}>
          {targetLead && (
            <div className={`px-4 py-3 rounded-xl border ${isDark ? 'bg-[#14213d] border-[#60a5fa]/40 text-blue-100' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
              <div className="text-sm font-semibold">
                {i18n.language === 'ar' ? 'الليد المستهدفة' : 'Target Lead'}
              </div>
              <div className="mt-1 text-xs opacity-90">
                {targetLeadName || (i18n.language === 'ar' ? 'بدون اسم' : 'No name')}
                {targetLeadPhone ? ` - ${targetLeadPhone}` : ''}
              </div>
              <div className="mt-2 text-xs opacity-80">
                {i18n.language === 'ar'
                  ? 'يفضل أن يحتوي ملف الهيستوري على نفس الاسم أو الموبايل حتى يتم الربط مع هذه الليد بشكل صحيح.'
                  : 'Make sure the history file contains the same name or mobile so it matches this lead correctly.'}
              </div>
            </div>
          )}

          <div className={`p-4 rounded-xl border ${
            isDark ? 'bg-[#14213d] border-[#60a5fa]/50' : 'bg-white border-blue-200'
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FaFileExcel className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                    {i18n.language === 'ar' ? 'تحميل قالب الهيستوري' : 'Download History Template'}
                  </h4>
                  <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {i18n.language === 'ar'
                      ? 'الصف الأول يمكن يكون context للعميل، والصفوف التالية تحتوي الهيستوري.'
                      : 'The first row can be lead context, followed by action history rows.'}
                  </p>
                </div>
              </div>
              <button
                onClick={downloadTemplate}
                className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none flex items-center gap-2"
              >
                <FaDownload className="w-3 h-3" />
                {i18n.language === 'ar' ? 'تحميل' : 'Download'}
              </button>
            </div>
          </div>

          <div
            className={`group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed transition-colors duration-300 ${
              isDark ? 'border-[#60a5fa] bg-[#14213d] hover:bg-[#1b2b4d]' : 'border-blue-300 bg-white hover:bg-blue-50/40'
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file && (/\.xlsx$|\.xls$/i).test(file.name)) {
                setHistoryFile(file)
              }
            }}
          >
            <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0l-3 3m3-3l3 3m7 4v12m0 0l-3-3m3 3l3-3" />
            </svg>
            <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              {i18n.language === 'ar' ? 'اسحب ملف الهيستوري هنا أو اختره يدويًا' : 'Drag the history file here or browse manually'}
            </p>
            <input
              id="modal-history-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setHistoryFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById('modal-history-file-input')?.click()}
              className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none"
            >
              {i18n.language === 'ar' ? 'اختيار ملف' : 'Browse File'}
            </button>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {historyFile
                ? (i18n.language === 'ar' ? `الملف المحدد: ${historyFile.name}` : `Selected file: ${historyFile.name}`)
                : (i18n.language === 'ar' ? 'لم يتم اختيار ملف بعد' : 'No file selected yet')}
            </div>
          </div>

          {sheetNames.length > 1 && (
            <div className="grid grid-cols-1 gap-2">
              <label className={`text-sm font-medium ${isDark ? 'text-white' : 'text-black'}`}>
                {i18n.language === 'ar' ? 'ورقة العمل' : 'Worksheet'}
              </label>
              <select
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
                className={`input input-bordered w-full ${isDark ? 'bg-[#14213d] text-white border-[#2c4b7a]' : 'bg-white text-black'}`}
              >
                {sheetNames.map((sheet) => (
                  <option key={sheet} value={sheet}>{sheet}</option>
                ))}
              </select>
            </div>
          )}

          {previewHeaders.length > 0 && (
            <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-[#1e3a8a]' : 'border-gray-200'}`}>
              <div className={`px-4 py-3 text-sm font-semibold ${isDark ? 'bg-[#14213d] text-white' : 'bg-gray-50 text-black'}`}>
                {i18n.language === 'ar' ? 'معاينة سريعة' : 'Quick Preview'}
              </div>
              <div className="overflow-auto max-h-64">
                <table className="table table-sm w-full">
                  <thead>
                    <tr>
                      {previewHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={index}>
                        {previewHeaders.map((header) => (
                          <td key={`${index}-${header}`}>{String(row?.[header] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={onImport}
              disabled={!historyFile || importing}
              className={`btn btn-sm text-white border-none flex items-center gap-2 ${
                !historyFile || importing
                  ? isDark
                    ? 'bg-indigo-900/60 text-indigo-100/70 cursor-not-allowed'
                    : 'bg-indigo-300 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <FaDownload className="w-4 h-4" />
              {importing
                ? (i18n.language === 'ar' ? 'جارٍ الاستيراد...' : 'Importing...')
                : (i18n.language === 'ar' ? 'استيراد الهيستوري' : 'Import History')}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {i18n.language === 'ar'
                ? 'الهيدر المتوقع: Client Name / Mobile / Stage / Follow Date / Sales Rep / Comment'
                : 'Expected headers: Client Name / Mobile / Stage / Follow Date / Sales Rep / Comment'}
            </span>
          </div>

          {importError && (
            <div className="px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
              {importError}
            </div>
          )}

          {importSummary && (
            <div className="space-y-3">
              <div className="px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800">
                {i18n.language === 'ar'
                  ? `تمت معالجة ${importSummary.added || 0} صف بنجاح`
                  : `Processed ${importSummary.added || 0} rows successfully`}
              </div>

              {jobId && (
                <div className="px-4 py-3 rounded-lg bg-gray-50 text-gray-800 border border-gray-200 dark:bg-[#0b1220]/40 dark:text-gray-200 dark:border-[#1e3a8a]/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">
                      {i18n.language === 'ar' ? `رقم العملية: #${jobId}` : `Job: #${jobId}`}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => setShowJobDetails((s) => !s)}
                        className="btn btn-xs bg-indigo-600 hover:bg-indigo-700 text-white border-none"
                      >
                        {showJobDetails
                          ? (i18n.language === 'ar' ? 'إخفاء التفاصيل' : 'Hide Details')
                          : (i18n.language === 'ar' ? 'عرض التفاصيل' : 'View Details')}
                      </button>
                      <button
                        type="button"
                        disabled={downloadingReviewed}
                        onClick={() => downloadReviewedFile({ issuesOnly: false })}
                        className="btn btn-xs bg-green-600 hover:bg-green-700 text-white border-none"
                      >
                        {i18n.language === 'ar' ? 'تنزيل ملف مُراجع' : 'Download Reviewed'}
                      </button>
                      <button
                        type="button"
                        disabled={downloadingReviewed}
                        onClick={() => downloadReviewedFile({ issuesOnly: true })}
                        className="btn btn-xs bg-amber-600 hover:bg-amber-700 text-white border-none"
                      >
                        {i18n.language === 'ar' ? 'المشاكل فقط' : 'Issues Only'}
                      </button>
                    </div>
                  </div>

                  {showJobDetails && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="table table-xs w-full">
                        <thead>
                          <tr>
                            <th>{i18n.language === 'ar' ? 'الصف' : 'Row'}</th>
                            <th>{i18n.language === 'ar' ? 'الحالة' : 'Status'}</th>
                            <th>{i18n.language === 'ar' ? 'التفاصيل' : 'Details'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {issueRows.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-center opacity-70 py-3">
                                {i18n.language === 'ar' ? 'لا توجد مشاكل لعرضها' : 'No issues to show'}
                              </td>
                            </tr>
                          ) : issueRows.map((r) => {
                            const details = []
                            if (r?.reason_message) details.push(String(r.reason_message))
                            if (Array.isArray(r?.warnings) && r.warnings.length) {
                              r.warnings.forEach((w) => details.push(String(w?.message || w?.code || 'Warning')))
                            }
                            return (
                              <tr key={r.id}>
                                <td>{r.row_number}</td>
                                <td>{r.status}</td>
                                <td>{details.join(' | ') || '-'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
