import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import {
  ArrowRightLeft,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
  Tag,
  User,
  Users,
} from 'lucide-react'
import { FaChevronDown, FaFileExcel, FaFileExport, FaFilePdf } from 'react-icons/fa'
import BackButton from '../BackButton'
import SearchableSelect from '../SearchableSelect'
import DateRangePicker from '../../shared/components/DateRangePicker'
import { PieChart } from '../../shared/components/PieChart'
import { api } from '../../utils/api'

const EMPTY_VALUE = ''

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
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

function getLeadOwnerName(lead) {
  return lead?.transfer_from_assignee_name || lead?.assigned_to_name || lead?.assignedAgent?.name || lead?.sales_person_name || '-'
}

function getLeadOwnerId(lead) {
  return String(lead?.transfer_from_assignee_id || lead?.assigned_to || lead?.assignedAgent?.id || lead?.assigned_to_user?.id || '')
}

function getLeadConvertedToId(lead) {
  return String(
    lead?.transfer_to_assignee_id ||
    lead?.convert_to ||
    lead?.converted_to ||
    lead?.converted_to_id ||
    lead?.assigned_to_sales ||
    '',
  ).trim()
}

function getLeadConvertedTo(lead, users = []) {
  const convertedToId = getLeadConvertedToId(lead)
  if (convertedToId) {
    const matchedUser = (users || []).find((entry) => String(entry?.id) === convertedToId)
    const matchedName = String(matchedUser?.name || '').trim()
    if (matchedName) return matchedName
  }

  const directName = String(
    lead?.transfer_to_assignee_name ||
    lead?.convert_to_name ||
    lead?.converted_to_name ||
    lead?.converted_to?.name ||
    '',
  ).trim()

  if (directName) return directName

  if (!convertedToId) return ''
  return ''
}

function getLeadProjectName(lead) {
  return (
    lead?.project?.name ||
    lead?.project ||
    lead?.project_name ||
    lead?.item ||
    lead?.item_name ||
    lead?.item?.name ||
    lead?.projectRelation?.name ||
    ''
  )
}

function getLeadDisplayStage(lead) {
  return (
    lead?.display_stage ||
    lead?.stageRelation?.name ||
    lead?.stage_name ||
    lead?.stage ||
    '-'
  )
}

function getLeadConvertedByName(lead) {
  const explicitActor = (
    lead?.convert_by_name ||
    lead?.latest_action?.user?.name ||
    lead?.latestAction?.user?.name ||
    lead?.updated_by_name ||
    ''
  )

  if (String(explicitActor || '').trim()) {
    return String(explicitActor).trim()
  }

  const sourceName = String(lead?.source || '').trim().toLowerCase()
  if (sourceName === 'whatsapp mirror') {
    return 'WhatsApp Mirror'
  }

  return 'System'
}

function getUserNameById(userId, users = []) {
  if (!userId) return ''
  const matchedUser = (users || []).find((entry) => String(entry?.id) === String(userId))
  return String(matchedUser?.name || '').trim()
}

function getUserManagerNameById(userId, users = []) {
  if (!userId) return ''
  const matchedUser = (users || []).find((entry) => String(entry?.id) === String(userId))
  if (!matchedUser?.manager_id) return ''
  const manager = (users || []).find((entry) => String(entry?.id) === String(matchedUser.manager_id))
  return String(manager?.name || '').trim()
}

function getLeadFromManagerName(lead, users = []) {
  return (
    lead?.assigned_to_user?.manager?.name ||
    lead?.assignedAgent?.manager?.name ||
    getUserManagerNameById(getLeadOwnerId(lead), users) ||
    '-'
  )
}

function getLeadToManagerName(lead, users = []) {
  return (
    lead?.converted_to_user?.manager?.name ||
    lead?.converted_to?.manager?.name ||
    getUserManagerNameById(getLeadConvertedToId(lead), users) ||
    '-'
  )
}

