import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import DatePicker from 'react-datepicker'
import { FaChevronDown, FaClone, FaCopy, FaEnvelope, FaExchangeAlt, FaEye, FaFilter, FaHistory, FaList, FaPhone, FaPlus, FaSearch, FaTrash, FaUpload, FaUserCheck, FaUserTie, FaWhatsapp } from 'react-icons/fa'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../utils/api'
import { useAppState } from '../shared/context/AppStateProvider'
import { useStages } from '../hooks/useStages'
import { isTenantAdminUser, isSuperAdminUser } from '../services/leadPermissions'
import ImportLeadsModal from '../components/ImportLeadsModal'
import { ICON_MAP } from '../components/settings/IconSelector'
import { formatPhoneForDisplay, getPhoneLines } from '@shared/utils/phoneDisplay'
import { getDefaultDialCode, isMobileMaskEnabled } from '@shared/utils/crmPhone'
import SearchableSelect from '../components/SearchableSelect'
import AddActionModal from '../components/AddActionModal'
import EnhancedLeadDetailsModal from '../shared/components/EnhancedLeadDetailsModal'
import TelesalesBulkAssignModal from '../components/TelesalesBulkAssignModal'

function hasTelesalesPermission(user, permission) {
  if (isTenantAdminUser(user) || isSuperAdminUser(user)) return true
  const perms = user?.meta_data?.module_permissions?.Telesales
  return Array.isArray(perms) ? perms.includes(permission) : false
}

