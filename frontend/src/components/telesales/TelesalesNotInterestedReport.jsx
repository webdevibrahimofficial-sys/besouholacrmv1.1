import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import BackButton from '../BackButton'
import SearchableSelect from '../SearchableSelect'
import DateRangePicker from '../../shared/components/DateRangePicker'
import { PieChart } from '../../shared/components/PieChart'
import { api } from '../../utils/api'
import {
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

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function stripAuditSuffix(value) {
  return String(value || '')
    .replace(/\s*\(performed by.*?\)\s*$/i, '')
    .trim()
}

function parseDateOnly(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDate) return isoDate[1]
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function inDateRange(value, from, to) {
  if (!from && !to) return true
  const normalized = parseDateOnly(value)
  if (!normalized) return false
  if (from && normalized < from) return false
  if (to && normalized > to) return false
  return true
}

function getLeadStageKey(lead) {
  return normalizeText(
    lead?.display_stage_key ||
      lead?.display_stage ||
      lead?.stageRelation?.type ||
      lead?.stageRelation?.name ||
      lead?.stage ||
      ''
  )
}

function getLeadOwnerName(lead) {
  return lead?.assigned_to_name || lead?.assignedAgent?.name || lead?.sales_person_name || '-'
}

function getLeadOwnerId(lead) {
  return String(lead?.assigned_to || lead?.assignedAgent?.id || lead?.assigned_to_user?.id || '')
}

function getLeadProjectName(lead) {
  return lead?.project?.name || lead?.project || lead?.project_name || lead?.item || lead?.item_name || lead?.item?.name || lead?.projectRelation?.name || ''
}

function getLeadReason(lead) {
  return String(
    lead?.latest_action?.reason ||
      lead?.latestAction?.reason ||
      lead?.not_interested_reason ||
      lead?.cancel_reason ||
      lead?.latest_action?.notes ||
      lead?.latestAction?.notes ||
      lead?.latest_action?.description ||
      lead?.latestAction?.description ||
      ''
  ).trim()
}

function getDescendants(rootId, allUsers) {
  let descendants = []
  const direct = allUsers.filter((entry) => String(entry?.manager_id || '') === String(rootId))
  direct.forEach((entry) => {
    descendants.push(entry)
    descendants = [...descendants, ...getDescendants(entry.id, allUsers)]
  })
  return descendants
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function formatCurrency(value) {
  return `EGP ${formatNumber(Math.round(Number(value || 0)))}`
}

function buildSegments(entries, palette) {
  return entries
    .filter((entry) => Number(entry?.value || 0) > 0)
    .map((entry, index) => ({
      label: entry.label,
      value: Number(entry.value || 0),
      color: palette[index % palette.length],
    }))
}

const EmptyState = ({ title, subtitle, compact = false, isLight }) => (
  <div className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700 bg-slate-900/30'} px-6 text-center ${compact ? 'py-6' : 'py-10'}`}>
    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-300'}`}>
      <BarChart3 size={22} />
    </div>
    <div className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{title}</div>
    <div className="mt-1 max-w-xs text-xs leading-5 text-[var(--muted-text)]">{subtitle}</div>
  </div>
)

const FilterField = ({ label, icon: Icon, children, isLight, isRtl = false }) => (
  <div className="space-y-1.5">
    <label className={`flex items-center gap-1.5 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} ${isRtl ? 'flex-row-reverse justify-end' : ''}`}>
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
        {tooltip ? <Info size={13} className="text-slate-400" title={tooltip} /> : null}
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
        className={`space-y-2 ${scrollable && items.length > visibleItems ? 'overflow-y-auto pr-1' : ''}`}
        style={scrollable && items.length > visibleItems ? { maxHeight: `${visibleItems * 58}px` } : undefined}
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

const ChartCard = ({ title, data, isLight, isRtl }) => {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0)

  return (
    <div className="rounded-2xl border border-theme-border p-4 shadow-sm dark:border-gray-700/50">
      <div className={`mb-3 text-sm font-semibold ${isLight ? 'text-black' : 'text-white'} text-center md:text-left`}>{title}</div>
      {total > 0 ? (
        <>
          <div className="flex h-52 items-center justify-center">
            <PieChart segments={data} size={168} centerValue={total} centerLabel={isRtl ? 'الإجمالي' : 'Total'} />
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
          <EmptyState title={isRtl ? 'لا توجد بيانات' : 'No Data Available'} subtitle={isRtl ? 'جرّب تغيير الفلاتر أو اختيار فترة أخرى.' : 'Try changing filters or selecting another range.'} compact isLight={isLight} />
        </div>
      )}
    </div>
  )
}

export default function TelesalesNotInterestedReport({
  rows,
  users,
  telesalesAssignees,
  companyType,
  isLight,
  isRtl,
  canExport = true,
  onBack,
}) {
  useTranslation()
  const [notInterestReasonsCatalog, setNotInterestReasonsCatalog] = useState([])
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const [filters, setFilters] = useState({
    assigned_to: '',
    manager_id: '',
    project: '',
    source: '',
    reason: '',
    created_from: '',
    created_to: '',
    updated_from: '',
    updated_to: '',
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const exportMenuRef = useRef(null)
  const normalizedCompanyType = normalizeText(companyType)
  const isRealEstate = normalizedCompanyType === 'real estate'
  const projectLabel = isRealEstate ? (isRtl ? 'المشروع' : 'Project') : (isRtl ? 'الصنف' : 'Item')
  const allProjectsLabel = isRealEstate ? (isRtl ? 'كل المشاريع' : 'All Projects') : (isRtl ? 'كل الأصناف' : 'All Items')
  const projectChartTitle = isRealEstate ? (isRtl ? 'غير مهتم حسب المشروع' : 'Not Interested by Project') : (isRtl ? 'غير مهتم حسب الصنف' : 'Not Interested by Item')

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
    setCurrentPage(1)
  }, [filters])

  useEffect(() => {
    const fetchNotInterestReasons = async () => {
      try {
        const response = await api.get('/api/not-interest-reasons')
        const reasonsData = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setNotInterestReasonsCatalog(reasonsData)
      } catch (error) {
        console.error('Failed to fetch not interest reasons', error)
        setNotInterestReasonsCatalog([])
      }
    }

    fetchNotInterestReasons()
  }, [])

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await api.get('/api/sources?active=1').catch(() => api.get('/api/sources'))
        const sourcesData = Array.isArray(response?.data)
          ? response.data
          : (response?.data?.data || [])

        setSourcesCatalog(
          sourcesData
            .map((item) => String(item?.name || item?.title || item || '').trim())
            .filter(Boolean)
        )
      } catch (error) {
        console.error('Failed to fetch sources catalog', error)
        setSourcesCatalog([])
      }
    }

    fetchSources()
  }, [])

  const notInterestedRows = useMemo(() => (
    (rows || []).filter((lead) => {
      const stageKey = getLeadStageKey(lead)
      return stageKey === 'not interested' || stageKey === 'not interest' || stageKey === 'not_interest'
    })
  ), [rows])

  const managerOptions = useMemo(() => {
    const allowedRoles = new Set(['telesales manager', 'telesales team leader', 'tenant admin', 'admin'])
    const managers = (users || [])
      .filter((entry) => allowedRoles.has(normalizeText(entry?.role || entry?.job_title)))
      .map((entry) => ({ value: String(entry.id), label: entry.name || `#${entry.id}` }))

    return [{ value: EMPTY_VALUE, label: isRtl ? 'كل المديرين' : 'All Managers' }, ...managers]
  }, [isRtl, users])

  const salesOptions = useMemo(() => {
    let candidates = Array.isArray(telesalesAssignees) ? [...telesalesAssignees] : []

    if (filters.manager_id) {
      const validIds = new Set([String(filters.manager_id)])
      getDescendants(filters.manager_id, users || []).forEach((entry) => validIds.add(String(entry.id)))
      candidates = candidates.filter((entry) => validIds.has(String(entry.id)) || validIds.has(String(entry.manager_id || '')))
    }

    return [
      { value: EMPTY_VALUE, label: isRtl ? 'كل مسؤولي التيليسيلز' : 'All Telesales Agents' },
      ...candidates.map((entry) => ({ value: String(entry.id), label: entry.name || `#${entry.id}` })),
    ]
  }, [filters.manager_id, isRtl, telesalesAssignees, users])

  const allSourceLabels = useMemo(() => (
    Array.from(new Set([
      ...sourcesCatalog,
      ...notInterestedRows.map((lead) => String(lead?.source || '').trim()).filter(Boolean),
    ]))
  ), [notInterestedRows, sourcesCatalog])

  const sourceOptions = useMemo(() => [
    { value: EMPTY_VALUE, label: isRtl ? 'كل المصادر' : 'All Sources' },
    ...allSourceLabels.map((item) => ({ value: item, label: item })),
  ], [allSourceLabels, isRtl])

  const projectOptions = useMemo(() => [
    { value: EMPTY_VALUE, label: allProjectsLabel },
    ...Array.from(new Set(notInterestedRows.map(getLeadProjectName).filter(Boolean))).map((item) => ({ value: item, label: item })),
  ], [allProjectsLabel, notInterestedRows])

  const catalogReasonEntries = useMemo(() => (
    (notInterestReasonsCatalog || [])
      .map((item) => {
        const en = String(item?.title || '').trim()
        const ar = String(item?.title_ar || '').trim()
        const label = isRtl ? (ar || en) : (en || ar)
        const variants = Array.from(new Set([
          normalizeText(en),
          normalizeText(ar),
          normalizeText(stripAuditSuffix(en)),
          normalizeText(stripAuditSuffix(ar)),
        ].filter(Boolean)))

        return { label, variants }
      })
      .filter((item) => item.label && item.variants.length > 0)
  ), [isRtl, notInterestReasonsCatalog])

  const resolveReasonLabel = (reason) => {
    const raw = String(reason || '').trim()
    if (!raw) return ''

    const normalizedRaw = normalizeText(raw)
    const normalizedBase = normalizeText(stripAuditSuffix(raw))

    const matchedCatalogEntry = catalogReasonEntries.find((entry) => (
      entry.variants.some((variant) =>
        variant === normalizedRaw ||
        variant === normalizedBase ||
        normalizedRaw.startsWith(`${variant} `) ||
        normalizedRaw.startsWith(`${variant}(`) ||
        normalizedBase.startsWith(`${variant} `) ||
        normalizedBase === variant
      )
    ))

    return matchedCatalogEntry?.label || stripAuditSuffix(raw)
  }

  const localizedCatalogReasons = useMemo(() => (
    catalogReasonEntries.map((entry) => entry.label)
  ), [catalogReasonEntries])

  const allSalesLabels = useMemo(() => (
    Array.from(new Set(
      (Array.isArray(telesalesAssignees) ? telesalesAssignees : [])
        .map((entry) => String(entry?.name || '').trim())
        .filter(Boolean)
    ))
  ), [telesalesAssignees])

  const reasonOptions = useMemo(() => [
    { value: EMPTY_VALUE, label: isRtl ? 'كل الأسباب' : 'All Reasons' },
    ...Array.from(new Set([
      ...localizedCatalogReasons,
      ...notInterestedRows.map((lead) => resolveReasonLabel(getLeadReason(lead))).filter(Boolean),
    ])).map((item) => ({ value: item, label: item })),
  ], [isRtl, localizedCatalogReasons, notInterestedRows])

  const filteredRows = useMemo(() => {
    return notInterestedRows.filter((lead) => {
      if (filters.assigned_to && String(getLeadOwnerId(lead)) !== String(filters.assigned_to)) return false

      if (filters.manager_id) {
        const validIds = new Set([String(filters.manager_id)])
        getDescendants(filters.manager_id, users || []).forEach((entry) => validIds.add(String(entry.id)))
        const ownerId = String(getLeadOwnerId(lead))
        const owner = (users || []).find((entry) => String(entry.id) === ownerId)
        const ownerManagerId = String(owner?.manager_id || '')
        if (!validIds.has(ownerId) && !validIds.has(ownerManagerId)) return false
      }

      if (filters.project && getLeadProjectName(lead) !== filters.project) return false
      if (filters.source && String(lead?.source || '').trim() !== filters.source) return false
      if (filters.reason && resolveReasonLabel(getLeadReason(lead)) !== filters.reason) return false
      if (!inDateRange(lead?.created_at || lead?.createdAt, filters.created_from, filters.created_to)) return false
      if (!inDateRange(lead?.updated_at || lead?.latest_action_at || lead?.last_action_at, filters.updated_from, filters.updated_to)) return false
      return true
    })
  }, [filters, notInterestedRows, users])

  const palette = ['#ef4444', '#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']

  const summary = useMemo(() => {
    const lostRevenue = filteredRows.reduce((sum, lead) => sum + Number(lead?.amount || lead?.total_amount || lead?.value || 0), 0)
    return {
      totalLeads: rows.length,
      totalNotInterested: filteredRows.length,
      lossRate: rows.length > 0 ? Math.round((filteredRows.length / rows.length) * 100) : 0,
      lostRevenue,
    }
  }, [filteredRows, rows.length])

  const topLists = useMemo(() => {
    const bySource = new Map()
    const bySales = new Map()
    const byReason = new Map()

    filteredRows.forEach((lead) => {
      const source = String(lead?.source || '-').trim() || '-'
      const sales = getLeadOwnerName(lead) || '-'
      const reason = resolveReasonLabel(getLeadReason(lead)) || (isRtl ? 'غير محدد' : 'Unspecified')
      bySource.set(source, Number(bySource.get(source) || 0) + 1)
      bySales.set(sales, Number(bySales.get(sales) || 0) + 1)
      byReason.set(reason, Number(byReason.get(reason) || 0) + 1)
    })

    localizedCatalogReasons.forEach((reason) => {
      if (!byReason.has(reason)) {
        byReason.set(reason, 0)
      }
    })

    allSalesLabels.forEach((sales) => {
      if (!bySales.has(sales)) {
        bySales.set(sales, 0)
      }
    })

    allSourceLabels.forEach((source) => {
      if (!bySource.has(source)) {
        bySource.set(source, 0)
      }
    })

    const sortMap = (map) => Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
    return {
      sources: sortMap(bySource),
      sales: sortMap(bySales),
      reasons: sortMap(byReason),
    }
  }, [allSalesLabels, allSourceLabels, filteredRows, isRtl, localizedCatalogReasons])

  const chartData = useMemo(() => {
    const sourcesMap = new Map()
    const projectsMap = new Map()

    filteredRows.forEach((lead) => {
      const source = String(lead?.source || '-').trim() || '-'
      const project = getLeadProjectName(lead) || '-'
      sourcesMap.set(source, Number(sourcesMap.get(source) || 0) + 1)
      projectsMap.set(project, Number(projectsMap.get(project) || 0) + 1)
    })

    return {
      sources: buildSegments(Array.from(sourcesMap.entries()).map(([label, value]) => ({ label, value })), palette),
      projects: buildSegments(Array.from(projectsMap.entries()).map(([label, value]) => ({ label, value })), palette),
    }
  }, [filteredRows])

  const tableRows = useMemo(() => {
    const grouped = new Map()
    filteredRows.forEach((lead) => {
      const key = getLeadOwnerId(lead) || getLeadOwnerName(lead)
      const current = grouped.get(key) || {
        salesperson: getLeadOwnerName(lead),
        totalLeads: 0,
        lostRevenue: 0,
        reasonCounts: {},
      }
      const reason = resolveReasonLabel(getLeadReason(lead)) || (isRtl ? 'غير محدد' : 'Unspecified')
      current.totalLeads += 1
      current.lostRevenue += Number(lead?.amount || lead?.total_amount || lead?.value || 0)
      current.reasonCounts[reason] = Number(current.reasonCounts[reason] || 0) + 1
      grouped.set(key, current)
    })

    return Array.from(grouped.values()).sort((a, b) => b.totalLeads - a.totalLeads)
  }, [filteredRows, isRtl])

  const reasonColumns = useMemo(
    () => Array.from(new Set([
      ...localizedCatalogReasons,
      ...filteredRows.map((lead) => resolveReasonLabel(getLeadReason(lead)) || (isRtl ? 'غير محدد' : 'Unspecified')),
    ])),
    [filteredRows, isRtl, localizedCatalogReasons]
  )

  const exportRows = useMemo(() => (
    tableRows.map((row) => {
      const mapped = {
        [isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent']: row.salesperson,
        [isRtl ? 'إجمالي الليدز' : 'Total Leads']: row.totalLeads,
        [isRtl ? 'الخسارة التقديرية' : 'Estimated Lost Revenue']: row.lostRevenue,
      }
      reasonColumns.forEach((reason) => {
        mapped[reason] = row.reasonCounts?.[reason] ?? 0
      })
      return mapped
    })
  ), [isRtl, reasonColumns, tableRows])

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return tableRows.slice(start, start + entriesPerPage)
  }, [currentPage, entriesPerPage, tableRows])

  const pageCount = Math.max(1, Math.ceil(tableRows.length / entriesPerPage))

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Not Interested Report')
    XLSX.writeFile(workbook, 'telesales_not_interested_report.xlsx')
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
      reason: '',
      created_from: '',
      created_to: '',
      updated_from: '',
      updated_to: '',
    })
  }

  const emptyTitle = isRtl ? 'لا توجد بيانات غير مهتم متاحة' : 'No not interested data available'
  const emptySubtitle = isRtl ? 'جرّب تغيير الفلاتر أو اختيار نطاق تاريخ آخر.' : 'Try changing filters or selecting another date range.'

  const metricCards = [
    {
      label: isRtl ? 'إجمالي الليدز' : 'Total Leads',
      value: formatNumber(summary.totalLeads),
      icon: User,
      accentClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300',
    },
    {
      label: isRtl ? 'ليدز غير مهتم' : 'Not Interested Leads',
      value: formatNumber(summary.totalNotInterested),
      icon: CircleX,
      accentClass: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300',
    },
    {
      label: isRtl ? 'معدل غير مهتم' : 'Not Interested Rate',
      value: `${summary.lossRate}%`,
      icon: TrendingDown,
      accentClass: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300',
    },
    {
      label: isRtl ? 'الخسارة التقديرية' : 'Estimated Lost Revenue',
      value: formatCurrency(summary.lostRevenue),
      icon: Briefcase,
      accentClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300',
      tooltip: isRtl ? 'تقدير مبني على أفضل قيمة متاحة داخل الليد.' : 'Estimated from the best available lead value.',
    },
  ]

  return (
    <div className="min-h-screen space-y-6 p-6">
      <div>
        <BackButton to="/telesales/dashboard?view=reports" onClick={onBack} className="relative z-[20060] pointer-events-auto" />
      </div>

      <div>
        <h1 className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
          {isRtl ? 'تقرير غير مهتم' : 'Not Interested Report'}
        </h1>
        <p className={`mt-2 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
          {isRtl ? 'تحليل أداء الليدز غير المهتمة وأسباب الخسارة داخل التيليسيلز' : 'Analyze telesales not interested leads and loss reasons'}
        </p>
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3 className={`${isLight ? 'text-black' : 'text-white'} font-semibold`}>{isRtl ? 'تصفية' : 'Filter'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdvancedFilters((prev) => !prev)} className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
              {showAdvancedFilters ? (isRtl ? 'إخفاء' : 'Hide') : (isRtl ? 'عرض الكل' : 'Show All')}
              <FaChevronDown size={12} className={`transform transition-transform duration-300 ${showAdvancedFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button onClick={clearFilters} className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}>
              {isRtl ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FilterField label={isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'} icon={User} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={salesOptions} value={filters.assigned_to} onChange={(value) => setFilters((prev) => ({ ...prev, assigned_to: value }))} placeholder={isRtl ? 'كل مسؤولي التيليسيلز' : 'All Telesales Agents'} />
            </FilterField>
            <FilterField label={isRtl ? 'المدير' : 'Manager'} icon={Users} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={managerOptions} value={filters.manager_id} onChange={(value) => setFilters((prev) => ({ ...prev, manager_id: value, assigned_to: '' }))} placeholder={isRtl ? 'كل المديرين' : 'All Managers'} />
            </FilterField>
            <FilterField label={isRtl ? 'المصدر' : 'Source'} icon={Tag} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={sourceOptions} value={filters.source} onChange={(value) => setFilters((prev) => ({ ...prev, source: value }))} placeholder={isRtl ? 'كل المصادر' : 'All Sources'} />
            </FilterField>
            <FilterField label={projectLabel} icon={Briefcase} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={projectOptions} value={filters.project} onChange={(value) => setFilters((prev) => ({ ...prev, project: value }))} placeholder={allProjectsLabel} />
            </FilterField>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${showAdvancedFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'}`}>
            <FilterField label={isRtl ? 'السبب' : 'Reason'} icon={CircleX} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={reasonOptions} value={filters.reason} onChange={(value) => setFilters((prev) => ({ ...prev, reason: value }))} placeholder={isRtl ? 'كل الأسباب' : 'All Reasons'} />
            </FilterField>
            <FilterField label={isRtl ? 'تاريخ إنشاء الليد' : 'Lead Creation Date'} icon={Calendar} isLight={isLight} isRtl={isRtl}>
              <DateRangePicker from={filters.created_from} to={filters.created_to} onChange={({ from, to }) => setFilters((prev) => ({ ...prev, created_from: from || '', created_to: to || '' }))} isRTL={isRtl} className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 ${isLight ? 'text-black' : 'text-white'}`} />
            </FilterField>
            <FilterField label={isRtl ? 'تاريخ آخر تحديث' : 'Last Update Date'} icon={Calendar} isLight={isLight} isRtl={isRtl}>
              <DateRangePicker from={filters.updated_from} to={filters.updated_to} onChange={({ from, to }) => setFilters((prev) => ({ ...prev, updated_from: from || '', updated_to: to || '' }))} isRTL={isRtl} className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 ${isLight ? 'text-black' : 'text-white'}`} />
            </FilterField>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <MetricCard key={card.label} icon={card.icon} label={card.label} value={card.value} accentClass={card.accentClass} tooltip={card.tooltip} isLight={isLight} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title={isRtl ? 'غير مهتم حسب المصدر' : 'Not Interested by Source'} data={chartData.sources} isLight={isLight} isRtl={isRtl} />
        <ChartCard title={projectChartTitle} data={chartData.projects} isLight={isLight} isRtl={isRtl} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RankedListCard title={isRtl ? 'أكثر المصادر' : 'Top Sources'} items={topLists.sources} isLight={isLight} emptyTitle={emptyTitle} emptySubtitle={emptySubtitle} scrollable visibleItems={5} />
        <RankedListCard title={isRtl ? 'أكثر مسؤولي التيليسيلز' : 'Top Telesales Agents'} items={topLists.sales} isLight={isLight} emptyTitle={emptyTitle} emptySubtitle={emptySubtitle} scrollable visibleItems={5} />
        <RankedListCard title={isRtl ? 'أكثر الأسباب' : 'Top Reasons'} items={topLists.reasons} isLight={isLight} emptyTitle={emptyTitle} emptySubtitle={emptySubtitle} scrollable visibleItems={5} />
      </div>

      <div className="rounded-2xl border border-theme-border shadow-sm dark:border-gray-700/50 overflow-hidden">
        <div className="flex items-center justify-between border-b border-theme-border px-4 py-4 dark:border-gray-700/50">
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'نظرة عامة على غير المهتم' : 'Not Interested Overview'}</h2>
          {canExport && (
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu((prev) => !prev)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700">
              <FaFileExport /> {isRtl ? 'تصدير' : 'Export'}
              <FaChevronDown size={12} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu ? (
              <div className={`absolute top-full ${isRtl ? 'left-0' : 'right-0'} z-50 mt-1 w-48 rounded-lg border border-gray-100 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800`}>
                <button onClick={handleExportExcel} className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:text-white dark:hover:bg-gray-700">
                  <FaFileExcel className="text-green-600" /> {isRtl ? 'تصدير كـ Excel' : 'Export to Excel'}
                </button>
                <button onClick={handleExportPdf} className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:text-white dark:hover:bg-gray-700">
                  <FaFilePdf className="text-red-600" /> {isRtl ? 'تصدير كـ PDF' : 'Export to PDF'}
                </button>
              </div>
            ) : null}
          </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={isLight ? 'bg-gray-50' : 'bg-slate-900/60'}>
              <tr>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'}</th>
                <th className={`px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'إجمالي الليدز' : 'Total Leads'}</th>
                {reasonColumns.map((reason) => (
                  <th key={reason} className={`px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{reason}</th>
                ))}
                <th className={`px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'الخسارة التقديرية' : 'Estimated Lost Revenue'}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={reasonColumns.length + 3} className="px-4 py-8 text-center text-[var(--muted-text)]">
                    {isRtl ? 'لا توجد بيانات' : 'No data'}
                  </td>
                </tr>
              ) : paginatedRows.map((row, index) => (
                <tr key={`${row.salesperson}-${index}`} className="border-t border-theme-border dark:border-gray-700/50">
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.salesperson}</td>
                  <td className="px-4 py-3 text-center font-semibold text-blue-600">{row.totalLeads}</td>
                  {reasonColumns.map((reason) => (
                    <td key={reason} className="px-4 py-3 text-center text-rose-600">{row.reasonCounts?.[reason] ?? 0}</td>
                  ))}
                  <td className="px-4 py-3 text-center font-semibold text-emerald-600">{formatCurrency(row.lostRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-theme-border p-4 dark:border-gray-700/50 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[var(--muted-text)]">
            {isRtl
              ? `عرض ${tableRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1}-${Math.min(currentPage * entriesPerPage, tableRows.length)} من ${tableRows.length}`
              : `Showing ${tableRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1}-${Math.min(currentPage * entriesPerPage, tableRows.length)} of ${tableRows.length}`}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span>{isRtl ? 'لكل صفحة:' : 'Per page:'}</span>
              <select value={entriesPerPage} onChange={(event) => { setEntriesPerPage(Number(event.target.value) || 10); setCurrentPage(1) }} className="rounded-lg border border-theme-border bg-transparent px-3 py-1.5">
                {[10, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="rounded-lg border border-theme-border p-2 disabled:opacity-50">
                {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              <span className="text-sm">{isRtl ? `صفحة ${currentPage} من ${pageCount}` : `Page ${currentPage} of ${pageCount}`}</span>
              <button type="button" onClick={() => setCurrentPage((prev) => Math.min(pageCount, prev + 1))} disabled={currentPage >= pageCount} className="rounded-lg border border-theme-border p-2 disabled:opacity-50">
                {isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