function getLeadTransferRoleLabel(lead, isRtl = false, users = []) {
  const explicitRole = normalizeText(lead?.transfer_assign_role)
  if (explicitRole === 'manager') return isRtl ? 'كمدير' : 'As Manager'
  if (explicitRole === 'sales') return isRtl ? 'كسيلز' : 'As Sales'

  const convertedToId = getLeadConvertedToId(lead)
  if (convertedToId) {
    const matchedUser = (users || []).find((entry) => String(entry?.id) === String(convertedToId))
    const role = normalizeText(matchedUser?.role || matchedUser?.job_title)
    if (role.includes('manager')) return isRtl ? 'كمدير' : 'As Manager'
    if (role) return isRtl ? 'كسيلز' : 'As Sales'
  }

  return '-'
}

function getLeadStageBefore(lead) {
  return (
    lead?.transfer_from_stage_name ||
    lead?.stage_before ||
    lead?.previous_stage_name ||
    lead?.previous_stage ||
    lead?.from_stage_name ||
    lead?.from_stage?.name ||
    lead?.latest_action?.from_stage?.name ||
    lead?.latestAction?.from_stage?.name ||
    getLeadDisplayStage(lead) ||
    '-'
  )
}

function mapTransferStageLabel(value, isRtl = false, fallback = '-', defaultLabel = '') {
  const normalized = normalizeText(value)
  const resolvedDefault = defaultLabel || (isRtl ? 'عميل جديد' : 'New Lead')
  if (!normalized) return resolvedDefault
  if (['same stage', 'same_stage'].includes(normalized)) return resolvedDefault
  if (['new lead', 'new_lead', 'new'].includes(normalized)) return isRtl ? 'عميل جديد' : 'New Lead'
  if (['cold calls', 'cold call', 'cold_calls', 'coldcalls'].includes(normalized)) return isRtl ? 'مكالمات باردة' : 'Cold Calls'
  if (['transferred', 'converted', 'convert'].includes(normalized)) return resolvedDefault
  return String(value || '').trim() || resolvedDefault
}

function getLeadStageAfter(lead, isRtl = false) {
  const stageBefore = getLeadStageBefore(lead) || '-'
  const defaultStageAfter = isRtl ? 'عميل جديد' : 'New Lead'
  const rawValue =
    lead?.stage_after ||
    lead?.stage_option ||
    lead?.transfer_stage ||
    lead?.sales_stage ||
    lead?.to_stage_key ||
    lead?.to_stage_name ||
    lead?.to_stage?.name ||
    lead?.latest_action?.to_stage?.name ||
    lead?.latestAction?.to_stage?.name ||
    lead?.latest_action?.meta?.stage ||
    lead?.latestAction?.meta?.stage ||
    ''

  return mapTransferStageLabel(rawValue, isRtl, stageBefore, defaultStageAfter)
}

function getTransferDate(lead) {
  return lead?.transferred_to_sales_at || lead?.transferred_at || lead?.updated_at || lead?.created_at || ''
}

function formatDisplayDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return parseDateOnly(raw) || raw
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hours}:${minutes}`
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

function summarizeValues(values, fallback = '-', mixedLabel = 'Multiple') {
  const uniqueValues = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  )

  if (uniqueValues.length === 0) return fallback
  if (uniqueValues.length === 1) return uniqueValues[0]
  return mixedLabel
}

const EmptyState = ({ title, subtitle, compact = false, isLight }) => (
  <div className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700 bg-slate-900/30'} px-6 text-center ${compact ? 'py-6' : 'py-10'}`}>
    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-300'}`}>
      <ArrowRightLeft size={22} />
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
      <div className={`space-y-2 ${scrollable && items.length > visibleItems ? 'overflow-y-auto pr-1' : ''}`} style={scrollable && items.length > visibleItems ? { maxHeight: `${visibleItems * 58}px` } : undefined}>
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}>
            <div className={`min-w-0 truncate text-sm font-medium ${isLight ? 'text-black' : 'text-white'}`}>{item.label}</div>
            <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">{item.count}</div>
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

