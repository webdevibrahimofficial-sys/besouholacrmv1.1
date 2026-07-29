import { useCallback, useMemo, useState } from 'react'
import { useTheme } from '../shared/context/ThemeProvider'
import { FaDownload, FaFileExcel, FaTimes, FaUpload } from 'react-icons/fa'

export default function ImportRequestsModal({ open, onClose, onImport, isRTL = false, currentUser = 'admin' }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [rows, setRows] = useState([])
  const [logs, setLogs] = useState([])
  const dir = isRTL ? 'rtl' : 'ltr'

  const columns = useMemo(
    () => ['id', 'customerName', 'propertyUnit', 'status', 'priority', 'type', 'description', 'assignedTo', 'createdAt', 'updatedAt'],
    []
  )

  const appendLog = useCallback((message, level = 'info') => {
    setLogs((prev) => [{ ts: new Date().toISOString(), level, message, user: currentUser }, ...prev])
  }, [currentUser])

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (!lines.length) return []
    const header = lines[0].split(',').map((h) => h.trim())
    return lines.slice(1).map((line) => {
      const vals = line.split(',')
      const obj = {}
      header.forEach((h, i) => { obj[h] = vals[i] })
      return obj
    })
  }

  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList || [])
    for (const file of arr) {
      try {
        const ext = file.name.toLowerCase().split('.').pop()
        if (ext === 'csv') {
          const text = await file.text()
          const data = parseCSV(text)
          setRows(data)
          appendLog(`CSV parsed: ${file.name} (${data.length} rows)`, 'success')
        } else if (ext === 'xlsx' || ext === 'xls') {
          const XLSX = (await import('xlsx')).default
          const ab = await file.arrayBuffer()
          const wb = XLSX.read(ab, { type: 'array' })
          const wsName = wb.SheetNames[0]
          const ws = wb.Sheets[wsName]
          const data = XLSX.utils.sheet_to_json(ws)
          setRows(data)
          appendLog(`XLSX parsed: ${file.name} (${data.length} rows)`, 'success')
        } else {
          appendLog(`Unsupported file type: ${file.name}`, 'error')
        }
      } catch (error) {
        console.error(error)
        appendLog(`Failed to parse ${file.name}: ${error.message}`, 'error')
      }
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    handleFiles(e.dataTransfer.files)
  }

  const handleImport = () => {
    if (!rows.length) {
      appendLog('No rows to import', 'error')
      alert('No rows to import')
      return
    }
    onImport?.(rows)
    appendLog(`Imported ${rows.length} row(s)`, 'success')
    alert(`Imported ${rows.length} row(s)`)
    onClose?.()
  }

  const downloadTemplate = () => {
    const content = [columns.join(','), ''].join('\n')
    const blob = new Blob([content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'requests_template.csv'
    a.click()
    URL.revokeObjectURL(url)
    appendLog('Template downloaded (csv)', 'info')
  }

  if (!open) return null

  return (
    <div dir={dir} className={`fixed inset-0 z-[2000] flex items-start justify-center pt-20 ${isDark ? 'bg-black/75 backdrop-blur-sm' : 'bg-black/50'}`}>
      <div className={`relative max-w-2xl w-full mx-4 rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden ${
        isDark
          ? 'bg-[#0f172a] border-[#1d4ed8] shadow-[0_25px_80px_rgba(0,0,0,0.65)] text-white'
          : 'bg-white border-gray-200 text-gray-900'
      }`}>
        <div className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-[#1e3a8a] bg-[#0f172a]' : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <FaDownload className="w-4 h-4" />
            </div>
            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Import Requests</h2>
          </div>
          <button
            onClick={onClose}
            className={`btn btn-sm btn-circle btn-ghost ${isDark ? 'text-white hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className={`px-6 py-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 ${isDark ? 'bg-[#0f172a]' : 'bg-white'}`}>
          <div className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#14213d] border-[#60a5fa]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]' : 'bg-white border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-green-600">
                <FaFileExcel />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold text-sm mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Download Excel Template</h3>
                <p className={`text-xs mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Download the template and fill in the required data</p>
                <div className={`text-xs mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  <strong>Required fields:</strong> id, customerName, propertyUnit, status, priority, type
                </div>
                <button
                  onClick={downloadTemplate}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium inline-flex items-center gap-2"
                >
                  <FaDownload className="w-3 h-3" />
                  Download Template
                </button>
              </div>
            </div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
            className={`group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed transition-colors duration-300 min-h-[250px] ${
              isDark ? 'border-[#60a5fa] bg-[#14213d] hover:bg-[#1b2b4d]' : 'border-blue-300 bg-white hover:bg-blue-50/40'
            }`}
          >
            <FaUpload className="text-3xl text-blue-500" />
            <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'} text-center`}>Drag & drop CSV/XLSX files here, or click to select</p>
            <input type="file" multiple accept=".csv,.xlsx,.xls" onChange={(e) => handleFiles(e.target.files)} className="mt-3" />
          </div>

          <div className="overflow-auto max-h-60 border rounded" style={{ borderColor: isDark ? '#1e3a8a' : '#e5e7eb' }}>
            <table className="min-w-full text-sm">
              <thead style={{ backgroundColor: isDark ? 'rgba(30, 58, 138, 0.4)' : '#f9fafb' }}>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-1 text-left border-b" style={{ borderColor: isDark ? '#1e3a8a' : '#e5e7eb', color: isDark ? '#e5e7eb' : '#374151' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? (isDark ? 'transparent' : 'white') : (isDark ? 'rgba(30, 58, 138, 0.1)' : '#f9fafb') }}>
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1 border-b" style={{ borderColor: isDark ? '#1e3a8a' : '#e5e7eb', color: isDark ? '#e5e7eb' : '#1f2937' }}>{r[c]}</td>
                    ))}
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={columns.length} className="px-2 py-6 text-center" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>No data preview</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs max-h-28 overflow-auto border rounded p-2" style={{ borderColor: isDark ? '#1e3a8a' : '#e5e7eb', backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'white' }}>
            {logs.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded ${l.level === 'success' ? 'bg-green-100 text-green-800' : l.level === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{l.level}</span>
                <span style={{ color: isDark ? '#d1d5db' : '#4b5563' }}>{l.ts}</span>
                <span style={{ color: isDark ? '#d1d5db' : '#4b5563' }}>{l.user}</span>
                <span style={{ color: isDark ? 'white' : '#111827' }}>{l.message}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`flex-shrink-0 px-6 py-5 border-t flex items-center justify-end gap-3 ${
          isDark ? 'border-[#1e3a8a] bg-[#0b1220]' : 'border-gray-200 bg-white'
        }`}>
          <button
            onClick={onClose}
            className={`btn btn-ghost ${isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            className="btn bg-blue-600 hover:bg-blue-700 text-white border-none"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
