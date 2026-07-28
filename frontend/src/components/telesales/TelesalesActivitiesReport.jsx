import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import BackButton from '../BackButton'
import SearchableSelect from '../SearchableSelect'
import DateRangePicker from '../../shared/components/DateRangePicker'
import { PieChart } from '../../shared/components/PieChart'
import { api } from '../../utils/api'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Layers,
  MessageSquare,
  PieChart as PieChartIcon,
  Phone,
  Tag,
  User,
  Users,
} from 'lucide-react'
import { FaChevronDown, FaFileExcel, FaFileExport, FaFilePdf } from 'react-icons/fa'

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
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

function toTimestamp(value) {
  if (!value) return null
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? null : time
}

function parseActionDetails(details) {
  if (details && typeof details === 'object') return details
  if (typeof details !== 'string') return {}
  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function resolveActionTypeKey(action) {
  const details = parseActionDetails(action?.details)
  return normalizeText(
    action?.action_type ||
    action?.type ||
    action?.next_action_type ||
    action?.nextAction ||
    details?.actionType ||
    details?.action_type ||
    details?.next_action_type ||
    details?.nextAction ||
    details?.channel ||
    details?.selectedQuickOption ||
    ''
  )
}

function isActivityWithinTelesalesWindow(lead, activityDate) {
  const activityTime = toTimestamp(activityDate)
  if (activityTime === null) return true

  const workflowEnteredAt = toTimestamp(lead?.workflow_entered_at || lead?.created_at || lead?.createdAt)
  const transferredAt = toTimestamp(lead?.transferred_to_sales_at)

  if (workflowEnteredAt !== null && activityTime < workflowEnteredAt) return false
  if (transferredAt !== null && activityTime > transferredAt) return false
  return true
}

function getLeadStage(lead) {
  return lead?.display_stage || lead?.stageRelation?.name || lead?.stage || '-'
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

function shouldHideStageOption(stage) {
  const normalized = normalizeText(stage)
  return ['fresh', 'duplicate', 'pending', 'cold calls', 'cold call'].includes(normalized)
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

function getDescendants(rootId, allUsers) {
  let descendants = []
  const direct = allUsers.filter((entry) => String(entry?.manager_id || '') === String(rootId))
  direct.forEach((entry) => {
    descendants.push(entry)
    descendants = [...descendants, ...getDescendants(entry.id, allUsers)]
  })
  return descendants
}

function buildPieSegments(entries, palette) {
  return entries
    .filter((entry) => Number(entry?.value || 0) > 0)
    .map((entry, index) => ({
      label: entry.label,
      value: Number(entry.value || 0),
      color: palette[index % palette.length],
    }))
}

const ActionStageTooltip = ({ data, isRtl, position }) => {
  if (!data || data.length === 0) return null

  const total = data.reduce((sum, item) => sum + Number(item?.count || 0), 0)

  const tooltipNode = (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="fixed z-[10000] min-w-[200px] max-w-[360px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-4 backdrop-blur-xl pointer-events-none"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        transform: 'translate(-50%, calc(-100% - 12px))',
      }}
    >
      <div className="relative">
        <p className="text-xs font-bold mb-3 border-b border-slate-100 dark:border-slate-700 pb-2 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {isRtl ? 'توزيع الأنشطة حسب المرحلة' : 'Activities by Stage'}
        </p>
        <div className="space-y-2.5">
          {data.map((item, index) => {
            const percentage = total > 0 ? Math.round((Number(item?.count || 0) / total) * 100) : 0
            return (
              <div key={`${item.stage}-${index}`} className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-sm gap-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800"
                      style={{ backgroundColor: item.color, ringColor: item.color }}
                    ></span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.stage}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{item.count}</span>
                    <span className="text-[10px] text-slate-400 font-medium">({percentage}%)</span>
                  </div>
                </div>
                <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-slate-800 border-r border-b border-slate-100 dark:border-slate-700 rotate-45"></div>
      </div>
    </motion.div>
  )

  return createPortal(tooltipNode, document.body)
}

function ChartCard({ title, data, isLight, isRtl }) {
  const total = data.reduce((sum, item) => sum + Number(item?.value || 0), 0)

  return (
    <div className="group relative bg-theme-bg backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
      <div className={`text-sm font-semibold mb-2 ${isLight ? 'text-black' : 'text-white'} text-center md:text-left`}>
        {title}
      </div>
      <div className="h-48 flex items-center justify-center">
        <PieChart
          segments={data.length > 0 ? data : [{ label: isRtl ? 'لا توجد بيانات' : 'No Data', value: 1, color: '#cbd5e1' }]}
          size={170}
          centerValue={total}
          centerLabel={isRtl ? 'الإجمالي' : 'Total'}
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {data.length === 0 ? (
          <div className="text-xs text-[var(--muted-text)]">{isRtl ? 'لا توجد بيانات متاحة' : 'No data available'}</div>
        ) : data.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className={isLight ? 'text-black' : 'text-white'}>
              {segment.label}: {segment.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TelesalesActivitiesReport({
  rows,
  users,
  telesalesAssignees,
  stageCards,
  companyType,
  isLight,
  isRtl,
  canExport = true,
  onBack,
}) {
  useTranslation()
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const [projectCatalog, setProjectCatalog] = useState([])
  const [salesPersonFilter, setSalesPersonFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState('')
  const [assignDateFrom, setAssignDateFrom] = useState('')
  const [assignDateTo, setAssignDateTo] = useState('')
  const [creationDateFrom, setCreationDateFrom] = useState('')
  const [creationDateTo, setCreationDateTo] = useState('')
  const [actionDateFrom, setActionDateFrom] = useState('')
  const [actionDateTo, setActionDateTo] = useState('')
  const [lastActionDateFrom, setLastActionDateFrom] = useState('')
  const [lastActionDateTo, setLastActionDateTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [expandedRows, setExpandedRows] = useState({})
  const [hoveredActionRow, setHoveredActionRow] = useState(null)
  const [actionTooltipPosition, setActionTooltipPosition] = useState({ x: 0, y: 0 })
  const exportMenuRef = useRef(null)
  const normalizedCompanyType = normalizeText(companyType)
  const isRealEstateTenant = normalizedCompanyType === 'real estate'
  const scopedEntityLabel = isRealEstateTenant ? (isRtl ? 'المشروع' : 'Project') : (isRtl ? 'الصنف' : 'Item')
  const scopedEntityAllLabel = isRealEstateTenant ? (isRtl ? 'كل المشاريع' : 'All Projects') : (isRtl ? 'كل الأصناف' : 'All Items')

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const fetchFilterCatalogs = async () => {
      try {
        const [sourceRes, projectRes] = await Promise.all([
          api.get('/api/sources?active=1').catch(() => api.get('/api/sources')),
          api.get(isRealEstateTenant ? '/api/projects' : '/api/items?all=1').catch(() => null),
        ])

        const sourcesData = Array.isArray(sourceRes?.data?.data)
          ? sourceRes.data.data
          : (Array.isArray(sourceRes?.data) ? sourceRes.data : [])

        const projectsData = Array.isArray(projectRes?.data?.data)
          ? projectRes.data.data
          : (Array.isArray(projectRes?.data) ? projectRes.data : [])

        setSourcesCatalog(
          sourcesData
            .map((item) => String(item?.name || item?.title || item || '').trim())
            .filter(Boolean)
        )

        setProjectCatalog(
          projectsData
            .map((item) => String(item?.name || item?.title || item?.item_name || item || '').trim())
            .filter(Boolean)
        )
      } catch (error) {
        console.error('Failed to fetch telesales activities filter catalogs', error)
        setSourcesCatalog([])
        setProjectCatalog([])
      }
    }

    fetchFilterCatalogs()
  }, [isRealEstateTenant])

  const managerOptions = useMemo(() => {
    const allowedRoles = new Set(['telesales manager', 'telesales team leader', 'tenant admin', 'admin'])
    const managers = (users || [])
      .filter((entry) => allowedRoles.has(normalizeText(entry?.role || entry?.job_title)))
      .map((entry) => ({ value: String(entry.id), label: entry.name || `#${entry.id}` }))

    return [{ value: '', label: isRtl ? 'الكل' : 'All Managers' }, ...managers]
  }, [isRtl, users])

  const salesPersonOptions = useMemo(() => {
    let candidates = Array.isArray(telesalesAssignees) ? [...telesalesAssignees] : []
    if (managerFilter) {
      const validIds = new Set([String(managerFilter)])
      getDescendants(managerFilter, users || []).forEach((entry) => validIds.add(String(entry.id)))
      candidates = candidates.filter((entry) => validIds.has(String(entry.id)) || validIds.has(String(entry.manager_id || '')))
    }

    return [
      { value: '', label: isRtl ? 'الكل' : 'All Telesales Agents' },
      ...candidates.map((entry) => ({ value: String(entry.id), label: entry.name || `#${entry.id}` })),
    ]
  }, [isRtl, managerFilter, telesalesAssignees, users])

  const stageOptions = useMemo(() => {
    const stageLabelsFromDb = Array.isArray(stageCards)
      ? stageCards
          .map((stage) => String(stage?.name || '').trim())
          .filter((value) => value && !shouldHideStageOption(value))
      : []

    const fallbackStageLabels = Array.from(
      new Set(
        (rows || [])
          .map((lead) => getLeadStage(lead))
          .filter((value) => value && !shouldHideStageOption(value))
      )
    )
    const labels = Array.from(new Set([...stageLabelsFromDb, ...fallbackStageLabels]))

    return [
      { value: '', label: isRtl ? 'الكل' : 'All Stages' },
      ...labels.map((value) => ({ value, label: value })),
    ]
  }, [isRtl, rows, stageCards])

  const sourceOptions = useMemo(() => {
    const labels = Array.from(new Set([
      ...sourcesCatalog,
      ...Array.from(new Set((rows || []).map((lead) => String(lead?.source || '').trim()).filter(Boolean))),
    ]))

    return [
      { value: '', label: isRtl ? 'الكل' : 'All Sources' },
      ...labels.map((value) => ({ value, label: value })),
    ]
  }, [isRtl, rows, sourcesCatalog])

  const projectOptions = useMemo(() => {
    const labels = Array.from(new Set([
      ...projectCatalog,
      ...Array.from(new Set((rows || []).map(getLeadProjectName).filter(Boolean))),
    ]))

    return [
      { value: '', label: scopedEntityAllLabel },
      ...labels.map((value) => ({ value, label: value })),
    ]
  }, [projectCatalog, rows, scopedEntityAllLabel])

  const allActivities = useMemo(() => {
    const items = []

    ;(rows || []).forEach((lead) => {
      const leadMeta = {
        leadId: lead.id,
        leadName: lead.name || '-',
        phoneNumber: lead.phone || lead.mobile || '',
        ownerId: getLeadOwnerId(lead),
        employeeName: getLeadOwnerName(lead),
        stage: getLeadStage(lead),
        stageKey: getLeadStageKey(lead),
        source: String(lead?.source || '').trim(),
        project: getLeadProjectName(lead),
        createdAtLead: lead?.created_at || lead?.createdAt || '',
        assignedAt: lead?.assigned_at || lead?.assignedAt || '',
        lastActionAt: lead?.latest_action_at || lead?.last_action_at || lead?.updated_at || '',
      }

      const actions = Array.isArray(lead?.actions) ? lead.actions : []

      actions.forEach((action, actionIndex) => {
        const actionType = resolveActionTypeKey(action)
        const actionDate = action?.created_at || action?.date || leadMeta.lastActionAt
        if (!isActivityWithinTelesalesWindow(lead, actionDate)) return
        const details = parseActionDetails(action?.details)
        const notes = String(action?.description || action?.notes || action?.comment || details?.notes || details?.comment || '').trim()
        const commentsArray = Array.isArray(details?.comments) ? details.comments : []

        commentsArray.forEach((comment, commentIndex) => {
          const commentDate = comment?.createdAt || actionDate
          if (!isActivityWithinTelesalesWindow(lead, commentDate)) return
          const commentText = String(comment?.text || comment?.comment || '').trim()
          if (!commentText) return
          items.push({
            id: `${lead.id}-comment-${action?.id || actionIndex}-${comment?.id || commentIndex}`,
            kind: 'comment',
            actionType: 'comment',
            actionLabel: isRtl ? 'تعليق' : 'Comment',
            createdAt: commentDate,
            comment: commentText,
            answered: false,
            noAnswer: false,
            ...leadMeta,
          })
        })

        if (actionType.includes('call') || notes.toLowerCase().includes('call') || notes.toLowerCase().includes('phone')) {
          const lowerNotes = notes.toLowerCase()
          const noAnswer = lowerNotes.includes('no answer') || lowerNotes.includes('not answer') || actionType.includes('missed')
          items.push({
            id: `${lead.id}-call-${action?.id || actionIndex}`,
            kind: 'call',
            actionType: noAnswer ? 'no_answer' : 'call',
            actionLabel: noAnswer ? (isRtl ? 'لم يتم الرد' : 'No Answer') : (isRtl ? 'مكالمة' : 'Call'),
            createdAt: actionDate,
            comment: notes,
            answered: !noAnswer,
            noAnswer,
            ...leadMeta,
          })
        } else if (notes && commentsArray.length === 0) {
          items.push({
            id: `${lead.id}-action-${action?.id || actionIndex}`,
            kind: 'action',
            actionType: actionType || 'action',
            actionLabel: action?.type || action?.action_type || (isRtl ? 'إجراء' : 'Action'),
            createdAt: actionDate,
            comment: notes,
            answered: false,
            noAnswer: false,
            ...leadMeta,
          })
        }
      })

      const latestAction = lead?.latest_action || lead?.latestAction || null
      const latestDetails = parseActionDetails(latestAction?.details)
      const latestType = resolveActionTypeKey(latestAction)
      const latestNotes = String(latestAction?.description || latestAction?.notes || latestDetails?.notes || latestDetails?.comment || '').trim()
      if (latestAction && actions.length === 0 && (latestType || latestNotes) && isActivityWithinTelesalesWindow(lead, latestAction?.created_at || latestAction?.date || leadMeta.lastActionAt)) {
        const noAnswer = latestNotes.toLowerCase().includes('no answer') || latestType.includes('missed')
        const isCall = latestType.includes('call') || latestNotes.toLowerCase().includes('call') || latestNotes.toLowerCase().includes('phone')
        items.push({
          id: `${lead.id}-latest-action`,
          kind: isCall ? 'call' : 'action',
          actionType: isCall ? (noAnswer ? 'no_answer' : 'call') : (latestType || 'action'),
          actionLabel: isCall
            ? (noAnswer ? (isRtl ? 'لم يتم الرد' : 'No Answer') : (isRtl ? 'مكالمة' : 'Call'))
            : (latestAction?.type || latestAction?.action_type || (isRtl ? 'إجراء' : 'Action')),
          createdAt: latestAction?.created_at || latestAction?.date || leadMeta.lastActionAt,
          comment: latestNotes,
          answered: isCall && !noAnswer,
          noAnswer: isCall && noAnswer,
          ...leadMeta,
        })
      }
    })

    return items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }, [isRtl, rows])

  const actionTypeOptions = useMemo(() => [
    { value: '', label: isRtl ? 'كل الإجراءات' : 'All Action Types' },
    ...Array.from(new Set(allActivities.map((entry) => entry.actionType).filter(Boolean))).map((value) => ({
      value,
      label: value.replace(/\b\w/g, (char) => char.toUpperCase()),
    })),
  ], [allActivities, isRtl])

  const filteredActivities = useMemo(() => {
    return allActivities.filter((entry) => {
      if (salesPersonFilter && String(entry.ownerId) !== String(salesPersonFilter)) return false

      if (managerFilter) {
        const validIds = new Set([String(managerFilter)])
        getDescendants(managerFilter, users || []).forEach((userRow) => validIds.add(String(userRow.id)))
        const owner = (users || []).find((userRow) => String(userRow.id) === String(entry.ownerId))
        const ownerManagerId = String(owner?.manager_id || '')
        if (!validIds.has(String(entry.ownerId)) && !validIds.has(ownerManagerId)) return false
      }

      if (stageFilter && entry.stage !== stageFilter) return false
      if (sourceFilter && entry.source !== sourceFilter) return false
      if (projectFilter && entry.project !== projectFilter) return false
      if (actionTypeFilter && entry.actionType !== actionTypeFilter) return false
      if (!inDateRange(entry.assignedAt, assignDateFrom, assignDateTo)) return false
      if (!inDateRange(entry.createdAtLead, creationDateFrom, creationDateTo)) return false
      if (!inDateRange(entry.createdAt, actionDateFrom, actionDateTo)) return false
      if (!inDateRange(entry.lastActionAt, lastActionDateFrom, lastActionDateTo)) return false
      return true
    })
  }, [
    actionDateFrom,
    actionDateTo,
    actionTypeFilter,
    allActivities,
    assignDateFrom,
    assignDateTo,
    creationDateFrom,
    creationDateTo,
    lastActionDateFrom,
    lastActionDateTo,
    managerFilter,
    projectFilter,
    salesPersonFilter,
    sourceFilter,
    stageFilter,
    users,
  ])

  const kpiData = useMemo(() => {
    const totalCalls = filteredActivities.filter((entry) => entry.kind === 'call').length
    const totalComments = filteredActivities.filter((entry) => entry.kind === 'comment').length
    const answered = filteredActivities.filter((entry) => entry.answered).length
    const noAnswer = filteredActivities.filter((entry) => entry.noAnswer).length

    return {
      totalCalls,
      totalActions: filteredActivities.length,
      totalComments,
      answered,
      noAnswer,
    }
  }, [filteredActivities])

  const palette = ['#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6']

  const chartData = useMemo(() => {
    const byStageMap = new Map()
    const byTypeMap = new Map()
    const callStageMap = new Map()
    const bySourceMap = new Map()

    filteredActivities.forEach((entry) => {
      byStageMap.set(entry.stage || '-', Number(byStageMap.get(entry.stage || '-') || 0) + 1)
      byTypeMap.set(entry.actionLabel || '-', Number(byTypeMap.get(entry.actionLabel || '-') || 0) + 1)
      bySourceMap.set(entry.source || '-', Number(bySourceMap.get(entry.source || '-') || 0) + 1)
      if (entry.kind === 'call') {
        callStageMap.set(entry.stage || '-', Number(callStageMap.get(entry.stage || '-') || 0) + 1)
      }
    })

    return {
      actionsByStage: buildPieSegments(Array.from(byStageMap.entries()).map(([label, value]) => ({ label, value })), palette),
      actionsByType: buildPieSegments(Array.from(byTypeMap.entries()).map(([label, value]) => ({ label, value })), palette),
      callsByStage: buildPieSegments(Array.from(callStageMap.entries()).map(([label, value]) => ({ label, value })), palette),
      actionsBySource: buildPieSegments(Array.from(bySourceMap.entries()).map(([label, value]) => ({ label, value })), palette),
    }
  }, [filteredActivities])

  const tableRows = useMemo(() => {
    const grouped = new Map()

    filteredActivities.forEach((entry) => {
      const key = entry.ownerId || entry.employeeName
      const current = grouped.get(key) || {
        id: key || entry.employeeName,
        salesperson: entry.employeeName || '-',
        leadIds: new Set(),
        actions: 0,
        calls: 0,
        comments: 0,
        answered: 0,
        noAnswer: 0,
        stages: {},
      }

      current.leadIds.add(entry.leadId)
      current.actions += 1
      if (entry.kind === 'call') current.calls += 1
      if (entry.kind === 'comment') current.comments += 1
      if (entry.answered) current.answered += 1
      if (entry.noAnswer) current.noAnswer += 1
      current.stages[entry.stage || '-'] = Number(current.stages[entry.stage || '-'] || 0) + 1
      grouped.set(key, current)
    })

    return Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        totalLeads: entry.leadIds.size,
        stageEntries: Object.entries(entry.stages).sort((a, b) => b[1] - a[1]),
        stageSummary: Object.entries(entry.stages)
          .sort((a, b) => b[1] - a[1])
          .map(([stage, count]) => `${stage}: ${count}`)
          .join(' | '),
      }))
      .sort((a, b) => {
        if (b.actions !== a.actions) return b.actions - a.actions
        return String(a.salesperson || '').localeCompare(String(b.salesperson || ''))
      })
  }, [filteredActivities])

  const exportRows = useMemo(() => (
    tableRows.map((row) => ({
      [isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent']: row.salesperson,
      [isRtl ? 'إجمالي الليدز' : 'Total Leads']: row.totalLeads,
      [isRtl ? 'الإجراءات' : 'Actions']: row.actions,
      [isRtl ? 'المكالمات' : 'Calls']: row.calls,
      [isRtl ? 'التعليقات' : 'Comments']: row.comments,
      [isRtl ? 'تم الرد' : 'Answered']: row.answered,
      [isRtl ? 'لم يتم الرد' : 'No Answer']: row.noAnswer,
      [isRtl ? 'الإجراء حسب المرحلة' : 'Action by Stage']: row.stageSummary,
    }))
  ), [isRtl, tableRows])

  const pageCount = Math.max(1, Math.ceil(tableRows.length / entriesPerPage))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return tableRows.slice(start, start + entriesPerPage)
  }, [currentPage, entriesPerPage, tableRows])

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Telesales Activities')
    XLSX.writeFile(workbook, 'telesales_activities_report.xlsx')
    setShowExportMenu(false)
  }

  const handleExportPdf = () => {
    window.print()
    setShowExportMenu(false)
  }

  const clearFilters = () => {
    setSalesPersonFilter('')
    setManagerFilter('')
    setStageFilter('')
    setSourceFilter('')
    setProjectFilter('')
    setActionTypeFilter('')
    setAssignDateFrom('')
    setAssignDateTo('')
    setCreationDateFrom('')
    setCreationDateTo('')
    setActionDateFrom('')
    setActionDateTo('')
    setLastActionDateFrom('')
    setLastActionDateTo('')
    setShowAllFilters(false)
  }

  return (
    <div className="p-4 md:p-6 bg-[var(--content-bg)] text-[var(--content-text)] overflow-hidden min-w-0">
      <div className="mb-6">
        <div className="mb-4">
          <BackButton onClick={onBack} />
        </div>
        <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-2`}>
          {isRtl ? 'تقرير أنشطة التيليسيلز' : 'Telesales Activities Report'}
        </h1>
        <p className={`${isLight ? 'text-black' : 'text-white'} text-sm`}>
          {isRtl ? 'متابعة نشاطات وأداء فريق التيليسيلز' : 'Monitor telesales activities and performance'}
        </p>
      </div>

      <div className="bg-theme-bg backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 p-6 mb-8">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3>{isRtl ? 'Filter' : 'Filter'}</h3>
          </div>
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
            <button
              onClick={() => setShowAllFilters((prev) => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? (isRtl ? 'إخفاء' : 'Hide') : (isRtl ? 'إظهار الكل' : 'Show All')}
              <FaChevronDown size={12} className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm dark:text-white hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              {isRtl ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <User size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'}
              </label>
              <SearchableSelect options={salesPersonOptions} value={salesPersonFilter} onChange={setSalesPersonFilter} placeholder={isRtl ? 'اختر' : 'Select'} icon={<User size={16} />} isRTL={isRtl} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Users size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'المدير' : 'Manager'}
              </label>
              <SearchableSelect options={managerOptions} value={managerFilter} onChange={setManagerFilter} placeholder={isRtl ? 'اختر' : 'Select'} icon={<Users size={16} />} isRTL={isRtl} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Layers size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'مرحلة التيليسيلز' : 'Telesales Stage'}
              </label>
              <SearchableSelect options={stageOptions} value={stageFilter} onChange={setStageFilter} placeholder={isRtl ? 'اختر' : 'Select'} icon={<Layers size={16} />} isRTL={isRtl} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'المصدر' : 'Source'}
              </label>
              <SearchableSelect options={sourceOptions} value={sourceFilter} onChange={setSourceFilter} placeholder={isRtl ? 'اختر' : 'Select'} icon={<Tag size={16} />} isRTL={isRtl} />
            </div>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${showAllFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'}`}>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                {scopedEntityLabel}
              </label>
              <SearchableSelect options={projectOptions} value={projectFilter} onChange={setProjectFilter} placeholder={isRtl ? 'اختر' : 'Select'} icon={<Briefcase size={16} />} isRTL={isRtl} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Activity size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'نوع الإجراء' : 'Action Type'}
              </label>
              <SearchableSelect options={actionTypeOptions} value={actionTypeFilter} onChange={setActionTypeFilter} placeholder={isRtl ? 'اختر' : 'Select'} icon={<Activity size={16} />} isRTL={isRtl} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'تاريخ التعيين' : 'Assign Date'}
              </label>
              <DateRangePicker from={assignDateFrom} to={assignDateTo} onChange={({ from, to }) => { setAssignDateFrom(from); setAssignDateTo(to) }} isRTL={isRtl} className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'تاريخ الإنشاء' : 'Creation Date'}
              </label>
              <DateRangePicker from={creationDateFrom} to={creationDateTo} onChange={({ from, to }) => { setCreationDateFrom(from); setCreationDateTo(to) }} isRTL={isRtl} className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Clock size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'تاريخ الإجراء' : 'Action Date'}
              </label>
              <DateRangePicker from={actionDateFrom} to={actionDateTo} onChange={({ from, to }) => { setActionDateFrom(from); setActionDateTo(to) }} isRTL={isRtl} className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Clock size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'تاريخ آخر إجراء' : 'Last Action Date'}
              </label>
              <DateRangePicker from={lastActionDateFrom} to={lastActionDateTo} onChange={({ from, to }) => { setLastActionDateFrom(from); setLastActionDateTo(to) }} isRTL={isRtl} className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { title: isRtl ? 'إجمالي المكالمات' : 'Total Calls', value: kpiData.totalCalls, icon: Phone, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
          { title: isRtl ? 'إجمالي الإجراءات' : 'Total Actions', value: kpiData.totalActions, icon: Activity, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/20' },
          { title: isRtl ? 'إجمالي الردود' : 'Total Answer', value: kpiData.answered, icon: MessageSquare, color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-900/20' },
          { title: isRtl ? 'لم يتم الرد' : 'No Answer', value: kpiData.noAnswer, icon: Phone, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20' },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden h-32">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110">
                <Icon size={80} className={card.color} />
              </div>
              <div className="flex flex-col justify-between h-full relative z-10">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${card.bgColor} ${card.color}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className={`${isLight ? 'text-black' : 'text-white'} text-sm font-semibold opacity-80`}>{card.title}</h3>
                </div>
                <div className="flex items-baseline space-x-2 rtl:space-x-reverse pl-1">
                  <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <ChartCard title={isRtl ? 'الإجراءات حسب المرحلة' : 'Actions by Stage'} data={chartData.actionsByStage} isLight={isLight} isRtl={isRtl} />
        <ChartCard title={isRtl ? 'الإجراءات حسب النوع' : 'Actions by Type'} data={chartData.actionsByType} isLight={isLight} isRtl={isRtl} />
        <ChartCard title={isRtl ? 'المكالمات حسب المرحلة' : 'Calls by Stage'} data={chartData.callsByStage} isLight={isLight} isRtl={isRtl} />
        <ChartCard title={isRtl ? 'الإجراءات حسب المصدر' : 'Actions by Source'} data={chartData.actionsBySource} isLight={isLight} isRtl={isRtl} />
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h2 className={`${isLight ? 'text-black' : 'text-white'} text-lg font-bold`}>{isRtl ? 'نظرة عامة على أنشطة التيليسيلز' : 'Telesales Activities Overview'}</h2>
          {canExport && (
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu((prev) => !prev)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
              <FaFileExport /> {isRtl ? 'تصدير' : 'Export'}
              <FaChevronDown className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} size={12} />
            </button>
            {showExportMenu ? (
              <div className={`absolute top-full ${isRtl ? 'left-0' : 'right-0'} mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}>
                <button onClick={handleExportExcel} className="w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-white">
                  <FaFileExcel className="text-green-600" /> {isRtl ? 'تصدير كـ Excel' : 'Export to Excel'}
                </button>
                <button onClick={handleExportPdf} className="w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-white">
                  <FaFilePdf className="text-red-600" /> {isRtl ? 'تصدير كـ PDF' : 'Export to PDF'}
                </button>
              </div>
            ) : null}
          </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className={`text-xs uppercase ${isLight ? 'text-black' : 'text-white'}`}>
              <tr>
                <th className="md:hidden px-4 py-3 border-b border-theme-border dark:border-gray-700/50"></th>
                <th className={`px-4 py-3 border-b border-theme-border dark:border-gray-700/50 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'}</th>
                <th className={`hidden md:table-cell px-4 py-3 text-center border-b border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'إجمالي الليدز' : 'Total Leads'}</th>
                <th className={`hidden md:table-cell px-4 py-3 text-center border-b border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'الإجراءات' : 'Actions'}</th>
                <th className={`hidden md:table-cell px-4 py-3 text-center border-b border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'المكالمات' : 'Calls'}</th>
                <th className={`hidden md:table-cell px-4 py-3 text-center border-b border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'التعليقات' : 'Comments'}</th>
                <th className={`hidden md:table-cell px-4 py-3 text-center border-b border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'تم الرد' : 'Answered'}</th>
                <th className={`hidden md:table-cell px-4 py-3 text-center border-b border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'لم يتم الرد' : 'No Answer'}</th>
                <th className={`px-4 py-3 border-b border-theme-border dark:border-gray-700/50 text-start ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'الإجراء حسب المرحلة' : 'Action by Stage'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border dark:divide-gray-700/50">
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[var(--muted-text)]">
                    {isRtl ? 'لا توجد بيانات' : 'No data'}
                  </td>
                </tr>
              ) : null}
              {paginatedRows.map((row) => (
                <>
                  <tr key={row.id} className="hover:bg-theme-bg/50 dark:hover:bg-white/5 transition-colors">
                    <td className="md:hidden px-4 py-3">
                      <button onClick={() => setExpandedRows((prev) => ({ ...prev, [row.id]: !prev[row.id] }))} className="p-1 rounded-full hover:bg-theme-bg/50 text-[var(--muted-text)]">
                        {expandedRows[row.id] ? <ChevronLeft size={16} className={isRtl ? '' : 'rotate-90'} /> : <ChevronRight size={16} className={isRtl ? '' : 'rotate-90'} />}
                      </button>
                    </td>
                    <td className={`px-4 py-3 font-medium ${isLight ? 'text-black' : 'text-white'}`}>{row.salesperson}</td>
                    <td className={`hidden md:table-cell px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{row.totalLeads}</td>
                    <td className={`hidden md:table-cell px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{row.actions}</td>
                    <td className={`hidden md:table-cell px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{row.calls}</td>
                    <td className={`hidden md:table-cell px-4 py-3 text-center ${isLight ? 'text-black' : 'text-white'}`}>{row.comments}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-center text-emerald-600 font-medium">{row.answered}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-center text-rose-500 font-medium">{row.noAnswer}</td>
                    <td className="px-4 py-3 text-start">
                      <div
                        className="relative inline-block"
                        onMouseEnter={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect()
                          setActionTooltipPosition({
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          })
                          setHoveredActionRow(row.id)
                        }}
                        onMouseLeave={() => setHoveredActionRow(null)}
                      >
                        <button
                          type="button"
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 border transition-all duration-200 group ${
                            isLight
                              ? 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-blue-50'
                              : 'bg-slate-700/50 border-slate-700 text-slate-100 hover:bg-blue-900/20'
                          }`}
                        >
                          <PieChartIcon size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-semibold uppercase">
                            {isRtl ? 'عرض التوزيع' : 'View Stats'}
                          </span>
                        </button>
                        <AnimatePresence>
                          {hoveredActionRow === row.id ? (
                            <ActionStageTooltip
                              data={(row.stageEntries || []).map(([stage, count], index) => ({
                                stage,
                                count,
                                color: palette[index % palette.length],
                              }))}
                              isRtl={isRtl}
                              position={actionTooltipPosition}
                            />
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </td>
                  </tr>
                  {expandedRows[row.id] ? (
                    <tr key={`${row.id}-stats`} className="border-b border-theme-border dark:border-gray-700/50">
                      <td colSpan={9} className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {row.stageEntries?.length ? row.stageEntries.map(([stage, count]) => (
                            <div
                              key={`${row.id}-${stage}`}
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm ${
                                isLight ? 'bg-slate-100 text-slate-800' : 'bg-slate-800 text-slate-100'
                              }`}
                            >
                              <span className="font-medium">{stage}</span>
                              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{count}</span>
                            </div>
                          )) : (
                            <span className="text-sm text-[var(--muted-text)]">{isRtl ? 'لا توجد بيانات مراحل' : 'No stage data available'}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4 border-t border-theme-border dark:border-gray-700/50">
          <div className="text-sm text-[var(--muted-text)]">
            {isRtl
              ? `عرض ${tableRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1}-${Math.min(currentPage * entriesPerPage, tableRows.length)} من ${tableRows.length}`
              : `Showing ${tableRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1}-${Math.min(currentPage * entriesPerPage, tableRows.length)} of ${tableRows.length}`}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span>{isRtl ? 'لكل صفحة:' : 'Per page:'}</span>
              <select value={entriesPerPage} onChange={(event) => { setEntriesPerPage(Number(event.target.value) || 10); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent">
                {[10, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="p-2 rounded-lg border border-theme-border disabled:opacity-50">
                {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              <span className="text-sm">{isRtl ? `صفحة ${currentPage} من ${pageCount}` : `Page ${currentPage} of ${pageCount}`}</span>
              <button type="button" onClick={() => setCurrentPage((prev) => Math.min(pageCount, prev + 1))} disabled={currentPage >= pageCount} className="p-2 rounded-lg border border-theme-border disabled:opacity-50">
                {isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
