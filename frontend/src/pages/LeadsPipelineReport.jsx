import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useTheme } from '../shared/context/ThemeProvider'
import { useAppState } from '../shared/context/AppStateProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import { Filter, Users, Tag, Calendar, XCircle, FileText, CheckCircle, ChevronDown, User, Layers, Briefcase, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { FaChevronDown, FaFileExport, FaFileExcel, FaFilePdf } from 'react-icons/fa'
import DateRangePicker from '../shared/components/DateRangePicker'
import * as XLSX from 'xlsx'
import { api, logExportEvent } from '../utils/api'
import BackButton from '../components/BackButton'
import SearchableSelect from '../components/SearchableSelect'
import ReassignLeadsReport from '../components/LeadsReport/ReassignLeadsReport'
import { LeadsAnalysisChart } from '../features/Dashboard/components/LeadsAnalysisChart'
import { useStages } from '../hooks/useStages'
import { getSourceCanonicalName, getSourceDisplayName } from '../shared/utils/sourceDisplay'

function readQueryFilters(search) {
  const params = new URLSearchParams(search || '')
  const pick = (...keys) => {
    for (const key of keys) {
      const value = params.get(key)
      if (value) return value
    }
    return ''
  }

  return {
    salesPersonFilter: pick('assigned_to', 'sales_person'),
    managerFilter: pick('manager_id', 'manager'),
    stageFilter: pick('stage'),
    sourceFilter: pick('source'),
    agencyFilter: pick('agency'),
    projectFilter: pick('project'),
    assignDateFrom: pick('assigned_date_from'),
    assignDateTo: pick('assigned_date_to'),
    creationDateFrom: pick('created_from', 'date_from', 'creation_date_from'),
    creationDateTo: pick('created_to', 'date_to', 'creation_date_to'),
    lastActionDateFrom: pick('last_action_date_from'),
    lastActionDateTo: pick('last_action_date_to'),
    closeDealsDateFrom: pick('closed_from', 'close_deals_date_from'),
    closeDealsDateTo: pick('closed_to', 'close_deals_date_to'),
  }
}

