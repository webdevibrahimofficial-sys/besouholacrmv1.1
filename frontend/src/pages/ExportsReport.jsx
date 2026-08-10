import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../shared/context/ThemeProvider'
import i18n from '../i18n'
import { useNavigate, useLocation } from 'react-router-dom'
import { FileText, CheckCircle2, XCircle, Filter, Calendar, ChevronLeft, ChevronRight, ChevronDown, Eye, Download, Building2, User, Clock, AlertCircle } from 'lucide-react'
import { FaFileExport, FaFileExcel, FaFilePdf } from 'react-icons/fa'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { api, logExportEvent } from '../utils/api'
import { PieChart } from '../shared/components/PieChart'
import BackButton from '../components/BackButton'
import { useAppState } from '../shared/context/AppStateProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend)

const ExportsReport = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const isRTL = i18n.dir() === 'rtl'
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAppState()
  const canExport = canExportReport(user, 'Exports Report')

  // Top-level UI state
  const [query, setQuery] = useState('')
  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [previewItem, setPreviewItem] = useState(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)
  const autoExportDoneRef = useRef(false)
  
  // Filters
  const [selectedManager, setSelectedManager] = useState('All')
  const [selectedEmployee, setSelectedEmployee] = useState('All')
  const [selectedDept, setSelectedDept] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [datePreset, setDatePreset] = useState('year')

  const dateOptions = [
    { value: 'today', label: isRTL ? '\u0627\u0644\u064a\u0648\u0645' : 'Today' },
    { value: 'week', label: isRTL ? '\u0623\u0633\u0628\u0648\u0639\u064a' : 'Weekly' },
    { value: 'month', label: isRTL ? '\u0634\u0647\u0631\u064a' : 'Monthly' },
    { value: 'year', label: isRTL ? '\u0633\u0646\u0648\u064a' : 'Yearly' },
  ]

  const [exportsData, setExportsData] = useState([])

  const managerOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        exportsData
          .map(r => r.performedBy)
          .filter(Boolean)
      )
    )
    return names
  }, [exportsData])

  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set(
        exportsData
          .map(r => r.status)
          .filter(Boolean)
      )
    )
    return statuses
  }, [exportsData])

  const departmentOptions = useMemo(() => {
    const depts = Array.from(
      new Set(
        exportsData
          .map(r => r.department)
          .filter(Boolean)
      )
    )
    return depts
  }, [exportsData])

  const [kpiData, setKpiData] = useState({
    total: 0,
    success: 0,
    failed: 0,
    byModule: [],
    byUser: [],
    activity: []
  })

  useEffect(() => {
    const fetchExports = async () => {
      try {
        const res = await api.get('/api/exports', {
          params: {
            per_page: 1000,
            action: 'export'
          }
        })
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        const mapped = data
          .map((row) => {
            const tsRaw = row.created_at || null
            const timestamp = tsRaw ? new Date(tsRaw) : new Date()
            const status = row.status === 'success' ? 'Success' : 'Failed'
            const action = row.action || 'export'
            return {
              fileName: row.file_name || '-',
              department: row.module || 'Reports',
              performedBy: row.user?.name || row.user_name || 'System',
              timestamp,
              status,
              error: row.error_message || '',
              action,
            }
          })
          .filter((row) => row.action === 'export')

        setExportsData(mapped)
      } catch (e) {
        console.error('Failed to fetch export logs', e)
        setExportsData([])
      }
    }

    const fetchStats = async () => {
      try {
        const res = await api.get('/api/exports/stats', {
          params: { action: 'export' }
        })
        const data = res.data
        setKpiData({
          total: data.total_exports,
          success: data.successful_exports || 0,
          failed: data.failed_exports || 0,
          byModule: data.by_module,
          byUser: data.by_user,
          activity: data.activity
        })
      } catch (e) {
        console.error('Failed to fetch export stats', e)
      }
    }

    fetchExports()
    fetchStats()
  }, [])

  // Date helpers
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

  // Filtering
  const latestDate = useMemo(() => {
    if (!exportsData.length) return new Date()
    const timestamps = exportsData.map(r => r.timestamp.getTime())
    return new Date(Math.max(...timestamps))
  }, [exportsData])

  const filtered = useMemo(() => {
    let rows = exportsData
    // text query
    if (query) rows = rows.filter(r => r.fileName.toLowerCase().includes(query.toLowerCase()))
    // manager/employee
    if (selectedManager !== 'All') rows = rows.filter(r => r.performedBy === selectedManager)
    if (selectedEmployee !== 'All') rows = rows.filter(r => r.performedBy === selectedEmployee)
    // department
    if (selectedDept !== 'All') rows = rows.filter(r => r.department === selectedDept)

    // status
    if (statusFilter !== 'All') rows = rows.filter(r => r.status === statusFilter)
    
    // date preset
    rows = rows.filter(r => {
      const dt = r.timestamp
      if (datePreset === 'today') return sameDay(dt, latestDate)
      if (datePreset === 'week') {
        const diffMs = latestDate.getTime() - dt.getTime()
        const diffDays = diffMs / (1000 * 60 * 60 * 24)
        return diffDays <= 7 && diffDays >= 0
      }
      if (datePreset === 'month') return sameMonth(dt, latestDate)
      if (datePreset === 'year') return dt.getFullYear() === latestDate.getFullYear()
      return true
    })
    
    return rows
  }, [exportsData, query, selectedManager, selectedEmployee, selectedDept, statusFilter, datePreset, latestDate])

  const clearFilters = () => {
    setSelectedManager('All')
    setSelectedEmployee('All')
    setSelectedDept('All')
    setStatusFilter('All')
    setDatePreset('year')
    setQuery('')
    setCurrentPage(1)
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Pagination
  const pageCount = Math.max(1, Math.ceil(filtered.length / entriesPerPage))
  const totalExports = filtered.length
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return filtered.slice(start, start + entriesPerPage)
  }, [filtered, currentPage, entriesPerPage])

  // Actions
  const handleDownloadRowCSV = (row) => {
    if (!canExport) return
    const csvContent = `File Name,Department,Performed By,Date & Time,Status,error\n${row.fileName},${row.department},${row.performedBy},${row.timestamp.toLocaleString()},${row.status},${row.error || ''}`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const name = row.fileName?.replace(/\.(xlsx|csv)$/i, '.csv') || 'export.csv'
    link.download = name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleRerun = (rowIdx) => {
    setExportsData(prev => {
      const next = [...prev]
      const item = { ...next[rowIdx] }
      // simulate retry success 70% of time
      const ok = Math.random() < 0.7
      item.status = ok ? 'Success' : 'Failed'
      item.error = ok ? '' : 'Retry failed'
      next[rowIdx] = item
      return next
    })
  }

  // Excel & PDF export of filtered dataset
  const exportExcel = () => {
    if (!canExport) return
    const rows = filtered.map(r => ({
      [isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0645\u0644\u0641' : 'File Name']: r.fileName,
      [isRTL ? '\u0627\u0644\u0642\u0633\u0645' : 'Department']: r.department,
      [isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By']: r.performedBy,
      [isRTL ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u0648\u0642\u062a' : 'Date & Time']: r.timestamp.toLocaleString(),
      [isRTL ? '\u0627\u0644\u062d\u0627\u0644\u0629' : 'Status']: r.status,
      [isRTL ? '\u0627\u0644\u062e\u0637\u0623' : 'error']: r.error || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Exports')
    const fileName = 'exports_report.xlsx'
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: 'Exports Report',
      fileName,
      format: 'xlsx',
    })
    setShowExportMenu(false)
  }

  const exportPDF = () => {
    if (!canExport) return
    const doc = new jsPDF('l', 'pt', 'a4')
    
    const tableColumn = [
      isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0645\u0644\u0641' : 'File Name',
      isRTL ? '\u0627\u0644\u0642\u0633\u0645' : 'Department',
      isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By',
      isRTL ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u0648\u0642\u062a' : 'Date & Time',
      isRTL ? '\u0627\u0644\u062d\u0627\u0644\u0629' : 'Status',
      isRTL ? '\u0627\u0644\u062e\u0637\u0623' : 'error'
    ]
    
    const tableRows = filtered.map(r => [
      r.fileName,
      r.department,
      r.performedBy,
      r.timestamp.toLocaleString(),
      r.status,
      r.error || ''
    ])

    doc.text(isRTL ? '\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062a\u0635\u062f\u064a\u0631' : 'Exports Report', 40, 40)
    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 60,
      styles: { font: 'Amiri-Regular', fontSize: 10, halign: isRTL ? 'right' : 'left' },
      headStyles: { fillColor: [66, 139, 202], halign: isRTL ? 'right' : 'left' }
    })
    doc.save('exports_report.pdf')
    logExportEvent({
      module: 'Exports Report',
      fileName: 'exports_report.pdf',
      format: 'pdf',
    })
    setShowExportMenu(false)
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('export') !== '1') {
      autoExportDoneRef.current = false
      return
    }

    if (!canExport || !filtered.length || autoExportDoneRef.current) return

    autoExportDoneRef.current = true

    const run = async () => {
      const format = String(params.get('format') || 'xlsx').toLowerCase()
      if (format === 'pdf') {
        await exportPDF()
      } else {
        await exportExcel()
      }

      params.delete('export')
      params.delete('format')
      params.delete('file_name')
      const nextSearch = params.toString()
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    }

    run()
  }, [canExport, filtered, location.pathname, location.search, navigate])

  // Charts
  // Removed Exports Over Time line chart per latest design

  // UI helpers
  const StatusBadge = ({ status }) => {
    const isSuccess = status === 'Success'
    const label = isRTL ? (isSuccess ? '\u0646\u0627\u062c\u062d' : '\u0641\u0627\u0634\u0644') : status
    const ring = isSuccess ? 'ring-emerald-200' : 'ring-rose-200'
    const bg = isSuccess ? 'bg-emerald-100' : 'bg-rose-100'
    const text = isSuccess ? 'text-emerald-700' : 'text-rose-700'
    const dot = isSuccess ? 'bg-emerald-600' : 'bg-rose-600'
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text} ring-1 ${ring}`} title={status}>
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </span>
    )
  }

  // Export modal handler
  const [exportForm, setExportForm] = useState({ fileName: '', department: 'Customers' })
  const performExport = () => {
    if (!canExport) return
    const performedBy = 'Maram Admin'
    const ok = Math.random() < 0.85
    const newRecord = {
      fileName: exportForm.fileName || `export_${Date.now()}.csv`,
      department: exportForm.department,
      performedBy,
      timestamp: new Date(),
      status: ok ? 'Success' : 'Failed',
      error: ok ? '' : 'Service unavailable',
    }
    setExportsData(prev => [newRecord, ...prev])
    setShowExportModal(false)
    setExportForm({ fileName: '', department: 'Customers' })
  }
  const successful = filtered.filter(x => x.status === 'Success').length
  const failed = filtered.filter(x => x.status === 'Failed').length
  const successVsFailed = { success: successful, failed }

  const exportsPerManager = useMemo(() => {
    // If we have API data for this, use it, otherwise fallback to local calculation
    if (kpiData.byUser && kpiData.byUser.length > 0) {
      const map = new Map()
      kpiData.byUser.forEach(item => {
        map.set(item.name, item.count)
      })
      return map
    }
    
    const map = new Map()
    filtered.forEach(r => {
      map.set(r.performedBy, (map.get(r.performedBy) || 0) + 1)
    })
    return map
  }, [filtered, kpiData.byUser])

  const kpiCards = [
    {
      title: isRTL ? '\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u062a\u0635\u062f\u064a\u0631' : 'Total Exports',
      value: kpiData.total,
      icon: FileText,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      title: isRTL ? '\u0627\u0644\u062a\u0635\u062f\u064a\u0631\u0627\u062a \u0627\u0644\u0646\u0627\u062c\u062d\u0629' : 'Successful Exports',
      value: kpiData.success,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20'
    },
    {
      title: isRTL ? '\u0627\u0644\u062a\u0635\u062f\u064a\u0631\u0627\u062a \u0627\u0644\u0641\u0627\u0634\u0644\u0629' : 'Failed Exports',
      value: kpiData.failed,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20'
    }
  ]
  return (
    <div className="p-4 md:px-6 md:py-6 bg-[var(--content-bg)] text-[var(--content-text)] overflow-hidden min-w-0">
      <div className="mb-6">
        <BackButton to="/reports" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-2`}>
              {isRTL ? '\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062a\u0635\u062f\u064a\u0631' : 'Exports Report'}
            </h1>
            <p className={`${isLight ? 'text-black' : 'text-white'} text-sm opacity-70`}>
              {isRTL ? '\u062a\u0627\u0628\u0639 \u062c\u0645\u064a\u0639 \u0639\u0645\u0644\u064a\u0627\u062a \u062a\u0635\u062f\u064a\u0631 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u0627\u0644\u0645\u0634\u0627\u0643\u0644' : 'Monitor all data export operations and issues'}
            </p>
          </div>
        </div>
      </div>

      <div className="backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 p-6 mb-8">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3>{t('Filter')}</h3>
          </div>

          <div className="flex items-center gap-2">

            <button
              onClick={clearFilters}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {t('Reset')}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By'}
              </label>
              <select
                value={selectedManager}
                onChange={(e) => {
                  setSelectedManager(e.target.value)
                  setCurrentPage(1)
                }}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-transparent`}
              >
                <option value="All">{t('All')}</option>
                {managerOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                {t('Status')}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-transparent`}
              >
                <option value="All">{t('All')}</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === 'Success'
                      ? isRTL ? '\u0646\u062c\u0627\u062d' : 'Success'
                      : status === 'Failed'
                        ? isRTL ? '\u0641\u0634\u0644' : 'Failed'
                        : status}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Action Date')}
              </label>
              <select
                value={datePreset}
                onChange={(e) => {
                  setDatePreset(e.target.value)
                  setCurrentPage(1)
                }}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-transparent`}
              >
                {dateOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon
          return (
            <div
                key={idx}
                className="group relative  backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden h-32"
              >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110">
                <Icon size={80} className={card.color} />
              </div>
              <div className="flex flex-col justify-between h-full relative z-10">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${card.bgColor} ${card.color}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className={`${isLight ? 'text-black' : 'text-white'} text-sm font-semibold opacity-80`}>
                    {card.title}
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2 rtl:space-x-reverse pl-1">
                  <span className={`text-2xl font-bold ${card.color}`}>
                    {card.value}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm p-4 rounded-2xl">
          <div className={`font-semibold mb-2 ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? '\u0639\u062f\u062f \u0627\u0644\u062a\u0635\u062f\u064a\u0631\u0627\u062a \u0644\u0643\u0644 \u0645\u0633\u062a\u062e\u062f\u0645' : 'Exports Quantity per User'}</div>
          <div className="h-[260px]">
            <Bar
              data={{
                labels: Array.from(exportsPerManager.keys()),
                datasets: [
                  {
                    label: t('Exports'),
                    data: Array.from(exportsPerManager.values()),
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderRadius: 6,
                    maxBarThickness: 40,
                    categoryPercentage: 0.6,
                    barPercentage: 0.7,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: {
                    ticks: {
                      autoSkip: false,
                      maxRotation: 0,
                      minRotation: 0,
                    },
                    title: {
                      display: true,
                      text: isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By',
                    },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      stepSize: 1,
                      precision: 0,
                      callback: v => `${v}`,
                    },
                    title: {
                      display: true,
                      text: isRTL ? '\u0627\u0644\u062a\u0635\u062f\u064a\u0631\u0627\u062a' : 'Exports',
                    },
                  },
                },
              }}
            />
          </div>
        </div>
        <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm p-4 rounded-2xl">
          <div className={`text-sm font-medium mb-2 ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? '\u0627\u0644\u0646\u062c\u0627\u062d / \u0627\u0644\u0641\u0634\u0644' : 'Success & Fail'}</div>
          <div className="h-[260px] flex flex-col items-center justify-center">
            <div className="flex-1 flex items-center justify-center">
              <PieChart
                segments={[
                  { label: isRTL ? '\u0646\u0627\u062c\u062d' : 'Success', value: kpiData.success, color: '#10b981' },
                  { label: isRTL ? '\u0641\u0627\u0634\u0644' : 'Failed', value: kpiData.failed, color: '#ef4444' },
                ]}
                size={170}
                centerValue={kpiData.total}
                centerLabel={isRTL ? '\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u062a\u0635\u062f\u064a\u0631' : 'Total Exports'}
              />
            </div>
            <div className="mt-4 w-full flex items-center justify-between gap-4 text-xs md:text-sm">
              <div className="inline-flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span className={`text-[var(--content-text)] ${isLight ? 'text-black' : 'text-white'}`}>
                  {isRTL ? '\u0646\u0627\u062c\u062d' : 'Success'}: {kpiData.success}
                  {kpiData.total > 0 && (
                    <> ({Math.round((kpiData.success / kpiData.total) * 100)}%)</>
                  )}
                </span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                <span className={`text-[var(--content-text)] ${isLight ? 'text-black' : 'text-white'}`}>
                  {isRTL ? '\u0641\u0627\u0634\u0644' : 'Failed'}: {kpiData.failed}
                  {kpiData.total > 0 && (
                    <> ({Math.round((kpiData.failed / kpiData.total) * 100)}%)</>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm rounded-2xl overflow-hidden mb-4">
        <div className="p-4 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>
            {isRTL ? '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062a\u0635\u062f\u064a\u0631' : 'Exports List'}
          </h2>
          {canExport && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                <FaFileExport /> {isRTL ? '\u062a\u0635\u062f\u064a\u0631' : 'Export'}
                <ChevronDown
                  className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`}
                  size={12}
                />
              </button>
              {showExportMenu && (
                <div
                  className={`absolute top-full ${isRTL ? 'left-0' : 'right-0'} mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}
                >
                  <button
                    onClick={exportExcel}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFileExcel className='text-green-600' /> {isRTL ? '\u062a\u0635\u062f\u064a\u0631 \u0625\u0644\u0649 Excel' : 'Export to Excel'}
                  </button>
                  <button
                    onClick={exportPDF}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className='text-red-600' /> {isRTL ? '\u062a\u0635\u062f\u064a\u0631 \u0625\u0644\u0649 PDF' : 'Export to PDF'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile View - Cards */}
        <div className="md:hidden space-y-4 p-4">
          {paginatedRows.map((row) => {
            const rowId = row.fileName + row.timestamp.getTime()
            return (
              <div key={rowId} className=" rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className={`font-semibold ${isLight ? 'text-black' : 'text-white'} text-lg`}>{row.fileName}</h3>
                    <p className={`text-xs ${isLight ? 'text-black' : 'text-white'} mt-1`}>{row.department}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By'}</span>
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{row.performedBy}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e' : 'Date'}</span>
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`} dir="ltr">{row.timestamp.toLocaleString()}</span>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? '\u0627\u0644\u062e\u0637\u0623' : 'error'}</span>
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'} truncate`}>{row.error || '-'}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => setPreviewItem(row)}
                    className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    <Eye size={16} />
                    {isRTL ? '\u0645\u0639\u0627\u064a\u0646\u0629' : 'Preview'}
                  </button>
                  {canExport && (
                    <button
                      onClick={() => handleDownloadRowCSV(row)}
                      className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium"
                    >
                      <Download size={16} />
                      {isRTL ? '\u062a\u062d\u0645\u064a\u0644' : 'Download'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {paginatedRows.length === 0 && (
            <div className={`text-center py-8 ${isLight ? 'text-black' : 'text-white'}`}>
              {isRTL ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a' : 'No data available'}
            </div>
          )}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className={`w-full text-sm text-left ${isLight ? 'text-black' : 'text-white'}`}>
            <thead className={`text-xs ${isLight ? 'text-black' : 'text-white'} uppercase  dark:bg-gray-700/50`}>
              <tr>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0645\u0644\u0641' : 'File Name'}</th>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u0627\u0644\u062d\u0627\u0644\u0629' : 'Status'}</th>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u0627\u0644\u0642\u0633\u0645' : 'Department'}</th>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By'}</th>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u0648\u0642\u062a' : 'Date & Time'}</th>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u0627\u0644\u062e\u0637\u0623' : 'error'}</th>
                <th className='px-4 py-3 text-start'>{isRTL ? '\u0627\u0644\u0625\u062c\u0631\u0627\u0621' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row) => {
                  const rowId = row.fileName + row.timestamp.getTime()
                  return (
                    <tr key={rowId} className="border-b  dark:border-gray-700/50 hover:bg-white/5 dark:hover:bg-white/5 transition-colors">
                      <td className={`px-4 py-3 font-medium ${isLight ? 'text-black' : 'text-white'} whitespace-nowrap`}>
                        {row.fileName}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.department}</td>
                      <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.performedBy}</td>
                      <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`} dir="ltr">
                        {row.timestamp.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'} max-w-xs truncate`} title={row.error || ''}>
                        {row.error || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewItem(row)}
                            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-blue-600 dark:text-blue-400 transition-colors"
                            title={isRTL ? '\u0645\u0639\u0627\u064a\u0646\u0629' : 'Preview'}
                          >
                            <Eye size={16} />
                          </button>
                          {canExport && (
                            <button
                              onClick={() => handleDownloadRowCSV(row)}
                              className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-blue-600 dark:text-blue-400 transition-colors"
                              title={isRTL ? '\u062a\u062d\u0645\u064a\u0644' : 'Download'}
                            >
                              <Download size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className={`px-4 py-8 text-center ${isLight ? 'text-black' : 'text-white'}`}>
                    {isRTL ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a' : 'No data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 bg-[var(--content-bg)]/80 border-t border-white/10 dark:border-gray-700/60 flex items-center justify-between gap-3">
          <div className="text-[11px] sm:text-xs text-[var(--muted-text)]">
            {isRTL
              ? `\u0625\u0638\u0647\u0627\u0631 ${Math.min((currentPage - 1) * entriesPerPage + 1, totalExports)}-${Math.min(currentPage * entriesPerPage, totalExports)} \u0645\u0646 ${totalExports}`
              : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, totalExports)}-${Math.min(currentPage * entriesPerPage, totalExports)} of ${totalExports}`}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                title={isRTL ? '\u0627\u0644\u0633\u0627\u0628\u0642' : 'Prev'}
              >
                {isRTL ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
              <span className="text-sm whitespace-nowrap">
                {isRTL
                  ? `\u0627\u0644\u0635\u0641\u062d\u0629 ${currentPage} \u0645\u0646 ${pageCount}`
                  : `Page ${currentPage} of ${pageCount}`}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))}
                disabled={currentPage === pageCount}
                title={isRTL ? '\u0627\u0644\u062a\u0627\u0644\u064a' : 'Next'}
              >
                {isRTL ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className={`text-[10px] sm:text-xs ${isLight ? 'text-black' : 'text-white'} whitespace-nowrap`}>
                {isRTL ? '\u0644\u0643\u0644 \u0635\u0641\u062d\u0629:' : 'Per page:'}
              </span>
              <select
                className={`input w-24 text-sm py-0 px-2 h-8 ${isLight ? 'text-black' : 'text-white'}`}
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {previewItem && (
          <div className="fixed inset-0 z-[2050] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setPreviewItem(null)}
            />
            <div className="relative z-[2050] w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <h2 className={`text-lg font-bold text-gray-900 ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
                <Eye size={20} className="text-blue-500" />
                {isRTL ? '\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0645\u0644\u0641' : 'File Details'}
              </h2>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4 ring-4 ring-blue-50/50 dark:ring-blue-900/10">
                  {previewItem.fileName.endsWith('.csv') || previewItem.fileName.endsWith('.xlsx') ? (
                    <FaFileExcel size={32} className="text-emerald-600 dark:text-emerald-400" />
                  ) : previewItem.fileName.endsWith('.pdf') ? (
                    <FaFilePdf size={32} className="text-red-600 dark:text-red-400" />
                  ) : (
                    <FileText size={32} className="text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <h3 className={`text-lg font-bold text-gray-900 ${isLight ? 'text-black' : 'text-white'} text-center break-all px-2 mb-2`}>
                  {previewItem.fileName}
                </h3>
                <StatusBadge status={previewItem.status} />
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 space-y-3 border border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Building2 size={16} />
                    {isRTL ? '\u0627\u0644\u0642\u0633\u0645' : 'Department'}
                  </span>
                  <span className={`text-sm font-medium text-gray-900 ${isLight ? 'text-black' : 'text-white'}`}>
                    {previewItem.department}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <User size={16} />
                    {isRTL ? '\u062a\u0645 \u0628\u0648\u0627\u0633\u0637\u0629' : 'Performed By'}
                  </span>
                  <span className={`text-sm font-medium text-gray-900 ${isLight ? 'text-black' : 'text-white'}`}>
                    {previewItem.performedBy}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Calendar size={16} />
                    {isRTL ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e' : 'Date'}
                  </span>
                  <span className={`text-sm font-medium text-gray-900 ${isLight ? 'text-black' : 'text-white'}`} dir="ltr">
                    {previewItem.timestamp.toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <Clock size={16} />
                    {isRTL ? '\u0627\u0644\u0648\u0642\u062a' : 'Time'}
                  </span>
                  <span className={`text-sm font-medium text-gray-900 ${isLight ? 'text-black' : 'text-white'}`} dir="ltr">
                    {previewItem.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {previewItem.error && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2 border border-red-100 dark:border-red-900/30">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{previewItem.error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30 flex gap-3">
              <button
                onClick={() => setPreviewItem(null)}
                className={`${canExport ? 'flex-1' : 'w-full'} px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm transition-colors`}
              >
                {isRTL ? '\u0625\u063a\u0644\u0627\u0642' : 'Close'}
              </button>
              {canExport && (
                <button
                  onClick={() => {
                    handleDownloadRowCSV(previewItem)
                    setPreviewItem(null)
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <Download size={18} />
                  {isRTL ? '\u062a\u062d\u0645\u064a\u0644' : 'Download'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowExportModal(false)}
          />
          <div className="relative z-50 glass-panel rounded-xl p-4 w-[560px] max-w-[95vw] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? '\u062a\u0635\u062f\u064a\u0631 \u062c\u062f\u064a\u062f' : 'New Export'}
              </h2>
              <button
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                onClick={() => setShowExportModal(false)}
              >
                 <XCircle size={20} className={`${isLight ? 'text-black' : 'text-white'}`} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={`${isLight ? 'text-black' : 'text-white'} label`} >
                  {isRTL ? '\u0627\u0633\u0645 \u0627\u0644\u0645\u0644\u0641' : 'File Name'}
                </label>
                <input
                  className={`input w-full dark:bg-gray-700 ${isLight ? 'text-black' : 'text-white'} dark:border-gray-600`}
                  value={exportForm.fileName}
                  onChange={(e) =>
                    setExportForm(f => ({ ...f, fileName: e.target.value }))
                  }
                  placeholder={isRTL ? 'clients_export.csv' : 'clients_export.csv'}
                />
              </div>
              <div>
                <label className="label dark:text-white">
                  {isRTL ? '\u0627\u0644\u0642\u0633\u0645' : 'Department'}
                </label>
                <select
                  className="input w-full dark:bg-gray-700 dark:text-white dark:border-gray-600"
                  value={exportForm.department}
                  onChange={(e) =>
                    setExportForm(f => ({ ...f, department: e.target.value }))
                  }
                >
                  {departmentOptions
                    .filter(d => d !== 'All')
                    .map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className={`px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700  ${isLight ? 'text-black' : 'text-white'} transition-colors`}
                onClick={() => setShowExportModal(false)}
              >
                {isRTL ? '\u0625\u0644\u063a\u0627\u0621' : 'Cancel'}
              </button>
              <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors" onClick={performExport}>
                {isRTL ? '\u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u062a\u0635\u062f\u064a\u0631' : 'Perform Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExportsReport
