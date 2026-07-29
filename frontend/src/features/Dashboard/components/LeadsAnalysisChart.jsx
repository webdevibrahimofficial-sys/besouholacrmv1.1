import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend)
import { useTheme } from '@shared/context/ThemeProvider'
import { PieChart } from '@shared/components/PieChart'



export const LeadsAnalysisChart = ({ data, chartType = 'bar', filters = {}, legendLabel = 'No. of Leads', exportMode = false, totalValue = null }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const { theme, resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 480
  const useLightColors = exportMode || isLight
  const tickColor = useLightColors ? '#0f172a' : '#ffffff'
  const gridColor = useLightColors ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.12)'
  const tickFontSize = exportMode ? 13 : (isMobile ? 10 : 12)
  const axisTitleFontSize = exportMode ? 14 : (isMobile ? 10 : 13)
  const xAxisLabel = lang === 'ar' ? 'الأشهر' : 'Months'
  const yAxisLabel = lang === 'ar' ? 'عدد العملاء المحتملين' : 'No. of Leads'
  const [chartData, setChartData] = useState([])
  const [maxValue, setMaxValue] = useState(0)
  const containerHeightPx = exportMode ? 420 : 192
  const chartHeightClass = exportMode ? 'h-[420px]' : 'h-40 sm:h-48'
  const pieSize = exportMode ? 260 : 192
  const mobileScrollableChartMinWidth = exportMode ? '100%' : (isMobile ? `${Math.max(chartData.length, 12) * 58}px` : '100%')
  const monthLabelsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const translateMonthLabel = (label) => {
    if (!label || lang !== 'ar') return label

    const monthMap = {
      january: 'يناير',
      jan: 'يناير',
      february: 'فبراير',
      feb: 'فبراير',
      march: 'مارس',
      mar: 'مارس',
      april: 'أبريل',
      apr: 'أبريل',
      may: 'مايو',
      june: 'يونيو',
      jun: 'يونيو',
      july: 'يوليو',
      jul: 'يوليو',
      august: 'أغسطس',
      aug: 'أغسطس',
      september: 'سبتمبر',
      sep: 'سبتمبر',
      sept: 'سبتمبر',
      october: 'أكتوبر',
      oct: 'أكتوبر',
      november: 'نوفمبر',
      nov: 'نوفمبر',
      december: 'ديسمبر',
      dec: 'ديسمبر',
    }

    const normalizedLabel = String(label).trim()
    return monthMap[normalizedLabel.toLowerCase()] || label
  }

  const buildCompleteMonthlySeries = (rawMonthlyData) => {
    const normalizedYear = Number(filters?.year) || new Date().getFullYear()
    const byMonth = new Map()

    ;(Array.isArray(rawMonthlyData) ? rawMonthlyData : []).forEach((item) => {
      const monthKey = String(item?.month || '').trim()
      const monthIndex = /^\d{4}-\d{2}$/.test(monthKey)
        ? Number(monthKey.slice(5, 7)) - 1
        : monthLabelsEn.findIndex((label) => label.toLowerCase() === String(item?.label || '').trim().toLowerCase())

      if (monthIndex < 0 || monthIndex > 11) return

      byMonth.set(monthIndex, {
        ...item,
        month: `${normalizedYear}-${String(monthIndex + 1).padStart(2, '0')}`,
        label: monthLabelsEn[monthIndex],
        value: Number(item?.value || 0),
        revenue: Number(item?.revenue || 0),
        converted: Number(item?.converted || 0),
        lost: Number(item?.lost || 0),
        inProgress: Number(item?.inProgress || 0),
      })
    })

    return monthLabelsEn.map((label, monthIndex) => (
      byMonth.get(monthIndex) || {
        month: `${normalizedYear}-${String(monthIndex + 1).padStart(2, '0')}`,
        label,
        value: 0,
        revenue: 0,
        converted: 0,
        lost: 0,
        inProgress: 0,
      }
    ))
  }

  // Advanced search states
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [advancedFilters, setAdvancedFilters] = useState({
    employee: '',
    stage: '',
    leadName: '',
    dateFrom: '',
    dateTo: '',
    valueMin: '',
    valueMax: ''
  })

  // Date management functions
  const setDateRange = (days) => {
    const today = new Date()
    const fromDate = new Date(today)
    fromDate.setDate(today.getDate() - days)
    
    setAdvancedFilters(prev => ({
      ...prev,
      dateFrom: fromDate.toISOString().split('T')[0],
      dateTo: today.toISOString().split('T')[0]
    }))
  }

  const setCurrentMonth = () => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    
    setAdvancedFilters(prev => ({
      ...prev,
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: lastDay.toISOString().split('T')[0]
    }))
  }

  const setCurrentYear = () => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), 0, 1)
    const lastDay = new Date(today.getFullYear(), 11, 31)
    
    setAdvancedFilters(prev => ({
      ...prev,
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: lastDay.toISOString().split('T')[0]
    }))
  }

  const clearDateRange = () => {
    setAdvancedFilters(prev => ({
      ...prev,
      dateFrom: '',
      dateTo: ''
    }))
  }

  const swapDates = () => {
    setAdvancedFilters(prev => ({
      ...prev,
      dateFrom: prev.dateTo,
      dateTo: prev.dateFrom
    }))
  }

  // Sample data for employees and stages
  const employees = [
    { id: 1, name: 'أحمد محمد' },
    { id: 2, name: 'فاطمة علي' },
    { id: 3, name: 'محمد حسن' },
    { id: 4, name: 'نور الدين' },
    { id: 5, name: 'سارة أحمد' }
  ]

  const stages = [
    { id: 'new', name: t('New') },
    { id: 'contacted', name: t('Contacted') },
    { id: 'qualified', name: t('Qualified') },
    { id: 'proposal', name: t('Proposal') },
    { id: 'negotiation', name: t('Negotiation') },
    { id: 'closed_won', name: t('Closed Won') },
    { id: 'closed_lost', name: t('Closed Lost') }
  ]

  // Sample data for leads analysis
  const sampleData = {
    monthly: [
      { label: t('January'), value: 120, converted: 45, lost: 25, inProgress: 50, employee: 'أحمد محمد', stage: 'qualified', leadName: 'عميل يناير', date: '2024-01-15' },
      { label: t('February'), value: 98, converted: 38, lost: 20, inProgress: 40, employee: 'فاطمة علي', stage: 'contacted', leadName: 'عميل فبراير', date: '2024-02-10' },
      { label: t('March'), value: 145, converted: 55, lost: 30, inProgress: 60, employee: 'محمد حسن', stage: 'proposal', leadName: 'عميل مارس', date: '2024-03-20' },
      { label: t('April'), value: 167, converted: 62, lost: 35, inProgress: 70, employee: 'نور الدين', stage: 'new', leadName: 'عميل أبريل', date: '2024-04-05' },
      { label: t('May'), value: 134, converted: 48, lost: 28, inProgress: 58, employee: 'سارة أحمد', stage: 'negotiation', leadName: 'عميل مايو', date: '2024-05-12' },
      { label: t('June'), value: 189, converted: 71, lost: 40, inProgress: 78, employee: 'أحمد محمد', stage: 'closed_won', leadName: 'عميل يونيو', date: '2024-06-18' },
      { label: t('July'), value: 175, converted: 68, lost: 36, inProgress: 71, employee: 'فاطمة علي', stage: 'qualified', leadName: 'عميل يوليو', date: '2024-07-14' },
      { label: t('August'), value: 160, converted: 63, lost: 31, inProgress: 66, employee: 'محمد حسن', stage: 'proposal', leadName: 'عميل أغسطس', date: '2024-08-09' },
      { label: t('September'), value: 142, converted: 56, lost: 29, inProgress: 57, employee: 'نور الدين', stage: 'contacted', leadName: 'عميل سبتمبر', date: '2024-09-21' },
      { label: t('October'), value: 153, converted: 60, lost: 30, inProgress: 63, employee: 'سارة أحمد', stage: 'negotiation', leadName: 'عميل أكتوبر', date: '2024-10-11' },
      { label: t('November'), value: 171, converted: 67, lost: 34, inProgress: 70, employee: 'أحمد محمد', stage: 'qualified', leadName: 'عميل نوفمبر', date: '2024-11-16' },
      { label: t('December'), value: 196, converted: 74, lost: 41, inProgress: 81, employee: 'فاطمة علي', stage: 'closed_won', leadName: 'عميل ديسمبر', date: '2024-12-19' }
    ],
    weekly: [
      { label: t('Week 1'), value: 45, converted: 18, lost: 8, inProgress: 19 },
      { label: t('Week 2'), value: 52, converted: 22, lost: 10, inProgress: 20 },
      { label: t('Week 3'), value: 38, converted: 15, lost: 7, inProgress: 16 },
      { label: t('Week 4'), value: 61, converted: 25, lost: 12, inProgress: 24 }
    ],
    bySource: [
      { label: t('Website'), value: 245, converted: 98, lost: 47, inProgress: 100 },
      { label: t('Social Media'), value: 189, converted: 76, lost: 38, inProgress: 75 },
      { label: t('Email Campaign'), value: 156, converted: 62, lost: 31, inProgress: 63 },
      { label: t('Referral'), value: 134, converted: 54, lost: 27, inProgress: 53 },
      { label: t('Direct'), value: 98, converted: 39, lost: 20, inProgress: 39 }
    ],
    byStatus: [
      { label: t('New'), value: 234, color: '#3B82F6' },
      { label: t('Contacted'), value: 189, color: '#10B981' },
      { label: t('Qualified'), value: 145, color: '#F59E0B' },
      { label: t('Proposal'), value: 98, color: '#8B5CF6' },
      { label: t('Negotiation'), value: 67, color: '#EF4444' },
      { label: t('Closed Won'), value: 156, color: '#059669' },
      { label: t('Closed Lost'), value: 89, color: '#DC2626' }
    ]
  }

  // Filter functions
  const applyFilters = (rawData) => {
    let filteredData = rawData

    // Apply search term filter
    if (searchTerm) {
      filteredData = filteredData.filter(item =>
        item.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.leadName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.employee?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply advanced filters (merged with external filters from props)
    const mergedEmployee = filters?.employee || advancedFilters.employee
    const mergedFrom = filters?.dateFrom || advancedFilters.dateFrom
    const mergedTo = filters?.dateTo || advancedFilters.dateTo

    // If backend provides aggregated data, we cannot filter on item.employee because it may not exist.
    if (mergedEmployee) {
      filteredData = filteredData.filter(item => {
        if (!item.employee) return true
        return String(item.employee) === String(mergedEmployee)
      })
    }

    if (advancedFilters.stage) {
      filteredData = filteredData.filter(item => item.stage === advancedFilters.stage)
    }

    if (mergedFrom) {
      filteredData = filteredData.filter(item => {
        if (!item.date) return true
        const itemDate = new Date(item.date)
        const fromDate = new Date(mergedFrom)
        return itemDate >= fromDate
      })
    }

    if (mergedTo) {
      filteredData = filteredData.filter(item => {
        if (!item.date) return true
        const itemDate = new Date(item.date)
        const toDate = new Date(mergedTo)
        return itemDate <= toDate
      })
    }

    if (advancedFilters.leadName) {
      filteredData = filteredData.filter(item =>
        item.leadName?.toLowerCase().includes(advancedFilters.leadName.toLowerCase())
      )
    }

    if (advancedFilters.valueMin) {
      filteredData = filteredData.filter(item => item.value >= parseFloat(advancedFilters.valueMin))
    }

    if (advancedFilters.valueMax) {
      filteredData = filteredData.filter(item => item.value <= parseFloat(advancedFilters.valueMax))
    }

    return filteredData
  }

  const clearAllFilters = () => {
    setSearchTerm('')
    setAdvancedFilters({
      employee: '',
      stage: '',
      leadName: '',
      dateFrom: '',
      dateTo: '',
      valueMin: '',
      valueMax: ''
    })
  }

  useEffect(() => {
    const incomingData = data || sampleData[filters.dataType || 'monthly']
    const rawData = filters.dataType === 'monthly'
      ? buildCompleteMonthlySeries(incomingData)
      : incomingData
    const filteredData = applyFilters(rawData).map(item => ({
      ...item,
      label: translateMonthLabel(item.label),
    }))
    setChartData(filteredData)
    
    if (chartType === 'pie' || chartType === 'doughnut') {
      setMaxValue(filteredData.reduce((sum, item) => sum + item.value, 0))
    } else {
      setMaxValue(Math.max(...filteredData.map(item => item.value)) * 1.2)
    }
  }, [data, filters, chartType, searchTerm, advancedFilters, lang])

  const getBarHeightPx = (value) => {
    if (!maxValue || maxValue <= 0) return '1px'
    const h = (value / maxValue) * containerHeightPx
    return `${Math.max(1, Math.round(h))}px`
  }

  const renderBarChart = () => {
    const labels = chartData.map(item => item.label)
    const values = chartData.map(item => item.value || 0)

    const dataObj = {
      labels,
      datasets: [
        {
          label: t(legendLabel),
          data: values,
          backgroundColor: 'rgba(59, 130, 246, 0.7)', // blue-500
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
          borderSkipped: false,
          borderRadius: 6,
          maxBarThickness: 36
        }
      ]
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: exportMode ? 3 : 2,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, minRotation: 0, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } }, title: { display: true, text: xAxisLabel, color: tickColor, font: { size: axisTitleFontSize, weight: 700 } } },
        y: { beginAtZero: true, grid: { display: true, color: gridColor }, ticks: { precision: 0, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } }, title: { display: true, text: yAxisLabel, color: tickColor, font: { size: axisTitleFontSize, weight: 700 } } }
      }
    }

    return (
      <div className={`w-full ${isMobile && !exportMode ? 'overflow-x-auto pb-2' : ''}`}>
        <div className={`${chartHeightClass} px-2`} style={{ minWidth: mobileScrollableChartMinWidth }}>
          <Bar data={dataObj} options={options} />
        </div>
      </div>
    )
  }

  const renderStackedBarChart = () => {
    const labels = chartData.map(item => item.label)
    const converted = chartData.map(item => item.converted || 0)
    const inProgress = chartData.map(item => item.inProgress || 0)
    const lost = chartData.map(item => item.lost || 0)

    const dataObj = {
      labels,
      datasets: [
        { label: t('Converted'), data: converted, backgroundColor: '#22c55e', stack: 'status' },
        { label: t('In Progress'), data: inProgress, backgroundColor: '#eab308', stack: 'status' },
        { label: t('Lost'), data: lost, backgroundColor: '#ef4444', stack: 'status' },
      ]
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: exportMode ? 3 : 2,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } } },
        tooltip: { enabled: true }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, minRotation: 0, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } }, title: { display: true, text: xAxisLabel, color: tickColor, font: { size: axisTitleFontSize, weight: 700 } } },
        y: { stacked: true, beginAtZero: true, grid: { display: true, color: gridColor }, ticks: { precision: 0, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } }, title: { display: true, text: yAxisLabel, color: tickColor, font: { size: axisTitleFontSize, weight: 700 } } }
      }
    }

    return (
      <div className={`w-full ${isMobile && !exportMode ? 'overflow-x-auto pb-2' : ''}`}>
        <div className={`${chartHeightClass} px-2`} style={{ minWidth: mobileScrollableChartMinWidth }}>
          <Bar data={dataObj} options={options} />
        </div>
      </div>
    )
  }

  const renderLineChart = () => {
    const labels = chartData.map(item => item.label)
    const values = chartData.map(item => item.value || 0)

    const dataObj = {
      labels,
      datasets: [
        {
          label: t(legendLabel),
          data: values,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#3B82F6',
          fill: true
        }
      ]
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: exportMode ? 3 : 2,
      plugins: {
        legend: { display: false, position: 'top', labels: { usePointStyle: true, boxWidth: 8, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } } },
        tooltip: { enabled: true }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, minRotation: 0, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } }, title: { display: true, text: xAxisLabel, color: tickColor, font: { size: axisTitleFontSize, weight: 700 } } },
        y: { beginAtZero: true, grid: { display: true, color: gridColor }, ticks: { precision: 0, color: tickColor, font: { size: tickFontSize, weight: exportMode ? 600 : 400 } }, title: { display: true, text: yAxisLabel, color: tickColor, font: { size: axisTitleFontSize, weight: 700 } } }
      }
    }

    return (
      <div className={`w-full ${isMobile && !exportMode ? 'overflow-x-auto pb-2' : ''}`}>
        <div className={`${chartHeightClass} px-2`} style={{ minWidth: mobileScrollableChartMinWidth }}>
          <Line data={dataObj} options={options} />
        </div>
      </div>
    )
  }

  const renderPieChart = () => {
    const chartTotal = chartData.reduce((sum, item) => sum + (item.value || 0), 0)
    const total = Number.isFinite(Number(totalValue)) && Number(totalValue) > 0 ? Number(totalValue) : chartTotal
    const palette = [
      '#2563eb', // blue-600
      '#06b6d4', // cyan-500
      '#22c55e', // green-500
      '#a3e635', // lime-400
      '#f59e0b', // amber-500
      '#f97316', // orange-500
      '#ef4444', // red-500
      '#f43f5e', // rose-500
      '#a78bfa', // purple-400
      '#8b5cf6', // violet-500
    ]
    const segments = chartData.map((item, index) => ({
      label: item.label,
      value: item.value || 0,
      color: palette[index % palette.length]
    }))
    const useFourColumnLegend = !isMobile && segments.length > 4

    return (
      <div className={`flex flex-col items-center justify-center gap-4 md:flex-row md:items-center ${exportMode ? 'min-h-[420px]' : 'h-auto min-h-48'}`}>
        <PieChart
          segments={segments}
          centerValue={total}
          centerLabel={t('Total Leads')}
          size={pieSize}
        />
        <div
          className={`w-full md:w-auto ${exportMode ? 'md:ml-8' : 'md:ml-6'} ${
            useFourColumnLegend
              ? 'grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2'
              : 'space-y-2'
          }`}
        >
          {segments.map((seg, index) => (
            <div key={index} className="flex items-center gap-2 min-w-0">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-sm truncate" style={{ color: tickColor }}>{seg.label}</span>
              <span className="text-sm font-medium shrink-0" style={{ color: tickColor }}>{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return renderBarChart()
      case 'stackedBar':
        return renderStackedBarChart()
      case 'line':
        return renderLineChart()
      case 'pie':
        return renderPieChart()
      default:
        return renderBarChart()
    }
  }

  return (
    <div className="w-full">
      {renderChart()}
    </div>
  )
}
