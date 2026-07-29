import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useTheme } from '../../shared/context/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { logExportEvent, logImportEvent } from '../../utils/api'
import { FaDownload, FaTimes, FaFileExcel, FaCloudUploadAlt } from 'react-icons/fa'

export default function DevelopersImportModal({ isRTL, onClose, onImport }) {
  const { isLight, isDark } = useTheme()
  const { t, i18n } = useTranslation()
  const rtl = typeof isRTL === 'boolean' ? isRTL : i18n.language === 'ar'

  const [excelFile, setExcelFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSummary, setImportSummary] = useState(null)

  const handleFileUpload = async (file) => {
    if (!file) return
    setImportError(null)
    setImportSummary(null)
    if (!/\.xlsx$|\.xls$/i.test(file.name)) {
      setImportError(rtl ? 'يُقبل فقط .xlsx أو .xls' : 'Only .xlsx or .xls files are supported')
      setExcelFile(null)
      return
    }
    setExcelFile(file)
  }

  const handleImport = async () => {
    if (!excelFile) return
    setImporting(true)
    setImportError(null)
    try {
      const data = await excelFile.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet)
      if (!Array.isArray(rows) || rows.length === 0) {
        setImportError(rtl ? 'الملف فارغ' : 'File is empty')
        setImporting(false)
        return
      }
      if (typeof onImport === 'function') {
        await onImport(rows)
      }
      setImportSummary({ total: rows.length })
      logImportEvent({
        module: 'Developers',
        fileName: excelFile?.name || 'developers_import.xlsx',
        format: 'xlsx',
        status: 'success',
        metaData: { total: rows.length },
      })
    } catch (e) {
      setImportError(rtl ? 'حدث خطأ أثناء استيراد الملف' : 'Error while importing file')
      logImportEvent({
        module: 'Developers',
        fileName: excelFile?.name || 'developers_import.xlsx',
        format: 'xlsx',
        status: 'failed',
        errorMessage: e?.message,
      })
    } finally {
      setImporting(false)
    }
  }

  const generateTemplate = () => {
    const templateData = [
      {
        companyName: rtl ? 'اسم الشركة' : 'Company Name',
        contactPerson: rtl ? 'اسم المسؤول' : 'Contact Person',
        phone: rtl ? 'الهاتف' : 'Phone',
        email: rtl ? 'البريد الإلكتروني' : 'Email',
        city: rtl ? 'المدينة' : 'City',
        status: 'Active',
      },
    ]
    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Developers Template')
    const fileName = 'developers_template.xlsx'
    XLSX.writeFile(workbook, fileName)
    logExportEvent({
      module: 'Developers',
      fileName,
      format: 'xlsx',
    })
  }

  return (
    <div className={`fixed inset-0 z-[2000] ${rtl ? 'rtl' : 'ltr'} flex items-start justify-center pt-20`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div
        className="relative max-w-2xl w-full mx-4 rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] transition-colors duration-200"
        style={{
          backgroundColor: isDark ? '#172554' : 'white',
          borderColor: isDark ? '#1e3a8a' : '#e5e7eb',
          color: isDark ? 'white' : '#111827',
        }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1e3a8a]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <FaDownload className="w-4 h-4" />
            </div>
            <h3 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>
              {rtl ? 'استيراد المطورين' : 'Import Developers'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className="px-6 py-6 overflow-y-auto custom-scrollbar">
          <div className="mb-6 p-4 rounded-xl border border-blue-200 dark:bg-[#1e3a8a]/40 dark:border-[#1e3a8a]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <FaFileExcel className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <h4 className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                    {t('template.downloadExcel', 'Download Excel Template')}
                  </h4>
                  <p className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>
                    {t('template.downloadDescription', 'Use this template to import data correctly')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={generateTemplate}
                className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none flex items-center gap-2"
              >
                <FaDownload className="w-3 h-3" />
                {t('template.downloadButton', 'Download')}
              </button>
            </div>
            <div className={`mt-3 text-xs ${isLight ? 'text-black' : 'text-white'}`}>
              <strong>{t('template.requiredFields', 'Required Fields')}:</strong>{' '}
              {rtl
                ? 'اسم الشركة، اسم المسؤول، الهاتف'
                : 'Company Name, Contact Person, Phone'}
            </div>
            <div className={`mt-2 text-xs ${isLight ? 'text-black' : 'text-white'}`}>
              <strong>{rtl ? 'حقول اختيارية' : 'Optional Fields'}:</strong>{' '}
              {rtl ? 'البريد الإلكتروني، المدينة، الحالة' : 'Email, City, Status'}
            </div>
          </div>

          <div
            className="group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed transition-colors duration-300 border-blue-300 dark:border-[#3b82f6] dark:bg-[#1e3a8a]/20 dark:hover:bg-[#1e3a8a]/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) await handleFileUpload(file)
            }}
          >
            <FaCloudUploadAlt className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            <p className={`text-sm ${isLight ? 'text-black' : 'text-white'} text-center`}>
              {t('import.dropzone', 'Drag and drop Excel file here')}
            </p>
            <input
              id="developers-import-excel-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={async (e) => {
                const file = e.target.files?.[0] || null
                if (file) await handleFileUpload(file)
                else {
                  setExcelFile(null)
                  setImportError(null)
                  setImportSummary(null)
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById('developers-import-excel-input')?.click()}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none"
            >
              {t('import.browseButton', 'Browse Files')}
            </button>
            {excelFile ? (
              <div className={`mt-2 text-xs ${isLight ? 'text-black' : 'text-white'}`}>
                {t('import.selectedFile', { file: excelFile.name, defaultValue: `Selected: ${excelFile.name}` })}
              </div>
            ) : (
              <div className={`mt-2 text-xs ${isLight ? 'text-black' : 'text-white'}`}>
                {t('import.noFileSelected', 'No file selected')}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              type="button"
              onClick={handleImport}
              disabled={!excelFile || importing}
              className={`btn btn-sm ${importing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white border-none flex items-center gap-2`}
            >
              <FaDownload className="w-4 h-4" />
              {importing ? t('import.importing', 'Importing...') : t('import.importButton', rtl ? 'استيراد المطورين' : 'Import Developers')}
            </button>
            <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>
              {t('import.supportedFiles', 'Supported files: .xlsx, .xls')}
            </span>
          </div>

          {importError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
              {t(importError) || importError}
            </div>
          )}
          {importSummary && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800">
              {rtl
                ? `تم تجهيز ${importSummary.total} مطور للاستيراد`
                : `Prepared ${importSummary.total} developers for import`}
            </div>
          )}

          <div className={`mt-3 text-xs ${isLight ? 'text-black' : 'text-white'}`}>
            {rtl
              ? 'الأعمدة المدعومة: اسم الشركة، المسؤول، الهاتف، البريد، المدينة، الحالة (وأسماء إنجليزية مكافئة في القالب).'
              : 'Supported columns: Company Name, Contact Person, Phone, Email, City, Status (see template for exact headers).'}
          </div>
        </div>
      </div>
    </div>
  )
}
