import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Calendar, Filter, Layers, Tag, UserCheck, Users } from 'lucide-react'
import { api } from '../utils/api'
import { useTheme } from '../shared/context/ThemeProvider'
import BackButton from '../components/BackButton'
import SearchableSelect from '../components/SearchableSelect'
import DateRangePicker from '../shared/components/DateRangePicker'
import { PieChart } from '../shared/components/PieChart'

const CHART_COLORS = ['#10b981', '#2563eb', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16']

const formatDateTimeSafe = (value, isArabic) => {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat(isArabic ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return '-'
  }
}

const getAssignRoleLabel = (value, isArabic) => {
  const normalized = String(value || '').toLowerCase().trim()
  if (normalized === 'manager') {
    return isArabic ? 'مدير تيليسيلز' : 'Telesales Manager'
  }

  return isArabic ? 'وكيل تيليسيلز' : 'Telesales Agent'
}

const buildSegments = (entries = []) => (
  entries.map((entry, index) => ({
    label: entry.label,
    value: entry.value,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))
)

const summarizeCounts = (rows, keyGetter) => {
  const counts = new Map()
  rows.forEach((row) => {
    const key = String(keyGetter(row) || '').trim() || '-'
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

const buildSelectOptions = (rows, keyGetter, allLabel) => {
  const values = Array.from(
    new Set(
      rows
        .map((row) => String(keyGetter(row) || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))

  return [{ value: '', label: allLabel }, ...values.map((value) => ({ value, label: value }))]
}

const isWithinDateRange = (value, from, to) => {
  if (!from && !to) return true

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  if (from) {
    const start = new Date(from)
    start.setHours(0, 0, 0, 0)
    if (date < start) return false
  }

  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    if (date > end) return false
  }

  return true
}

const SummaryCard = ({ icon: Icon, title, value, iconClass = 'text-blue-500 dark:text-blue-400', iconBgClass = 'bg-blue-100 dark:bg-blue-900/30', isLight }) => (
  <div className="rounded-2xl border border-theme-border dark:border-gray-700/50 p-5 shadow-sm bg-theme-bg backdrop-blur-md">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className={`text-sm font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>{title}</div>
        <div className={`mt-2 text-3xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{value}</div>
      </div>
      <div className={`p-3 rounded-xl ${iconBgClass} ${iconClass}`}>
        <Icon size={22} />
      </div>
    </div>
  </div>
)

const ChartCard = ({ title, total, segments, isLight }) => (
  <div className="rounded-2xl border border-theme-border dark:border-gray-700/50 p-5 shadow-sm bg-theme-bg backdrop-blur-md">
    <h3 className={`text-xl font-bold mb-8 ${isLight ? 'text-black' : 'text-white'}`}>{title}</h3>
    <div className="flex flex-col items-center justify-center gap-5 min-h-[330px]">
      <PieChart
        segments={segments}
        centerValue={total}
        centerLabel="Total"
        size={220}
        cutout="72%"
        borderRadius={6}
      />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {segments.map((segment) => (
          <div key={segment.label} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${isLight ? 'bg-gray-100' : 'bg-gray-900/60'}`}>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className={`${isLight ? 'text-black' : 'text-white'} text-sm font-medium`}>{segment.label}</span>
            <span className="text-sm font-bold text-blue-500">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
)

const TopListCard = ({ title, items, isLight }) => (
  <div className="rounded-2xl border border-theme-border dark:border-gray-700/50 p-5 shadow-sm bg-theme-bg backdrop-blur-md">
    <h3 className={`text-xl font-bold mb-5 ${isLight ? 'text-black' : 'text-white'}`}>{title}</h3>
    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className={`rounded-2xl px-4 py-5 text-sm text-center ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-900/50 text-gray-300'}`}>
          No data available
        </div>
      ) : items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-4 ${isLight ? 'bg-gray-100' : 'bg-gray-800'}`}
        >
          <span className={`font-semibold truncate ${isLight ? 'text-black' : 'text-white'}`}>{item.label}</span>
          <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-emerald-50 px-3 text-sm font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
)

export default function SalesToTelesalesTransfersReport() {
  const { i18n } = useTranslation()
  const isArabic = i18n.language === 'ar' || i18n.dir() === 'rtl'
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [senderFilter, setSenderFilter] = useState('')
  const [receiverFilter, setReceiverFilter] = useState('')
  const [dateRange, setDateRange] = useState([null, null])

  useEffect(() => {
    let cancelled = false

    const fetchRows = async () => {
      try {
        const { data } = await api.get('/api/dashboard-data/sales-to-telesales-transfers')
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error('Failed to fetch sales to telesales transfers report', error)
        if (!cancelled) {
          setRows([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchRows()
    return () => { cancelled = true }
  }, [])

  const allLabel = isArabic ? 'الكل' : 'All'
  const [dateFrom, dateTo] = dateRange

  const sourceOptions = useMemo(() => buildSelectOptions(rows, (row) => row.source, allLabel), [rows, allLabel])
  const projectOptions = useMemo(() => buildSelectOptions(rows, (row) => row.project, allLabel), [rows, allLabel])
  const senderOptions = useMemo(() => buildSelectOptions(rows, (row) => row.fromSalesName, allLabel), [rows, allLabel])
  const receiverOptions = useMemo(() => buildSelectOptions(rows, (row) => row.toTelesalesName || row.toManagerName, allLabel), [rows, allLabel])

  const filteredRows = useMemo(() => (
    rows.filter((row) => {
      const receiverName = row.toTelesalesName || row.toManagerName || ''

      if (sourceFilter && row.source !== sourceFilter) return false
      if (projectFilter && row.project !== projectFilter) return false
      if (senderFilter && row.fromSalesName !== senderFilter) return false
      if (receiverFilter && receiverName !== receiverFilter) return false
      if (!isWithinDateRange(row.transferredAt, dateFrom, dateTo)) return false

      return true
    })
  ), [rows, sourceFilter, projectFilter, senderFilter, receiverFilter, dateFrom, dateTo])

  const totalTransfers = filteredRows.length
  const sourceSummary = useMemo(() => summarizeCounts(filteredRows, (row) => row.source), [filteredRows])
  const projectSummary = useMemo(() => summarizeCounts(filteredRows, (row) => row.project), [filteredRows])
  const topReceivers = useMemo(() => summarizeCounts(filteredRows, (row) => row.toTelesalesName || row.toManagerName).slice(0, 8), [filteredRows])
  const topSenders = useMemo(() => summarizeCounts(filteredRows, (row) => row.fromSalesName).slice(0, 8), [filteredRows])
  const uniqueTelesalesUsers = useMemo(() => new Set(filteredRows.map((row) => row.toTelesalesName || row.toManagerName).filter(Boolean)).size, [filteredRows])
  const uniqueSalesUsers = useMemo(() => new Set(filteredRows.map((row) => row.fromSalesName).filter(Boolean)).size, [filteredRows])

  const resetFilters = () => {
    setSourceFilter('')
    setProjectFilter('')
    setSenderFilter('')
    setReceiverFilter('')
    setDateRange([null, null])
  }

  const getStageLabel = (row, key) => {
    const arabicValue = row?.[`${key}Ar`]
    const englishValue = row?.[`${key}En`]
    return (isArabic ? arabicValue : englishValue) || englishValue || arabicValue || row?.[key] || '-'
  }

  return (
    <div className="p-4 md:p-6 bg-[var(--content-bg)] text-[var(--content-text)] overflow-hidden min-w-0">
      <div className="mb-6">
        <BackButton to="/reports" />
        <h1 className={`text-2xl font-bold mb-2 ${isLight ? 'text-black' : 'text-white'}`}>
          {isArabic ? 'تقرير التحويل إلى التيليسيلز' : 'Transfer To Telesales Report'}
        </h1>
        <p className={`text-sm ${isLight ? 'text-black' : 'text-white'}`}>
          {isArabic ? 'متابعة الليدز التي تم تحويلها من السيلز إلى التيليسيلز.' : 'Track leads that were transferred from sales into telesales.'}
        </p>
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-6 bg-theme-bg">
        <div className="flex  gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div className={`flex items-center gap-2 font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            <Filter size={18} className="text-blue-500 dark:text-blue-400" />
            <h3>{isArabic ? 'الفلاتر' : 'Filters'}</h3>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className={`text-sm font-medium transition-colors ${
              isLight ? 'text-gray-600 hover:text-black' : 'text-white/70 hover:text-white'
            }`}
          >
            {isArabic ? 'إعادة تعيين' : 'Reset'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              {isArabic ? 'المصدر' : 'Source'}
            </label>
            <SearchableSelect
              options={sourceOptions}
              value={sourceFilter}
              onChange={setSourceFilter}
              placeholder={allLabel}
              isRTL={isArabic}
              icon={<Tag size={16} />}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              {isArabic ? 'المشروع' : 'Project'}
            </label>
            <SearchableSelect
              options={projectOptions}
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder={allLabel}
              isRTL={isArabic}
              icon={<Layers size={16} />}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              {isArabic ? 'من السيلز' : 'From Sales'}
            </label>
            <SearchableSelect
              options={senderOptions}
              value={senderFilter}
              onChange={setSenderFilter}
              placeholder={allLabel}
              isRTL={isArabic}
              icon={<Users size={16} />}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              {isArabic ? 'إلى التيليسيلز' : 'To Telesales'}
            </label>
            <SearchableSelect
              options={receiverOptions}
              value={receiverFilter}
              onChange={setReceiverFilter}
              placeholder={allLabel}
              isRTL={isArabic}
              icon={<UserCheck size={16} />}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-black/70' : 'text-white/70'}`}>
              {isArabic ? 'تاريخ التحويل' : 'Transfer Date'}
            </label>
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={setDateRange}
              isRTL={isArabic}
              placeholderText={isArabic ? 'من - إلى' : 'From - To'}
              className="w-full"
              wrapperClassName="w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={ArrowLeftRight}
          title={isArabic ? 'إجمالي التحويلات' : 'Total Converted'}
          value={loading ? '...' : totalTransfers}
          iconClass="text-emerald-500 dark:text-emerald-300"
          iconBgClass="bg-emerald-50 dark:bg-emerald-900/30"
          isLight={isLight}
        />
        <SummaryCard
          icon={Tag}
          title={isArabic ? 'المصادر النشطة' : 'Active Sources'}
          value={loading ? '...' : sourceSummary.length}
          iconClass="text-blue-500 dark:text-blue-300"
          iconBgClass="bg-blue-50 dark:bg-blue-900/30"
          isLight={isLight}
        />
        <SummaryCard
          icon={UserCheck}
          title={isArabic ? 'وكلاء التيليسيلز' : 'Telesales Agents'}
          value={loading ? '...' : uniqueTelesalesUsers}
          iconClass="text-indigo-500 dark:text-indigo-300"
          iconBgClass="bg-indigo-50 dark:bg-indigo-900/30"
          isLight={isLight}
        />
        <SummaryCard
          icon={Users}
          title={isArabic ? 'مستخدمو السيلز' : 'Sales Users'}
          value={loading ? '...' : uniqueSalesUsers}
          iconClass="text-purple-500 dark:text-purple-300"
          iconBgClass="bg-purple-50 dark:bg-purple-900/30"
          isLight={isLight}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
        <ChartCard
          title={isArabic ? 'التحويل حسب المصدر' : 'Converted by Source'}
          total={totalTransfers}
          segments={buildSegments(sourceSummary)}
          isLight={isLight}
        />
        <ChartCard
          title={isArabic ? 'التحويل حسب المشروع' : 'Converted by Project'}
          total={totalTransfers}
          segments={buildSegments(projectSummary)}
          isLight={isLight}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
        <TopListCard
          title={isArabic ? 'أعلى المستلمين' : 'Top Receivers'}
          items={topReceivers}
          isLight={isLight}
        />
        <TopListCard
          title={isArabic ? 'أعلى المحولين' : 'Top Senders'}
          items={topSenders}
          isLight={isLight}
        />
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-6 bg-theme-bg">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            <Layers size={20} className="text-blue-500 dark:text-blue-400" />
            <h3>{isArabic ? 'سجل التحويلات' : 'Transfers Log'}</h3>
          </div>
          <div className={`text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
            {loading ? (isArabic ? 'جارٍ التحميل...' : 'Loading...') : `${totalTransfers} ${isArabic ? 'تحويل' : 'transfers'}`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className={isLight ? 'bg-gray-100/80 text-black' : 'bg-slate-900/70 text-white'}>
              <tr>
                <th className="px-4 py-3 text-start">{isArabic ? 'العميل المحتمل' : 'Lead'}</th>
                <th className="px-4 py-3 text-start">{isArabic ? 'المصدر' : 'Source'}</th>
                <th className="px-4 py-3 text-start">{isArabic ? 'المشروع' : 'Project'}</th>
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
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-300">
                    {isArabic ? 'جارٍ التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-300">
                    {isArabic ? 'لا توجد بيانات متاحة' : 'No data available'}
                  </td>
                </tr>
              ) : filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-theme-border dark:border-gray-700/60 ${
                    isLight ? 'bg-white hover:bg-gray-50' : 'bg-gray-800 hover:bg-blue-900/10'
                  }`}
                >
                  <td className="px-4 py-3 font-semibold">{row.leadName || '-'}</td>
                  <td className="px-4 py-3">{row.source || '-'}</td>
                  <td className="px-4 py-3">{row.project || '-'}</td>
                  <td className="px-4 py-3">{row.fromSalesName || '-'}</td>
                  <td className="px-4 py-3">{row.toTelesalesName || row.toManagerName || '-'}</td>
                  <td className="px-4 py-3">{getAssignRoleLabel(row.assignRole, isArabic)}</td>
                  <td className="px-4 py-3">{getStageLabel(row, 'stageBefore')}</td>
                  <td className="px-4 py-3">{getStageLabel(row, 'stageAfter')}</td>
                  <td className="px-4 py-3">{row.transferredBy || '-'}</td>
                  <td className="px-4 py-3">{formatDateTimeSafe(row.transferredAt, isArabic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