const LeadStatsTooltip = ({ anchorRect, details, isLight, isRtl }) => {
  if (!anchorRect || !details?.length || typeof document === 'undefined') return null

  const top = anchorRect.bottom + 10
  const left = Math.max(16, Math.min(anchorRect.left, window.innerWidth - 340))

  return createPortal(
    <div
      className={`pointer-events-none fixed z-[20080] w-[320px] rounded-2xl border p-3 shadow-2xl ${
        isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-700 bg-slate-900 text-white'
      }`}
      style={{ top, left }}
    >
      <div className="mb-2 text-sm font-semibold">{isRtl ? 'تفاصيل التحويل' : 'Conversion Details'}</div>
      <div className="space-y-2">
        {details.map((item, index) => (
          <div
            key={`${item.id || item.name || 'lead'}-${index}`}
            className={`rounded-xl px-3 py-2 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}
          >
            <div className="truncate text-sm font-medium">{item.name || (isRtl ? 'بدون اسم' : 'Unnamed Lead')}</div>
            <div className="mt-1 text-xs text-[var(--muted-text)]">
              {isRtl ? 'المرحلة قبل التحويل:' : 'Stage Before:'} {item.stageBefore || '-'}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}

export default function TelesalesConvertedLeadsReport({ rows, users, telesalesAssignees, companyType, isLight, isRtl, canExport = true, onBack }) {
  useTranslation()
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const [projectCatalog, setProjectCatalog] = useState([])
  const [filters, setFilters] = useState({
    assigned_to: '',
    manager_id: '',
    converted_to: '',
    source: '',
    project: '',
    created_from: '',
    created_to: '',
    transferred_from: '',
    transferred_to: '',
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [hoveredStats, setHoveredStats] = useState(null)
  const exportMenuRef = useRef(null)

  const normalizedCompanyType = normalizeText(companyType)
  const isRealEstate = normalizedCompanyType === 'real estate'
  const projectLabel = isRealEstate ? (isRtl ? 'المشروع' : 'Project') : (isRtl ? 'الصنف' : 'Item')
  const allProjectsLabel = isRealEstate ? (isRtl ? 'كل المشاريع' : 'All Projects') : (isRtl ? 'كل الأصناف' : 'All Items')
  const unspecifiedLabel = isRtl ? 'غير محدد' : 'Unspecified'
  const multipleLabel = isRtl ? 'متعدد' : 'Multiple'

  useEffect(() => {
    const onMouseDown = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) setShowExportMenu(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        const [sourceRes, projectRes] = await Promise.all([
          api.get('/api/sources?active=1').catch(() => api.get('/api/sources')),
          api.get(isRealEstate ? '/api/projects' : '/api/items?all=1').catch(() => null),
        ])
        const sourcesData = Array.isArray(sourceRes?.data?.data) ? sourceRes.data.data : (Array.isArray(sourceRes?.data) ? sourceRes.data : [])
        const projectsData = Array.isArray(projectRes?.data?.data) ? projectRes.data.data : (Array.isArray(projectRes?.data) ? projectRes.data : [])
        setSourcesCatalog(sourcesData.map((item) => String(item?.name || item?.title || item || '').trim()).filter(Boolean))
        setProjectCatalog(projectsData.map((item) => String(item?.name || item?.title || item?.item_name || item || '').trim()).filter(Boolean))
      } catch (error) {
        console.error('Failed to fetch converted leads report catalogs', error)
        setSourcesCatalog([])
        setProjectCatalog([])
      }
    }
    fetchCatalogs()
  }, [isRealEstate])

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
    return [{ value: EMPTY_VALUE, label: isRtl ? 'كل مسؤولي التيليسيلز' : 'All Telesales Agents' }, ...candidates.map((entry) => ({ value: String(entry.id), label: entry.name || `#${entry.id}` }))]
  }, [filters.manager_id, isRtl, telesalesAssignees, users])

  const allConvertedToLabels = useMemo(
    () => Array.from(new Set((rows || []).map((lead) => getLeadConvertedTo(lead, users)).filter(Boolean))),
    [rows, users],
  )
  const allSourceLabels = useMemo(() => Array.from(new Set([...sourcesCatalog, ...(rows || []).map((lead) => String(lead?.source || '').trim()).filter(Boolean)])), [rows, sourcesCatalog])
  const allProjectLabels = useMemo(() => Array.from(new Set([...projectCatalog, ...(rows || []).map(getLeadProjectName).filter(Boolean)])), [projectCatalog, rows])

  const convertedToOptions = useMemo(() => [{ value: EMPTY_VALUE, label: isRtl ? 'الكل' : 'All Sales Users' }, ...allConvertedToLabels.map((item) => ({ value: item, label: item }))], [allConvertedToLabels, isRtl])
  const sourceOptions = useMemo(() => [{ value: EMPTY_VALUE, label: isRtl ? 'كل المصادر' : 'All Sources' }, ...allSourceLabels.map((item) => ({ value: item, label: item }))], [allSourceLabels, isRtl])
  const projectOptions = useMemo(() => [{ value: EMPTY_VALUE, label: allProjectsLabel }, ...allProjectLabels.map((item) => ({ value: item, label: item }))], [allProjectLabels, allProjectsLabel])

  const filteredRows = useMemo(() => (rows || []).filter((lead) => {
    if (filters.assigned_to && String(getLeadOwnerId(lead)) !== String(filters.assigned_to)) return false
    if (filters.manager_id) {
      const validIds = new Set([String(filters.manager_id)])
      getDescendants(filters.manager_id, users || []).forEach((entry) => validIds.add(String(entry.id)))
      const ownerId = String(getLeadOwnerId(lead))
      const owner = (users || []).find((entry) => String(entry.id) === ownerId)
      const ownerManagerId = String(owner?.manager_id || '')
      if (!validIds.has(ownerId) && !validIds.has(ownerManagerId)) return false
    }
    if (filters.converted_to && getLeadConvertedTo(lead, users) !== filters.converted_to) return false
    if (filters.source && String(lead?.source || '').trim() !== filters.source) return false
    if (filters.project && getLeadProjectName(lead) !== filters.project) return false
    if (!inDateRange(lead?.created_at || lead?.createdAt, filters.created_from, filters.created_to)) return false
    if (!inDateRange(lead?.transferred_to_sales_at || lead?.transferred_at, filters.transferred_from, filters.transferred_to)) return false
    return true
  }), [filters, rows, users])

  const summary = useMemo(() => ({
    totalConverted: filteredRows.length,
    totalSources: new Set(filteredRows.map((lead) => String(lead?.source || '').trim()).filter(Boolean)).size,
    totalAgents: new Set(filteredRows.map((lead) => getLeadOwnerName(lead)).filter(Boolean)).size,
    totalSalesUsers: new Set(filteredRows.map((lead) => getLeadConvertedTo(lead, users)).filter(Boolean)).size,
  }), [filteredRows, users])

  const palette = ['#10b981', '#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6']

  const topLists = useMemo(() => {
    const bySource = new Map()
    const bySales = new Map()
    const byConvertedTo = new Map()

    filteredRows.forEach((lead) => {
      const source = String(lead?.source || '-').trim() || '-'
      const sales = getLeadOwnerName(lead) || '-'
      const convertedTo = getLeadConvertedTo(lead, users) || unspecifiedLabel
      bySource.set(source, Number(bySource.get(source) || 0) + 1)
      bySales.set(sales, Number(bySales.get(sales) || 0) + 1)
      byConvertedTo.set(convertedTo, Number(byConvertedTo.get(convertedTo) || 0) + 1)
    })

    ;(Array.isArray(telesalesAssignees) ? telesalesAssignees : []).forEach((entry) => {
      const label = String(entry?.name || '').trim()
      if (label && !bySales.has(label)) bySales.set(label, 0)
    })
    allSourceLabels.forEach((label) => {
      if (label && !bySource.has(label)) bySource.set(label, 0)
    })
    allConvertedToLabels.forEach((label) => {
      if (label && !byConvertedTo.has(label)) byConvertedTo.set(label, 0)
    })

    const sortMap = (map) => Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
    return { sources: sortMap(bySource), telesales: sortMap(bySales), convertedTo: sortMap(byConvertedTo) }
  }, [allConvertedToLabels, allSourceLabels, filteredRows, telesalesAssignees, unspecifiedLabel, users])

  const transactionRows = useMemo(() => {
    const groupedRows = new Map()

    filteredRows.forEach((lead, index) => {
      const transferDate = getTransferDate(lead)
      const sortTime = new Date(transferDate || 0).getTime() || 0
      const transferHistoryId = String(lead?.transfer_history_id || '').trim()
      const rowBase = {
        leadId: lead?.id || `converted-${index}`,
        leadName: String(
          lead?.client_name ||
          lead?.customer_name ||
          lead?.full_name ||
          lead?.name ||
          lead?.title ||
          `#${lead?.id || index + 1}`,
        ).trim(),
        date: formatDisplayDate(transferDate),
        sortTime,
        by: getLeadConvertedByName(lead) || '-',
        fromManager: getLeadFromManagerName(lead, users),
        toManager: getLeadToManagerName(lead, users),
        fromTelesales: getLeadOwnerName(lead) || '-',
        toSales: getLeadConvertedTo(lead, users) || '-',
        transferRole: getLeadTransferRoleLabel(lead, isRtl, users),
        stageBefore: getLeadStageBefore(lead) || '-',
        stageAfter: getLeadStageAfter(lead, isRtl),
        project: getLeadProjectName(lead) || '-',
        source: String(lead?.source || '-').trim() || '-',
      }

      const groupKey = transferHistoryId || [
        rowBase.date,
        rowBase.by,
        rowBase.fromTelesales,
        rowBase.toSales,
        rowBase.stageAfter,
      ].join('|')

      if (!groupedRows.has(groupKey)) {
        groupedRows.set(groupKey, {
          id: groupKey,
          date: rowBase.date,
          sortTime: rowBase.sortTime,
          by: rowBase.by,
          count: 0,
          leadDetails: [],
          rawFromManagers: [],
          rawToManagers: [],
          rawFromTelesales: [],
          rawToSales: [],
          rawTransferRoles: [],
          rawStagesBefore: [],
          rawStagesAfter: [],
          rawProjects: [],
          rawSources: [],
        })
      }

      const entry = groupedRows.get(groupKey)
      entry.count += 1
      entry.sortTime = Math.max(entry.sortTime, rowBase.sortTime)
      entry.rawFromManagers.push(rowBase.fromManager)
      entry.rawToManagers.push(rowBase.toManager)
      entry.rawFromTelesales.push(rowBase.fromTelesales)
      entry.rawToSales.push(rowBase.toSales)
      entry.rawTransferRoles.push(rowBase.transferRole)
      entry.rawStagesBefore.push(rowBase.stageBefore)
      entry.rawStagesAfter.push(rowBase.stageAfter)
      entry.rawProjects.push(rowBase.project)
      entry.rawSources.push(rowBase.source)
      entry.leadDetails.push({
        id: rowBase.leadId,
        name: `${rowBase.fromTelesales || '-'} - ${rowBase.leadName}`,
        stageBefore: rowBase.stageBefore,
      })
    })

    return Array.from(groupedRows.values())
      .map((entry) => ({
        id: entry.id,
        date: entry.date,
        sortTime: entry.sortTime,
        by: entry.by,
        fromManager: summarizeValues(entry.rawFromManagers, '-', multipleLabel),
        toManager: summarizeValues(entry.rawToManagers, '-', multipleLabel),
        fromTelesales: summarizeValues(entry.rawFromTelesales, '-', multipleLabel),
        toSales: summarizeValues(entry.rawToSales, unspecifiedLabel, multipleLabel),
        transferRole: summarizeValues(entry.rawTransferRoles, '-', multipleLabel),
        stageBefore: summarizeValues(entry.rawStagesBefore, '-', multipleLabel),
        stageAfter: summarizeValues(entry.rawStagesAfter, '-', multipleLabel),
        project: summarizeValues(entry.rawProjects, '-', multipleLabel),
        source: summarizeValues(entry.rawSources, '-', multipleLabel),
        count: entry.count,
        leadDetails: entry.leadDetails,
      }))
      .sort((a, b) => b.sortTime - a.sortTime)
  }, [filteredRows, isRtl, multipleLabel, unspecifiedLabel, users])

  const chartData = useMemo(() => {
    const sourceMap = new Map()
    const projectMap = new Map()
    filteredRows.forEach((lead) => {
      const source = String(lead?.source || '-').trim() || '-'
      const project = getLeadProjectName(lead) || '-'
      sourceMap.set(source, Number(sourceMap.get(source) || 0) + 1)
      projectMap.set(project, Number(projectMap.get(project) || 0) + 1)
    })
    return {
      sources: Array.from(sourceMap.entries()).filter(([, value]) => value > 0).map(([label, value], index) => ({ label, value, color: palette[index % palette.length] })),
      projects: Array.from(projectMap.entries()).filter(([, value]) => value > 0).map(([label, value], index) => ({ label, value, color: palette[index % palette.length] })),
    }
  }, [filteredRows])

  const exportRows = useMemo(() => transactionRows.map((row) => ({
    [isRtl ? 'التاريخ' : 'Date']: row.date,
    [isRtl ? 'بواسطة' : 'By']: row.by,
    [isRtl ? 'من المدير' : 'From Manager']: row.fromManager,
    [isRtl ? 'إلى المدير' : 'To Manager']: row.toManager,
    [isRtl ? 'من التيليسيلز' : 'From Telesales']: row.fromTelesales,
    [isRtl ? 'التحويل إلى' : 'Convert To']: row.toSales,
    [isRtl ? 'نوع الإسناد' : 'Assignment Role']: row.transferRole,
    [isRtl ? 'المرحلة قبل' : 'Stage Before']: row.stageBefore,
    [isRtl ? 'المرحلة بعد' : 'Stage After']: row.stageAfter,
    [projectLabel]: row.project,
    [isRtl ? 'المصدر' : 'Source']: row.source,
    [isRtl ? 'العدد' : 'Count']: row.count,
    [isRtl ? 'تفاصيل الليدز' : 'Lead Details']: (row.leadDetails || [])
      .map((item) => `${item.name || '-'} (${item.stageBefore || '-'})`)
      .join(' | '),
  })), [isRtl, projectLabel, transactionRows])

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return transactionRows.slice(start, start + entriesPerPage)
  }, [currentPage, entriesPerPage, transactionRows])

  const pageCount = Math.max(1, Math.ceil(transactionRows.length / entriesPerPage))

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Converted Leads')
    XLSX.writeFile(workbook, 'telesales_converted_leads_report.xlsx')
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
      converted_to: '',
      source: '',
      project: '',
      created_from: '',
      created_to: '',
      transferred_from: '',
      transferred_to: '',
    })
  }

  const emptyTitle = isRtl ? 'لا توجد بيانات تحويل متاحة' : 'No converted leads data available'
  const emptySubtitle = isRtl ? 'جرّب تغيير الفلاتر أو اختيار نطاق تاريخ آخر.' : 'Try changing filters or selecting another date range.'

  return (
    <div className="min-h-screen space-y-6 p-6">
      <div>
        <BackButton to="/telesales/dashboard?view=reports" onClick={onBack} className="relative z-[20060] pointer-events-auto" />
      </div>

      <div>
        <h1 className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'الليدز المحولة إلى السيلز' : 'Converted Leads'}</h1>
        <p className={`mt-2 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{isRtl ? 'كل الليدز التي خرجت من بايبلاين التيلي وتم تحويلها إلى السيلز.' : 'Leads transferred from telesales workflow into sales.'}</p>
      </div>

      <div className="backdrop-blur-md rounded-2xl border border-theme-border p-4 shadow-sm dark:border-gray-700/50">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3 className={`${isLight ? 'text-black' : 'text-white'} font-semibold`}>{isRtl ? 'تصفية' : 'Filter'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdvancedFilters((prev) => !prev)} className="flex items-center gap-1 rounded-lg bg-blue-900/20 px-3 py-1.5 text-sm text-blue-600 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30">
              {showAdvancedFilters ? (isRtl ? 'إخفاء' : 'Hide') : (isRtl ? 'عرض الكل' : 'Show All')}
              <FaChevronDown size={12} className={`transform transition-transform duration-300 ${showAdvancedFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button onClick={clearFilters} className={`rounded-lg px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20`}>
              {isRtl ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FilterField label={isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'} icon={User} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={salesOptions} value={filters.assigned_to} onChange={(value) => setFilters((prev) => ({ ...prev, assigned_to: value }))} placeholder={isRtl ? 'كل مسؤولي التيليسيلز' : 'All Telesales Agents'} />
            </FilterField>
            <FilterField label={isRtl ? 'المدير' : 'Manager'} icon={Users} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={managerOptions} value={filters.manager_id} onChange={(value) => setFilters((prev) => ({ ...prev, manager_id: value, assigned_to: '' }))} placeholder={isRtl ? 'كل المديرين' : 'All Managers'} />
            </FilterField>
            <FilterField label={isRtl ? 'التحويل إلى' : 'Convert To'} icon={ArrowRightLeft} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={convertedToOptions} value={filters.converted_to} onChange={(value) => setFilters((prev) => ({ ...prev, converted_to: value }))} placeholder={isRtl ? 'الكل' : 'All Sales Users'} />
            </FilterField>
            <FilterField label={isRtl ? 'المصدر' : 'Source'} icon={Tag} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={sourceOptions} value={filters.source} onChange={(value) => setFilters((prev) => ({ ...prev, source: value }))} placeholder={isRtl ? 'كل المصادر' : 'All Sources'} />
            </FilterField>
          </div>

          <div className={`grid grid-cols-1 gap-4 overflow-hidden transition-all duration-500 ease-in-out md:grid-cols-2 lg:grid-cols-4 ${showAdvancedFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'}`}>
            <FilterField label={projectLabel} icon={Briefcase} isLight={isLight} isRtl={isRtl}>
              <SearchableSelect options={projectOptions} value={filters.project} onChange={(value) => setFilters((prev) => ({ ...prev, project: value }))} placeholder={allProjectsLabel} />
            </FilterField>
            <FilterField label={isRtl ? 'تاريخ إنشاء الليد' : 'Lead Creation Date'} icon={Calendar} isLight={isLight} isRtl={isRtl}>
              <DateRangePicker from={filters.created_from} to={filters.created_to} onChange={({ from, to }) => setFilters((prev) => ({ ...prev, created_from: from || '', created_to: to || '' }))} isRTL={isRtl} className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 ${isLight ? 'text-black' : 'text-white'}`} />
            </FilterField>
            <FilterField label={isRtl ? 'تاريخ التحويل' : 'Transfer Date'} icon={Calendar} isLight={isLight} isRtl={isRtl}>
              <DateRangePicker from={filters.transferred_from} to={filters.transferred_to} onChange={({ from, to }) => setFilters((prev) => ({ ...prev, transferred_from: from || '', transferred_to: to || '' }))} isRTL={isRtl} className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 ${isLight ? 'text-black' : 'text-white'}`} />
            </FilterField>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ArrowRightLeft} label={isRtl ? 'إجمالي المحول' : 'Total Converted'} value={formatNumber(summary.totalConverted)} accentClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300" isLight={isLight} />
        <MetricCard icon={Tag} label={isRtl ? 'المصادر المستخدمة' : 'Active Sources'} value={formatNumber(summary.totalSources)} accentClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300" isLight={isLight} />
        <MetricCard icon={User} label={isRtl ? 'مسؤولو التيليسيلز' : 'Telesales Agents'} value={formatNumber(summary.totalAgents)} accentClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300" isLight={isLight} />
        <MetricCard icon={Users} label={isRtl ? 'مستخدمو السيلز' : 'Sales Users'} value={formatNumber(summary.totalSalesUsers)} accentClass="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300" isLight={isLight} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title={isRtl ? 'التحويلات حسب المصدر' : 'Converted by Source'} data={chartData.sources} isLight={isLight} isRtl={isRtl} />
        <ChartCard title={isRealEstate ? (isRtl ? 'التحويلات حسب المشروع' : 'Converted by Project') : (isRtl ? 'التحويلات حسب الصنف' : 'Converted by Item')} data={chartData.projects} isLight={isLight} isRtl={isRtl} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RankedListCard title={isRtl ? 'أكثر المستلمين' : 'Top Receivers'} items={topLists.convertedTo} isLight={isLight} emptyTitle={emptyTitle} emptySubtitle={emptySubtitle} scrollable visibleItems={5} />
        <RankedListCard title={isRtl ? 'أكثر المرسلين' : 'Top Senders'} items={topLists.telesales} isLight={isLight} emptyTitle={emptyTitle} emptySubtitle={emptySubtitle} scrollable visibleItems={5} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-theme-border shadow-sm dark:border-gray-700/50">
        <div className="flex items-center justify-between border-b border-theme-border px-4 py-4 dark:border-gray-700/50">
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'سجل التحويلات' : 'Transaction Log'}</h2>
          {canExport && (
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu((prev) => !prev)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700">
              <FaFileExport /> {isRtl ? 'تصدير' : 'Export'}
              <FaChevronDown size={12} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu ? (
              <div className={`absolute top-full z-50 mt-1 w-48 rounded-lg border border-gray-100 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800 ${isRtl ? 'left-0' : 'right-0'}`}>
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
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'التاريخ' : 'Date'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'بواسطة' : 'By'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'من المدير' : 'From Manager'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'إلى المدير' : 'To Manager'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'من التيليسيلز' : 'From Telesales'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'التحويل إلى' : 'Convert To'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'نوع الإسناد' : 'Assignment Role'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'المرحلة قبل' : 'Stage Before'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'المرحلة بعد' : 'Stage After'}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{projectLabel}</th>
                <th className={`px-4 py-3 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'المصدر' : 'Source'}</th>
                <th className={`px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'العدد' : 'Count'}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-[var(--muted-text)]">
                    {isRtl ? 'لا توجد بيانات' : 'No data'}
                  </td>
                </tr>
              ) : paginatedRows.map((row, index) => (
                <tr key={`${row.id}-${index}`} className="border-t border-theme-border dark:border-gray-700/50">
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.date}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.by}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.fromManager}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.toManager}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.fromTelesales}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.toSales}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.transferRole}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.stageBefore}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.stageAfter}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.project}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{row.source}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="font-semibold text-emerald-600">{row.count}</span>
                      {row.count > 1 ? (
                        <button
                          type="button"
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isLight
                              ? 'border-blue-100 bg-white text-blue-600 hover:bg-blue-50'
                              : 'border-blue-500/30 bg-slate-900 text-blue-300 hover:bg-slate-800'
                          }`}
                          onMouseEnter={(event) => {
                            setHoveredStats({
                              rowId: row.id,
                              rect: event.currentTarget.getBoundingClientRect(),
                              details: row.leadDetails || [],
                            })
                          }}
                          onMouseLeave={() => {
                            setHoveredStats((current) => (current?.rowId === row.id ? null : current))
                          }}
                        >
                          <Info size={14} />
                          {isRtl ? 'عرض التفاصيل' : 'View Stats'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex  gap-3 border-t border-theme-border p-4 dark:border-gray-700/50 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[var(--muted-text)]">
            {isRtl
              ? `عرض ${transactionRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1}-${Math.min(currentPage * entriesPerPage, transactionRows.length)} من ${transactionRows.length}`
              : `Showing ${transactionRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1}-${Math.min(currentPage * entriesPerPage, transactionRows.length)} of ${transactionRows.length}`}
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

      <LeadStatsTooltip
        anchorRect={hoveredStats?.rect}
        details={hoveredStats?.details}
        isLight={isLight}
        isRtl={isRtl}
      />
    </div>
  )
}
