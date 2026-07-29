import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useTheme } from '../../shared/context/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { logExportEvent, logImportEvent } from '../../utils/api'
import { FaFileExcel, FaTimes, FaDownload } from 'react-icons/fa'

export default function ItemsImportModal({ isOpen, onClose, onImport }) {
  const { theme } = useTheme()
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const isDark = theme === 'dark'

  const [excelFile, setExcelFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSummary, setImportSummary] = useState(null)

  const copy = useMemo(() => ({
    title: isRTL ? 'استيراد الأصناف من ملف Excel' : 'Import Items from Excel',
    downloadTitle: isRTL ? 'تحميل ملف Excel' : 'Download Excel Template',
    downloadDescription: isRTL ? 'قم بتحميل القالب واملأ البيانات المطلوبة' : 'Download the template and fill in the required data',
    downloadButton: isRTL ? 'تحميل نموذج' : 'Download Template',
    requiredFields: isRTL ? 'الحقول المطلوبة:' : 'Required fields:',
    requiredFieldsValue: isRTL ? 'الاسم، التصنيف، السعر، الحالة' : 'Name, Category, Price, Status',
    fileLabel: isRTL ? 'ملف Excel' : 'Excel file',
    dropzone: isRTL ? 'اسحب الملف هنا أو اضغط لاختيار الملف' : 'Drag and drop or click to choose file',
    browseButton: isRTL ? 'اختيار ملف' : 'Choose File',
    noFileSelected: isRTL ? 'لم يتم اختيار ملف بعد' : 'No file selected',
    selectedFile: isRTL ? `الملف المختار:` : 'Selected file:',
    cancel: isRTL ? 'إلغاء' : 'Cancel',
    import: isRTL ? 'استيراد' : 'Import',
    importing: isRTL ? 'جارٍ الاستيراد...' : 'Importing...',
    emptyFile: isRTL ? 'الملف فارغ' : 'File is empty',
    importError: isRTL ? 'حدث خطأ أثناء استيراد الملف' : 'Error while importing file',
    importPrepared: (count) => isRTL ? `تم تجهيز ${count} صنف للاستيراد` : `Prepared ${count} items for import`,
  }), [isRTL])

  if (!isOpen) return null

  const normalizeKey = (v) =>
    String(v || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[_-]+/g, '')

  const pick = (row, candidates) => {
    const entries = Object.entries(row || {})
    for (const cand of candidates) {
      const candNorm = normalizeKey(cand)
      for (const [k, v] of entries) {
        if (normalizeKey(k) === candNorm) return v
      }
    }
    return undefined
  }

  const toNumber = (v) => {
    if (v === null || v === undefined || v === '') return undefined
    const n = Number(String(v).replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : undefined
  }

  const mapRows = (rows) => {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const name =
          pick(row, ['name', 'itemname', 'item', 'اسم', 'اسم الصنف', 'الصنف', 'الاسم']) ??
          pick(row, ['Name', 'Item Name'])
        const family = pick(row, ['family', 'العائلة', 'عائلة'])
        const category = pick(row, ['category', 'التصنيف', 'تصنيف'])
        const group = pick(row, ['group', 'المجموعة', 'مجموعة'])
        const brand = pick(row, ['brand', 'العلامة التجارية', 'علامة'])
        const supplier = pick(row, ['supplier', 'المورد'])
        const sku = pick(row, ['sku', 'code', 'itemcode', 'كود', 'رمز', 'SKU', 'Code'])
        const status = pick(row, ['status', 'الحالة', 'Status']) ?? 'Active'
        const price = toNumber(pick(row, ['price', 'السعر', 'Price']))
        const stock = toNumber(pick(row, ['stock', 'quantity', 'qty', 'المخزون', 'الكمية', 'Stock', 'Quantity']))
        const minStock = toNumber(pick(row, ['minstock', 'minalert', 'min', 'اقل مخزون', 'الحد الأدنى', 'Min Stock', 'Min Alert']))

        const mapped = {
          name: name !== undefined && name !== null ? String(name).trim() : '',
          sku: sku !== undefined && sku !== null ? String(sku).trim() : undefined,
          family: family !== undefined && family !== null ? String(family).trim() : undefined,
          category: category !== undefined && category !== null ? String(category).trim() : undefined,
          group: group !== undefined && group !== null ? String(group).trim() : undefined,
          brand: brand !== undefined && brand !== null ? String(brand).trim() : undefined,
          supplier: supplier !== undefined && supplier !== null ? String(supplier).trim() : undefined,
          price,
          stock,
          minStock,
          status: status !== undefined && status !== null ? String(status).trim() : 'Active',
        }

        Object.keys(mapped).forEach((k) => {
          if (mapped[k] === undefined || mapped[k] === '') delete mapped[k]
        })

        return mapped
      })
      .filter((x) => String(x?.name || '').trim().length > 0)
  }

  const handleFileChange = (file) => {
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
      const mappedRows = mapRows(rows)
      if (!Array.isArray(mappedRows) || mappedRows.length === 0) {
        setImportError(isRTL ? 'الملف فارغ' : 'File is empty')
        setImporting(false)
        return
      }
      if (typeof onImport === 'function') {
        await onImport(mappedRows)
      }
      setImportSummary({ total: mappedRows.length })
      logImportEvent({
        module: 'Items',
        fileName: excelFile?.name || 'items_import.xlsx',
        format: 'xlsx',
        status: 'success',
        meta: { total: mappedRows.length },
      })
    } catch (e) {
      setImportError(isRTL ? 'حدث خطأ أثناء استيراد الملف' : 'Error while importing file')
      logImportEvent({
        module: 'Items',
        fileName: excelFile?.name || 'items_import.xlsx',
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
        name: isRTL ? 'اسم الصنف' : 'Item Name',
        sku: 'ITEM-001',
        family: isRTL ? 'العائلة' : 'Family',
        category: isRTL ? 'التصنيف' : 'Category',
        group: isRTL ? 'المجموعة' : 'Group',
        brand: isRTL ? 'العلامة التجارية' : 'Brand',
        supplier: isRTL ? 'المورد' : 'Supplier',
        price: 100,
        stock: 0,
        minStock: 0,
        status: 'Active',
      },
    ]
    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Items Template')
    const fileName = 'items_template.xlsx'
    XLSX.writeFile(workbook, fileName)
    logExportEvent({
      module: 'Items',
      fileName,
      format: 'xlsx',
    })
  }

  return (
    <div className={`fixed inset-0 z-[2000] ${isRTL ? 'rtl' : 'ltr'} flex items-start justify-center pt-20`}>
      <div className={`absolute inset-0 ${isDark ? 'bg-black/75 backdrop-blur-sm' : 'bg-black/50'}`} onClick={onClose} />

      <div className={`relative max-w-2xl w-full mx-4 rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden transition-colors duration-200 ${
        isDark
          ? 'bg-[#0f172a] border-[#1d4ed8] shadow-[0_25px_80px_rgba(0,0,0,0.65)]'
          : 'bg-white border-gray-200'
      }`}>
        <div className={`flex-shrink-0 flex items-center justify-between px-6 py-5 border-b ${
          isDark ? 'border-[#1e3a8a] bg-[#0f172a]' : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <FaDownload className="w-4 h-4" />
            </div>
            <h3 className={`text-lg sm:text-xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>{copy.title}</h3>
          </div>

          <button
            onClick={onClose}
            className={`btn btn-sm btn-circle btn-ghost ${isDark ? 'text-white hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className={`px-6 py-6 overflow-y-auto custom-scrollbar ${isDark ? 'bg-[#0f172a]' : 'bg-white'}`}>
          <div className={`mb-6 p-5 rounded-2xl border ${
            isDark ? 'bg-[#14213d] border-[#60a5fa]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]' : 'bg-white border-blue-200'
          }`}>
            <div className="flex flex-row items-center justify-between gap-6">
              <div className="flex items-start gap-3">
                <FaFileExcel className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                    {copy.downloadTitle}
                  </h4>
                  <p className={`mt-1 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {copy.downloadDescription}
                  </p>
                  <div className={`mt-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <strong>{copy.requiredFields}</strong> {copy.requiredFieldsValue}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <button
                  onClick={generateTemplate}
                  className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none flex items-center justify-center gap-2 min-w-[220px]"
                >
                  <FaDownload className="w-3 h-3" />
                  {copy.downloadButton}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
              {copy.fileLabel}
            </label>

            <div
              className={`group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed transition-colors duration-300 cursor-pointer min-h-[250px] ${
                isDark
                  ? 'border-[#60a5fa] bg-[#14213d] hover:bg-[#1b2b4d]'
                  : 'border-blue-300 bg-white hover:bg-blue-50/40'
              }`}
              onClick={() => document.getElementById('items-excel-file-input')?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file && (/\.xlsx$|\.xls$/i).test(file.name)) {
                  handleFileChange(file)
                }
              }}
            >
              <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0l-3 3m3-3l3 3m7 4v12m0 0l-3-3m3 3l3-3" />
              </svg>

              <p className={`text-center text-base sm:text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {copy.dropzone}
              </p>

              <input
                id="items-excel-file-input"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('items-excel-file-input')?.click()
                }}
                className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none min-w-[110px]"
              >
                {copy.browseButton}
              </button>

              <div className={`mt-2 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {excelFile ? `${copy.selectedFile} ${excelFile.name}` : copy.noFileSelected}
              </div>
            </div>
          </div>

          {importError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800">
              {importError}
            </div>
          )}

          {importSummary && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800">
              {copy.importPrepared(importSummary.total)}
            </div>
          )}
        </div>

        <div className={`flex-shrink-0 px-6 py-5 border-t flex items-center justify-end gap-3 ${
          isDark ? 'border-[#1e3a8a] bg-[#0b1220]' : 'border-gray-200 bg-white'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`btn btn-ghost ${isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!excelFile || importing}
            className={`btn text-white border-none min-w-[140px] ${
              !excelFile || importing
                ? isDark
                  ? 'bg-blue-900/60 text-blue-100/70 cursor-not-allowed'
                  : 'bg-blue-300 disabled:text-white disabled:cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {importing ? copy.importing : copy.import}
          </button>
        </div>
      </div>
    </div>
  )
}
