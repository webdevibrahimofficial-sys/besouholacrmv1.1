import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useTheme } from '@shared/context/ThemeProvider'
import { logExportEvent, logImportEvent } from '@utils/api'
import { FaChevronDown, FaChevronUp, FaDownload, FaFileExcel, FaTimes, FaUpload } from 'react-icons/fa'

const safeStr = (v) => String(v ?? '').trim()

const CcContractsImportModal = ({ onClose, onImport, isRTL }) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [excelFile, setExcelFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  const generateTemplate = () => {
    const headers = [
      'Customer ID',
      'Property ID',
      'Contract Number',
      'Contract Date (YYYY-MM-DD)',
      'First Due Date (YYYY-MM-DD)',
      'Total Price',
    ]
    const dummyData = [
      [12, 345, 'CN-0001', '2026-04-01', '2026-04-15', 1500000],
      [13, 346, 'CN-0002', '2026-04-03', '', 900000],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dummyData])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts Template')
    const fileName = 'cc_contracts_template.xlsx'
    XLSX.writeFile(wb, fileName)
    logExportEvent({ module: 'CC Contracts', fileName, format: 'xlsx' })
  }

  const validateRequiredFields = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
          if (jsonData.length < 2) {
            reject(new Error(isRTL ? 'الملف فارغ' : 'File is empty'))
            return
          }
          const headers = (jsonData[0] || []).map((h) => String(h).toLowerCase().trim())
          const hasCustomer = headers.some((h) => h.includes('customer') && h.includes('id')) || headers.includes('customer id')
          const hasProperty = headers.some((h) => h.includes('property') && h.includes('id')) || headers.includes('property id')
          if (!hasCustomer || !hasProperty) {
            reject(new Error(isRTL ? 'حقول مطلوبة مفقودة: Customer ID و Property ID' : 'Missing required fields: Customer ID and Property ID'))
            return
          }
          resolve(true)
        } catch {
          reject(new Error(isRTL ? 'خطأ في قراءة الملف' : 'Error reading file'))
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  const handleFileUpload = async (file) => {
    if (!file) return
    setImportError(null)
    setImportSummary(null)
    setShowDetails(false)

    try {
      await validateRequiredFields(file)
      setExcelFile(file)
    } catch (error) {
      setImportError(error?.message || (isRTL ? 'ملف غير صالح' : 'Invalid file'))
      setExcelFile(null)
      logImportEvent({
        module: 'CC Contracts',
        fileName: file?.name || 'cc_contracts_import.xlsx',
        format: 'xlsx',
        status: 'failed',
        errorMessage: error?.message || 'Invalid import file',
        metaData: { reason_code: 'invalid_import_file' },
      })
    }
  }

  const executeImport = async () => {
    if (!excelFile) return
    setImporting(true)
    setImportError(null)
    setImportSummary(null)
    setShowDetails(false)

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' })

          const findKey = (row, keys) => {
            const rowKeys = Object.keys(row || {})
            for (const k of keys) {
              const found = rowKeys.find((rk) => rk.toLowerCase().trim() === String(k).toLowerCase().trim())
              if (found) return row[found]
            }
            return ''
          }

          const mapped = jsonData.map((row, idx) => ({
            __rowNumber: idx + 2,
            customer_id: findKey(row, ['Customer ID', 'customer_id', 'رقم العميل', 'كود العميل']),
            property_id: findKey(row, ['Property ID', 'property_id', 'رقم الوحدة', 'رقم العقار']),
            contract_number: safeStr(findKey(row, ['Contract Number', 'Contract No', 'رقم العقد'])),
            contract_date: safeStr(findKey(row, ['Contract Date', 'contract_date', 'تاريخ العقد'])),
            first_due_date: safeStr(findKey(row, ['First Due Date', 'first_due_date', 'تاريخ أول قسط'])),
            total_price: findKey(row, ['Total Price', 'Price', 'total_price', 'السعر']),
          }))

          const res = await onImport(mapped)
          setImportSummary(res || { added: 0, failed: 0, errors: [] })
          logImportEvent({
            module: 'CC Contracts',
            fileName: excelFile?.name || 'cc_contracts_import.xlsx',
            format: 'xlsx',
            status: (res?.failed || 0) > 0 ? 'warning' : (res?.added || 0) > 0 ? 'success' : 'warning',
            metaData: { added: res?.added || 0, failed: res?.failed || 0 },
          })
        } catch (err) {
          setImportError(isRTL ? 'فشل الاستيراد' : 'Import failed')
          logImportEvent({
            module: 'CC Contracts',
            fileName: excelFile?.name || 'cc_contracts_import.xlsx',
            format: 'xlsx',
            status: 'failed',
            errorMessage: err?.message || 'Import failed',
          })
        } finally {
          setImporting(false)
        }
      }
      reader.readAsArrayBuffer(excelFile)
    } catch (e) {
      setImporting(false)
      setImportError(isRTL ? 'فشل الاستيراد' : 'Import failed')
      logImportEvent({
        module: 'CC Contracts',
        fileName: excelFile?.name || 'cc_contracts_import.xlsx',
        format: 'xlsx',
        status: 'failed',
        errorMessage: e?.message || 'Import failed',
      })
    }
  }

  const closeDisabled = importing
  const errors = Array.isArray(importSummary?.errors) ? importSummary.errors : []
  const added = Number(importSummary?.added || 0) || 0
  const failed = Number(importSummary?.failed || 0) || 0

  return (
    <div className={`fixed inset-0 z-[2000] ${isRTL ? 'rtl' : 'ltr'} flex items-start justify-center pt-20`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="absolute inset-0" onClick={() => (!closeDisabled ? onClose() : null)} />
      <div
        className="relative max-w-2xl w-full mx-4 rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] transition-colors duration-200"
        style={{
          backgroundColor: isDark ? '#172554' : 'white',
          borderColor: isDark ? '#1e3a8a' : '#e5e7eb',
          color: isDark ? 'white' : '#111827',
        }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b transition-colors duration-200"
          style={{ borderColor: isDark ? '#1e3a8a' : '#e5e7eb' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <FaDownload className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold" style={{ color: isDark ? 'white' : '#111827' }}>
              {isRTL ? 'استيراد العقود' : 'Import Contracts'}
            </h3>
          </div>
          <button
            onClick={() => (!closeDisabled ? onClose() : null)}
            className="btn btn-sm btn-circle btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            disabled={closeDisabled}
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className="px-6 py-6 overflow-y-auto custom-scrollbar">
          <div
            className="mb-6 p-4 rounded-xl border transition-colors duration-200"
            style={{
              backgroundColor: isDark ? 'rgba(30, 58, 138, 0.4)' : '#eff6ff',
              borderColor: isDark ? '#1e40af' : '#bfdbfe',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FaFileExcel className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: isDark ? 'white' : '#111827' }}>
                    {isRTL ? 'تحميل نموذج Excel' : 'Download Excel Template'}
                  </h4>
                  <p className="text-xs" style={{ color: isDark ? '#d1d5db' : '#4b5563' }}>
                    {isRTL ? 'استخدم هذا النموذج لإضافة عقود جديدة' : 'Use this template to add new contracts'}
                  </p>
                </div>
              </div>
              <button
                onClick={generateTemplate}
                className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none flex items-center gap-2"
              >
                <FaDownload className="w-3 h-3" />
                {isRTL ? 'تحميل' : 'Download'}
              </button>
            </div>
            <div className="mt-3 text-xs" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
              {isRTL ? 'المطلوب: Customer ID و Property ID.' : 'Required: Customer ID and Property ID.'}
            </div>
          </div>

          <div
            className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-white/5"
            style={{ borderColor: isDark ? '#1e40af' : '#d1d5db' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file && (/\.xlsx$|\.xls$/i).test(file.name)) {
                handleFileUpload(file)
              }
            }}
          >
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
              <FaUpload size={24} />
            </div>
            <h4 className="font-semibold mb-1" style={{ color: isDark ? 'white' : '#111827' }}>
              {isRTL ? 'رفع ملف Excel' : 'Upload Excel File'}
            </h4>
            <p className="text-xs mb-4 max-w-xs" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
              {isRTL ? 'قم بسحب وإفلات الملف هنا أو اضغط للاختيار' : 'Drag and drop your file here or click to browse'}
            </p>

            <input
              id="cc-contracts-excel-file-input"
              type="file"
              accept=".xlsx, .xls"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
                else setExcelFile(null)
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => document.getElementById('cc-contracts-excel-file-input')?.click()}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none"
            >
              {isRTL ? 'اختيار ملف' : 'Browse File'}
            </button>

            {excelFile ? (
              <div className="mt-2 text-xs" style={{ color: isDark ? '#9ca3af' : '#4b5563' }}>
                {isRTL ? `تم اختيار: ${excelFile.name}` : `Selected: ${excelFile.name}`}
              </div>
            ) : (
              <div className="mt-2 text-xs" style={{ color: isDark ? '#9ca3af' : '#4b5563' }}>
                {isRTL ? 'لم يتم اختيار ملف' : 'No file selected'}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={executeImport}
              disabled={!excelFile || importing}
              className={`btn btn-sm ${importing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white border-none flex items-center gap-2`}
            >
              <FaDownload className="w-4 h-4" />
              {importing ? (isRTL ? 'جارٍ الاستيراد...' : 'Importing...') : isRTL ? 'استيراد البيانات' : 'Import Data'}
            </button>
            <span className="text-xs" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
              {isRTL ? 'الملفات المدعومة: .xlsx, .xls' : 'Supported files: .xlsx, .xls'}
            </span>
          </div>

          {importError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
              {importError}
            </div>
          )}

          {importSummary && (
            <div className="mt-4 space-y-2">
              <div className="px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800">
                {isRTL
                  ? `تم استيراد ${added} عقد${failed ? ` — فشل ${failed}` : ''}`
                  : `Imported ${added} contracts${failed ? ` — Failed ${failed}` : ''}`}
              </div>

              {errors.length > 0 && (
                <div className="px-4 py-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="w-full flex items-center justify-between text-sm font-semibold"
                  >
                    <span>{isRTL ? `تفاصيل الأخطاء (${errors.length})` : `Error details (${errors.length})`}</span>
                    {showDetails ? <FaChevronUp /> : <FaChevronDown />}
                  </button>
                  {showDetails && (
                    <div className="mt-2 text-xs space-y-1 max-h-40 overflow-auto">
                      {errors.slice(0, 50).map((e, idx) => (
                        <div key={idx} className="whitespace-pre-wrap break-words">
                          {safeStr(e)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 text-xs" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
            {isRTL
              ? 'Customer ID و Property ID لازم يكونوا أرقام (ممكن تكتب C-0001 وهيتحول تلقائيًا).'
              : 'Customer ID and Property ID must be numeric (C-0001 is accepted and will be parsed).'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CcContractsImportModal
