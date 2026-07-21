import { useMemo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  FaChartLine,
  FaChevronDown,
  FaFilter,
  FaPhone,
} from 'react-icons/fa'
import { Activity, Crown, Star, User } from 'lucide-react'
import { RiBarChart2Line, RiLineChartLine, RiPieChartLine } from 'react-icons/ri'
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '../shared/context/AppStateProvider'
import { api } from '../utils/api'
import { useStages } from '../hooks/useStages'
import { isSuperAdminUser, isTenantAdminUser } from '../services/leadPermissions'
import SearchableSelect from '../components/SearchableSelect'
import { LeadsAnalysisChart } from '../features/Dashboard/components/LeadsAnalysisChart'
import { DelayLeads } from '../features/Dashboard/components/DelayLeads'
import { PipelineAnalysis } from '../features/Dashboard/components/PipelineAnalysis'
import exportDashboardChartsToPdf from '../features/Dashboard/utils/exportDashboardChartsToPdf'
import { ICON_MAP } from '../components/settings/IconSelector'

function hasTelesalesPermission(user, permission) {
  if (isTenantAdminUser(user) || isSuperAdminUser(user)) return true
  const perms = user?.meta_data?.module_permissions?.Telesales
  return Array.isArray(perms) ? perms.includes(permission) : false
}

function normalizeRoleValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStageKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatYmdLocal(date) {
  if (!date) return ''
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

function formatShortDateTime(value, locale = 'en') {
  if (!value) return '-'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return '-'
  }
}

const MONTH_LABELS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const isHexColor = (c) => typeof c === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)

const hexToRgb = (hex) => {
  try {
    let h = String(hex || '').replace('#', '')
    if (h.length === 3) h = h.split('').map((x) => x + x).join('')
    const bigint = parseInt(h, 16)
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    }
  } catch {
    return { r: 0, g: 0, b: 0 }
  }
}

const withAlpha = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const COLOR_STYLES = {
  blue: {
    containerLight: 'border-blue-400 bg-gradient-to-br from-blue-100 via-blue-100 to-blue-100 backdrop-blur-sm shadow-blue-300/30',
    patternFromLight: 'from-blue-200/40',
    patternToLight: 'to-blue-300/30',
    iconBgLight: 'bg-blue-600/80',
    badgeLightBg: 'bg-blue-100/60',
    badgeLightText: 'text-blue-700',
    badgeLightBorder: 'border-blue-300',
  },
  green: {
    containerLight: 'border-green-400 bg-gradient-to-br from-green-100 via-green-100 to-green-100 backdrop-blur-sm shadow-green-300/30',
    patternFromLight: 'from-green-200/40',
    patternToLight: 'to-green-300/30',
    iconBgLight: 'bg-green-600/80',
    badgeLightBg: 'bg-green-100/60',
    badgeLightText: 'text-green-700',
    badgeLightBorder: 'border-green-300',
  },
  yellow: {
    containerLight: 'border-yellow-400 bg-gradient-to-br from-yellow-100 via-yellow-100 to-yellow-100 backdrop-blur-sm shadow-yellow-300/30',
    patternFromLight: 'from-yellow-200/40',
    patternToLight: 'to-yellow-300/30',
    iconBgLight: 'bg-yellow-600/80',
    badgeLightBg: 'bg-yellow-100/60',
    badgeLightText: 'text-yellow-700',
    badgeLightBorder: 'border-yellow-300',
  },
  red: {
    containerLight: 'border-red-400 bg-gradient-to-br from-red-100 via-red-100 to-red-100 backdrop-blur-sm shadow-red-300/30',
    patternFromLight: 'from-red-200/40',
    patternToLight: 'to-red-300/30',
    iconBgLight: 'bg-red-600/80',
    badgeLightBg: 'bg-red-100/60',
    badgeLightText: 'text-red-700',
    badgeLightBorder: 'border-red-300',
  },
  purple: {
    containerLight: 'border-purple-400 bg-gradient-to-br from-purple-100 via-purple-100 to-purple-100 backdrop-blur-sm shadow-purple-300/30',
    patternFromLight: 'from-purple-200/40',
    patternToLight: 'to-purple-300/30',
    iconBgLight: 'bg-purple-600/80',
    badgeLightBg: 'bg-purple-100/60',
    badgeLightText: 'text-purple-700',
    badgeLightBorder: 'border-purple-300',
  },
  orange: {
    containerLight: 'border-orange-400 bg-gradient-to-br from-orange-100 via-orange-100 to-orange-100 backdrop-blur-sm shadow-orange-300/30',
    patternFromLight: 'from-orange-200/40',
    patternToLight: 'to-orange-300/30',
    iconBgLight: 'bg-orange-600/80',
    badgeLightBg: 'bg-orange-100/60',
    badgeLightText: 'text-orange-700',
    badgeLightBorder: 'border-orange-300',
  },
}