export default function LeadsPipelineReport() {
  const { i18n, t } = useTranslation()
  const location = useLocation()
  const isRTL = i18n.dir() === 'rtl'
  const normalizeOptionKey = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  const getStageLocalizedLabel = (stage) => {
    const english = String(stage?.name || '').trim()
    const arabic = String(stage?.nameAr || stage?.name_ar || '').trim()
    const typeKey = String(stage?.type || '').trim()
    const translatedType = typeKey ? String(t(typeKey) || '').trim() : ''

    if (isRTL) {
      return arabic || translatedType || english
    }

    return english || arabic || translatedType
  }

  const { isLight } = useTheme()
  const { stages: stagesCatalog } = useStages({ workflowKey: 'sales', activeOnly: true })

  const [activeTab, setActiveTab] = useState('pipeline')
  const [users, setUsers] = useState([])
  const [tenantCompany, setTenantCompany] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const { user } = useAppState()
  const canExport = canExportReport(user, 'Leads Pipeline')
  const [reportTotals, setReportTotals] = useState({
    totalLeads: 0,
    pending: 0,
    meetings: 0,
    proposals: 0,
    reservations: 0,
    closedDeals: 0,
    cancelation: 0,
  })
  const [salesPersonStats, setSalesPersonStats] = useState([])
  const [monthlySeries, setMonthlySeries] = useState([])
  const [reportOptions, setReportOptions] = useState({ stages: [], sources: [], agencies: [], projects: [] })
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, companyRes, sourcesRes] = await Promise.all([
          api.get('/api/users', { params: { per_page: 1000 } }),
          api.get('/api/company-info'),
          api.get('/api/sources', { params: { active: 1 } }),
        ])

        const rawUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.data || [])
        const mappedUsers = rawUsers.map(u => ({
          id: u.id,
          name: u.name,
          role: Array.isArray(u.roles) && u.roles[0]?.name ? u.roles[0].name : (u.role || ''),
          manager_id: u.manager_id || null
        }))
        setUsers(mappedUsers)

        const tenant = companyRes.data?.tenant || companyRes.data?.company || null
        setTenantCompany(tenant)
        
        const user = companyRes.data?.user || null
        setCurrentUser(user)
        setSourcesCatalog(Array.isArray(sourcesRes.data) ? sourcesRes.data : [])
      } catch (err) {
        console.error('Failed to fetch leads or users', err)
      }
    }
    fetchData()
  }, [])

  const canViewReassignment = useMemo(() => {
    if (!currentUser) return false
    const role = (currentUser.role || '').toLowerCase()
    const isAdminOrManager = ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager', 'sales manager', 'branch manager', 'team leader'].includes(role)
    return currentUser.is_super_admin || isAdminOrManager
  }, [currentUser])


  // Filters State
  const initialQueryFilters = readQueryFilters(location.search)
  const [salesPersonFilter, setSalesPersonFilter] = useState(initialQueryFilters.salesPersonFilter)
  const [managerFilter, setManagerFilter] = useState(initialQueryFilters.managerFilter)
  const [stageFilter, setStageFilter] = useState(initialQueryFilters.stageFilter)
  const [sourceFilter, setSourceFilter] = useState(initialQueryFilters.sourceFilter)
  const [agencyFilter, setAgencyFilter] = useState(initialQueryFilters.agencyFilter)
  const [projectFilter, setProjectFilter] = useState(initialQueryFilters.projectFilter)
  const [assignDateFrom, setAssignDateFrom] = useState(initialQueryFilters.assignDateFrom)
  const [assignDateTo, setAssignDateTo] = useState(initialQueryFilters.assignDateTo)
  const [creationDateFrom, setCreationDateFrom] = useState(initialQueryFilters.creationDateFrom)
  const [creationDateTo, setCreationDateTo] = useState(initialQueryFilters.creationDateTo)
  const [lastActionDateFrom, setLastActionDateFrom] = useState(initialQueryFilters.lastActionDateFrom)
  const [lastActionDateTo, setLastActionDateTo] = useState(initialQueryFilters.lastActionDateTo)
  const [closeDealsDateFrom, setCloseDealsDateFrom] = useState(initialQueryFilters.closeDealsDateFrom)
  const [closeDealsDateTo, setCloseDealsDateTo] = useState(initialQueryFilters.closeDealsDateTo)
  const [showAllFilters, setShowAllFilters] = useState(Boolean(
    initialQueryFilters.creationDateFrom
    || initialQueryFilters.creationDateTo
    || initialQueryFilters.assignDateFrom
    || initialQueryFilters.assignDateTo
  ))
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)

  useEffect(() => {
    const next = readQueryFilters(location.search)
    setSalesPersonFilter(next.salesPersonFilter)
    setManagerFilter(next.managerFilter)
    setStageFilter(next.stageFilter)
    setSourceFilter(next.sourceFilter)
    setAgencyFilter(next.agencyFilter)
    setProjectFilter(next.projectFilter)
    setAssignDateFrom(next.assignDateFrom)
    setAssignDateTo(next.assignDateTo)
    setCreationDateFrom(next.creationDateFrom)
    setCreationDateTo(next.creationDateTo)
    setLastActionDateFrom(next.lastActionDateFrom)
    setLastActionDateTo(next.lastActionDateTo)
    setCloseDealsDateFrom(next.closeDealsDateFrom)
    setCloseDealsDateTo(next.closeDealsDateTo)
    if (next.creationDateFrom || next.creationDateTo || next.assignDateFrom || next.assignDateTo) {
      setShowAllFilters(true)
    }
  }, [location.search])

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const managerOptions = useMemo(() => {
    if (!users.length) return [{ value: '', label: isRTL ? 'الكل' : 'All Managers' }]
    const managers = users.filter(u => {
      const role = String(u.role || '').toLowerCase()
      const isSalesPerson = role.includes('sales person') || role.includes('salesperson')
      return !isSalesPerson
    })
    const uniqueManagers = Array.from(new Map(managers.map(m => [m.id, m])).values())
    return [
      { value: '', label: isRTL ? 'الكل' : 'All Managers' },
      ...uniqueManagers.map(m => ({ value: String(m.id), label: m.name || `#${m.id}` }))
    ]
  }, [users, isRTL])

  const getDescendants = (rootId, allUsers) => {
    let descendants = []
    const direct = allUsers.filter(u => String(u.manager_id || '') === String(rootId))
    direct.forEach(u => {
      descendants.push(u)
      descendants = [...descendants, ...getDescendants(u.id, allUsers)]
    })
    return descendants
  }

  const salesPersonOptions = useMemo(() => {
    const selectedManagerId = managerFilter ? parseInt(managerFilter, 10) : null

    let candidates = [...users]

    if (selectedManagerId) {
      const validIds = new Set([String(selectedManagerId)])
      getDescendants(selectedManagerId, users).forEach(u => validIds.add(String(u.id)))
      candidates = candidates.filter(u => validIds.has(String(u.id)))
    }

    const uniqueSales = Array.from(new Map(candidates.map(s => [s.id, s])).values())
      .filter(s => String(s?.name || '').trim() !== '')

    const fallbackSales = uniqueSales.length
      ? []
      : (salesPersonStats || [])
          .map(stat => String(stat?.name || '').trim())
          .filter(name => name && name.toLowerCase() !== 'unassigned')
          .map(name => ({ value: name, label: name }))

    const resolvedOptions = uniqueSales.length
      ? uniqueSales.map(s => ({ value: String(s.id), label: s.name || `#${s.id}` }))
      : fallbackSales

    const dedupedOptions = Array.from(
      new Map(
        resolvedOptions
          .filter(option => String(option?.value || '').trim() !== '')
          .map(option => [option.value, option])
      ).values()
    )

    return [
      { value: '', label: isRTL ? 'الكل' : 'All Sales Persons' },
      ...dedupedOptions
    ]
  }, [users, managerFilter, isRTL, salesPersonStats])

  const projectOrProductOptions = useMemo(() => {
    const type = String(tenantCompany?.company_type || '').toLowerCase()

    const baseLabel = type === 'real estate'
      ? (isRTL ? 'الكل' : 'All Units')
      : (isRTL ? 'الكل' : 'All Projects')

    const uniqueValues = Array.from(new Set((reportOptions.projects || []).filter(Boolean)))

    return [
      { value: '', label: baseLabel },
      ...uniqueValues.map(v => ({ value: v, label: v }))
    ]
  }, [reportOptions.projects, tenantCompany, isRTL])

  const stageLabelMap = useMemo(() => {
    const map = new Map()
    ;(stagesCatalog || []).forEach((stage) => {
      const english = String(stage?.name || '').trim()
      const arabic = String(stage?.nameAr || stage?.name_ar || '').trim()
      const label = getStageLocalizedLabel(stage)

      ;[english, arabic].forEach((key) => {
        const normalized = normalizeOptionKey(key)
        if (normalized && label) map.set(normalized, label)
      })
    })
    ;(reportOptions.stages || []).forEach((stage) => {
      if (typeof stage === 'object' && stage !== null) {
        const english = String(stage?.name || '').trim()
        const arabic = String(stage?.name_ar || stage?.nameAr || '').trim()
        const label = getStageLocalizedLabel(stage)
        ;[english, arabic].forEach((key) => {
          const normalized = normalizeOptionKey(key)
          if (normalized && label) map.set(normalized, label)
        })
      }
    })
    return map
  }, [stagesCatalog, reportOptions.stages, isRTL, t])

  const sourceLabelMap = useMemo(() => {
    const map = new Map()
    ;(sourcesCatalog || []).forEach((item) => {
      const value = getSourceCanonicalName(item)
      const label = getSourceDisplayName(item, isRTL)
      const normalized = normalizeOptionKey(value)
      if (normalized && label) map.set(normalized, label)
    })
    ;(reportOptions.sources || []).forEach((source) => {
      if (typeof source === 'object' && source !== null) {
        const value = getSourceCanonicalName(source)
        const label = getSourceDisplayName(source, isRTL)
        const normalized = normalizeOptionKey(value)
        if (normalized && label) map.set(normalized, label)
      }
    })
    return map
  }, [sourcesCatalog, reportOptions.sources, isRTL])

  const stageFilterOptions = useMemo(() => ([
    { value: '', label: isRTL ? 'الكل' : 'All Stages' },
    ...Array.from(new Map(
      (stagesCatalog || [])
        .map((stage) => {
          const value = typeof stage === 'object' && stage !== null
            ? String(stage?.name || stage?.name_ar || stage?.nameAr || '').trim()
            : String(stage || '').trim()
          if (!value) return null
          const label = stageLabelMap.get(normalizeOptionKey(value)) || value
          return [value, { value, label }]
        })
        .filter(Boolean)
    ).values()),
  ]), [stagesCatalog, stageLabelMap, isRTL])

  const sourceFilterOptions = useMemo(() => ([
    { value: '', label: isRTL ? 'الكل' : 'All Sources' },
    ...Array.from(new Map(
      (sourcesCatalog || [])
        .map((source) => {
          const value = typeof source === 'object' && source !== null
            ? String(source?.name || source?.name_ar || source?.nameAr || '').trim()
            : String(source || '').trim()
          if (!value) return null
          const label = sourceLabelMap.get(normalizeOptionKey(value)) || value
          return [value, { value, label }]
        })
        .filter(Boolean)
    ).values()),
  ]), [sourcesCatalog, sourceLabelMap, isRTL])

  // Filter Logic
  useEffect(() => {
    const fetchReport = async () => {
      try {
        setReportLoading(true)
        const params = {
          lang: i18n.language,
          manager_id: managerFilter || undefined,
          assigned_to: salesPersonFilter || undefined,
          stage: stageFilter || undefined,
          source: sourceFilter || undefined,
          agency: agencyFilter || undefined,
          project: projectFilter || undefined,
          assigned_date_from: assignDateFrom || undefined,
          assigned_date_to: assignDateTo || undefined,
          created_from: creationDateFrom || undefined,
          created_to: creationDateTo || undefined,
          last_action_date: lastActionDateFrom && lastActionDateTo && lastActionDateFrom === lastActionDateTo ? lastActionDateFrom : undefined,
          last_action_date_from: lastActionDateFrom || undefined,
          last_action_date_to: lastActionDateTo || undefined,
          closed_from: closeDealsDateFrom || undefined,
          closed_to: closeDealsDateTo || undefined,
        }

        const res = await api.get('/api/leads/pipeline-report', { params })
        setReportTotals(res.data?.totals || {
          totalLeads: 0,
          pending: 0,
          meetings: 0,
          proposals: 0,
          reservations: 0,
          closedDeals: 0,
          cancelation: 0,
        })
        setSalesPersonStats(res.data?.salesPersonStats || [])
        setMonthlySeries(res.data?.monthly || [])
        setReportOptions(res.data?.options || { stages: [], sources: [], agencies: [], projects: [] })
        setCurrentPage(1)
      } catch (err) {
        console.error('Failed to fetch leads pipeline report', err)
        setReportTotals({
          totalLeads: 0,
          pending: 0,
          meetings: 0,
          proposals: 0,
          reservations: 0,
          closedDeals: 0,
          cancelation: 0,
        })
        setSalesPersonStats([])
        setMonthlySeries([])
        setReportOptions({ stages: [], sources: [], agencies: [], projects: [] })
      } finally {
        setReportLoading(false)
      }
    }

    fetchReport()
  }, [
    i18n.language,
    managerFilter,
    salesPersonFilter,
    stageFilter,
    sourceFilter,
    agencyFilter,
    projectFilter,
    assignDateFrom,
    assignDateTo,
    creationDateFrom,
    creationDateTo,
    lastActionDateFrom,
    lastActionDateTo,
    closeDealsDateFrom,
    closeDealsDateTo,
  ])

  const growthData = useMemo(() => {
    const counts = {}
    monthlySeries.forEach(item => {
      const key = item?.month
      const value = item?.count
      if (!key) return
      counts[key] = (counts[key] || 0) + (Number(value) || 0)
    })

    return Object.keys(counts).sort().map(month => {
      const [year, m] = month.split('-')
      const date = new Date(year, parseInt(m, 10) - 1)
      const label = date.toLocaleString(i18n.language, { month: 'short', year: 'numeric' })
      return { label, value: counts[month] }
    })
  }, [monthlySeries, i18n.language])

  const [expandedRows, setExpandedRows] = useState({});

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(salesPersonStats.length / entriesPerPage))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return salesPersonStats.slice(start, start + entriesPerPage)
  }, [salesPersonStats, currentPage, entriesPerPage])

  const exportSummaryRows = useMemo(() => {
    return salesPersonStats.map((stat) => ({
      [isRTL ? 'مسؤول المبيعات' : 'Sales Person']: stat.name || (isRTL ? 'غير معين' : 'Unassigned'),
      [isRTL ? 'إجمالي العملاء' : 'Total Leads']: stat.total ?? 0,
      [isRTL ? 'معلق (جديد)' : 'Pending (New)']: stat.pendingNew ?? 0,
      [isRTL ? 'معلق (بارد)' : 'Pending (Cold)']: stat.pendingCold ?? 0,
      [isRTL ? 'متابعة' : 'Follow up']: stat.followUp ?? 0,
      [isRTL ? 'عرض' : 'Proposal']: stat.proposal ?? 0,
      [isRTL ? 'اجتماع' : 'Meeting']: stat.meeting ?? 0,
      [isRTL ? 'حجز' : 'Reservation']: stat.reservation ?? 0,
      [isRTL ? 'مغلق' : 'Closed']: stat.closed ?? 0,
      [isRTL ? 'ملغى' : 'Canceled']: stat.canceled ?? 0,
    }))
  }, [salesPersonStats, isRTL])

  const handleExport = async () => {
    try {
      const ws = XLSX.utils.json_to_sheet(exportSummaryRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leads Overview')
      const fileName = 'leads_pipeline_report.xlsx'
      XLSX.writeFile(wb, fileName)
      logExportEvent({
        module: 'Leads Pipeline Report',
        fileName,
        format: 'xlsx',
      })
      setShowExportMenu(false)
    } catch (error) {
      console.error('Export Excel Error:', error)
    }
  }

  const exportToPdf = async () => {
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'landscape' })
      
      const tableColumn = [
        isRTL ? 'مسؤول المبيعات' : 'Sales Person',
        isRTL ? 'إجمالي العملاء' : 'Total Leads',
        isRTL ? 'معلق (جديد)' : 'Pending (New)',
        isRTL ? 'معلق (بارد)' : 'Pending (Cold)',
        isRTL ? 'متابعة' : 'Follow up',
        isRTL ? 'عرض' : 'Proposal',
        isRTL ? 'اجتماع' : 'Meeting',
        isRTL ? 'حجز' : 'Reservation',
        isRTL ? 'مغلق' : 'Closed',
        isRTL ? 'ملغى' : 'Canceled'
      ]
      const tableRows = salesPersonStats.map((stat) => [
        stat.name || (isRTL ? 'غير معين' : 'Unassigned'),
        stat.total ?? 0,
        stat.pendingNew ?? 0,
        stat.pendingCold ?? 0,
        stat.followUp ?? 0,
        stat.proposal ?? 0,
        stat.meeting ?? 0,
        stat.reservation ?? 0,
        stat.closed ?? 0,
        stat.canceled ?? 0
      ])

      doc.text(isRTL ? 'تقرير نظرة عامة على العملاء' : 'Leads Overview Report', 14, 15)
      autoTable.default(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        margin: { left: 10, right: 10 }
      })
      doc.save('leads_pipeline_report.pdf')
      logExportEvent({
        module: 'Leads Pipeline Report',
        fileName: 'leads_pipeline_report.pdf',
        format: 'pdf',
      })
      setShowExportMenu(false)
    } catch (error) {
      console.error('Export PDF Error:', error)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 min-h-screen ">
        <div>
          <BackButton to="/reports" className="relative z-[20060] pointer-events-auto" />
        </div>      
      {/* Header & Navigation */}
      
        {/* Row 1: Back Button */}


        {/* Row 2: Title and Export Button */}
        <div className="flex flex-wrap  md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} flex items-center gap-3`}>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <Layers size={32} />
            </div>
            {isRTL ? 'التقارير، مسار العملاء المحتملين' : 'Leads Pipeline'}
            {reportLoading && (
              <span className={`text-xs font-medium opacity-70 ${isLight ? 'text-black' : 'text-white'}`}>
                {isRTL ? 'جاري التحميل...' : 'Loading...'}
              </span>
            )}
          </h1>
        </div>

        {/* Tabs */}
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl inline-flex mb-6">
          <button
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'pipeline'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('pipeline')}
          >
            {isRTL ? 'تقرير المسار' : 'Pipeline Report'}
          </button>
          {canViewReassignment && (
            <button
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === 'reassignment'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab('reassignment')}
            >
              {isRTL ? 'إعادة تعيين العملاء' : 'Reassign Leads'}
            </button>
          )}
        </div>

      {activeTab === 'reassignment' ? (
        <ReassignLeadsReport users={users} />
      ) : (
        <>
      {/* Filters Section */}
      <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3>{isRTL ? 'الفلاتر' : 'Filters'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowAllFilters(prev => !prev)} 
              className={`flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors`}
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'إظهار الكل' : 'Show All')}
              <ChevronDown size={12} className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button
              onClick={() => {
                setSalesPersonFilter('')
                setManagerFilter('')
                setStageFilter('')
                setSourceFilter('')
                setAgencyFilter('')
                setProjectFilter('')
                setAssignDateFrom('')
                setAssignDateTo('')
                setCreationDateFrom('')
                setCreationDateTo('')
                setLastActionDateFrom('')
                setLastActionDateTo('')
                setCloseDealsDateFrom('')
                setCloseDealsDateTo('')
                setShowAllFilters(false)
              }}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {/* First Row - Always Visible */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Sales Person */}
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <User size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'مسؤول المبيعات' : 'Sales Person'}
              </label>
              <SearchableSelect 
                options={salesPersonOptions}
                value={salesPersonFilter}
                onChange={setSalesPersonFilter}
                placeholder={isRTL ? 'اختر' : 'Sales Person'}
                icon={<User size={16} />}
                isRTL={isRTL}
              />
            </div>

            {/* Manager */}
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Users size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'المدير' : 'Manager'}
              </label>
              <SearchableSelect 
                options={managerOptions}
                value={managerFilter}
                onChange={setManagerFilter}
                placeholder={isRTL ? 'اختر' : 'Manager'}
                icon={<Users size={16} />}
                isRTL={isRTL}
              />
            </div>

            {/* Stage */}
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Layers size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'المرحلة' : 'Stage'}
              </label>
              <SearchableSelect 
                options={stageFilterOptions}
                value={stageFilter}
                onChange={setStageFilter}
                placeholder={isRTL ? 'اختر' : 'Select stage'}
                icon={<Layers size={16} />}
                isRTL={isRTL}
              />
            </div>

            {/* Source */}
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'المصدر' : 'Source'}
              </label>
              <SearchableSelect 
                options={sourceFilterOptions}
                value={sourceFilter}
                onChange={setSourceFilter}
                placeholder={isRTL ? 'اختر' : 'Source'}
                icon={<Tag size={16} />}
                isRTL={isRTL}
              />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'الوكالة' : 'Agency'}
              </label>
              <SearchableSelect
                options={[
                  { value: '', label: isRTL ? 'الكل' : 'All Agencies' },
                  ...Array.from(new Set((reportOptions.agencies || []).filter(Boolean))).map(a => ({ value: a, label: a }))
                ]}
                value={agencyFilter}
                onChange={setAgencyFilter}
                placeholder={isRTL ? 'اختر' : 'Agency'}
                icon={<Briefcase size={16} />}
                isRTL={isRTL}
              />
            </div>
          </div>

          {/* Additional Filters (Toggleable) */}
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showAllFilters ? 'max-h-[800px] opacity-100 pt-3' : 'max-h-0 opacity-0'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Project */}
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'المشروع أو المنتج' : 'Project or Product'}
                </label>
                <SearchableSelect 
                  options={projectOrProductOptions}
                  value={projectFilter}
                  onChange={setProjectFilter}
                  placeholder={isRTL ? 'اختر' : 'Project or Product'}
                  icon={<Briefcase size={16} />}
                  isRTL={isRTL}
                />
              </div>

              {/* Assign Date */}
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'تاريخ التعيين' : 'Assign Date'}
                </label>
                <DateRangePicker
                  from={assignDateFrom}
                  to={assignDateTo}
                  onChange={({ from, to }) => {
                    setAssignDateFrom(from)
                    setAssignDateTo(to)
                  }}
                  isRTL={isRTL}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>

              {/* Creation Date */}
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'تاريخ الإنشاء' : 'Creation Date'}
                </label>
                <DateRangePicker
                  from={creationDateFrom}
                  to={creationDateTo}
                  onChange={({ from, to }) => {
                    setCreationDateFrom(from)
                    setCreationDateTo(to)
                  }}
                  isRTL={isRTL}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>

              {/* Last Action Date */}
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Clock size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'تاريخ آخر إجراء' : 'Last Action Date'}
                </label>
                <DateRangePicker
                  from={lastActionDateFrom}
                  to={lastActionDateTo}
                  onChange={({ from, to }) => {
                    setLastActionDateFrom(from)
                    setLastActionDateTo(to)
                  }}
                  isRTL={isRTL}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>

              {/* Close Deals Date */}
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <CheckCircle size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'تاريخ إغلاق الصفقات' : 'Close Deals Date'}
                </label>
                <DateRangePicker
                  from={closeDealsDateFrom}
                  to={closeDealsDateTo}
                  onChange={({ from, to }) => {
                    setCloseDealsDateFrom(from)
                    setCloseDealsDateTo(to)
                  }}
                  isRTL={isRTL}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
        {[
          {
            title: isRTL ? 'إجمالي الليدز' : 'Total Leads',
            value: (reportTotals.totalLeads || 0).toLocaleString(),
            sub: isRTL ? '(الكل)' : '(Total)',
            icon: Users,
            color: 'text-blue-500 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          },
          {
            title: isRTL ? 'بيندنج' : 'Pending',
            value: reportTotals.pending || 0,
            sub: isRTL ? '(معلق)' : '(Pending)',
            icon: Filter,
            color: 'text-indigo-600 dark:text-indigo-400',
            bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
          },
          {
            title: isRTL ? 'الاجتماعات' : 'Meetings',
            value: reportTotals.meetings || 0,
            sub: isRTL ? '(مجدولة)' : '(Scheduled)',
            icon: Calendar,
            color: 'text-purple-600 dark:text-purple-400',
            bgColor: 'bg-purple-50 dark:bg-purple-900/20',
          },
          {
            title: isRTL ? 'العروض' : 'Proposals',
            value: reportTotals.proposals || 0,
            sub: isRTL ? '(مرسلة)' : '(Sent)',
            icon: FileText,
            color: 'text-cyan-600 dark:text-cyan-400',
            bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
          },
          {
            title: isRTL ? 'الحجوزات' : 'Reservations',
            value: reportTotals.reservations || 0,
            sub: isRTL ? '(حجز)' : '(Reservation)',
            icon: Tag,
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
          },
          {
            title: isRTL ? 'صفقات مغلقة' : 'Closed Deals',
            value: reportTotals.closedDeals || 0,
            sub: isRTL ? '(فوز)' : '(Won)',
            icon: CheckCircle,
            color: 'text-emerald-600 dark:text-emerald-400',
            bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
          },
          {
            title: isRTL ? 'إلغاء' : 'Cancelation',
            value: (reportTotals.cancelation || 0).toLocaleString(),
            sub: isRTL ? '(خسارة)' : '(Lost)',
            icon: XCircle,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-50 dark:bg-red-900/20',
          },
        ].map((card, idx) => {
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
                  <span className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                    {card.sub}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Leads Growth Chart */}
      <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-6">
        <h2 className={`text-lg font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
          {isRTL ? 'نمو العملاء' : 'Leads Growth'}
        </h2>
        <div className="h-64 sm:h-80">
           {growthData.length > 0 ? (
             <LeadsAnalysisChart 
               data={growthData} 
               chartType="line" 
               legendLabel={isRTL ? 'عدد العملاء' : 'No. of Leads'} 
             />
           ) : (
             <div className="flex items-center justify-center h-full text-gray-500">
               {isRTL ? 'لا توجد بيانات متاحة للعرض' : 'No data available to display'}
             </div>
           )}
        </div>
      </div>

      {/* Leads Overview List Table */}
      <div className=" bg-white/10 backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 overflow-hidden">
        <div className="p-6 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
           <h3 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'قائمة نظرة عامة على العملاء' : 'Leads overview List:'}</h3>
           {canExport && (
             <div className="relative" ref={exportMenuRef}>
               <button 
                 onClick={() => setShowExportMenu(!showExportMenu)} 
                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
               >
                 <FaFileExport /> {isRTL ? 'تصدير' : 'Export'}
                 <FaChevronDown className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} size={12} />
               </button>
               
               {showExportMenu && (
                 <div className={`absolute top-full ${isRTL ? 'left-0' : 'right-0'} mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}>
                   <button 
                     onClick={() => {
                       handleExport();
                       setShowExportMenu(false);
                     }}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                   >
                     <FaFileExcel className="text-green-600" /> {isRTL ? 'تصدير كـ Excel' : 'Export to Excel'}
                   </button>
                   <button 
                     onClick={() => {
                       exportToPdf();
                       setShowExportMenu(false);
                     }}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                   >
                     <FaFilePdf className="text-red-600" /> {isRTL ? 'تصدير كـ PDF' : 'Export to PDF'}
                   </button>
                 </div>
               )}
             </div>
           )}
         </div>
        
        {/* Responsive Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className={`text-xs uppercase bg-white/5 dark:bg-white/5 ${isLight ? 'text-black' : 'text-white'}`}>
              <tr>
                <th className="md:hidden px-6 py-4 border-b border-theme-border dark:border-gray-700/50"></th>
                <th className="px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'مسؤول المبيعات' : 'Sales Person'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'إجمالي العملاء' : 'Total Leads'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'معلق (جديد)' : 'Pending (New)'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'معلق (بارد)' : 'Pending (Cold)'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'متابعة' : 'Follow up'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'عرض' : 'Proposal'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'اجتماع' : 'Meeting'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'حجز' : 'Reservation'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'مغلق' : 'Closed'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRTL ? 'ملغى' : 'Canceled'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border dark:divide-gray-700/50">
              {salesPersonStats.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-6 text-center text-gray-500 dark:text-gray-400"
                  >
                    {isRTL ? 'لا توجد بيانات' : 'No data'}
                  </td>
                </tr>
              )}
              {salesPersonStats.length > 0 && paginatedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-6 text-center text-gray-500 dark:text-gray-400"
                  >
                    {isRTL ? 'لا توجد نتائج' : 'No results'}
                  </td>
                </tr>
              )}
              {paginatedRows.map((stat, idx) => (
                <React.Fragment key={idx}>
                  <tr className="hover:bg-white/5 dark:hover:bg-white/5 transition-colors">
                    <td className="md:hidden px-6 py-4">
                      <button onClick={() => toggleRow(stat.name)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400">
                        {expandedRows[stat.name] ? <ChevronDown size={16} className="transform rotate-180" /> : <ChevronDown size={16} />}
                      </button>
                    </td>
                    <td className={`px-6 py-4 font-bold ${isLight ? 'text-black' : 'text-white'}`}>{stat.name}</td>
                    <td className={`hidden md:table-cell px-6 py-4 font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{stat.total}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-blue-600 dark:text-blue-400">{stat.pendingNew}</td>
                    <td className={`hidden md:table-cell px-6 py-4 ${isLight ? 'text-black' : 'text-white'}`}>{stat.pendingCold}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-amber-600 dark:text-amber-400">{stat.followUp}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-purple-600 dark:text-purple-400">{stat.proposal}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-indigo-600 dark:text-indigo-400">{stat.meeting}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-amber-600 dark:text-amber-400">{stat.reservation}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-green-600 dark:text-green-400 font-bold">{stat.closed}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-red-600 dark:text-red-400">{stat.canceled}</td>
                  </tr>
                  {/* Mobile Expandable Row */}
                  {expandedRows[stat.name] && (
                    <tr className="md:hidden bg-gray-50 dark:bg-white/5">
                      <td colSpan={2} className="px-6 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'إجمالي العملاء' : 'Total Leads'}</span>
                            <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{stat.total}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'معلق (جديد)' : 'Pending (New)'}</span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400">{stat.pendingNew}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'معلق (بارد)' : 'Pending (Cold)'}</span>
                            <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{stat.pendingCold}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'متابعة' : 'Follow up'}</span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">{stat.followUp}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'عرض' : 'Proposal'}</span>
                            <span className="font-semibold text-purple-600 dark:text-purple-400">{stat.proposal}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'اجتماع' : 'Meeting'}</span>
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{stat.meeting}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'حجز' : 'Reservation'}</span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">{stat.reservation}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'مغلق' : 'Closed'}</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">{stat.closed}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRTL ? 'ملغى' : 'Canceled'}</span>
                            <span className="font-semibold text-red-600 dark:text-red-400">{stat.canceled}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-3 bg-theme-bg/80 border-t border-theme-border dark:border-gray-700/60 flex items-center justify-between gap-3">
            <div className={`text-[11px] sm:text-xs ${isLight ? 'text-black' : 'text-white'}`}>
              {isRTL
                ? `إظهار ${Math.min((currentPage - 1) * entriesPerPage + 1, salesPersonStats.length)}-${Math.min(currentPage * entriesPerPage, salesPersonStats.length)} من ${salesPersonStats.length}`
                : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, salesPersonStats.length)}-${Math.min(currentPage * entriesPerPage, salesPersonStats.length)} of ${salesPersonStats.length}`}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  title={isRTL ? 'السابق' : 'Prev'}
                >
                  {isRTL ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </button>
                <span className={`text-sm whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>
                  {isRTL
                    ? `الصفحة ${currentPage} من ${pageCount}`
                    : `Page ${currentPage} of ${pageCount}`}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))}
                  disabled={currentPage === pageCount}
                  title={isRTL ? 'التالي' : 'Next'}
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
                  {isRTL ? 'لكل صفحة:' : 'Per page:'}
                </span>
                <select
                  className={`input w-24 text-sm py-0 px-2 h-8 ${isLight ? 'text-black' : 'text-white'} bg-theme-bg dark:bg-gray-700 border-theme-border dark:border-gray-600`}
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
      </>
      )}
    </div>
  )
}
