import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '@shared/context/AppStateProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import { api, logExportEvent } from '../utils/api'
import BackButton from '../components/BackButton'
import { PieChart } from '../shared/components/PieChart'
import SearchableSelect from '../components/SearchableSelect'
import DateRangePicker from '../shared/components/DateRangePicker'
import { getSourceCanonicalName, getSourceDisplayName } from '../shared/utils/sourceDisplay'
import {
  Banknote,
  BarChart3,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Filter,
  Info,
  Tag,
  TrendingDown,
  User,
  Users,
} from 'lucide-react'
import { FaChevronDown, FaFileExcel, FaFileExport, FaFilePdf } from 'react-icons/fa'

const EMPTY_VALUE = ''

const DEFAULT_REPORT = {
  summary: { totalLeads: 0, totalCancelled: 0, lossRate: 0, lostRevenue: 0 },
  charts: { sources: [], projects: [] },
  topLists: { stages: [], sales: [], reasons: [] },
  table: { reasonColumns: [], rows: [] },
  options: { sources: [], projects: [], reasons: [], companyType: '' },
}

const formatNumber = (value) => Number(value || 0).toLocaleString()
const formatCurrencyEGP = (value) => `EGP ${formatNumber(Math.round(Number(value || 0)))}`
const normalizeReasonKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/\s+/g, ' ')

const EmptyState = ({ title, subtitle, compact = false, isLight }) => (
  <div className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700 bg-slate-900/30'} px-6 text-center ${compact ? 'py-6' : 'py-10'}`}>
    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-300'}`}>
      <BarChart3 size={22} />
    </div>
    <div className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{title}</div>
    <div className="mt-1 max-w-xs text-xs leading-5 text-[var(--muted-text)]">{subtitle}</div>
  </div>
)