export default function TelesalesDashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme: contextTheme, resolvedTheme } = useTheme()
  const theme = resolvedTheme || contextTheme
  const isLight = theme === 'light'
  const textColor = isLight ? 'text-black' : 'text-white'
  const { user, activeModules } = useAppState()
  const { stages: telesalesStages } = useStages({ workflowKey: 'telesales', activeOnly: true })

  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [telesalesAssignees, setTelesalesAssignees] = useState([])
  const [summary, setSummary] = useState(null)
  const [disableCheck, setDisableCheck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [selectedManager, setSelectedManager] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(true)
  const [leadsChartType, setLeadsChartType] = useState('bar')
  const [showAllStages, setShowAllStages] = useState(false)
  const [selectedStageFilter, setSelectedStageFilter] = useState('')
  const [delayLeadsOpenMobile, setDelayLeadsOpenMobile] = useState(true)
  const [delayLeadsCount, setDelayLeadsCount] = useState(0)
  const [rankingPeriod, setRankingPeriod] = useState('today')
  const [commentsOpenMobile, setCommentsOpenMobile] = useState(true)
  const [recentCallsOpenMobile, setRecentCallsOpenMobile] = useState(true)
  const [recentCallsCount, setRecentCallsCount] = useState(0)
  const [recentCallsRange, setRecentCallsRange] = useState('today')
  const [leadsAnalysisOpenMobile, setLeadsAnalysisOpenMobile] = useState(true)
  const [pipelineAnalysisOpenMobile, setPipelineAnalysisOpenMobile] = useState(true)
  const [leadsAnalysisYear, setLeadsAnalysisYear] = useState(String(new Date().getFullYear()))
  const [exportingChartKey, setExportingChartKey] = useState(null)
  const leadsAnalysisChartRef = useRef(null)
  const pipelineAnalysisChartRef = useRef(null)

  const moduleEnabled = Array.isArray(activeModules) && activeModules.includes('telesales')
  const canShow = useMemo(() => hasTelesalesPermission(user, 'showModule'), [user])
  const canViewDashboard = useMemo(() => hasTelesalesPermission(user, 'viewDashboard'), [user])
  const canDisableModule = useMemo(() => hasTelesalesPermission(user, 'disableModule'), [user])
  const normalizedRole = useMemo(() => normalizeRoleValue(user?.role || user?.job_title), [user?.job_title, user?.role])
  const isTelesalesAgent = normalizedRole === 'telesales agent'
  const canViewDuplicateDisplay = useMemo(() => {
    if (isTenantAdminUser(user) || isSuperAdminUser(user)) return true
    const perms = user?.meta_data?.module_permissions?.Telesales
    return Array.isArray(perms) ? perms.includes('viewDuplicateLeads') : false
  }, [user])
  const canViewPendingDisplay = !isTelesalesAgent
  const isRtl = String(i18n.language || '').startsWith('ar')

  const normalizeUsers = (payload) => {
    if (Array.isArray(payload?.data)) return payload.data
    if (Array.isArray(payload)) return payload
    return []
  }

  const buildDashboardParams = () => ({
    page: 1,
    per_page: 100,
    ...(selectedEmployee ? { assigned_to: selectedEmployee } : {}),
    ...(selectedManager ? { manager_id: selectedManager } : {}),
    ...(dateFrom ? { created_from: dateFrom } : {}),
    ...(dateTo ? { created_to: dateTo } : {}),
  })

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)
      setPageError('')

      try {
        if (!moduleEnabled || !canShow || !canViewDashboard) {
          setPageError('You do not have access to this dashboard.')
          setRows([])
          setUsers([])
          setTelesalesAssignees([])
          setSummary(null)
          setDisableCheck(null)
          return
        }

        const params = buildDashboardParams()

        const [leadRes, userRes, telesalesAssigneeRes, summaryRes, disableCheckRes] = await Promise.all([
          api.get('/api/telesales/leads', { params }),
          api.get('/api/users'),
          api.get('/api/telesales/assignees', { params: { workflow: 'telesales' } }).catch(() => null),
          api.get('/api/telesales/dashboard-summary', { params }),
          canDisableModule ? api.get('/api/telesales/module-disable-check') : Promise.resolve(null),
        ])

        const leadPayload = leadRes?.data || {}
        const leadRows = Array.isArray(leadPayload?.data) ? leadPayload.data : []

        setRows(leadRows)
        setUsers(normalizeUsers(userRes?.data))
        setTelesalesAssignees(normalizeUsers(telesalesAssigneeRes?.data))
        setSummary(summaryRes?.data || null)
        setDisableCheck(disableCheckRes?.data || null)
      } catch (error) {
        setPageError(error?.response?.data?.message || 'Failed to load telesales dashboard.')
        setRows([])
        setUsers([])
        setTelesalesAssignees([])
        setSummary(null)
        setDisableCheck(null)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [moduleEnabled, canShow, canViewDashboard, canDisableModule, selectedEmployee, selectedManager, dateFrom, dateTo])

  const stageCounts = useMemo(() => {
    const counts = { total: Number(summary?.total_leads || rows.length || 0) }
    const summaryStages = Array.isArray(summary?.by_stage) ? summary.by_stage : []

    if (summaryStages.length > 0) {
      summaryStages.forEach((item) => {
        const key = normalizeStageKey(item?.stage_key || item?.stage_name)
        if (!key) return
        counts[key] = Number(item.count || 0)
      })
    } else {
      rows.forEach((lead) => {
        const key = normalizeStageKey(lead?.display_stage || lead?.stageRelation?.type || lead?.stageRelation?.name || lead?.stage)
        if (!key) return
        counts[key] = Number(counts[key] || 0) + 1
      })
    }

    if (typeof summary?.duplicate === 'number') counts.duplicate = Number(summary.duplicate || 0)
    if (typeof summary?.pending === 'number') counts.pending = Number(summary.pending || 0)

    return counts
  }, [rows, summary])

  const managerOptions = useMemo(() => {
    const allowedRoles = new Set(['telesales manager', 'telesales team leader', 'tenant admin', 'admin'])
    return users
      .filter((entry) => allowedRoles.has(normalizeRoleValue(entry?.role || entry?.job_title)))
      .map((entry) => ({ value: String(entry.id), label: entry.name }))
  }, [users])

  const employeeOptions = useMemo(
    () => telesalesAssignees.map((entry) => ({ value: String(entry.id), label: entry.name })),
    [telesalesAssignees]
  )

  const stageCards = useMemo(() => telesalesStages
    .filter((stage) => {
      const stageTypeKey = normalizeStageKey(stage?.type)
      const key = stageTypeKey && stageTypeKey !== 'display' ? stageTypeKey : normalizeStageKey(stage?.name)
      if (key === 'duplicate') return canViewDuplicateDisplay
      if (key === 'pending') return canViewPendingDisplay
      return true
    })
    .map((stage) => {
      const stageTypeKey = normalizeStageKey(stage?.type)
      const key = stageTypeKey && stageTypeKey !== 'display' ? stageTypeKey : normalizeStageKey(stage?.name)
      return {
        id: stage.id || key,
        key,
        name: isRtl && stage?.name_ar ? stage.name_ar : stage.name,
        type: stageTypeKey,
        icon: stage.icon || 'BarChart2',
        count: stageCounts[key] || 0,
        color: String(stage.color || '').toLowerCase(),
        order: Number(stage?.order ?? 0),
      }
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return String(a.name || '').localeCompare(String(b.name || ''))
    }), [canViewDuplicateDisplay, canViewPendingDisplay, isRtl, stageCounts, telesalesStages])

  const analysisData = useMemo(() => {
    const selectedYear = Number(leadsAnalysisYear) || new Date().getFullYear()
    const rowsForYear = rows.filter((lead) => {
      const rawDate = lead?.created_at || lead?.creation_date || lead?.createdAt || lead?.date
      const createdDate = rawDate ? new Date(rawDate) : null
      if (!createdDate || Number.isNaN(createdDate.getTime())) return false
      return createdDate.getFullYear() === selectedYear
    })

    const monthlyMap = new Map()
    const sourceMap = new Map()
    const statusMap = new Map()

    rowsForYear.forEach((lead) => {
      const rawDate = lead?.created_at || lead?.creation_date || lead?.createdAt || lead?.date
      const createdDate = rawDate ? new Date(rawDate) : null
      if (createdDate && !Number.isNaN(createdDate.getTime())) {
        const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`
        const monthLabel = createdDate.toLocaleString('en-US', { month: 'long' })
        const currentMonth = monthlyMap.get(monthKey) || { month: monthKey, label: monthLabel, value: 0 }
        currentMonth.value += 1
        monthlyMap.set(monthKey, currentMonth)
      }

      const sourceKey = String(lead?.source || t('Unknown')).trim() || t('Unknown')
      const sourceEntry = sourceMap.get(sourceKey) || { label: sourceKey, value: 0 }
      sourceEntry.value += 1
      sourceMap.set(sourceKey, sourceEntry)

      const stageKey = String(lead?.display_stage || lead?.stageRelation?.name || lead?.stage || t('Unknown')).trim() || t('Unknown')
      const stageEntry = statusMap.get(stageKey) || { label: stageKey, value: 0 }
      stageEntry.value += 1
      statusMap.set(stageKey, stageEntry)
    })

    const monthly = MONTH_LABELS_EN.map((label, monthIndex) => {
      const monthKey = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`
      return monthlyMap.get(monthKey) || { month: monthKey, label, value: 0 }
    })

    return {
      monthly,
      bySource: Array.from(sourceMap.values()).sort((a, b) => b.value - a.value).slice(0, 6),
      byStatus: Array.from(statusMap.values()).sort((a, b) => b.value - a.value),
    }
  }, [leadsAnalysisYear, rows, t])

  const recentLeadActivity = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        const aTime = new Date(a?.latest_action_at || a?.updated_at || a?.created_at || 0).getTime()
        const bTime = new Date(b?.latest_action_at || b?.updated_at || b?.created_at || 0).getTime()
        return bTime - aTime
      })
      .slice(0, 6)
  }, [rows])

  const topAgents = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const day = now.getDay()
    const daysSinceSaturday = (day - 6 + 7) % 7
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceSaturday)
    const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const rowsForRanking = rows.filter((lead) => {
      if (rankingPeriod === 'all') return true
      const rawDate = lead?.latest_action_at || lead?.last_action_at || lead?.updated_at || lead?.created_at
      const activityDate = rawDate ? new Date(rawDate) : null
      if (!activityDate || Number.isNaN(activityDate.getTime())) return false

      if (rankingPeriod === 'today') {
        return activityDate >= startOfToday && activityDate < startOfTomorrow
      }

      if (rankingPeriod === 'week') {
        return activityDate >= startOfWeek && activityDate < endOfWeek
      }

      if (rankingPeriod === 'month') {
        return activityDate >= startOfMonth && activityDate < endOfMonth
      }

      return true
    })

    const map = new Map()
    rowsForRanking.forEach((lead) => {
      const name = lead?.assigned_to_name || lead?.assignedAgent?.name || lead?.sales_person_name || '-'
      if (!name || name === '-') return
      const entry = map.get(name) || { name, total: 0 }
      entry.total += 1
      map.set(name, entry)
    })
    const baseAgents = telesalesAssignees
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        total: map.get(entry.name)?.total || 0,
      }))
      .filter((entry) => String(entry.name || '').trim())

    map.forEach((value, key) => {
      if (!baseAgents.some((entry) => entry.name === key)) {
        baseAgents.push({ id: key, name: key, total: value.total || 0 })
      }
    })

    return baseAgents.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [rankingPeriod, rows, telesalesAssignees])

  const rankingPeriods = useMemo(() => ([
    { value: 'today', label: t('Today') },
    { value: 'week', label: t('Week') },
    { value: 'month', label: t('Month') },
    { value: 'all', label: t('All') },
  ]), [t])

  const telesalesComments = useMemo(() => (
    rows
      .flatMap((lead) => {
        const leadMeta = {
          leadId: lead.id,
          leadName: lead.name || '-',
          stage: lead.display_stage || lead.stageRelation?.name || lead.stage || '-',
          priority: lead.priority || 'medium',
          source: lead.source || '-',
          employeeName: lead.assigned_to_name || lead.assignedAgent?.name || lead.sales_person_name || '-',
        }

        const actions = Array.isArray(lead?.actions) ? lead.actions : []
        const actionRows = actions
          .flatMap((action, index) => {
            const commentsArray = Array.isArray(action?.details?.comments) ? action.details.comments : []
            const commentEntries = commentsArray
              .map((comment, commentIndex) => {
                const commentText = String(comment?.text || comment?.comment || '').trim()
                if (!commentText) return null
                return {
                  id: `${lead.id}-action-${action?.id || index}-comment-${comment?.id || commentIndex}`,
                  ...leadMeta,
                  actionBy: comment?.userName || action?.created_by_name || action?.user_name || action?.user?.name || 'admin',
                  comment: commentText,
                  createdAt: comment?.createdAt || action?.created_at || action?.date || lead?.updated_at || lead?.created_at,
                }
              })
              .filter(Boolean)

            if (commentEntries.length > 0) return commentEntries

            const commentText =
              action?.description ||
              action?.notes ||
              action?.comment ||
              action?.details?.notes ||
              action?.details?.comment ||
              ''

            if (!String(commentText || '').trim()) return []

            return [{
              id: `${lead.id}-action-${action?.id || index}`,
              ...leadMeta,
              actionBy: action?.created_by_name || action?.user_name || action?.user?.name || 'admin',
              comment: commentText,
              createdAt: action?.created_at || action?.date || lead?.updated_at || lead?.created_at,
            }]
          })

        if (actionRows.length > 0) return actionRows

        const latestAction = lead?.latest_action || lead?.latestAction || {}
        const latestCommentsArray = Array.isArray(latestAction?.details?.comments) ? latestAction.details.comments : []
        const latestCommentEntry = latestCommentsArray
          .map((comment, commentIndex) => {
            const commentText = String(comment?.text || comment?.comment || '').trim()
            if (!commentText) return null
            return {
              id: `${lead.id}-latest-comment-${comment?.id || commentIndex}`,
              ...leadMeta,
              actionBy: comment?.userName || latestAction?.created_by_name || latestAction?.user_name || latestAction?.user?.name || 'admin',
              comment: commentText,
              createdAt: comment?.createdAt || latestAction?.created_at || latestAction?.date || lead?.updated_at || lead?.created_at,
            }
          })
          .filter(Boolean)

        if (latestCommentEntry.length > 0) return latestCommentEntry

        const fallbackComment =
          latestAction?.description ||
          latestAction?.notes ||
          lead?.last_comment ||
          lead?.comment ||
          lead?.notes ||
          ''

        if (!String(fallbackComment || '').trim()) return []

        return [{
          id: `${lead.id}-latest`,
          ...leadMeta,
          actionBy: latestAction?.created_by_name || latestAction?.user_name || latestAction?.user?.name || 'admin',
          comment: fallbackComment,
          createdAt: latestAction?.created_at || latestAction?.date || lead?.updated_at || lead?.created_at,
        }]
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8)
  ), [rows])

  const normalizeStageFilterValue = (value) => normalizeStageKey(value).replace(/-/g, ' ')

  const matchesSelectedStageFilter = (value) => {
    const target = normalizeStageFilterValue(selectedStageFilter)
    if (!target) return true

    const normalizedValue = normalizeStageFilterValue(value)
    if (!normalizedValue) return false

    if (target === 'cold calls') {
      return ['cold calls', 'cold call'].includes(normalizedValue)
    }

    return normalizedValue === target
  }

  const filteredTelesalesComments = useMemo(() => (
    telesalesComments.filter((entry) => matchesSelectedStageFilter(entry.stage))
  ), [selectedStageFilter, telesalesComments])

  const telesalesRecentCalls = useMemo(() => (
    rows
      .map((lead) => {
        const latestAction = lead?.latest_action || lead?.latestAction || {}
        const actionType = String(latestAction?.type || latestAction?.action_type || '').toLowerCase()
        const actionText = String(latestAction?.description || latestAction?.notes || '').toLowerCase()
        const looksLikeCall = actionType.includes('call') || actionText.includes('call') || actionText.includes('phone')
        if (!looksLikeCall) return null
        return {
          id: `${lead.id}-call`,
          employeeName: lead.assigned_to_name || lead.assignedAgent?.name || lead.sales_person_name || '-',
          leadName: lead.name || '-',
          stage: lead.display_stage || lead.stageRelation?.name || lead.stage || '-',
          phoneNumber: lead.phone || lead.mobile || '',
          callType: actionType.includes('incoming') ? 'incoming' : actionType.includes('missed') ? 'missed' : 'outgoing',
          duration: latestAction?.duration || '00:00',
          notes: latestAction?.description || latestAction?.notes || '',
          createdAt: latestAction?.created_at || latestAction?.date || lead?.updated_at || lead?.created_at,
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8)
  ), [rows])

  const filteredRecentCalls = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    return telesalesRecentCalls.filter((call) => {
      if (!matchesSelectedStageFilter(call.stage)) return false
      if (recentCallsRange === 'all') return true
      const createdAt = new Date(call.createdAt || 0)
      if (Number.isNaN(createdAt.getTime())) return false

      if (recentCallsRange === 'today') {
        return (
          createdAt.getFullYear() === startOfToday.getFullYear() &&
          createdAt.getMonth() === startOfToday.getMonth() &&
          createdAt.getDate() === startOfToday.getDate()
        )
      }

      if (recentCallsRange === 'week') {
        const weekAgo = new Date(startOfToday)
        weekAgo.setDate(weekAgo.getDate() - 6)
        return createdAt >= weekAgo
      }

      return true
    })
  }, [recentCallsRange, selectedStageFilter, telesalesRecentCalls])

  useEffect(() => {
    setRecentCallsCount(filteredRecentCalls.length)
  }, [filteredRecentCalls.length])

  const effectiveEmployeeName = useMemo(() => {
    const selectedEmployeeOption = employeeOptions.find((entry) => String(entry.value) === String(selectedEmployee))
    if (selectedEmployeeOption?.label) return selectedEmployeeOption.label
    const selectedManagerOption = managerOptions.find((entry) => String(entry.value) === String(selectedManager))
    return selectedManagerOption?.label || ''
  }, [employeeOptions, managerOptions, selectedEmployee, selectedManager])

  const telesalesPipelineRawData = useMemo(() => (
    rows.map((lead) => ({
      stage: lead.display_stage || lead.stageRelation?.name || lead.stage || t('Unknown'),
      leadName: lead.name || '-',
      employee: lead.assigned_to_name || lead.assignedAgent?.name || lead.sales_person_name || '-',
      date: lead.created_at || lead.creation_date || lead.createdAt || lead.date || '',
      value: Number(lead.amount || lead.total_amount || lead.value || 0),
      prorated: Number(lead.amount || lead.total_amount || lead.value || 0),
    }))
  ), [rows, t])

  const normalizedLeadsAnalysisYear = useMemo(() => {
    const parsed = Number(leadsAnalysisYear)
    if (!Number.isFinite(parsed)) return String(new Date().getFullYear())
    return String(Math.min(2100, Math.max(2000, Math.trunc(parsed))))
  }, [leadsAnalysisYear])

  const handleExportDashboardPdf = async () => {
    if (!leadsAnalysisChartRef.current) return
    try {
      setExportingChartKey('leads-analysis')
      await exportDashboardChartsToPdf({
        charts: [
          {
            key: 'leads-analysis',
            title: t('Telesales Leads Analysis'),
            ref: leadsAnalysisChartRef,
            monthlyData: analysisData.monthly,
          },
        ],
        title: t('Telesales Dashboard Report'),
        dateRange: { from: dateFrom, to: dateTo },
        reportYear: normalizedLeadsAnalysisYear,
        userName: user?.name || 'admin',
        fileName: `telesales-leads-analysis-${normalizedLeadsAnalysisYear}.pdf`,
      })
    } finally {
      setExportingChartKey(null)
    }
  }

  const handleExportPipelinePdf = async () => {
    if (!pipelineAnalysisChartRef.current) return
    try {
      setExportingChartKey('pipeline-analysis')
      await exportDashboardChartsToPdf({
        charts: [
          {
            key: 'pipeline-analysis',
            title: t('Telesales Pipeline Analysis'),
            ref: pipelineAnalysisChartRef,
          },
        ],
        title: t('Telesales Dashboard Report'),
        dateRange: { from: dateFrom, to: dateTo },
        reportYear: normalizedLeadsAnalysisYear,
        userName: user?.name || 'admin',
        fileName: `telesales-pipeline-analysis-${normalizedLeadsAnalysisYear}.pdf`,
      })
    } finally {
      setExportingChartKey(null)
    }
  }

  const resetFilters = () => {
    setSelectedManager('')
    setSelectedEmployee('')
    setDateFrom('')
    setDateTo('')
    setSelectedStageFilter('')
  }

  const navigateToTelesalesStage = (stageKey = '') => {
    const normalizedStage = normalizeStageKey(stageKey)
    const params = new URLSearchParams()

    if (normalizedStage) {
      params.set('stage', normalizedStage)
    }

    navigate({
      pathname: '/telesales',
      search: params.toString() ? `?${params.toString()}` : '',
    })
  }

  const stagePipelineCards = useMemo(() => {
    const total = Number(stageCounts.total || 0)

    const totalCard = {
      key: '__total__',
      filterKey: '',
      title: t('Total Pipeline'),
      value: total,
      percent: 100,
      icon: <FaChartLine className="w-4 h-4" />,
      color: 'blue',
    }

    const stageOnlyCards = stageCards.map((stage) => {
      const Icon = ICON_MAP[String(stage.icon || '')] || ICON_MAP.BarChart2
      return {
        key: `__stage_${stage.id}__`,
        filterKey: stage.key,
        title: stage.name,
        value: Number(stage.count || 0),
        percent: stage.type === 'convert' ? null : (total > 0 ? Math.round((Number(stage.count || 0) / total) * 100) : 0),
        isConvert: stage.type === 'convert',
        icon: <Icon className="w-4 h-4" />,
        color: stage.type === 'convert' ? 'green' : (stage.color || 'blue'),
      }
    })

    return [totalCard, ...stageOnlyCards]
  }, [stageCards, stageCounts.total, t])

  const visibleStagePipelineCards = useMemo(() => (
    showAllStages ? stagePipelineCards : stagePipelineCards.slice(0, 5)
  ), [showAllStages, stagePipelineCards])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">{t('Loading...')}</div>
  }

  if (pageError) {
    return <div className="p-6 text-sm text-red-600">{t(pageError)}</div>
  }

  return (
    <>
      <div className="mt-1 mb-3 px-2 md:px-6">
        <div className={`relative inline-flex items-center ${isRtl ? 'flex-row-reverse' : ''} gap-2`}>
          <h1 className="page-title text-2xl font-bold text-primary">{t('Telesales Dashboard')}</h1>
          <span
            aria-hidden
            className="absolute block h-[1px] rounded bg-gradient-to-r from-blue-500 via-purple-500 to-transparent"
            style={{
              width: 'calc(100% + 8px)',
              left: isRtl ? 'auto' : '-4px',
              right: isRtl ? '-4px' : 'auto',
              bottom: '-4px',
            }}
          />
        </div>
      </div>

      <div className={`px-2 max-[480px]:px-1 py-2 md:px-6 md:py-3 min-h-screen overflow-x-hidden ${textColor}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <section className="p-1.5 rounded-lg shadow-md glass-panel filter-card w-full mb-3">
          <div className="flex items-center justify-between mb-1 pb-1 border-b border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 bg-blue-600 rounded-md">
                <FaFilter className="w-2.5 h-2.5 text-white" />
              </div>
              <h3 className={`text-[12px] font-bold ${isLight ? 'text-black' : 'text-white'}`}>{t('Filters')}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={resetFilters} className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                {t('Reset')}
              </button>
              <button onClick={() => setFiltersOpenMobile((v) => !v)} className="md:hidden flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600">
                <FaChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpenMobile ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className={`${filtersOpenMobile ? 'block' : 'hidden'} md:block`}>
            <div className="grid grid-cols-1 md:grid-cols-[280px_280px_240px] gap-2 md:justify-start">
              <div className="space-y-1 md:w-[280px]">
                <label className={`text-xs font-medium ${textColor}`}>{t('Manager')}</label>
                <SearchableSelect
                  value={selectedManager}
                  onChange={(value) => setSelectedManager(Array.isArray(value) ? value[0] || '' : value || '')}
                  options={managerOptions}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1 md:w-[280px]">
                <label className={`text-xs font-medium ${textColor}`}>{t('Telesales Agent')}</label>
                <SearchableSelect
                  value={selectedEmployee}
                  onChange={(value) => setSelectedEmployee(Array.isArray(value) ? value[0] || '' : value || '')}
                  options={employeeOptions}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1 md:w-[240px] md:justify-self-start">
                <label className={`text-xs font-medium ${textColor}`}>{t('Date Range')}</label>
                <DatePicker
                  popperContainer={({ children }) => createPortal(children, document.body)}
                  selectsRange
                  startDate={dateFrom ? new Date(dateFrom) : null}
                  endDate={dateTo ? new Date(dateTo) : null}
                  onChange={(update) => {
                    const [start, end] = update
                    setDateFrom(formatYmdLocal(start))
                    setDateTo(formatYmdLocal(end))
                  }}
                  isClearable
                  placeholderText={isRtl ? 'من - إلى' : 'From - To'}
                  className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg dark:bg-gray-700 ${textColor} text-sm dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
                  wrapperClassName="w-full"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg shadow-md glass-panel w-full mb-4 p-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-[20px] font-bold ${isLight ? 'text-gray-900' : 'text-primary'}`}>{t('Telesales Pipeline stages')}</h2>
            {stagePipelineCards.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllStages((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 transition-colors hover:text-blue-400"
              >
                {showAllStages ? t('Show Less') : t('Show More')}
                <FaChevronDown className={`w-3 h-3 transition-transform ${showAllStages ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <div className={`text-xs font-semibold px-3 py-1 rounded-full ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/10 text-blue-300'}`}>
                {Number(disableCheck?.active_leads_count || 0)} {t('active before disable')}
              </div>
            )}
          </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2`}>
              {visibleStagePipelineCards.map((card) => (
              (() => {
                let style = COLOR_STYLES[card.color] || COLOR_STYLES.blue
                let customContainer = {}
                let customIcon = {}
                let customBadge = {}
                let customPattern1 = {}
                let customPattern2 = {}
                let iconTextColor = 'text-white'

                if (!COLOR_STYLES[card.color] && isHexColor(card.color)) {
                  const c = card.color.startsWith('#') ? card.color : `#${card.color}`
                  customContainer = {
                    borderColor: c,
                    backgroundColor: '#ffffff',
                    backgroundImage: `linear-gradient(135deg, ${withAlpha(c, 0.15)} 0%, ${withAlpha(c, 0.05)} 100%)`,
                    boxShadow: `0 10px 25px -5px ${withAlpha(c, 0.3)}, 0 8px 10px -6px ${withAlpha(c, 0.2)}`,
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                  }
                  customIcon = {
                    backgroundColor: c,
                    borderColor: withAlpha(c, 0.5),
                  }
                  customBadge = {
                    backgroundColor: withAlpha(c, 0.1),
                    color: c,
                    borderColor: withAlpha(c, 0.3),
                  }
                  customPattern1 = {
                    backgroundImage: `linear-gradient(to bottom right, ${withAlpha(c, 0.2)}, transparent)`,
                  }
                  customPattern2 = {
                    backgroundImage: `linear-gradient(to top right, ${withAlpha(c, 0.2)}, transparent)`,
                  }
                  const { r, g, b } = hexToRgb(c)
                  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
                  iconTextColor = yiq >= 160 ? 'text-black' : 'text-white'
                }

                return (
                  <div
                    key={`top-${card.key}`}
                    className={`relative overflow-hidden rounded-2xl p-1 group border-2 shadow-2xl transform transition-all duration-500 cursor-pointer hover:shadow-3xl hover:scale-[1.02] hover:-translate-y-1 ${style.containerLight} ${
                      selectedStageFilter === String(card.filterKey || '')
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                        : ''
                    }`}
                    style={customContainer}
                    onClick={() => {
                      const nextFilter = String(card.filterKey || '')
                      setSelectedStageFilter(nextFilter)
                      navigateToTelesalesStage(nextFilter)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        const nextFilter = String(card.filterKey || '')
                        setSelectedStageFilter(nextFilter)
                        navigateToTelesalesStage(nextFilter)
                      }
                    }}
                  >
                    <div className="absolute inset-0 opacity-15 dark:hidden">
                      <div
                        className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${style.patternFromLight} ${style.patternToLight} rounded-full transform translate-x-12 -translate-y-12 group-hover:scale-110 transition-transform duration-700`}
                        style={customPattern1}
                      />
                      <div
                        className={`absolute bottom-0 left-0 w-12 h-12 bg-gradient-to-tr ${style.patternFromLight} ${style.patternToLight} rounded-full transform -translate-x-10 translate-y-10 group-hover:scale-105 transition-transform duration-500`}
                        style={customPattern2}
                      />
                    </div>
                    <div className="relative z-20 min-h-[112px] px-3 py-2.5">
                      <div className="flex items-start justify-between mb-5 gap-3">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="mb-2 flex flex-wrap items-start gap-2">
                            <span
                              className="block max-w-full whitespace-normal break-words text-[11px] font-semibold uppercase tracking-wider text-black leading-tight"
                              title={card.title}
                            >
                              {card.title}
                            </span>
                            {card.isConvert && (
                              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                {t('Convert')}
                              </span>
                            )}
                          </div>
                          <div className="text-[2rem] leading-none font-black tracking-tight text-gray-900">{card.value}</div>
                        </div>
                        <div
                          className={`flex items-center justify-center h-9 w-9 shrink-0 rounded-lg border-2 border-white/30 shadow-xl group-hover:scale-105 group-hover:rotate-3 transition-all duration-500 ${style.iconBgLight}`}
                          style={customIcon}
                        >
                          <span className={iconTextColor}>{card.icon}</span>
                        </div>
                      </div>

                      <div
                        className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold ${style.badgeLightBg} ${style.badgeLightText} ${style.badgeLightBorder}`}
                        style={customBadge}
                      >
                        {card.isConvert
                          ? t('Excluded from total leads')
                          : `${t('Stage share of total')}: ${card.percent}%`}
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                  </div>
                )
              })()
            ))}
          </div>
        </section>

        <section className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] gap-4 mb-4">
          <div className="min-w-0">
            <div className="min-w-0 p-4 glass-panel h-full overflow-auto rounded-lg shadow-md">
              <div className="section-header flex items-center w-full justify-between gap-2 mb-3">
                <div className={`flex min-w-0 flex-1 items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <h3 className={`text-xl font-semibold text-primary ${isRtl ? 'text-right' : 'text-left'}`}>{t('Telesales Delay Leads')}</h3>
                  <span className="inline-flex items-center justify-center min-w-9 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-500">
                    {delayLeadsCount}
                  </span>
                </div>
                <button onClick={() => setDelayLeadsOpenMobile((v) => !v)} className="close-btn md:hidden flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              <div className={`${delayLeadsOpenMobile ? 'block' : 'hidden'} md:block`}>
                <DelayLeads
                  mode="telesales"
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  selectedEmployee={selectedEmployee || selectedManager}
                  selectedEmployeeName={effectiveEmployeeName}
                  stageFilter={selectedStageFilter}
                  onCountChange={setDelayLeadsCount}
                  employeeColumnLabel={t('Telesales Agent')}
                />
              </div>
            </div>
          </div>

          <div
            className={`w-full min-w-0 rounded-xl shadow-lg border overflow-hidden flex flex-col ${
              isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-700'
            }`}
          >
            <div
              className={`p-4 border-b flex flex-col gap-3 ${
                isLight ? 'bg-white border-gray-100' : 'bg-gray-800/50 border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div>
                  <h3 className={`font-bold text-lg ${isLight ? 'text-gray-900' : 'text-white'}`}>
                    {t('Telesales Ranking')}
                  </h3>
                </div>
              </div>

              <div className={`flex items-center w-full p-1 rounded-lg ${isLight ? 'bg-gray-100' : 'bg-gray-800'}`}>
                {rankingPeriods.map((period) => (
                  <button
                    key={period.value}
                    type="button"
                    onClick={() => setRankingPeriod(period.value)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      rankingPeriod === period.value
                        ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 custom-scrollbar h-[420px] overflow-y-auto">
              {topAgents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Activity className="w-10 h-10 opacity-20" />
                  <span className="text-sm">{t('No agent activity found.')}</span>
                </div>
              ) : (
                <div className="flex min-h-full flex-col gap-4">
                  {topAgents.map((agent, index) => (
                    <div
                      key={`${agent.id || agent.name}-${index}`}
                      className={`w-full flex-1 flex items-center justify-between p-3 rounded-xl transition-all ${
                        index === 0
                          ? (isLight
                              ? 'bg-amber-50 border border-amber-100 shadow-sm'
                              : 'bg-amber-900/10 border border-amber-500/20')
                          : (isLight
                              ? 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
                              : 'bg-gray-800/40 border border-gray-700 hover:bg-gray-800/60')
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shadow-sm ${
                            index === 0
                              ? 'bg-gradient-to-br from-yellow-300 to-amber-500 text-white'
                              : index === 1
                                ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white'
                                : index === 2
                                  ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white'
                                  : (isLight
                                      ? 'bg-white text-gray-600 border border-gray-200'
                                      : 'bg-gray-700 text-gray-300 border border-gray-600')
                          }`}
                        >
                          {index === 0 ? <Crown className="w-5 h-5 fill-current" /> : index + 1}
                        </div>

                        <div>
                          <h4 className={`font-semibold text-sm ${isLight ? 'text-gray-900' : 'text-white'}`}>
                            {agent.name}
                          </h4>
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <User className="w-3 h-3" />
                            <span className="truncate max-w-[120px]">{t('Telesales Agent')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-lg font-bold ${
                              index === 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : (isLight ? 'text-gray-900' : 'text-white')
                            }`}
                          >
                            {agent.total}
                          </span>
                          <Star
                            className={`w-4 h-4 ${
                              index === 0
                                ? 'fill-amber-500 text-amber-500'
                                : 'fill-yellow-400 text-yellow-400'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                          {t('Leads')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="p-4 glass-panel rounded-lg shadow-md lg:col-span-2">
            <div className="section-header flex items-center w-full justify-between gap-2 mb-4">
              <h3 className={`flex-1 text-2xl font-bold text-primary ${isRtl ? 'text-right' : 'text-left'}`}>{t('Telesales Last Comments')}</h3>
              <button onClick={() => setCommentsOpenMobile((v) => !v)} className="close-btn md:hidden flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div className={`${commentsOpenMobile ? 'block' : 'hidden'} md:block overflow-x-auto scrollbar-thin-blue ${telesalesComments.length > 5 ? 'max-h-80 overflow-y-auto' : ''}`}>
              <table className="comments-table w-full min-w-max text-sm text-left">
                <thead className={`text-xs uppercase sticky top-0 ${isLight ? 'bg-gray-200' : 'bg-gray-900'}`}>
                  <tr>
                    <th className="px-6 py-3">{t('Lead Name')}</th>
                    <th className="px-6 py-3">{t('Stage')}</th>
                    <th className="px-6 py-3">{t('Priority')}</th>
                    <th className="px-6 py-3">{t('Source')}</th>
                    <th className="px-6 py-3">{t('Telesales Agent')}</th>
                    <th className="px-6 py-3">{t('Action By')}</th>
                    <th className="px-6 py-3">{t('Last Comment')}</th>
                    <th className="px-6 py-3">{t('Action date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTelesalesComments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">{t('No data available')}</td>
                    </tr>
                  ) : filteredTelesalesComments.map((comment) => (
                    <tr key={comment.id} className={`border-b ${isLight ? 'bg-white border-gray-200 hover:bg-gray-50' : 'bg-gray-800 border-gray-700 dark:hover:bg-blue-900/25'}`}>
                      <td className="px-6 py-4 text-blue-500">{comment.leadName}</td>
                      <td className="px-6 py-4">{comment.stage}</td>
                      <td className="px-6 py-4">{comment.priority}</td>
                      <td className="px-6 py-4">{comment.source}</td>
                      <td className="px-6 py-4">{comment.employeeName}</td>
                      <td className="px-6 py-4">{comment.actionBy}</td>
                      <td className="px-6 py-4">{comment.comment}</td>
                      <td className="px-6 py-4">{formatShortDateTime(comment.createdAt, isRtl ? 'ar' : 'en')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 glass-panel rounded-lg shadow-md lg:col-span-1">
            <div className="section-header flex items-center w-full justify-between gap-2 mb-4">
              <h3 className={`flex-1 text-2xl font-bold text-primary ${isRtl ? 'text-right' : 'text-left'} flex items-center gap-3`}>
                <span>{t('Telesales Recent Phone Calls')}</span>
                <span className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-sm font-bold">
                  {recentCallsCount}
                </span>
              </h3>
              <button onClick={() => setRecentCallsOpenMobile((v) => !v)} className="close-btn md:hidden flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div className={`${recentCallsOpenMobile ? 'block' : 'hidden'} md:block`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1 rounded-full border border-gray-200 bg-white/70 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
                  <button
                    type="button"
                    onClick={() => setRecentCallsRange('today')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full ${
                      recentCallsRange === 'today'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {t('Today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentCallsRange('week')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full ${
                      recentCallsRange === 'week'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {t('7 Days')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentCallsRange('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full ${
                      recentCallsRange === 'all'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {t('All')}
                  </button>
                </div>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin-blue">
                {filteredRecentCalls.length === 0 ? (
                  <div className="h-full min-h-40 flex items-center justify-center text-sm text-gray-500">{t('No data available')}</div>
                ) : filteredRecentCalls.map((call) => (
                  <div key={call.id} className={`p-3 rounded-lg border hover:shadow-md transition-shadow ${
                    isLight
                      ? (call.callType === 'missed' ? 'bg-red-50 border-white' : call.callType === 'incoming' ? 'bg-blue-50 border-white' : 'bg-emerald-50 border-white')
                      : 'dark:bg-gray-800 dark:border-gray-700 dark:text-white'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-semibold inline-flex items-center px-1.5 py-0.5 rounded bg-white/80 text-gray-700 border border-white/60">
                        {call.callType}
                      </span>
                      <span className={`text-xs ${isLight ? 'text-gray-800' : 'dark:text-gray-200'}`}>
                        {formatShortDateTime(call.createdAt, isRtl ? 'ar' : 'en')}
                      </span>
                    </div>
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isLight ? 'text-gray-700' : 'dark:text-gray-200'}`}>{t('Employee')}:</span>
                        <span className={`text-sm ${isLight ? 'text-gray-900' : 'dark:text-white'}`}>{call.employeeName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isLight ? 'text-gray-700' : 'dark:text-gray-200'}`}>{t('Lead')}:</span>
                        <span className={`text-sm ${isLight ? 'text-gray-900' : 'dark:text-white'}`}>{call.leadName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isLight ? 'text-gray-700' : 'dark:text-gray-200'}`}>{t('Phone')}:</span>
                        <span className={`text-sm ${isLight ? 'text-gray-900' : 'dark:text-white'}`} dir="ltr">{call.phoneNumber || '-'}</span>
                      </div>
                    </div>
                    {call.notes ? (
                      <div className="mt-2 p-2 bg-[var(--lm-surface)] dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-white">
                        <span className="font-medium">{t('Notes')}:</span> {call.notes}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 mb-4">
          <div ref={leadsAnalysisChartRef} className="rounded-lg shadow-md glass-panel p-4">
            <div className="section-header flex items-center w-full justify-between gap-2 mb-3">
              <h3 className={`flex-1 text-2xl font-bold text-primary ${isRtl ? 'text-right' : 'text-left'}`}>{t('Telesales Leads Analysis')}</h3>
              <div className="flex items-center gap-2" data-export-ignore="true">
                <label htmlFor="telesales-leads-analysis-year" className={`text-sm font-semibold ${isLight ? 'text-gray-700' : 'text-gray-200'}`}>
                  {t('Year')}
                </label>
                <input
                  id="telesales-leads-analysis-year"
                  type="number"
                  min="2000"
                  max="2100"
                  step="1"
                  value={leadsAnalysisYear}
                  onChange={(event) => setLeadsAnalysisYear(event.target.value)}
                  onBlur={() => setLeadsAnalysisYear(normalizedLeadsAnalysisYear)}
                  className={`h-10 w-24 rounded-lg border px-3 text-sm font-semibold outline-none transition-colors ${
                    isLight
                      ? 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                      : 'border-gray-600 bg-gray-800 text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={handleExportDashboardPdf}
                disabled={exportingChartKey === 'leads-analysis'}
                className="inline-flex items-center gap-3 px-3 py-2 rounded-full text-sm sm:text-base font-semibold bg-[#2563EB] text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)] hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                data-export-ignore="true"
              >
                {exportingChartKey === 'leads-analysis' ? t('Exporting...') : t('Export')}
              </button>
              <button onClick={() => setLeadsAnalysisOpenMobile((v) => !v)} className="close-btn md:hidden flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            <div data-export-ignore="true" className={`${leadsAnalysisOpenMobile ? 'flex' : 'hidden'} md:flex flex-wrap items-center gap-2 mb-3 justify-end`}>
              <span className={`${isLight ? 'text-blue-700 font-semibold' : 'dark:text-gray-300'} text-sm`}>
                {leadsChartType === 'bar' ? t('Bar Chart') : leadsChartType === 'line' ? t('Line Chart') : t('Pie Chart')}
              </span>
              <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setLeadsChartType('bar')}
                  className={`group relative flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded-md transition-all duration-300 ease-in-out ${
                    leadsChartType === 'bar'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 scale-105'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105'
                  } border border-gray-200 dark:border-gray-600`}
                >
                  <RiBarChart2Line className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => setLeadsChartType('line')}
                  className={`group relative flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded-md transition-all duration-300 ease-in-out ${
                    leadsChartType === 'line'
                      ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/25 scale-105'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-600 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-105'
                  } border border-gray-200 dark:border-gray-600`}
                >
                  <RiLineChartLine className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => setLeadsChartType('pie')}
                  className={`group relative flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded-md transition-all duration-300 ease-in-out ${
                    leadsChartType === 'pie'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 scale-105'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-gray-600 hover:text-orange-600 dark:hover:text-orange-400 hover:scale-105'
                  } border border-gray-200 dark:border-gray-600`}
                >
                  <RiPieChartLine className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>

            <LeadsAnalysisChart
              data={analysisData.monthly}
              chartType={leadsChartType}
              filters={{ year: Number(normalizedLeadsAnalysisYear) }}
              legendLabel={t('Telesales Leads')}
              totalValue={stageCounts.total}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 mb-8">
          <div className="lg:col-span-3">
            <div className="p-4 glass-panel h-full overflow-auto rounded-lg shadow-md">
              <div className="section-header flex items-center w-full justify-between gap-2 mb-4">
                <h3 className={`flex-1 text-2xl font-bold text-primary ${isRtl ? 'text-right' : 'text-left'}`}>{t('Telesales Pipeline Analysis')}</h3>
                <button
                  type="button"
                  onClick={handleExportPipelinePdf}
                  disabled={exportingChartKey === 'pipeline-analysis'}
                  className="inline-flex items-center gap-3 px-3 py-2 rounded-full text-sm sm:text-base font-semibold bg-[#2563EB] text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)] hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  data-export-ignore="true"
                >
                  {exportingChartKey === 'pipeline-analysis' ? t('Exporting...') : t('Export')}
                </button>
                <button onClick={() => setPipelineAnalysisOpenMobile((v) => !v)} className="close-btn md:hidden flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              <div className={`${pipelineAnalysisOpenMobile ? 'block' : 'hidden'} md:block`} ref={pipelineAnalysisChartRef}>
                <PipelineAnalysis
                  selectedEmployee={effectiveEmployeeName}
                  selectedManager={selectedManager}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  exportMode={exportingChartKey === 'pipeline-analysis'}
                  rawDataOverride={telesalesPipelineRawData}
                  stagesOverride={telesalesStages}
                  workflowKey="telesales"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