function hasExplicitTelesalesPermission(user, permission) {
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

function isTruthySetting(value) {
  if (value === true || value === 1) return true
  const normalized = String(value ?? '').toLowerCase().trim()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

const TELESALES_STAGE_DISPLAY_ORDER = [
  'fresh',
  'duplicate',
  'pending',
  'cold calls',
]

const MEET_ICON_URL = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><rect x='2' y='4' width='12' height='16' rx='3' fill='%23ffffff'/><rect x='2' y='4' width='12' height='4' rx='2' fill='%234285F4'/><rect x='2' y='4' width='4' height='16' rx='2' fill='%2334A853'/><rect x='10' y='4' width='4' height='16' rx='2' fill='%23FBBC05'/><rect x='2' y='16' width='12' height='4' rx='2' fill='%23EA4335'/><polygon points='14,9 22,5 22,19 14,15' fill='%2334A853'/></svg>"

function formatYmdLocal(date) {
  if (!date) return ''
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

function TransferControls({
  users,
  salesStages,
  assignmentMethod,
  setAssignmentMethod,
  assignedTo,
  setAssignedTo,
  stageId,
  setStageId,
  disabled,
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-300">
          Assignment Method
        </span>
        <select
          className="w-full rounded-lg border border-theme-border dark:border-gray-600 bg-transparent px-4 py-3 text-sm"
          value={assignmentMethod}
          onChange={(e) => setAssignmentMethod(e.target.value)}
          disabled={disabled}
        >
          <option value="direct">Direct assignee</option>
          <option value="rotation">Sales rotation</option>
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-300">
          Sales Entry Stage
        </span>
        <select
          className="w-full rounded-lg border border-theme-border dark:border-gray-600 bg-transparent px-4 py-3 text-sm"
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          disabled={disabled}
        >
          <option value="">Sales entry stage</option>
          {salesStages.map((stage) => (
            <option key={stage.id} value={stage.id}>{stage.name}</option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-300">
          Assignee
        </span>
        <select
          className="w-full rounded-lg border border-theme-border dark:border-gray-600 bg-transparent px-4 py-3 text-sm"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          disabled={disabled || assignmentMethod !== 'direct'}
        >
          <option value="">Assignee</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default function Telesales() {
  const { t, i18n } = useTranslation()
  const { theme: contextTheme, resolvedTheme } = useTheme()
  const theme = resolvedTheme || contextTheme
  const isLight = theme === 'light'
  const textColor = isLight ? 'text-black' : 'text-white'
  const tableHeaderBgClass = isLight ? 'bg-gray-100/90' : 'bg-slate-900/80'
  const pipelineTabSelectedClass = isLight
    ? 'bg-blue-600 text-white border-none'
    : 'bg-blue-600 text-white border-none shadow-lg shadow-blue-500/20'

  const navigate = useNavigate()
  const location = useLocation()
  const { user, company, crmSettings, activeModules } = useAppState()
  const { stages: telesalesStages } = useStages({ workflowKey: 'telesales', activeOnly: true })
  const currencyCode = crmSettings?.defaultCurrency || crmSettings?.default_currency || 'EGP'
  const maskMobileNumber = useMemo(() => isMobileMaskEnabled(crmSettings), [crmSettings])
  const defaultDialCode = useMemo(() => getDefaultDialCode(crmSettings, '+20'), [crmSettings?.defaultCountryCode])

  const [rows, setRows] = useState([])
  const [historicalRows, setHistoricalRows] = useState([])
  const [users, setUsers] = useState([])
  const [telesalesAssignees, setTelesalesAssignees] = useState([])
  const [salesAssignees, setSalesAssignees] = useState([])
  const [salesStages, setSalesStages] = useState([])
  const [summary, setSummary] = useState(null)
  const [disableCheck, setDisableCheck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [historicalLoading, setHistoricalLoading] = useState(false)
  const [transferingId, setTransferingId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [assignmentMethod, setAssignmentMethod] = useState('direct')
  const [assignedTo, setAssignedTo] = useState('')
  const [stageId, setStageId] = useState('')
  const [mode, setMode] = useState('operational')
  const [pageError, setPageError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [stageFilter, setStageFilter] = useState([])
  const [sourceFilter, setSourceFilter] = useState([])
  const [priorityFilter, setPriorityFilter] = useState([])
  const [projectFilter, setProjectFilter] = useState([])
  const [assigneeFilter, setAssigneeFilter] = useState([])
  const [createdByFilter, setCreatedByFilter] = useState([])
  const [managerFilter, setManagerFilter] = useState([])
  const [campaignFilter, setCampaignFilter] = useState([])
  const [countryFilter, setCountryFilter] = useState([])
  const [emailFilter, setEmailFilter] = useState('')
  const [expectedRevenueFilter, setExpectedRevenueFilter] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState([])
  const [assignedDateFrom, setAssignedDateFrom] = useState('')
  const [assignedDateTo, setAssignedDateTo] = useState('')
  const [lastActionDateFrom, setLastActionDateFrom] = useState('')
  const [lastActionDateTo, setLastActionDateTo] = useState('')
  const [actionDateFrom, setActionDateFrom] = useState('')
  const [actionDateTo, setActionDateTo] = useState('')
  const [creationDateFrom, setCreationDateFrom] = useState('')
  const [creationDateTo, setCreationDateTo] = useState('')
  const [sourcesList, setSourcesList] = useState([])
  const [projectsList, setProjectsList] = useState([])
  const [campaignsList, setCampaignsList] = useState([])
  const [countriesList, setCountriesList] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [pageSearch, setPageSearch] = useState('')
  const [totalRows, setTotalRows] = useState(0)
  const [historicalPage, setHistoricalPage] = useState(1)
  const [historicalLastPage, setHistoricalLastPage] = useState(1)
  const [historicalTotal, setHistoricalTotal] = useState(0)
  const [showImportModal, setShowImportModal] = useState(false)
  const [excelFile, setExcelFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSummary, setImportSummary] = useState(null)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [showAddActionModal, setShowAddActionModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showBulkTransferPanel, setShowBulkTransferPanel] = useState(false)
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false)
  const [assignModalError, setAssignModalError] = useState('')
  const [assignModalSubmitting, setAssignModalSubmitting] = useState(false)

  const moduleEnabled = Array.isArray(activeModules) && activeModules.includes('telesales')
  const canShow = useMemo(() => hasTelesalesPermission(user, 'showModule'), [user])
  const canTransfer = useMemo(() => hasTelesalesPermission(user, 'transferToSales'), [user])
  const canBulkTransfer = useMemo(() => hasTelesalesPermission(user, 'bulkTransferToSales'), [user])
  const canAssignLead = useMemo(() => hasTelesalesPermission(user, 'assignLead'), [user])
  const canDeleteLead = useMemo(() => hasTelesalesPermission(user, 'deleteLead'), [user])
  const canViewDashboard = useMemo(() => hasTelesalesPermission(user, 'viewDashboard'), [user])
  const canDisableModule = useMemo(() => hasTelesalesPermission(user, 'disableModule'), [user])
  const canViewHistorical = useMemo(() => hasTelesalesPermission(user, 'viewHistoricalRecords'), [user])
  const canCreateLead = useMemo(() => hasTelesalesPermission(user, 'createLead'), [user])
  const canImportLeads = canCreateLead
  const normalizedRole = useMemo(() => normalizeRoleValue(user?.role || user?.job_title), [user?.job_title, user?.role])
  const isTelesalesAgent = normalizedRole === 'telesales agent'
  const isDuplicateFeatureEnabled = isTruthySetting(crmSettings?.duplicationSystem)
  const canViewDuplicateDisplay = isDuplicateFeatureEnabled && hasExplicitTelesalesPermission(user, 'viewDuplicateLeads')
  const canViewPendingDisplay = !isTelesalesAgent

  const historicalOnly = !moduleEnabled || (!canShow && canViewHistorical)
  const isMyLeadsView = location.pathname.startsWith('/telesales/my-leads')
  const isReferralView = location.pathname.startsWith('/telesales/referral')
  const isHistoricalRoute = location.pathname.startsWith('/telesales/historical')
  const isRtl = String(i18n.language || '').startsWith('ar')
  const isGeneralTenant = String(company?.company_type || '').toLowerCase() === 'general'

  const formatMoney = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '-'
    try {
      return new Intl.NumberFormat('en-EG', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(n)
    } catch {
      return `${n.toLocaleString()} ${currencyCode}`
    }
  }

  const getLeadDefaultCountryCode = (lead) =>
    lead?.phone_country ||
    lead?.phoneCountry ||
    lead?.meta_data?.phone_country ||
    lead?.metaData?.phone_country ||
    lead?.meta_data?.phoneCountry ||
    lead?.metaData?.phoneCountry ||
    defaultDialCode

  const getLeadPhoneEntries = (lead) => {
    const defaultCountryCode = getLeadDefaultCountryCode(lead)
    const values = [
      lead?.phone,
      lead?.mobile,
      lead?.other_mobile,
      lead?.otherMobile,
      lead?.other_phone,
      lead?.otherPhone,
      lead?.meta_data?.other_mobile,
      lead?.meta_data?.other_phone,
      lead?.metaData?.other_mobile,
      lead?.metaData?.other_phone,
    ]

    const seen = new Set()
    const entries = []

    values.forEach((value) => {
      const raw = String(value || '').trim()
      if (!raw) return

      getPhoneLines(raw, {
        showFull: !maskMobileNumber,
        defaultCountryCode,
      }).forEach((line) => {
        const digitsKey = String(line?.digits || '').trim()
        const displayKey = String(line?.display || '').trim()
        const key = digitsKey || displayKey
        if (!key || seen.has(key)) return
        seen.add(key)
        entries.push({
          display: displayKey || formatPhoneForDisplay(raw, { showFull: !maskMobileNumber, defaultCountryCode }),
          digits: digitsKey,
        })
      })
    })

    return entries
  }

  const copyPhoneToClipboard = async (phone) => {
    const value = String(phone || '').trim()
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'success',
          message: isRtl ? 'تم نسخ الرقم' : 'Phone copied',
        },
      }))
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'error',
          message: isRtl ? 'تعذر نسخ الرقم' : 'Could not copy phone',
        },
      }))
    }
  }

  const getPriorityColor = (priority) => {
    switch (String(priority || '').toLowerCase()) {
      case 'hot': return 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200'
      case 'high': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'low': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
    }
  }

  useEffect(() => {
    setSelectedIds([])
  }, [currentPage, stageFilter, searchTerm, sourceFilter, priorityFilter, projectFilter, assigneeFilter, createdByFilter, managerFilter, campaignFilter, countryFilter, emailFilter, expectedRevenueFilter, actionTypeFilter, assignedDateFrom, assignedDateTo, lastActionDateFrom, lastActionDateTo, actionDateFrom, actionDateTo, creationDateFrom, creationDateTo, isMyLeadsView, isReferralView, isHistoricalRoute])

  useEffect(() => {
    if (selectedIds.length === 0) {
      setShowBulkTransferPanel(false)
      setShowBulkAssignModal(false)
    }
  }, [selectedIds.length])

  useEffect(() => {
    if (historicalOnly || isHistoricalRoute) {
      setMode('historical')
    } else {
      setMode('operational')
    }
  }, [historicalOnly, isHistoricalRoute])

  const normalizeUsers = (payload) => {
    if (Array.isArray(payload?.data)) return payload.data
    if (Array.isArray(payload)) return payload
    return []
  }

  const normalizeArrayFilter = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean)
    if (value === null || value === undefined || value === '') return []
    return [value].filter(Boolean)
  }

  const buildOperationalParams = (scopeOverride = null) => {
    const scope = scopeOverride || (isMyLeadsView ? 'my' : (isReferralView ? 'referral' : 'all'))

    return {
      scope,
      page: currentPage,
      per_page: perPage,
      ...(isMyLeadsView ? { assigned_to: user?.id } : {}),
      ...(isReferralView ? { referral_only: 1 } : {}),
      ...(stageFilter.length > 0 ? { display_stage: stageFilter } : {}),
      ...(sourceFilter.length > 0 ? { source: sourceFilter } : {}),
      ...(priorityFilter.length > 0 ? { priority: priorityFilter } : {}),
      ...(projectFilter.length > 0 ? { project: projectFilter } : {}),
      ...(assigneeFilter.length > 0 ? { assigned_to_filter: assigneeFilter } : {}),
      ...(createdByFilter.length > 0 ? { created_by_filter: createdByFilter } : {}),
      ...(managerFilter.length > 0 ? { manager_id: managerFilter } : {}),
      ...(campaignFilter.length > 0 ? { campaign: campaignFilter } : {}),
      ...(countryFilter.length > 0 ? { country: countryFilter } : {}),
      ...(emailFilter.trim() ? { email: emailFilter.trim() } : {}),
      ...(expectedRevenueFilter !== '' ? { estimated_value_min: expectedRevenueFilter } : {}),
      ...(actionTypeFilter.length > 0 ? { action_type: actionTypeFilter } : {}),
      ...(assignedDateFrom ? { assigned_date_from: assignedDateFrom } : {}),
      ...(assignedDateTo ? { assigned_date_to: assignedDateTo } : {}),
      ...(lastActionDateFrom ? { last_action_date_from: lastActionDateFrom } : {}),
      ...(lastActionDateTo ? { last_action_date_to: lastActionDateTo } : {}),
      ...(actionDateFrom ? { action_date_from: actionDateFrom } : {}),
      ...(actionDateTo ? { action_date_to: actionDateTo } : {}),
      ...(creationDateFrom ? { created_from: creationDateFrom } : {}),
      ...(creationDateTo ? { created_to: creationDateTo } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    }
  }

  const applyPaginator = (payload, historical = false) => {
    const dataRows = Array.isArray(payload?.data) ? payload.data : []
    if (historical) {
      setHistoricalRows(dataRows)
      setHistoricalPage(Number(payload?.current_page || 1))
      setHistoricalLastPage(Number(payload?.last_page || 1))
      setHistoricalTotal(Number(payload?.total || dataRows.length || 0))
      return
    }

    setRows(dataRows)
    setCurrentPage(Number(payload?.current_page || 1))
    setLastPage(Number(payload?.last_page || 1))
    setPerPage(Number(payload?.per_page || 20))
    setTotalRows(Number(payload?.total || dataRows.length || 0))
  }

  const loadOperational = async () => {
    const scope = isMyLeadsView ? 'my' : (isReferralView ? 'referral' : 'all')
    const telesalesParams = buildOperationalParams(scope)

    const shouldLoadSalesTransferStages = (canTransfer || canBulkTransfer) && selectedIds.length > 0

    const [leadRes, salesStageRes, userRes, telesalesAssigneeRes, salesAssigneeRes, sourceRes, projectRes, campaignRes, countryRes] = await Promise.all([
      api.get('/api/telesales/leads', { params: telesalesParams }),
      shouldLoadSalesTransferStages
        ? api.get('/api/stages', { params: { workflow_key: 'sales', active: 1 } })
        : Promise.resolve(null),
      api.get('/api/users'),
      api.get('/api/telesales/assignees', { params: { workflow: 'telesales' } }).catch(() => null),
      api.get('/api/telesales/assignees', { params: { workflow: 'sales' } }).catch(() => null),
      api.get('/api/sources?active=1').catch(() => null),
      api.get(isGeneralTenant ? '/api/items?all=1' : '/api/projects').catch(() => null),
      api.get('/api/campaigns').catch(() => null),
      api.get('/api/countries?active=1').catch(() => null),
    ])

    let summaryRes = null
    let disableCheckRes = null
    try {
      ;[summaryRes, disableCheckRes] = await Promise.all([
        canViewDashboard ? api.get('/api/telesales/dashboard-summary', {
          params: {
            ...buildOperationalParams(scope),
          }
        }) : Promise.resolve(null),
        canDisableModule ? api.get('/api/telesales/module-disable-check') : Promise.resolve(null),
      ])
    } catch {
      summaryRes = null
      disableCheckRes = null
    }

    applyPaginator(leadRes?.data, false)
    setSalesStages(Array.isArray(salesStageRes?.data) ? salesStageRes.data : [])
    setUsers(normalizeUsers(userRes?.data))
    setTelesalesAssignees(normalizeUsers(telesalesAssigneeRes?.data))
    setSalesAssignees(normalizeUsers(salesAssigneeRes?.data))
    setSourcesList(Array.isArray(sourceRes?.data?.data) ? sourceRes.data.data : (Array.isArray(sourceRes?.data) ? sourceRes.data : []))
    setProjectsList(Array.isArray(projectRes?.data?.data) ? projectRes.data.data : (Array.isArray(projectRes?.data) ? projectRes.data : []))
    setCampaignsList(Array.isArray(campaignRes?.data?.data) ? campaignRes.data.data : (Array.isArray(campaignRes?.data) ? campaignRes.data : []))
    setCountriesList(Array.isArray(countryRes?.data?.data) ? countryRes.data.data : (Array.isArray(countryRes?.data) ? countryRes.data : []))
    setSummary(summaryRes?.data || null)
    setDisableCheck(disableCheckRes?.data || null)
  }

  const loadHistorical = async () => {
    setHistoricalLoading(true)
    try {
      const res = await api.get('/api/telesales/historical', {
        params: {
          page: historicalPage,
          per_page: perPage,
          ...(searchTerm ? { search: searchTerm } : {}),
        }
      })
      applyPaginator(res?.data, true)
      setPageError('')
    } catch (error) {
      setPageError(error?.response?.data?.message || 'Failed to load telesales records.')
      setHistoricalRows([])
    } finally {
      setHistoricalLoading(false)
    }
  }

  const load = async () => {
    setLoading(true)
    setPageError('')

    try {
      if (moduleEnabled && canShow) {
        await loadOperational()
      } else if (canViewHistorical) {
        await loadHistorical()
      } else {
        setPageError('You do not have access to this module.')
      }
    } catch (error) {
      setPageError(error?.response?.data?.message || 'Failed to load telesales module.')
      if (canViewHistorical && !(moduleEnabled && canShow)) {
        await loadHistorical()
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [moduleEnabled, canShow, canViewHistorical, canViewDashboard, canDisableModule, isMyLeadsView, isReferralView, isHistoricalRoute, currentPage, historicalPage, perPage, searchTerm, JSON.stringify(stageFilter), JSON.stringify(sourceFilter), JSON.stringify(priorityFilter), JSON.stringify(projectFilter), JSON.stringify(assigneeFilter), JSON.stringify(createdByFilter), JSON.stringify(managerFilter), JSON.stringify(campaignFilter), JSON.stringify(countryFilter), emailFilter, expectedRevenueFilter, JSON.stringify(actionTypeFilter), assignedDateFrom, assignedDateTo, lastActionDateFrom, lastActionDateTo, actionDateFrom, actionDateTo, creationDateFrom, creationDateTo])

  const pageTitle = useMemo(() => {
    if (isHistoricalRoute || mode === 'historical') return 'History(deleted)'
    if (isReferralView) return 'Referal Telesales Leads'
    if (isMyLeadsView) return 'My Telesales Leads'
    return 'All Telesales Leads'
  }, [isHistoricalRoute, isMyLeadsView, isReferralView, mode])

  const canSubmitTransfer = useMemo(() => {
    if (!stageId) return false
    if (assignmentMethod === 'direct' && !assignedTo) return false
    return true
  }, [assignedTo, assignmentMethod, stageId])

  const stageCounts = useMemo(() => {
    const counts = { total: Number(summary?.total_leads || totalRows || 0) }
    ;(summary?.by_stage || []).forEach((item) => {
      const key = normalizeStageKey(item?.stage_key || item?.stage_name)
      if (!key) return
      counts[key] = Number(item.count || 0)
    })
    if (typeof summary?.duplicate === 'number') counts.duplicate = Number(summary.duplicate || 0)
    if (typeof summary?.pending === 'number') counts.pending = Number(summary.pending || 0)
    return counts
  }, [summary, totalRows])

  const handleTransfer = async (leadId) => {
    if (!canSubmitTransfer) return
    setTransferingId(leadId)
    try {
      await api.post(`/api/telesales/leads/${leadId}/transfer-to-sales`, {
        assignment_method: assignmentMethod,
        assigned_to: assignmentMethod === 'direct' ? Number(assignedTo) : null,
        sales_entry_stage_id: Number(stageId),
      })
      setSelectedIds((prev) => prev.filter((id) => id !== leadId))
      await loadOperational()
    } finally {
      setTransferingId(null)
    }
  }

  const handleToggleSelect = (value) => {
    const sourceRows = mode === 'historical' ? historicalRows : rows
    if (value === 'all') {
      setSelectedIds((prev) => (prev.length === sourceRows.length ? [] : sourceRows.map((lead) => lead.id)))
      return
    }

    setSelectedIds((prev) => (
      prev.includes(value)
        ? prev.filter((id) => id !== value)
        : [...prev, value]
    ))
  }

  const handleBulkTransfer = async (allActive = false) => {
    if (!canSubmitTransfer) return
    if (!allActive && selectedIds.length === 0) return

    setBulkBusy(true)
    try {
      await api.post('/api/telesales/leads/bulk-transfer-to-sales', {
        all_active: allActive,
        lead_ids: allActive ? [] : selectedIds,
        assignment_method: assignmentMethod,
        assigned_to: assignmentMethod === 'direct' ? Number(assignedTo) : null,
        sales_entry_stage_id: Number(stageId),
      })
      setSelectedIds([])
      await loadOperational()
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkAssign = async (assignData) => {
    if (!assignData?.userId || selectedIds.length === 0) {
      setAssignModalError('Please select a telesales assignee.')
      return false
    }

    setAssignModalSubmitting(true)
    setAssignModalError('')
    try {
      await api.post('/api/telesales/leads/bulk-assign', {
        lead_ids: selectedIds,
        assigned_to: Number(assignData.userId),
        assign_role: assignData.assignRole || 'sales',
        method: assignData.method || 'fresh',
        options: assignData.options || {},
      })

      setSelectedIds([])
      setShowBulkAssignModal(false)
      await loadOperational()
      return true
    } catch (error) {
      const message = error?.response?.data?.message
        || Object.values(error?.response?.data?.errors || {}).flat().filter(Boolean).join(' | ')
        || 'Failed to assign telesales leads.'
      setAssignModalError(message)
      return false
    } finally {
      setAssignModalSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    const confirmed = window.confirm(isRtl ? 'هل تريد حذف الليدز المحددة؟' : 'Delete selected telesales leads?')
    if (!confirmed) return

    setBulkBusy(true)
    try {
      await api.post('/api/leads/bulk-delete', {
        ids: selectedIds,
      })

      setSelectedIds([])
      setShowBulkAssignModal(false)
      setShowBulkTransferPanel(false)
      await loadOperational()
    } catch (error) {
      const message = error?.response?.data?.message
        || Object.values(error?.response?.data?.errors || {}).flat().filter(Boolean).join(' | ')
        || 'Failed to delete telesales leads.'
      window.alert(message)
    } finally {
      setBulkBusy(false)
    }
  }

  const resetFilters = () => {
    setSearchTerm('')
    setStageFilter([])
    setSourceFilter([])
    setPriorityFilter([])
    setProjectFilter([])
    setAssigneeFilter([])
    setCreatedByFilter([])
    setManagerFilter([])
    setCampaignFilter([])
    setCountryFilter([])
    setEmailFilter('')
    setExpectedRevenueFilter('')
    setActionTypeFilter([])
    setAssignedDateFrom('')
    setAssignedDateTo('')
    setLastActionDateFrom('')
    setLastActionDateTo('')
    setActionDateFrom('')
    setActionDateTo('')
    setCreationDateFrom('')
    setCreationDateTo('')
    setCurrentPage(1)
    setHistoricalPage(1)
  }

  const telesalesAgentOptions = useMemo(() => {
    return telesalesAssignees
      .map((entry) => ({ value: String(entry.id), label: entry.name }))
  }, [telesalesAssignees])

  const createdByOptions = useMemo(
    () => users.map((entry) => ({ value: String(entry.id), label: entry.name })),
    [users]
  )

  const managerOptions = useMemo(() => {
    const allowedRoles = new Set(['telesales manager', 'telesales team leader', 'tenant admin', 'admin'])
    return users
      .filter((entry) => allowedRoles.has(normalizeRoleValue(entry?.role || entry?.job_title)))
      .map((entry) => ({ value: String(entry.id), label: entry.name }))
  }, [users])

  const toLocalYmd = (date) => {
    if (!date) return ''
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - (offset * 60 * 1000))
    return localDate.toISOString().split('T')[0]
  }

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const readRowValue = (row, aliases) => {
    const aliasSet = new Set((aliases || []).map(normalizeKey))
    const matchKey = Object.keys(row || {}).find((key) => aliasSet.has(normalizeKey(key)))
    return matchKey ? row[matchKey] : ''
  }

  const normalizeExcelDate = (value) => {
    if (value === null || value === undefined || value === '') return ''

    if (typeof value === 'number' && Number.isFinite(value)) {
      const serialDate = XLSX.SSF.parse_date_code(value)
      if (!serialDate) return ''
      const jsDate = new Date(Date.UTC(serialDate.y, serialDate.m - 1, serialDate.d))
      return toLocalYmd(jsDate)
    }

    const raw = String(value).trim()
    if (!raw) return ''
    const asDate = new Date(raw)
    return Number.isNaN(asDate.getTime()) ? raw : toLocalYmd(asDate)
  }

  const extractImportErrorMessage = (err) => {
    const responseData = err?.response?.data || {}
    const directMessage =
      String(responseData?.error || '').trim() ||
      String(responseData?.message || '').trim()

    if (directMessage) return directMessage

    if (responseData?.errors && typeof responseData.errors === 'object') {
      const flattened = Object.values(responseData.errors)
        .flat()
        .map((item) => String(item || '').trim())
        .filter(Boolean)

      if (flattened.length > 0) {
        return flattened.join(' | ')
      }
    }

    if (typeof err?.message === 'string' && err.message.trim()) {
      return err.message.trim()
    }

    const status = err?.response?.status
    if (status) {
      return `Import failed with HTTP ${status}`
    }

    return ''
  }

  const parseExcelToTelesalesLeads = async (file) => {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    const nowDateStr = toLocalYmd(new Date())

    const headerMap = {
      name: ['name', 'lead name', 'client name', 'customer name', 'الاسم'],
      email: ['email', 'البريد', 'البريد الالكتروني'],
      phone: ['phone', 'mobile', 'phone number', 'mobile number', 'الهاتف', 'الموبايل'],
      phoneCountry: ['phone country', 'country code', 'phone_country', 'كود الدولة'],
      otherMobile: ['other mobile', 'other phone', 'secondary phone', 'other_mobile', 'رقم اضافي'],
      company: ['company', 'company name', 'الشركة'],
      stage: ['stage', 'status stage', 'المرحلة'],
      status: ['status', 'الحالة'],
      priority: ['priority', 'الاولوية'],
      source: ['source', 'lead source', 'المصدر'],
      project: ['project', 'المشروع'],
      item: ['item', 'الصنف'],
      assignedTo: ['sales person', 'assigned to', 'assignedto', 'المسؤول', 'اسم البائع'],
      creationDate: ['creation date', 'created at', 'creation_date', 'تاريخ الانشاء'],
      firstActionDate: ['first action date', 'last action date', 'action date', 'تاريخ اول اكشن'],
      nextActionDate: ['next action date', 'next_action_date', 'تاريخ الاكشن القادم'],
      nextActionTime: ['next action time', 'next_action_time', 'وقت الاكشن القادم'],
      estimatedValue: ['estimated value', 'estimatedvalue', 'القيمة المتوقعة'],
      probability: ['probability', 'الاحتمالية'],
      cancelReason: ['cancel reason', 'cancel_reason', 'سبب الالغاء'],
      notes: ['notes', 'ملاحظات'],
      comment: ['comment', 'comments', 'تعليق'],
      lastContact: ['last contact', 'اخر تواصل'],
    }

    return rows.map((row) => {
      const creationDate = normalizeExcelDate(readRowValue(row, headerMap.creationDate))
      const firstActionDate = normalizeExcelDate(readRowValue(row, headerMap.firstActionDate))
      const nextActionDate = normalizeExcelDate(readRowValue(row, headerMap.nextActionDate))

      return {
        id: Date.now() + Math.random(),
        name: String(readRowValue(row, headerMap.name) || '').trim(),
        email: String(readRowValue(row, headerMap.email) || '').trim(),
        phone: String(readRowValue(row, headerMap.phone) || '').trim(),
        phone_country: String(readRowValue(row, headerMap.phoneCountry) || '').trim(),
        otherMobile: String(readRowValue(row, headerMap.otherMobile) || '').trim(),
        company: String(readRowValue(row, headerMap.company) || '').trim(),
        stage: String(readRowValue(row, headerMap.stage) || '').trim(),
        status: String(readRowValue(row, headerMap.status) || '').trim(),
        priority: String(readRowValue(row, headerMap.priority) || 'medium').toLowerCase().trim(),
        source: String(readRowValue(row, headerMap.source) || '').trim(),
        project: String(readRowValue(row, headerMap.project) || '').trim(),
        item: String(readRowValue(row, headerMap.item) || '').trim(),
        assignedTo: String(readRowValue(row, headerMap.assignedTo) || '').trim(),
        creation_date: creationDate,
        first_action_date: firstActionDate,
        createdAt: creationDate || nowDateStr,
        lastContact: String(readRowValue(row, headerMap.lastContact) || nowDateStr).trim(),
        estimatedValue: Number(readRowValue(row, headerMap.estimatedValue)) || 0,
        probability: Number(readRowValue(row, headerMap.probability)) || 0,
        next_action_date: nextActionDate,
        next_action_time: String(readRowValue(row, headerMap.nextActionTime) || '').trim(),
        cancel_reason: String(readRowValue(row, headerMap.cancelReason) || '').trim(),
        notes: String(readRowValue(row, headerMap.notes) || '').trim(),
        comment: String(readRowValue(row, headerMap.comment) || '').trim(),
      }
    })
  }

  const handleTelesalesImport = async () => {
    if (!excelFile) {
      setImportError('Please select an Excel file first.')
      return
    }

    setImporting(true)
    setImportError('')
    setImportSummary(null)

    try {
      const newLeads = await parseExcelToTelesalesLeads(excelFile)
      const fileName = excelFile?.name || 'telesales_import.xlsx'
      const phoneCountryHint = String(newLeads?.find?.((lead) => String(lead?.phone_country || '').trim())?.phone_country || '').trim()

      const response = await api.post('/api/import-jobs', {
        module: 'leads',
        file_name: fileName,
        rows: newLeads,
        mapping: {},
        phone_country: phoneCountryHint || undefined,
        options: {
          workflow_key: 'telesales',
        },
      })

      const jobId = Number(response.data?.job_id || 0) || null
      const summary = response.data?.summary || {}
      let jobRows = []

      try {
        if (jobId) {
          const rowsRes = await api.get(`/api/import-jobs/${jobId}/rows`, { params: { per_page: 200 } })
          jobRows = Array.isArray(rowsRes.data?.data) ? rowsRes.data.data : []
        }
      } catch {
        jobRows = []
      }

      setImportSummary({
        jobId,
        jobRows,
        added: Number(summary?.success_rows ?? 0) + Number(summary?.duplicate_rows ?? 0),
        duplicates: Number(summary?.duplicate_rows ?? 0),
        duplicateExisting: jobRows.filter((row) => row?.reason_code === 'duplicate_existing').length,
        duplicateInFile: jobRows.filter((row) => row?.reason_code === 'duplicate_in_file').length,
        skipped: Number(summary?.skipped_rows ?? 0),
        failed: Number(summary?.failed_rows ?? 0),
        warnings: Number(summary?.warning_rows ?? 0),
        errors: jobRows
          .filter((row) => row?.status === 'failed' || row?.status === 'skipped')
          .map((row) => `Row ${row?.row_number || '-'}: ${row?.reason_message || 'Import issue'}`),
      })

      await loadOperational()
    } catch (error) {
      setImportError(extractImportErrorMessage(error) || 'Failed to import telesales leads.')
    } finally {
      setImporting(false)
    }
  }

  const stageCards = useMemo(() => telesalesStages
    .filter((stage) => {
      const key = normalizeStageKey(stage?.name)
      if (key === 'duplicate') return !isMyLeadsView && canViewDuplicateDisplay
      if (key === 'pending') return !isMyLeadsView && canViewPendingDisplay
      return true
    })
    .map((stage) => {
      const key = normalizeStageKey(stage?.name)
      return {
        id: stage.id || key,
        key,
        name: stage.name,
        icon: stage.icon || 'BarChart2',
        count: stageCounts[key] || 0,
      }
    })
    .sort((a, b) => {
      const aIndex = TELESALES_STAGE_DISPLAY_ORDER.indexOf(a.key)
      const bIndex = TELESALES_STAGE_DISPLAY_ORDER.indexOf(b.key)
      const aPriority = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex
      const bPriority = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex

      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }

      if (aPriority !== Number.MAX_SAFE_INTEGER) {
        return 0
      }

      return String(a.name || '').localeCompare(String(b.name || ''))
    }), [canViewDuplicateDisplay, canViewPendingDisplay, isMyLeadsView, stageCounts, telesalesStages])

  const getLeadDisplayStage = (lead) => lead.display_stage || lead.stageRelation?.name || lead.stage || '-'
  const getLeadAssignedName = (lead) => lead.assignedAgent?.name || lead.assigned_to?.name || lead.assignedTo?.name || lead.sales_person_name || '-'
  const getLeadProjectName = (lead) => lead.project?.name || lead.project_name || lead.project || lead.item?.name || lead.item_name || lead.item || '-'
  const getLeadLastComment = (lead) => (
    lead?.latest_action?.description ||
    lead?.latest_action?.notes ||
    lead?.last_comment ||
    lead?.comment ||
    lead?.notes ||
    '-'
  )
  const isDuplicateLead = (lead) => String(getLeadDisplayStage(lead) || '').toLowerCase().includes('duplicate') || String(lead?.status || '').toLowerCase() === 'duplicate'

  const paginatedRows = mode === 'historical' ? historicalRows : rows
  const activePage = mode === 'historical' ? historicalPage : currentPage
  const activeLastPage = mode === 'historical' ? historicalLastPage : lastPage
  const activeTotal = mode === 'historical' ? historicalTotal : totalRows

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">{t('Loading...')}</div>
  }

  if (pageError && !canViewHistorical && !(moduleEnabled && canShow)) {
    return <div className="p-6 text-sm text-red-600">{pageError}</div>
  }

  return (
    <div className={`px-2 max-[480px]:px-1 py-4 md:px-6 md:py-6 min-h-screen ${textColor}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="p-4 flex justify-between items-center gap-4 mb-6">
        <div className={`relative inline-flex items-center ${isRtl ? 'flex-row-reverse' : ''} gap-2`}>
          <h1
            className={`page-title text-2xl md:text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2 ${isRtl ? 'text-right' : 'text-left'}`}
            style={{ textAlign: isRtl ? 'right' : 'left', color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            {t(pageTitle)}
          </h1>
          <span
            aria-hidden
            className="absolute block h-[1px] rounded bg-gradient-to-r from-blue-500 via-cyan-500 to-transparent"
            style={{ width: 'calc(100% + 8px)', left: isRtl ? 'auto' : '-4px', right: isRtl ? '-4px' : 'auto', bottom: '-4px' }}
          ></span>
        </div>

        <div className={`flex items-center gap-2 max-[480px]:gap-1 flex-nowrap ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
          {moduleEnabled && canShow && canImportLeads && mode === 'operational' && (
            <button
              onClick={() => {
                setImportError('')
                setImportSummary(null)
                setShowImportModal(true)
              }}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none gap-2 max-[480px]:px-2 max-[480px]:py-1.5 max-[480px]:h-8 max-[480px]:gap-1 max-[480px]:text-xs whitespace-nowrap"
            >
              <FaUpload className="w-3 h-3 text-white" />
              <span className="text-white">{t('Import Telesales Leads')}</span>
            </button>
          )}
          {moduleEnabled && canShow && canCreateLead && mode === 'operational' && (
            <button
              onClick={() => navigate('/telesales/new')}
              className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none gap-2 max-[480px]:px-2 max-[480px]:py-1.5 max-[480px]:h-8 max-[480px]:gap-1 max-[480px]:text-xs whitespace-nowrap"
            >
              <FaPlus className="w-3 h-3 text-white" />
              <span className="text-white">{t('Add Telesales Lead')}</span>
            </button>
          )}

        </div>
      </div>

      <div className="glass-panel rounded-2xl p-3 mb-6 filters-compact">
        <div className="flex justify-between items-center mb-3">
          <h2 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
            <FaFilter size={16} className="text-blue-500 dark:text-blue-400" /> {t('Filters')}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAllFilters((prev) => !prev)} className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
              {showAllFilters ? t('Hide ') : t('Show ')}
              <FaChevronDown size={12} className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button
              onClick={resetFilters}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {t('Reset')}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                <FaSearch size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Search')}
              </label>
              <input
                type="text"
                placeholder={t('Search leads...')}
                value={searchTerm}
                onChange={(e) => {
                  setCurrentPage(1)
                  setHistoricalPage(1)
                  setSearchTerm(e.target.value)
                }}
                className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg ${textColor} text-sm font-medium dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
              />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">⌁</span>
                {t('Source')}
              </label>
              <SearchableSelect
                value={sourceFilter}
                multiple={true}
                onChange={(value) => {
                  setCurrentPage(1)
                  setSourceFilter(normalizeArrayFilter(value))
                }}
                options={sourcesList.map((source) => ({ value: source.name, label: source.name }))}
                placeholder={t('All')}
                isRTL={isRtl}
              />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">!</span>
                {t('Priority')}
              </label>
              <SearchableSelect
                value={priorityFilter}
                multiple={true}
                onChange={(value) => {
                  setCurrentPage(1)
                  setPriorityFilter(normalizeArrayFilter(value))
                }}
                options={[
                  { value: 'hot', label: t('Hot') },
                  { value: 'high', label: t('High') },
                  { value: 'medium', label: t('Medium') },
                  { value: 'low', label: t('Low') },
                ]}
                placeholder={t('All')}
                isRTL={isRtl}
              />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">▣</span>
                {isGeneralTenant ? t('Item') : t('Project')}
              </label>
              <SearchableSelect
                value={projectFilter}
                multiple={true}
                onChange={(value) => {
                  setCurrentPage(1)
                  setProjectFilter(normalizeArrayFilter(value))
                }}
                options={projectsList
                  .map((project) => ({
                    value: String(project.id ?? ''),
                    label: project.name || project.title || project.item_name || '-',
                  }))
                  .filter((option) => option.value && option.label)}
                placeholder={t('All')}
                isRTL={isRtl}
              />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">≡</span>
                {t('Stage')}
              </label>
              <SearchableSelect
                value={stageFilter}
                multiple={true}
                onChange={(value) => {
                  setCurrentPage(1)
                  setStageFilter(normalizeArrayFilter(value))
                }}
                options={stageCards.map((stage) => ({
                  value: stage.key,
                  label: stage.name,
                }))}
                placeholder={t('All')}
                isRTL={isRtl}
              />
            </div>
          </div>

          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showAllFilters ? 'max-h-[960px] opacity-100 pt-3' : 'max-h-0 opacity-0'}`}>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">◔</span>
                  {t('Manager')}
                </label>
                <SearchableSelect
                  value={managerFilter}
                  multiple={true}
                  onChange={(value) => {
                    setCurrentPage(1)
                    setManagerFilter(normalizeArrayFilter(value))
                  }}
                  options={managerOptions}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">👤</span>
                  {t('Telesales Agent')}
                </label>
                <SearchableSelect
                  value={assigneeFilter}
                  multiple={true}
                  onChange={(value) => {
                    setCurrentPage(1)
                    setAssigneeFilter(normalizeArrayFilter(value))
                  }}
                  options={telesalesAgentOptions}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">＋</span>
                  {t('Created By')}
                </label>
                <SearchableSelect
                  value={createdByFilter}
                  multiple={true}
                  onChange={(value) => {
                    setCurrentPage(1)
                    setCreatedByFilter(normalizeArrayFilter(value))
                  }}
                  options={createdByOptions}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">◌</span>
                  {t('Campaign')}
                </label>
                <SearchableSelect
                  value={campaignFilter}
                  multiple={true}
                  onChange={(value) => {
                    setCurrentPage(1)
                    setCampaignFilter(normalizeArrayFilter(value))
                  }}
                  options={campaignsList.map((campaign) => ({ value: campaign.name, label: campaign.name }))}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">⌖</span>
                  {t('Country')}
                </label>
                <SearchableSelect
                  value={countryFilter}
                  multiple={true}
                  onChange={(value) => {
                    setCurrentPage(1)
                    setCountryFilter(normalizeArrayFilter(value))
                  }}
                  options={countriesList.map((country) => ({ value: country.name_en, label: isRtl ? (country.name_ar || country.name_en) : country.name_en })).filter((option) => option.value && option.label)}
                  placeholder={t('All')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <FaEnvelope size={12} className="text-blue-500 dark:text-blue-400" />
                  {t('Email')}
                </label>
                <input
                  type="text"
                  placeholder={t('Search email...')}
                  value={emailFilter}
                  onChange={(e) => {
                    setCurrentPage(1)
                    setEmailFilter(e.target.value)
                  }}
                  className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg ${textColor} text-sm font-medium dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <span className="inline-flex h-3 w-3 items-center justify-center text-blue-500 dark:text-blue-400">₤</span>
                  {t('Expected Revenue')}
                </label>
                <input
                  type="number"
                  placeholder={t('Enter minimum value...')}
                  value={expectedRevenueFilter}
                  onChange={(e) => {
                    setCurrentPage(1)
                    setExpectedRevenueFilter(e.target.value)
                  }}
                  className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg ${textColor} text-sm font-medium dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
                  <FaPhone size={12} className="text-blue-500 dark:text-blue-400" />
                  {t('Action Type')}
                </label>
                <SearchableSelect
                  value={actionTypeFilter}
                  multiple={true}
                  onChange={(value) => {
                    setCurrentPage(1)
                    setActionTypeFilter(normalizeArrayFilter(value))
                  }}
                  options={[
                    { value: 'call', label: t('Call') },
                    { value: 'whatsapp', label: t('WhatsApp') },
                    { value: 'email', label: t('Email') },
                    { value: 'meeting', label: t('Meeting') },
                    { value: 'sms', label: t('SMS') },
                    { value: 'note', label: t('Note') },
                  ]}
                  placeholder={t('Action Types')}
                  isRTL={isRtl}
                />
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>{t('Assign Date')}</label>
                <div className="w-full">
                  <DatePicker
                    popperContainer={({ children }) => createPortal(children, document.body)}
                    selectsRange
                    startDate={assignedDateFrom ? new Date(assignedDateFrom) : null}
                    endDate={assignedDateTo ? new Date(assignedDateTo) : null}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    yearDropdownItemNumber={12}
                    onChange={(update) => {
                      const [start, end] = update
                      setCurrentPage(1)
                      setAssignedDateFrom(formatYmdLocal(start))
                      setAssignedDateTo(formatYmdLocal(end))
                    }}
                    isClearable
                    placeholderText={isRtl ? 'من - إلى' : 'From - To'}
                    className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg dark:bg-gray-700 ${textColor} text-sm dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
                    wrapperClassName="w-full"
                    dateFormat="yyyy-MM-dd"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>{t('Last Action Date')}</label>
                <div className="w-full">
                  <DatePicker
                    popperContainer={({ children }) => createPortal(children, document.body)}
                    selectsRange
                    startDate={lastActionDateFrom ? new Date(lastActionDateFrom) : null}
                    endDate={lastActionDateTo ? new Date(lastActionDateTo) : null}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    yearDropdownItemNumber={12}
                    onChange={(update) => {
                      const [start, end] = update
                      setCurrentPage(1)
                      setLastActionDateFrom(formatYmdLocal(start))
                      setLastActionDateTo(formatYmdLocal(end))
                    }}
                    isClearable
                    placeholderText={isRtl ? 'من - إلى' : 'From - To'}
                    className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg dark:bg-gray-700 ${textColor} text-sm dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
                    wrapperClassName="w-full"
                    dateFormat="yyyy-MM-dd"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>{t('Action Date')}</label>
                <div className="w-full">
                  <DatePicker
                    popperContainer={({ children }) => createPortal(children, document.body)}
                    selectsRange
                    startDate={actionDateFrom ? new Date(actionDateFrom) : null}
                    endDate={actionDateTo ? new Date(actionDateTo) : null}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    yearDropdownItemNumber={12}
                    onChange={(update) => {
                      const [start, end] = update
                      setCurrentPage(1)
                      setActionDateFrom(formatYmdLocal(start))
                      setActionDateTo(formatYmdLocal(end))
                    }}
                    isClearable
                    placeholderText={isRtl ? 'من - إلى' : 'From - To'}
                    className={`w-full px-3 py-2 border border-theme-border dark:border-gray-500 rounded-lg dark:bg-gray-700 ${textColor} text-sm dark:placeholder-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400 transition-all duration-200`}
                    wrapperClassName="w-full"
                    dateFormat="yyyy-MM-dd"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>{t('Creation Date')}</label>
                <div className="w-full">
                  <DatePicker
                    popperContainer={({ children }) => createPortal(children, document.body)}
                    selectsRange
                    startDate={creationDateFrom ? new Date(creationDateFrom) : null}
                    endDate={creationDateTo ? new Date(creationDateTo) : null}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    yearDropdownItemNumber={12}
                    onChange={(update) => {
                      const [start, end] = update
                      setCurrentPage(1)
                      setCreationDateFrom(formatYmdLocal(start))
                      setCreationDateTo(formatYmdLocal(end))
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
          </div>
        </div>
      </div>

      {mode === 'operational' && moduleEnabled && canShow && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={`text-xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>Telesales Pipeline</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4 items-stretch">
            <button
              onClick={() => {
                setStageFilter([])
                setCurrentPage(1)
              }}
              className={`btn btn-glass text-sm flex items-center justify-between gap-2 px-3 py-2 min-h-[56px] h-full ${stageFilter.length === 0 ? pipelineTabSelectedClass : textColor}`}
            >
              <span className="flex items-center gap-2 text-left"><span>Σ</span><span>{t('total leads')}</span></span>
              <span className="font-bold">{Number(stageCounts.total || 0)}</span>
            </button>

            {stageCards.map((stage) => (
              <button
                key={stage.id}
                onClick={() => {
                  setCurrentPage(1)
                  setStageFilter((prev) => (prev[0] === stage.key ? [] : [stage.key]))
                }}
                className={`btn btn-glass text-sm flex items-center justify-between gap-2 px-3 py-2 min-h-[56px] h-full ${stageFilter[0] === stage.key ? pipelineTabSelectedClass : textColor}`}
              >
                <span className="flex items-center gap-2 text-left">
                  <span className="inline-flex items-center justify-center">
                    {(() => {
                      const Icon = ICON_MAP[String(stage.icon || '')] || ICON_MAP.BarChart2
                      return <Icon className="w-4 h-4 shrink-0" />
                    })()}
                  </span>
                  <span>{stage.name}</span>
                </span>
                <span className="font-bold">{stage.count}</span>
              </button>
            ))}
          </div>

          {pageError && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {pageError}
            </div>
          )}

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="relative z-[60] flex md:flex-row justify-between items-center p-4 gap-4 border-b border-theme-border dark:border-gray-700 bg-transparent backdrop-blur-md">
              {selectedIds.length > 0 ? (
                <div className="flex items-center gap-3 flex-wrap w-full">
                  <div className={`flex items-center px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 text-sm font-semibold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
                    {t('Selected')}: {selectedIds.length}
                  </div>

                  <div className="h-6 w-px bg-gray-700 mx-1 hidden md:block"></div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {canAssignLead && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowBulkAssignModal(true)
                          setShowBulkTransferPanel(false)
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95"
                      >
                        <FaUserTie className="text-xs" />
                        {t('Assign Leads')}
                      </button>
                    )}

                    {canBulkTransfer && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowBulkTransferPanel((prev) => !prev)
                          setShowBulkAssignModal(false)
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-95"
                      >
                        <FaUserCheck className="text-xs" />
                        {t('Convert To Sales')}
                        <FaChevronDown className={`text-xs transition-transform ${showBulkTransferPanel ? 'rotate-180' : ''}`} />
                      </button>
                    )}

                    {canDeleteLead && (
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={bulkBusy}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium shadow-lg shadow-red-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FaTrash className="text-xs" />
                        {t('Delete')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <FaList className="text-xs" />
                  <span className="text-sm font-medium">{t('No leads selected for bulk actions')}</span>
                </div>
              )}

              <div className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${isLight ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-blue-800 bg-blue-900/30 text-blue-300'}`}>
                <FaList className="text-xs" />
                <span>{t('Stage Count')}:</span>
                <span>{activeTotal}</span>
              </div>
            </div>

            {selectedIds.length > 0 && canBulkTransfer && showBulkTransferPanel && (
              <div className="border-b border-theme-border dark:border-gray-700 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                  <FaExchangeAlt className="text-blue-500" />
                  <span>{t('Bulk Transfer To Sales')}</span>
                </div>

                <TransferControls
                  users={salesAssignees}
                  salesStages={salesStages}
                  assignmentMethod={assignmentMethod}
                  setAssignmentMethod={setAssignmentMethod}
                  assignedTo={assignedTo}
                  setAssignedTo={setAssignedTo}
                  stageId={stageId}
                  setStageId={setStageId}
                  disabled={bulkBusy}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleBulkTransfer(false)}
                    disabled={bulkBusy || selectedIds.length === 0 || !canSubmitTransfer}
                  >
                    <FaExchangeAlt className="text-xs" />
                    {bulkBusy ? t('Processing...') : `${t('Transfer selected')} (${selectedIds.length})`}
                  </button>
                  <button
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleBulkTransfer(true)}
                    disabled={bulkBusy || !canSubmitTransfer}
                  >
                    <FaExchangeAlt className="text-xs" />
                    {bulkBusy ? t('Processing...') : t('Transfer all active leads')}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 w-full overflow-x-auto rounded-lg shadow-md backdrop-blur-lg">
              <table className={`w-max min-w-full divide-y divide-theme-border dark:divide-gray-700 ${isLight ? 'text-black' : 'text-white'}`} style={{ tableLayout: 'auto' }}>
                <thead className={`${tableHeaderBgClass} backdrop-blur-md sticky top-0 z-30 shadow-md`}>
                  <tr>
                    <th className={`w-10 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.length === paginatedRows.length && paginatedRows.length > 0}
                        onChange={() => handleToggleSelect('all')}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-theme-border rounded"
                      />
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Lead</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Contact</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Source</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Project</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Telesales Agent</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Last Comment</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Stage</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Expected Revenue</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap`}>Priority</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${textColor} whitespace-nowrap sticky ${i18n.language === 'ar' ? 'right-0' : 'left-0'} z-30 ${tableHeaderBgClass}`}>{t('Actions')}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-theme-border dark:bg-transparent dark:divide-gray-700">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-sm text-gray-500">No data</td>
                    </tr>
                  ) : paginatedRows.map((lead) => (
                    <tr key={lead.id} className="hover:bg-white/5 transition-colors duration-150">
                      <td className="w-10 px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(lead.id)}
                          onChange={() => handleToggleSelect(lead.id)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-theme-border rounded"
                        />
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>
                        <div className="font-semibold text-base flex items-center gap-1">
                          {lead.name || '-'}
                          {canViewDuplicateDisplay && isDuplicateLead(lead) && (
                            <span title={t('Duplicate Lead')}>
                              <FaClone className="text-red-500 min-w-[14px]" size={14} />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{lead.company || '-'}</div>
                      </td>
                      <td className={`px-6 py-4 text-sm ${textColor}`}>
                        <div className="max-w-[260px] truncate font-normal" title={lead.email || ''}>{lead.email || '-'}</div>
                        <div className="mt-0.5 flex flex-col items-start gap-0.5">
                          {getLeadPhoneEntries(lead).length > 0 ? getLeadPhoneEntries(lead).map((line, idx) => (
                            <div key={idx} className="group flex max-w-[260px] items-center gap-1 font-normal">
                              <span dir="ltr" className="min-w-0 truncate leading-5" title={line.display}>{line.display}</span>
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#25D366] transition hover:opacity-80"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (line?.digits) window.open(`https://wa.me/${line.digits}`, '_blank')
                                }}
                                title={t('Open WhatsApp')}
                              >
                                <FaWhatsapp size={11} />
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-blue-600 transition hover:opacity-80 dark:text-[#60a5fa]"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (line?.digits) window.open(`tel:${line.digits}`)
                                }}
                                title={t('Call')}
                              >
                                <FaPhone size={10} />
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyPhoneToClipboard(line.display)
                                }}
                                title={t('Copy')}
                              >
                                <FaCopy size={10} />
                              </button>
                            </div>
                          )) : <span>-</span>}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>{lead.source || '-'}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>{getLeadProjectName(lead)}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>{getLeadAssignedName(lead)}</td>
                      <td className={`px-6 py-4 text-sm ${textColor}`}>
                        <div className="max-w-[240px] truncate" title={getLeadLastComment(lead)}>{getLeadLastComment(lead)}</div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                          {getLeadDisplayStage(lead)}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>
                        {lead.estimatedValue || lead.estimated_value ? formatMoney(lead.estimatedValue || lead.estimated_value) : '-'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColor}`}>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold leading-5 rounded-full ${getPriorityColor(lead.priority)}`}>
                          {t(lead.priority || 'N/A')}
                        </span>
                      </td>
                      <td className={`px-6 py-3 whitespace-nowrap text-xs font-medium sticky ${i18n.language === 'ar' ? 'right-0' : 'left-0'} z-20 ${isLight ? 'bg-white/90' : 'bg-slate-950/90'}`}>
                        <div className="flex items-center gap-2 flex-nowrap">
                          <button
                            title={t('Preview')}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedLead(lead)
                              setShowLeadModal(true)
                            }}
                            className="inline-flex items-center justify-center text-indigo-300 hover:text-indigo-400"
                          >
                            <FaEye size={16} />
                          </button>
                          <button
                            title={t('Add Action')}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedLead(lead)
                              setShowAddActionModal(true)
                            }}
                            className="inline-flex items-center justify-center text-emerald-300 hover:text-emerald-400"
                          >
                            <FaPlus size={16} />
                          </button>
                          {canTransfer && (
                            <button
                              title={t('Transfer to Sales')}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleTransfer(lead.id)
                              }}
                              disabled={transferingId === lead.id || !canSubmitTransfer}
                              className="inline-flex items-center justify-center text-blue-400 hover:text-blue-300 disabled:opacity-50"
                            >
                              <FaExchangeAlt size={16} />
                            </button>
                          )}
                          <button
                            title={t('Call')}
                            onClick={(e) => {
                              e.stopPropagation()
                              const digits = getLeadPhoneEntries(lead)?.[0]?.digits || ''
                              if (digits) window.open(`tel:${digits}`)
                            }}
                            className="inline-flex items-center justify-center text-blue-600 dark:text-[#2563EB] hover:opacity-80"
                          >
                            <FaPhone size={16} />
                          </button>
                          <button
                            title={t('Email')}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (lead.email) window.open(`mailto:${lead.email}`)
                            }}
                            className="inline-flex items-center justify-center text-[#FFA726] hover:opacity-80"
                          >
                            <FaEnvelope size={16} />
                          </button>
                          <button
                            title="Google Meet"
                            onClick={(e) => {
                              e.stopPropagation()
                              window.open('https://meet.google.com/', '_blank')
                            }}
                            className="inline-flex items-center justify-center hover:opacity-80"
                          >
                            <img src={MEET_ICON_URL} alt="Google Meet" className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav className="flex flex-col gap-4 p-3 lg:p-4 border-t border-theme-border dark:border-gray-700 dark:bg-transparent rounded-b-lg backdrop-blur-sm">
              <div className="flex lg:flex-row justify-between items-center gap-3">
                <div className={`flex flex-wrap items-center gap-2 w-full lg:w-auto text-sm font-medium ${textColor}`}>
                  <span>{t('Show')}</span>
                  <select
                    value={perPage}
                    onChange={(e) => {
                      const nextPerPage = Number(e.target.value)
                      setPerPage(nextPerPage)
                      setCurrentPage(1)
                      setHistoricalPage(1)
                    }}
                    className={`px-2 py-1 border border-theme-border dark:border-gray-600 rounded-md dark:bg-transparent backdrop-blur-sm ${textColor} text-xs`}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className={`text-xs font-semibold ${textColor}`}>{t('entries')}</span>
                  <label htmlFor="telesales-page-search" className="sr-only">{t('Search Page')}</label>
                  <input
                    id="telesales-page-search"
                    type="text"
                    placeholder={t('Go to page...')}
                    value={pageSearch}
                    onChange={(e) => setPageSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      const page = Number(pageSearch)
                      if (!page || page < 1 || page > activeLastPage) return
                      if (mode === 'historical') {
                        setHistoricalPage(page)
                      } else {
                        setCurrentPage(page)
                      }
                      setPageSearch('')
                    }}
                    className={`ml-2 px-3 py-1.5 border border-theme-border dark:border-gray-600 rounded-lg dark:bg-transparent backdrop-blur-sm ${textColor} text-xs w-full sm:w-64 lg:w-28 dark:placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-400`}
                  />
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
                  <button
                    onClick={() => mode === 'historical' ? setHistoricalPage((p) => Math.max(1, p - 1)) : setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={activePage <= 1}
                    className={`block px-3 py-2 leading-tight ${textColor} border border-theme-border rounded-l-lg hover:bg-gray-100 hover:text-gray-700 dark:bg-transparent dark:border-gray-700 dark:hover:bg-gray-700 dark:hover:text-white disabled:opacity-50 backdrop-blur-sm`}
                  >
                    <span className={`sr-only ${textColor}`}>{t('Previous')}</span>
                    <svg className="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                  </button>
                  <span className={`text-sm font-medium ${textColor}`}>
                    {t('Page')} <span className={`font-semibold ${textColor}`}>{activePage}</span> {t('of')} <span className={`font-semibold ${textColor}`}>{activeLastPage}</span>
                  </span>
                  <button
                    onClick={() => mode === 'historical' ? setHistoricalPage((p) => Math.min(activeLastPage, p + 1)) : setCurrentPage((p) => Math.min(activeLastPage, p + 1))}
                    disabled={activePage >= activeLastPage}
                    className={`block px-3 py-2 leading-tight ${textColor} border border-theme-border rounded-r-lg hover:bg-gray-100 hover:text-gray-700 dark:bg-transparent dark:border-gray-700 dark:hover:bg-gray-700 dark:hover:text-white disabled:opacity-50 backdrop-blur-sm`}
                  >
                    <span className={`sr-only ${textColor}`}>{t('Next')}</span>
                    <svg className="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
                  </button>
                </div>
              </div>
            </nav>
          </div>
        </>
      )}

      {mode === 'historical' && canViewHistorical && (
        <>
          {pageError && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {pageError}
            </div>
          )}

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-theme-border dark:border-gray-700">
              <h2 className={`text-xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>Telesales History</h2>
            </div>

            <div className="overflow-x-auto">
              <table className={`w-full ${textColor}`}>
                <thead className={tableHeaderBgClass}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Lead</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Stage</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Assigned</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Transferred At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border dark:divide-gray-700">
                  {historicalLoading ? (
                    <tr><td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={5}>Loading...</td></tr>
                  ) : historicalRows.length === 0 ? (
                    <tr><td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={5}>No data</td></tr>
                  ) : historicalRows.map((lead) => (
                    <tr key={lead.id} className="hover:bg-white/5 transition-colors duration-150">
                      <td className="px-6 py-4 text-sm"><div className="font-semibold">{lead.name || '-'}</div><div className="text-xs text-gray-500">#{lead.id}</div></td>
                      <td className="px-6 py-4 text-sm">{lead.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm">{lead.stageRelation?.name || lead.stage || '-'}</td>
                      <td className="px-6 py-4 text-sm">{lead.assignedAgent?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm">{lead.transferred_to_sales_at || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showAddActionModal && selectedLead && (
        <AddActionModal
          isOpen={showAddActionModal}
          onClose={() => setShowAddActionModal(false)}
          lead={selectedLead}
          onSave={async () => {
            setShowAddActionModal(false)
            await loadOperational()
          }}
        />
      )}

      {showLeadModal && selectedLead && (
        <EnhancedLeadDetailsModal
          isOpen={showLeadModal}
          onClose={() => {
            setShowLeadModal(false)
            setSelectedLead(null)
          }}
          lead={selectedLead}
          isArabic={i18n.language === 'ar'}
          theme={theme}
        />
      )}

      {showImportModal && (
        <ImportLeadsModal
          isOpen={showImportModal}
          onClose={() => {
            if (importing) return
            setShowImportModal(false)
            setExcelFile(null)
            setImportError('')
            setImportSummary(null)
          }}
          companyType={company?.company_type}
          excelFile={excelFile}
          setExcelFile={setExcelFile}
          importing={importing}
          importError={importError}
          importSummary={importSummary}
          onImport={handleTelesalesImport}
        />
      )}

      {showBulkAssignModal && (
        <TelesalesBulkAssignModal
          isOpen={showBulkAssignModal}
          onClose={() => {
            setShowBulkAssignModal(false)
            setAssignModalError('')
            setAssignModalSubmitting(false)
          }}
          lead={null}
          onAssign={handleBulkAssign}
          isArabic={isRtl}
          currentUser={user}
          errorMessage={assignModalError}
          submitting={assignModalSubmitting}
          onClearError={() => setAssignModalError('')}
          usersOverride={telesalesAssignees}
          title={isRtl ? 'تعيين ليدز التيليسيلز' : 'Assign Telesales Leads'}
          selectedCount={selectedIds.length}
          assignButtonLabel={isRtl ? 'تعيين' : 'Assign'}
          filterByRoleLabel={isRtl ? 'تصفية حسب دور التيليسيلز' : 'Filter By Telesales Role'}
          assignToLabel={isRtl ? 'تعيين إلى' : 'Assign To'}
          searchPlaceholder={isRtl ? 'ابحث في أعضاء فريق التيليسيلز' : 'Search telesales team members'}
        />
      )}
    </div>
  )
}