const FilterField = ({ label, icon: Icon, children, isLight, isRTL = false }) => (
  <div className="space-y-1.5">
    <label className={`flex items-center gap-1.5 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
      <Icon size={13} className="text-blue-500 dark:text-blue-400" />
      {label}
    </label>
    {children}
  </div>
)

const MetricCard = ({ icon: Icon, label, value, accentClass, tooltip, isLight }) => (
  <div className="flex min-h-[108px] items-center gap-3 rounded-2xl border border-theme-border p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-gray-700/50">
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accentClass}`}>
      <Icon size={20} />
    </div>
    <div className="min-w-0">
      <div className={`flex items-center gap-1.5 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
        <span>{label}</span>
        {tooltip && <Info size={13} className="text-slate-400" title={tooltip} />}
      </div>
      <div className={`mt-1 truncate text-xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{value}</div>
    </div>
  </div>
)

const RankedListCard = ({ title, items, isLight, emptyTitle, emptySubtitle, scrollable = false, visibleItems = 5 }) => (
  <div className="rounded-2xl border border-theme-border p-4 shadow-sm dark:border-gray-700/50">
    <div className={`mb-3 text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{title}</div>
    {items.length === 0 ? (
      <div className="h-32">
        <EmptyState title={emptyTitle} subtitle={emptySubtitle} compact isLight={isLight} />
      </div>
    ) : (
      <div
        className={`space-y-2 ${scrollable ? 'overflow-y-auto pr-1' : ''}`}
        style={scrollable ? { maxHeight: `${visibleItems * 58}px` } : undefined}
      >
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
            <div className={`min-w-0 truncate text-sm font-medium ${isLight ? 'text-black' : 'text-white'}`}>{item.label}</div>
            <div className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 dark:bg-red-900/20 dark:text-red-300">{item.count}</div>
          </div>
        ))}
      </div>
    )}
  </div>
)

const ChartCard = ({ title, data, isLight, isRTL }) => {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0)
  const hasData = total > 0

  return (
    <div className="rounded-2xl border border-theme-border p-4 shadow-sm dark:border-gray-700/50">
      <div className={`mb-3 text-sm font-semibold ${isLight ? 'text-black' : 'text-white'} text-center md:text-left`}>{title}</div>
      {hasData ? (
        <>
          <div className="flex h-52 items-center justify-center">
            <PieChart
              segments={data}
              size={168}
              centerValue={total}
              centerLabel={isRTL ? 'الإجمالي' : 'Total'}
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
            {data.slice(0, 4).map((item) => (
              <div key={item.label} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-200'}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                <span>{item.label}</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-36 items-center justify-center">
          <div className="flex flex-col items-center">
            <PieChart
              percentage={0}
              size={112}
              centerValue={0}
              centerLabel={isRTL ? 'لا توجد بيانات' : 'No Data Available'}
              centerValueClass={`text-2xl font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}
              centerLabelClass="mt-1 text-[11px] text-[var(--muted-text)]"
              primaryColor="#cbd5e1"
              secondaryColor={isLight ? '#e2e8f0' : '#334155'}
              innerTrackColor={isLight ? '#f1f5f9' : '#1e293b'}
            />
            <div className="mt-3 text-xs text-[var(--muted-text)]">
              {isRTL ? 'جرّب تغيير الفلاتر أو اختيار فترة زمنية أخرى.' : 'Try changing filters or selecting another date range.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CancellationReport() {
  const { i18n } = useTranslation()
  const { theme } = useTheme()
  const { user, company } = useAppState()
  const isLight = theme === 'light'
  const isRTL = (i18n?.language || '').toLowerCase().startsWith('ar')
  const canExport = canExportReport(user, 'Cancellation Report')
  const appCompanyType = String(company?.company_type || '').toLowerCase()
  const [filters, setFilters] = useState({
    assigned_to: '',
    manager_id: '',
    project: '',
    source: '',
    cancel_reason: '',
    created_from: '',
    created_to: '',
    cancelled_from: '',
    cancelled_to: '',
  })
  const [users, setUsers] = useState([])
  const [cancelReasonsCatalog, setCancelReasonsCatalog] = useState([])
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const [report, setReport] = useState(DEFAULT_REPORT)
  const [loading, setLoading] = useState(true)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const exportMenuRef = useRef(null)

  const effectiveCompanyType = String(report?.options?.companyType || appCompanyType || '').toLowerCase()
  const isRealEstate = effectiveCompanyType === 'real estate'
  const projectLabel = isRealEstate ? (isRTL ? 'المشروع' : 'Project') : (isRTL ? 'الوحدة' : 'Item')
  const allProjectsLabel = isRealEstate ? (isRTL ? 'كل المشاريع' : 'All Projects') : (isRTL ? 'كل الوحدات' : 'All Items')
  const projectChartTitle = isRealEstate
    ? (isRTL ? 'الإلغاءات حسب المشروع' : 'Cancellations by Project')
    : (isRTL ? 'الإلغاءات حسب الوحدة' : 'Cancellations by Item')

  useEffect(() => {
    const onMouseDown = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    const fetchBootstrap = async () => {
      try {
        const [usersResponse, reasonsResponse, sourcesResponse] = await Promise.all([
          api.get('/api/users', { params: { per_page: 1000 } }),
          api.get('/api/cancel-reasons'),
          api.get('/api/sources').catch(() => ({ data: [] })),
        ])
        const usersData = Array.isArray(usersResponse.data) ? usersResponse.data : (usersResponse.data?.data || [])
        const reasonsData = Array.isArray(reasonsResponse.data) ? reasonsResponse.data : (reasonsResponse.data?.data || [])
        const sourcesData = Array.isArray(sourcesResponse.data) ? sourcesResponse.data : (sourcesResponse.data?.data || [])
        setUsers(usersData)
        setCancelReasonsCatalog(reasonsData)
        setSourcesCatalog(sourcesData)
      } catch (error) {
        console.error('Failed to fetch cancellation report bootstrap data', error)
        setUsers([])
        setCancelReasonsCatalog([])
        setSourcesCatalog([])
      }
    }

    fetchBootstrap()
  }, [])

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true)
      try {
        const response = await api.get('/api/reports/cancellation', {
          params: {
            assigned_to: filters.assigned_to || undefined,
            manager_id: filters.manager_id || undefined,
            project: filters.project || undefined,
            source: filters.source || undefined,
            cancel_reason: filters.cancel_reason || undefined,
            created_from: filters.created_from || undefined,
            created_to: filters.created_to || undefined,
            cancelled_from: filters.cancelled_from || undefined,
            cancelled_to: filters.cancelled_to || undefined,
          },
        })
        setReport({
          ...DEFAULT_REPORT,
          ...(response.data || {}),
          summary: { ...DEFAULT_REPORT.summary, ...(response.data?.summary || {}) },
          charts: { ...DEFAULT_REPORT.charts, ...(response.data?.charts || {}) },
          topLists: { ...DEFAULT_REPORT.topLists, ...(response.data?.topLists || {}) },
          table: { ...DEFAULT_REPORT.table, ...(response.data?.table || {}) },
          options: { ...DEFAULT_REPORT.options, ...(response.data?.options || {}) },
        })
      } catch (error) {
        console.error('Failed to fetch cancellation report', error)
        setReport(DEFAULT_REPORT)
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [filters])

  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const isSuperManagerRole = (role) => {
    const normalized = String(role || '').toLowerCase()
    return (
      normalized === 'admin' ||
      normalized === 'tenant admin' ||
      normalized === 'tenant-admin' ||
      normalized === 'operation manager' ||
      normalized === 'sales admin' ||
      normalized === 'director' ||
      normalized === 'branch manager'
    )
  }

  const getDescendants = (rootId, allUsers) => {
    let descendants = []
    const direct = allUsers.filter((userRow) => String(userRow?.manager_id ?? '') === String(rootId))
    direct.forEach((userRow) => {
      descendants.push(userRow)
      descendants = descendants.concat(getDescendants(userRow.id, allUsers))
    })
    return descendants
  }

  const managerOptions = useMemo(() => {
    const directManagerIds = new Set(users.map((userRow) => Number(userRow?.manager_id)).filter(Number.isFinite))
    const deduped = new Map()
    users
      .filter((userRow) => {
        const role = String(userRow?.role || userRow?.job_title || '').toLowerCase()
        const isSalesPerson = role.includes('sales person') || role.includes('salesperson')
        return !isSalesPerson && (directManagerIds.has(Number(userRow?.id)) || isSuperManagerRole(role))
      })
      .forEach((userRow) => {
        const value = String(userRow?.id ?? '')
        const label = String(userRow?.name ?? '').trim()
        if (!value || !label) return
        deduped.set(value, { value, label })
      })

    return [
      { value: EMPTY_VALUE, label: isRTL ? 'كل المديرين' : 'All Managers' },
      ...Array.from(deduped.values()),
    ]
  }, [users, isRTL])

  const salesOptions = useMemo(() => {
    const selectedManagerId = filters.manager_id
    let pool = users

    if (selectedManagerId) {
      const selectedManager = users.find((userRow) => String(userRow?.id) === String(selectedManagerId))
      if (selectedManager) {
        const selectedRole = String(selectedManager?.role || selectedManager?.job_title || '').toLowerCase()
        pool = isSuperManagerRole(selectedRole)
          ? users
          : [selectedManager, ...getDescendants(selectedManager.id, users)]
      }
    }

    const deduped = new Map()
    pool.forEach((userRow) => {
      const value = String(userRow?.id ?? '')
      const label = String(userRow?.name ?? '').trim()
      if (!value || !label) return
      deduped.set(value, { value, label })
    })

    return [
      { value: EMPTY_VALUE, label: isRTL ? 'كل مسؤولي المبيعات' : 'All Sales Persons' },
      ...Array.from(deduped.values()),
    ]
  }, [filters.manager_id, users, isRTL])

  const sourceLabelMap = useMemo(() => {
    const map = new Map()
    ;(sourcesCatalog || []).forEach((item) => {
      const value = getSourceCanonicalName(item)
      const label = getSourceDisplayName(item, isRTL)
      if (value && label) map.set(value, label)
    })
    return map
  }, [sourcesCatalog, isRTL])

  const sourceOptions = useMemo(() => [
    { value: EMPTY_VALUE, label: isRTL ? 'كل المصادر' : 'All Sources' },
    ...((report?.options?.sources || [])
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
      .map((item) => ({ value: item, label: sourceLabelMap.get(String(item).trim()) || String(item) }))),
  ], [report?.options?.sources, isRTL, sourceLabelMap])

  const reasonLabelMap = useMemo(() => {
    const map = new Map()
    ;(cancelReasonsCatalog || []).forEach((item) => {
      const keys = [item?.title, item?.title_ar]
      keys.forEach((key) => {
        const normalized = normalizeReasonKey(key)
        if (!normalized) return
        map.set(normalized, {
          en: String(item?.title || key || '').trim(),
          ar: String(item?.title_ar || item?.title || key || '').trim(),
        })
      })
    })
    ;(report?.options?.reasons || []).forEach((reason) => {
      const normalized = normalizeReasonKey(reason)
      if (!normalized || map.has(normalized)) return
      map.set(normalized, {
        en: String(reason || '').trim(),
        ar: String(reason || '').trim(),
      })
    })
    return map
  }, [cancelReasonsCatalog, report?.options?.reasons])

  const localizeReasonLabel = (reason) => {
    const normalized = normalizeReasonKey(reason)
    const entry = reasonLabelMap.get(normalized)
    if (!entry) return String(reason || '').trim()
    return isRTL ? entry.ar || entry.en || String(reason || '').trim() : entry.en || entry.ar || String(reason || '').trim()
  }

  const projectOptions = useMemo(() => [
    { value: EMPTY_VALUE, label: allProjectsLabel },
    ...((report?.options?.projects || [])
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
      .map((item) => ({ value: item, label: item }))),
  ], [allProjectsLabel, report?.options?.projects])

  const reasonOptions = useMemo(() => [
    { value: EMPTY_VALUE, label: isRTL ? 'كل الأسباب' : 'All Reasons' },
    ...Array.from(new Set([
      ...(cancelReasonsCatalog || []).map((item) => localizeReasonLabel(item?.title || item?.title_ar || '')),
      ...((report?.options?.reasons || []).map((item) => localizeReasonLabel(item || ''))),
    ]))
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
      .map((item) => ({ value: item, label: item })),
  ], [cancelReasonsCatalog, report?.options?.reasons, isRTL, reasonLabelMap])

  const sortedStages = useMemo(
    () => [...(report?.topLists?.stages || [])].sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0)),
    [report?.topLists?.stages]
  )

  const sortedReasons = useMemo(
    () => [...(report?.topLists?.reasons || [])].sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0)),
    [report?.topLists?.reasons]
  )

  const sortedSales = useMemo(
    () => [...(report?.topLists?.sales || [])].sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0)),
    [report?.topLists?.sales]
  )

  const exportRows = useMemo(() => {
    const reasonColumns = report?.table?.reasonColumns || []
    return (report?.table?.rows || []).map((row) => {
      const mapped = {
        [isRTL ? 'Sales' : 'Sales']: row.salesperson,
        [isRTL ? 'Total Leads' : 'Total Leads']: row.totalLeads,
        [isRTL ? 'Total Cancelled' : 'Total Cancelled']: row.totalCanceled,
      }
      reasonColumns.forEach((reasonName) => {
        mapped[reasonName] = row?.reasonCounts?.[reasonName] ?? 0
      })
      return mapped
    })
  }, [report?.table?.reasonColumns, report?.table?.rows, isRTL])

  const paginatedRows = useMemo(() => {
    const rows = report?.table?.rows || []
    const start = (currentPage - 1) * entriesPerPage
    return rows.slice(start, start + entriesPerPage)
  }, [report?.table?.rows, currentPage, entriesPerPage])

  const totalRows = (report?.table?.rows || []).length
  const pageCount = Math.max(1, Math.ceil(totalRows / entriesPerPage))

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cancellation Report')
    const fileName = 'cancellation-report.xlsx'
    XLSX.writeFile(workbook, fileName)
    logExportEvent({
      module: 'Cancellation Report',
      fileName,
      format: 'xlsx',
    })
    setShowExportMenu(false)
  }

  const handleExportPdf = () => {
    window.print()
    setShowExportMenu(false)
  }

  const clearFilters = () => {
    setFilters({
      assigned_to: '',
      manager_id: '',
      project: '',
      source: '',
      cancel_reason: '',
      created_from: '',
      created_to: '',
      cancelled_from: '',
      cancelled_to: '',
    })
  }

  const emptyTitle = isRTL ? 'لا توجد بيانات إلغاء متاحة' : 'No cancellation data available'
  const emptySubtitle = isRTL ? 'جرّب تغيير الفلاتر أو اختيار نطاق تاريخ آخر.' : 'Try changing filters or selecting another date range.'

  const metricCards = [
    {
      label: isRTL ? 'إجمالي الليدز' : 'Total Leads',
      value: loading ? '...' : formatNumber(report?.summary?.totalLeads),
      icon: User,
      accentClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300',
    },
    {
      label: isRTL ? 'الليدز الملغية' : 'Cancelled Leads',
      value: loading ? '...' : formatNumber(report?.summary?.totalCancelled),
      icon: CircleX,
      accentClass: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300',
    },
    {
      label: isRTL ? 'معدل الإلغاء' : 'Cancellation Rate',
      value: loading ? '...' : `${report?.summary?.lossRate || 0}%`,
      icon: TrendingDown,
      accentClass: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300',
    },
    {
      label: isRTL ? 'الخسارة التقديرية في الإيراد' : 'Estimated Lost Revenue',
      value: loading ? '...' : formatCurrencyEGP(report?.summary?.lostRevenue),
      icon: Banknote,
      accentClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300',
      tooltip: isRTL
        ? 'يتم حسابها من أفضل قيمة متاحة لكل ليد ملغي: قيمة الإلغاء أو المبلغ، ثم القيمة التقديرية لليد.'
        : 'Calculated from the best available value per cancelled lead: cancellation revenue/amount, then estimated lead value.',
    },
  ]

  return (
    <div className="min-h-screen space-y-6 p-6">
      <div>
        <BackButton to="/reports" className="relative z-[20060] pointer-events-auto" />
      </div>

      <div>
        <h1 className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
          {isRTL ? 'تقرير الإلغاءات' : 'Cancellation Report'}
        </h1>
        <p className={`mt-2 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
          {isRTL ? 'تحليل أداء الإلغاءات وأسباب الخسارة' : 'Analyze cancellation performance and loss reasons'}
        </p>
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3 className={`${isLight ? 'text-black' : 'text-white'} font-semibold`}>{isRTL ? 'تصفية' : 'Filter'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAdvancedFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <FaChevronDown size={12} className={`transform transition-transform duration-300 ${showAdvancedFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button
              onClick={clearFilters}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterField label={isRTL ? 'مسؤول المبيعات' : 'Sales Person'} icon={User} isLight={isLight} isRTL={isRTL}>
            <SearchableSelect
              options={salesOptions}
              value={filters.assigned_to}
              onChange={(value) => setFilters((prev) => ({ ...prev, assigned_to: value }))}
              placeholder={isRTL ? 'كل مسؤولي المبيعات' : 'All Sales Persons'}
            />
          </FilterField>

          <FilterField label={isRTL ? 'المدير' : 'Manager'} icon={Users} isLight={isLight} isRTL={isRTL}>
            <SearchableSelect
              options={managerOptions}
              value={filters.manager_id}
              onChange={(value) => setFilters((prev) => ({ ...prev, manager_id: value, assigned_to: '' }))}
              placeholder={isRTL ? 'كل المديرين' : 'All Managers'}
            />
          </FilterField>

          <FilterField label={isRTL ? 'المصدر' : 'Source'} icon={Tag} isLight={isLight} isRTL={isRTL}>
            <SearchableSelect
              options={sourceOptions}
              value={filters.source}
              onChange={(value) => setFilters((prev) => ({ ...prev, source: value }))}
              placeholder={isRTL ? 'كل المصادر' : 'All Sources'}
            />
          </FilterField>

          <FilterField label={projectLabel} icon={Briefcase} isLight={isLight} isRTL={isRTL}>
            <SearchableSelect
              options={projectOptions}
              value={filters.project}
              onChange={(value) => setFilters((prev) => ({ ...prev, project: value }))}
              placeholder={allProjectsLabel}
            />
          </FilterField>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${
          showAdvancedFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'
        }`}>
            <FilterField label={isRTL ? 'سبب الإلغاء' : 'Cancel Reason'} icon={CircleX} isLight={isLight} isRTL={isRTL}>
              <SearchableSelect
                options={reasonOptions}
                value={filters.cancel_reason}
                onChange={(value) => setFilters((prev) => ({ ...prev, cancel_reason: value }))}
                placeholder={isRTL ? 'كل الأسباب' : 'All Reasons'}
              />
            </FilterField>

            <FilterField label={isRTL ? 'تاريخ إنشاء الليد' : 'Lead Creation Date'} icon={Calendar} isLight={isLight} isRTL={isRTL}>
              <DateRangePicker
                from={filters.created_from}
                to={filters.created_to}
                onChange={({ from, to }) => setFilters((prev) => ({ ...prev, created_from: from || '', created_to: to || '' }))}
                isRTL={isRTL}
                className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 ${isLight ? 'text-black' : 'text-white'}`}
              />
            </FilterField>

            <FilterField label={isRTL ? 'تاريخ الإلغاء' : 'Cancellation Date'} icon={Calendar} isLight={isLight} isRTL={isRTL}>
              <DateRangePicker
                from={filters.cancelled_from}
                to={filters.cancelled_to}
                onChange={({ from, to }) => setFilters((prev) => ({ ...prev, cancelled_from: from || '', cancelled_to: to || '' }))}
                isRTL={isRTL}
                className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 ${isLight ? 'text-black' : 'text-white'}`}
              />
            </FilterField>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            accentClass={card.accentClass}
            tooltip={card.tooltip}
            isLight={isLight}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title={isRTL ? 'الإلغاءات حسب المصدر' : 'Cancellations by Source'}
          data={report?.charts?.sources || []}
          isLight={isLight}
          isRTL={isRTL}
        />
        <ChartCard
          title={projectChartTitle}
          data={report?.charts?.projects || []}
          isLight={isLight}
          isRTL={isRTL}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <RankedListCard
          title={isRTL ? 'أعلى أسباب الإلغاء' : 'Top Cancellation Reasons'}
          items={sortedReasons.map((item) => ({
            ...item,
            label: localizeReasonLabel(item.label),
          }))}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          isLight={isLight}
          scrollable
          visibleItems={5}
        />
        <RankedListCard
          title={isRTL ? 'أعلى المراحل قبل الإلغاء' : 'Top Stages Before Cancellation'}
          items={sortedStages}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          isLight={isLight}
          scrollable
          visibleItems={5}
        />
        <RankedListCard
          title={isRTL ? 'أعلى المبيعات في الإلغاء' : 'Top Sales Cancellation'}
          items={sortedSales}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          isLight={isLight}
          scrollable
          visibleItems={5}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-theme-border shadow-sm dark:border-gray-700/50">
        <div className={`flex items-center justify-between gap-3 border-b border-theme-border p-4 dark:border-gray-700/50 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'نظرة عامة على الإلغاءات' : 'Cancellation Overview'}</h2>
          {canExport && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((prev) => !prev)}
                className={`flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <FaFileExport />
                {isRTL ? 'تصدير' : 'Export'}
                <FaChevronDown className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} size={12} />
              </button>

              {showExportMenu && (
                <div className={`absolute top-full z-50 mt-1 w-48 rounded-lg border border-gray-100 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800 ${isRTL ? 'left-0' : 'right-0'}`}>
                  <button
                    onClick={handleExportExcel}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-start text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFileExcel className="text-green-600" /> {isRTL ? 'تصدير إلى إكسل' : 'Export to Excel'}
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-start text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className="text-red-600" /> {isRTL ? 'تصدير إلى PDF' : 'Export to PDF'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 p-4 md:hidden">
          {paginatedRows.map((row) => (
            <div key={row.salesperson} className="space-y-4 rounded-xl border border-gray-200 p-4 shadow-sm dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{row.salesperson}</h3>
                  <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isRTL ? 'إجمالي الليدز' : 'Total Leads'}: {row.totalLeads}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-600 dark:text-red-400">{row.totalCanceled}</p>
                  <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">
                    {isRTL ? 'الإلغاءات' : 'Cancellations'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {(report?.table?.reasonColumns || []).map((reasonName) => (
                  <div key={`${row.salesperson}-${reasonName}-mobile`} className="space-y-1">
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{localizeReasonLabel(reasonName)}</p>
                    <p className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{row?.reasonCounts?.[reasonName] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!loading && totalRows === 0 && (
            <div className="py-2">
              <EmptyState title={emptyTitle} subtitle={emptySubtitle} isLight={isLight} />
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table dir={isRTL ? 'rtl' : 'ltr'} className={`min-w-[1100px] w-full text-left text-sm ${isLight ? 'text-black' : 'text-white'}`}>
            <thead className={`${isLight ? 'bg-slate-50 text-slate-600' : 'bg-white/5 text-slate-200'} text-xs uppercase`}>
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">{isRTL ? 'المبيعات' : 'Sales'}</th>
                <th className="px-4 py-3 whitespace-nowrap">{isRTL ? 'إجمالي الليدز' : 'Total Leads'}</th>
                <th className="px-4 py-3 whitespace-nowrap">{isRTL ? 'إجمالي الإلغاءات' : 'Total Cancelled'}</th>
                {(report?.table?.reasonColumns || []).map((reasonName) => (
                  <th key={reasonName} className="px-4 py-3 min-w-[170px] whitespace-nowrap">{localizeReasonLabel(reasonName)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 dark:divide-gray-700/50">
              {paginatedRows.map((row) => (
                <tr key={row.salesperson} className="transition-colors hover:bg-white/5 dark:hover:bg-white/5">
                  <td className={`px-4 py-3 font-medium whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{row.salesperson}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.totalLeads}</td>
                  <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">{row.totalCanceled}</td>
                  {(report?.table?.reasonColumns || []).map((reasonName) => (
                    <td key={`${row.salesperson}-${reasonName}`} className="px-4 py-3 min-w-[170px] whitespace-nowrap">
                      {row?.reasonCounts?.[reasonName] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && totalRows === 0 && (
                <tr>
                  <td colSpan={3 + (report?.table?.reasonColumns || []).length} className="px-4 py-5">
                    <div className="h-44">
                      <EmptyState title={emptyTitle} subtitle={emptySubtitle} isLight={isLight} />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex  gap-3 border-t border-white/10 bg-[var(--content-bg)]/80 px-6 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700/60">
          <div className="text-[11px] text-[var(--muted-text)] sm:text-xs">
            {isRTL
              ? `عرض ${Math.min((currentPage - 1) * entriesPerPage + 1, totalRows)}-${Math.min(currentPage * entriesPerPage, totalRows)} من ${totalRows}`
              : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, totalRows)}-${Math.min(currentPage * entriesPerPage, totalRows)} of ${totalRows}`}
          </div>

          <div className="flex gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                disabled={currentPage === 1}
                title={isRTL ? 'السابق' : 'Prev'}
              >
                {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <span className="whitespace-nowrap text-sm">
                {isRTL ? `الصفحة ${currentPage} من ${pageCount}` : `Page ${currentPage} of ${pageCount}`}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage((page) => Math.min(page + 1, pageCount))}
                disabled={currentPage === pageCount}
                title={isRTL ? 'التالي' : 'Next'}
              >
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[10px] text-[var(--muted-text)] sm:text-xs">
                {isRTL ? 'لكل صفحة:' : 'Per page:'}
              </span>
              <select
                className="input h-8 w-24 px-2 py-0 text-sm"
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
    </div>
  )
}
