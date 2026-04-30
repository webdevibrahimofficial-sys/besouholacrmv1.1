import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useTheme } from '../../shared/context/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { logExportEvent, logImportEvent } from '../../utils/api'
import { FaDownload, FaTimes, FaFileExcel, FaUpload } from 'react-icons/fa'

export default function RealEstateRequestsImportModal({ isOpen, onClose, onImport }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'

  const [excelFile, setExcelFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSummary, setImportSummary] = useState(null)

  // keep for possible future style tweaks; avoids unused var lint warnings in stricter configs
  void isDark

  if (!isOpen) return null

  const labels = useMemo(() => {
    return {
      title: isRTL ? 'استيراد طلبات الريال إستيت' : 'Import Real Estate Requests',
      templateTitle: isRTL ? 'تحميل نموذج Excel' : 'Download Excel Template',
      templateDesc: isRTL ? 'استخدم هذا النموذج لإضافة طلبات جديدة' : 'Use this template to add new requests',
      templateNote: isRTL ? 'الرجاء عدم تغيير عناوين الأعمدة في النموذج لضمان الاستيراد الصحيح.' : 'Please do not change column headers in the template to ensure correct import.',
      uploadTitle: isRTL ? 'رفع ملف Excel' : 'Upload Excel File',
      uploadDesc: isRTL ? 'قم بسحب وإفلات الملف هنا أو اضغط للاختيار' : 'Drag and drop your file here or click to browse',
      browse: isRTL ? 'اختيار ملف' : 'Browse File',
      noFile: isRTL ? 'لم يتم اختيار ملف' : 'No file selected',
      import: isRTL ? 'استيراد البيانات' : 'Import Data',
      importing: isRTL ? 'جاري الاستيراد...' : 'Importing...',
      supported: isRTL ? 'الملفات المدعومة: .xlsx, .xls' : 'Supported files: .xlsx, .xls',
      emptyFile: isRTL ? 'الملف فارغ' : 'File is empty',
      readError: isRTL ? 'حدث خطأ أثناء استيراد الملف' : 'Error while importing file',
      prepared: (n) => isRTL ? `تم تجهيز ${n} طلب للاستيراد` : `Prepared ${n} requests for import`,
      templateBtn: isRTL ? 'تحميل' : 'Download',
    }
  }, [isRTL])

  const handleFileUpload = (file) => {
    if (!file) return
    setExcelFile(file)
    setImportError(null)
    setImportSummary(null)
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
        setImportError(labels.emptyFile)
        setImporting(false)
        return
      }
      if (typeof onImport === 'function') {
        await onImport(rows)
      }
      setImportSummary({ total: rows.length })
      logImportEvent({
        module: 'Real Estate Requests',
        fileName: excelFile?.name || 'real_estate_requests_import.xlsx',
        format: 'xlsx',
        status: 'success',
        meta: { total: rows.length },
      })
    } catch (e) {
      setImportError(labels.readError)
      logImportEvent({
        module: 'Real Estate Requests',
        fileName: excelFile?.name || 'real_estate_requests_import.xlsx',
        format: 'xlsx',
        status: 'failed',
        error: e?.message,
      })
    } finally {
      setImporting(false)
    }
  }

  const generateTemplate = () => {
    const templateData = [
      {
        project: isRTL ? 'اسم المشروع' : 'Project Name',
        customer: isRTL ? 'اسم العميل' : 'Customer Name',
        phone: isRTL ? 'رقم الهاتف' : 'Phone',
        budget: 1000000,
        unit_type: isRTL ? 'نوع الوحدة' : 'Unit Type',
        status: 'New',
      },
    ]
    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RealEstate Requests Template')
    const fileName = 'real_estate_requests_template.xlsx'
    XLSX.writeFile(workbook, fileName)
    logExportEvent({
      module: 'Real Estate Requests',
      fileName,
      format: 'xlsx',
    })
  }

  return (
    <div className={`fixed inset-0 z-[2000] ${isRTL ? 'rtl' : 'ltr'} flex items-start justify-center pt-20`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative max-w-2xl w-full mx-4 rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] transition-colors duration-200 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <FaDownload className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold">{labels.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            aria-label="Close"
            type="button"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 overflow-y-auto custom-scrollbar">
          {/* Template Download Section */}
          <div className="mb-6 p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/40 transition-colors duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FaFileExcel className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className="text-sm font-semibold">{labels.templateTitle}</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{labels.templateDesc}</p>
                </div>
              </div>
              <button
                onClick={generateTemplate}
                className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none flex items-center gap-2"
                type="button"
              >
                <FaDownload className="w-3 h-3" />
                {labels.templateBtn}
              </button>
            </div>
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{labels.templateNote}</div>
          </div>

          {/* Upload Section */}
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-white/5"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const f = e.dataTransfer?.files?.[0]
              if (f) handleFileUpload(f)
            }}
          >
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
              <FaUpload size={24} />
            </div>
            <h4 className="font-semibold mb-1">{labels.uploadTitle}</h4>
            <p className="text-xs mb-4 max-w-xs text-gray-500 dark:text-gray-400">{labels.uploadDesc}</p>

            <input
              id="real-estate-requests-excel-input"
              type="file"
              accept=".xlsx, .xls"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => document.getElementById('real-estate-requests-excel-input')?.click()}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none"
            >
              {labels.browse}
            </button>

            {excelFile ? (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                {isRTL ? 'تم اختيار: ' + excelFile.name : 'Selected: ' + excelFile.name}
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">{labels.noFile}</div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={handleImport}
              disabled={!excelFile || importing}
              className={`btn btn-sm ${importing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white border-none flex items-center gap-2`}
              type="button"
            >
              <FaDownload className="w-4 h-4" />
              {importing ? labels.importing : labels.import}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">{labels.supported}</span>
          </div>

          {/* Feedback */}
          {importError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
              {importError}
            </div>
          )}
          {importSummary && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800">
              {labels.prepared(importSummary.total)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
