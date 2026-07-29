import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useTheme } from '../../shared/context/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { logExportEvent, logImportEvent } from '../../utils/api'
import { FaFileExcel, FaTimes, FaUpload, FaDownload } from 'react-icons/fa'

export default function RequestsImportModal({ isOpen, onClose, onImport }) {
  const { theme } = useTheme()
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const isDark = theme === 'dark'

  const [excelFile, setExcelFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSummary, setImportSummary] = useState(null)

  const labels = useMemo(() => ({
    title: isRTL ? 'استيراد الطلبات' : 'Import Requests',
    templateTitle: isRTL ? 'تحميل ملف Excel' : 'Download Excel Template',
    templateDescription: isRTL
      ? 'قم بتحميل القالب واملأ البيانات المطلوبة'
      : 'Download the template and fill in the required data',
    requiredFields: isRTL ? 'الحقول المطلوبة:' : 'Required fields:',
    requiredFieldsValue: isRTL
      ? 'اسم العميل، الهاتف، المنتج، الكمية، السعر، الأولوية، النوع'
      : 'Customer Name, Phone, Product, Quantity, Price, Priority, Type',
    downloadTemplate: isRTL ? 'تحميل القالب' : 'Download Template',
    fileLabel: isRTL ? 'ملف Excel' : 'Excel file',
    uploadHint: isRTL ? 'اضغط للرفع أو اسحب الملف هنا' : 'Click to upload or drag file here',
    supportedFiles: 'XLSX, XLS',
    emptyFile: isRTL ? 'الملف فارغ' : 'File is empty',
    readError: isRTL ? 'حدث خطأ أثناء استيراد الملف' : 'Error while importing file',
    summary: (count) => isRTL
      ? `تم قراءة ${count} صف بنجاح. جاري المعالجة...`
      : `Successfully read ${count} rows. Processing...`,
    cancel: isRTL ? 'إلغاء' : 'Cancel',
    import: isRTL ? 'استيراد' : 'Import',
    importing: isRTL ? 'جاري الاستيراد...' : 'Importing...',
  }), [isRTL])

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    setExcelFile(file || null)
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
        return
      }

      if (typeof onImport === 'function') {
        await onImport(rows)
      }

      setImportSummary({ total: rows.length })
      logImportEvent({
        module: 'Requests',
        fileName: excelFile?.name || 'requests_import.xlsx',
        format: 'xlsx',
        status: 'success',
        metaData: { total: rows.length },
      })

      setTimeout(() => {
        onClose?.()
      }, 1500)
    } catch (error) {
      console.error(error)
      setImportError(labels.readError)
      logImportEvent({
        module: 'Requests',
        fileName: excelFile?.name || 'requests_import.xlsx',
        format: 'xlsx',
        status: 'failed',
        errorMessage: error?.message,
      })
    } finally {
      setImporting(false)
    }
  }

  const generateTemplate = () => {
    const templateData = [
      {
        'Customer Name': 'John Doe',
        'Customer Phone': '123456789',
        Product: 'Laptop',
        Quantity: 1,
        Price: 1000,
        Priority: 'Medium',
        Type: 'Inquiry',
        'Payment Plan': 'Cash',
        Notes: 'Urgent request',
      },
    ]

    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Requests Template')
    const fileName = 'requests_template.xlsx'
    XLSX.writeFile(workbook, fileName)

    logExportEvent({
      module: 'Requests',
      fileName,
      format: 'xlsx',
    })
  }

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${isDark ? 'bg-black/75 backdrop-blur-sm' : 'bg-black/60 backdrop-blur-sm'}`}>
      <div className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden ${
        isDark
          ? 'bg-[#0f172a] border-[#1d4ed8] shadow-[0_25px_80px_rgba(0,0,0,0.65)]'
          : 'bg-white border-gray-200'
      }`}>
        <div className={`flex-none flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-[#1e3a8a] bg-[#0f172a]' : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <FaDownload className="w-4 h-4" />
            </div>
            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{labels.title}</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${isDark ? 'text-white hover:bg-red-900/30' : 'text-gray-500 hover:bg-red-50'}`}
          >
            <FaTimes />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${isDark ? 'bg-[#0f172a]' : 'bg-white'}`}>
          <div className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#14213d] border-[#60a5fa]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]' : 'bg-white border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-green-600">
                <FaFileExcel />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold text-sm mb-1 ${isDark ? 'text-white' : 'text-black'}`}>{labels.templateTitle}</h3>
                <p className={`text-xs mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{labels.templateDescription}</p>
                <div className={`text-xs mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  <strong>{labels.requiredFields}</strong> {labels.requiredFieldsValue}
                </div>
                <button
                  onClick={generateTemplate}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium inline-flex items-center gap-2"
                >
                  <FaDownload className="w-3 h-3" />
                  {labels.downloadTemplate}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-gray-700'}`}>{labels.fileLabel}</label>
            <div className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
              excelFile
                ? isDark
                  ? 'border-green-500 bg-[#14213d]'
                  : 'border-green-500 bg-green-50'
                : isDark
                  ? 'border-[#60a5fa] bg-[#14213d] hover:bg-[#1b2b4d]'
                  : 'border-blue-300 bg-white hover:bg-blue-50/40'
            }`}>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <FaUpload className={`text-3xl ${excelFile ? 'text-green-500' : 'text-gray-400'}`} />
                {excelFile ? (
                  <div className="text-sm font-medium text-green-700 dark:text-green-400">{excelFile.name}</div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{labels.uploadHint}</span>
                    <span className="text-xs text-gray-400">{labels.supportedFiles}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {importError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-800/50">
              {importError}
            </div>
          )}

          {importSummary && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm border border-green-100 dark:border-green-800/50">
              {labels.summary(importSummary.total)}
            </div>
          )}
        </div>

        <div className={`flex-none flex items-center justify-end gap-3 px-6 py-4 border-t rounded-b-xl ${
          isDark ? 'border-[#1e3a8a] bg-[#0b1220]' : 'border-gray-200 bg-gray-50'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium transition-colors ${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}
            disabled={importing}
          >
            {labels.cancel}
          </button>
          <button
            onClick={handleImport}
            disabled={!excelFile || importing}
            className={`px-6 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-all ${
              !excelFile || importing
                ? isDark
                  ? 'bg-blue-900/60 text-blue-100/70 cursor-not-allowed'
                  : 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
            }`}
          >
            {importing ? labels.importing : labels.import}
          </button>
        </div>
      </div>
    </div>
  )
}
