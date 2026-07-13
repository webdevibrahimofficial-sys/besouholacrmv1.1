import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '@shared/context/AppStateProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import { api, logExportEvent } from '../utils/api'
import BackButton from '../components/BackButton'
import { PieChart } from '../shared/components/PieChart'
import SearchableSelect from '../components/SearchableSelect'
import EnhancedLeadDetailsModal from '../shared/components/EnhancedLeadDetailsModal'
import DateRangePicker from '../shared/components/DateRangePicker'
import { Filter, User, Users, Tag, Briefcase, Calendar, Trophy, ChevronLeft, ChevronRight, Eye, Trash2 } from 'lucide-react'
import { FaChevronDown, FaFileExport, FaFileExcel, FaFilePdf } from 'react-icons/fa'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function ClosedDealsReport() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const isRTL = (i18n?.language || '').toLowerCase().startsWith('ar')
  const { user, company } = useAppState()
  const canExport = canExportReport(user, 'Closed Deals')
  const companyType = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyType === 'real estate'
  const projectLabel = isRealEstate ? t('Project') : t('Item')
  const dealTypeValue = isRealEstate ? 'unit' : 'item'
  const unitOrItemLabel = isRealEstate ? 'Unit Number' : 'Item'
  const closedByProjectTitle = isRealEstate
    ? t('Closed Deals by Project')
    : (isRTL ? 'الصفقات المغلقة حسب المنتج' : 'Closed Deals by Item')

  const [deals, setDeals] = useState([])
  const [usersList, setUsersList] = useState([])
  const [sourceOptions, setSourceOptions] = useState(['all'])
  const [projectOptions, setProjectOptions] = useState(['all'])
  const [itemsList, setItemsList] = useState([])

  const [salesPersonFilter, setSalesPersonFilter] = useState('all')
  const [managerFilter, setManagerFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [lastActionDateFrom, setLastActionDateFrom] = useState('')
  const [lastActionDateTo, setLastActionDateTo] = useState('')
  const [closedDealDateFrom, setClosedDealDateFrom] = useState('')
  const [closedDealDateTo, setClosedDealDateTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)

  const isSuperManagerRole = (role) => {
    const r = String(role || '').toLowerCase()
    return (
      r === 'admin' ||
      r === 'tenant admin' ||
      r === 'tenant-admin' ||
      r === 'operation manager' ||
      r === 'sales admin' ||
      r === 'director' ||
      r === 'branch manager'
    )
  }

  const getDescendants = (rootId, allUsers) => {
    let descendants = []
    const direct = allUsers.filter(u => u.manager_id === rootId)
    direct.forEach(u => {
      descendants.push(u)
      descendants = descendants.concat(getDescendants(u.id, allUsers))
    })
    return descendants
  }

  const normalizeDate = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    return raw.slice(0, 10)
  }

  const formatDateTime = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString()
  }

  const resolveDealReportStatus = (details) => {
    const raw = String(details?.report_status || '').trim().toLowerCase()
    return ['cancelled', 'canceled'].includes(raw) ? 'cancelled' : 'done'
  }

  const dealStatusClass = (status) => {
    const value = String(status || '').trim().toLowerCase()
    if (value === 'cancelled' || value === 'canceled') {
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
    }
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  }

  const resolveProjectOrItem = (lead) => {
    if (isRealEstate) {
      return (
        lead.project ||
        lead.project_name ||
        (lead.projectRelation && (lead.projectRelation.name || lead.projectRelation.name_ar)) ||
        ''
      )
    }

    return (
      (lead.item && (lead.item.name || lead.item.title || lead.item.product)) ||
      lead.item_name ||
      (lead.meta_data && (lead.meta_data.lead_item_name || lead.meta_data.item_name)) ||
      itemsList.find(it => String(it.id) === String(lead.item_id || ''))?.name ||
      lead.project ||
      ''
    )
  }

  const resolveUnitOrItemName = (lead, details) => {
    if (isRealEstate) {
      return (
        details?.unit ||
        details?.unit_number ||
        details?.unitNumber ||
        details?.property_unit ||
        lead?.meta_data?.payment_plan?.unitNo ||
        lead?.meta_data?.payment_plan?.unit_no ||
        ''
      )
    }

    return (
      details?.item_name ||
      details?.product ||
      (lead?.item && (lead.item.name || lead.item.title || lead.item.product)) ||
      lead?.item_name ||
      (lead?.meta_data && (lead.meta_data.lead_item_name || lead.meta_data.item_name)) ||
      itemsList.find(it => String(it.id) === String(lead?.item_id || ''))?.name ||
      ''
    )
  }

  const openPropertyByUnit = (deal) => {
    const unitValue = String(deal?.unitOrItemName || '').trim()
    if (!isRealEstate || !unitValue) return
    navigate(`/inventory/properties?unit=${encodeURIComponent(unitValue)}`)
  }

  const renderUnitOrItemCell = (deal) => {
    const value = String(deal?.unitOrItemName || '').trim()
    if (!value) return '-'

    if (isRealEstate) {
      return (
        <button
          type="button"
          onClick={() => openPropertyByUnit(deal)}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {value}
        </button>
      )
    }

    return value
  }

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/api/users')
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setUsersList(data)
      } catch (e) {
        console.error('Failed to fetch users for closed deals report', e)
        setUsersList([])
      }
    }
    fetchUsers()
  }, [])

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const res = await api.get('/api/lead-actions', {
          params: {
            next_action_type: 'closing_deals'
          }
        })
        const raw = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        const mapped = raw.map(a => {
          const details = a.details || {}

          const valueRaw =
            details.closingRevenue ??
            details.revenue ??
            a.revenue ??
            (a.lead && a.lead.estimated_value) ??
            0

          const value =
            typeof valueRaw === 'number'
              ? valueRaw
              : parseFloat(valueRaw || '0') || 0

          const closedDateRaw = a.created_at || details.date || ''

          const lead = a.lead || {}
          const salesperson =
            (lead.assigned_agent && lead.assigned_agent.name) ||
            (lead.assignedAgent && lead.assignedAgent.name) ||
            lead.sales_person ||
            lead.salesperson ||
            (a.user && a.user.name) ||
            ''
          const salespersonId =
            lead.assigned_to ??
            lead.assignedTo ??
            (lead.assigned_agent && lead.assigned_agent.id) ??
            (lead.assignedAgent && lead.assignedAgent.id) ??
            a.user_id ??
            (a.user && a.user.id) ??
            null
          const lastActionDateRaw =
            lead.last_action_at ||
            lead.lastActionAt ||
            ''

          return {
            id: a.id,
            leadId: a.lead_id,
            leadName: lead.name || lead.company || '',
            contact: lead.phone || '',
            value,
            dealType: dealTypeValue,
            project: resolveProjectOrItem(lead),
            unitOrItemName: resolveUnitOrItemName(lead, details),
            source: lead.source || '',
            closedDateTime: closedDateRaw,
            closedDate: normalizeDate(closedDateRaw),
            lastActionDate: normalizeDate(lastActionDateRaw),
            status: resolveDealReportStatus(details),
            salesperson,
            salespersonId: salespersonId !== null && salespersonId !== undefined && salespersonId !== ''
              ? String(salespersonId)
              : '',
          }
        })
        setDeals(mapped)
      } catch (e) {
        console.error('Failed to fetch closed deals actions', e)
        setDeals([])
      }
    }
    fetchDeals()
  }, [dealTypeValue, itemsList, isRealEstate])

  useEffect(() => {
    const fetchItems = async () => {
      if (companyType !== 'general') {
        setItemsList([])
        return
      }

      try {
        const res = await api.get('/api/items?all=1')
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setItemsList(data)
      } catch (e) {
        console.error('Failed to fetch items for closed deals report', e)
        setItemsList([])
      }
    }

    fetchItems()
  }, [companyType])

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await api.get('/api/sources?active=1')
        const data = Array.isArray(res.data) ? res.data : (res.data.data || [])
        const names = Array.from(new Set(data.map(s => s.name).filter(Boolean)))
        setSourceOptions(['all', ...names])
      } catch (e) {
        console.error('Failed to fetch sources for closed deals report', e)
        const set = new Set(deals.map(d => d.source).filter(Boolean))
        setSourceOptions(['all', ...Array.from(set)])
      }
    }
    fetchSources()
  }, [deals])

  useEffect(() => {
    const fetchProjectsOrItems = async () => {
      try {
        let names = []
        if (companyType === 'real estate') {
          const res = await api.get('/api/projects')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          names = data.map(p => p.name || p.name_ar || p.title).filter(Boolean)
        } else if (companyType === 'general') {
          const res = await api.get('/api/items?all=1')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          names = data.map(it => it.name || it.product || it.title).filter(Boolean)
        } else {
          const set = new Set(deals.map(d => d.project).filter(Boolean))
          names = Array.from(set)
        }
        const unique = Array.from(new Set(names))
        setProjectOptions(['all', ...unique])
      } catch (e) {
        console.error('Failed to fetch projects/items for closed deals report', e)
        const set = new Set(deals.map(d => d.project).filter(Boolean))
        setProjectOptions(['all', ...Array.from(set)])
      }
    }
    fetchProjectsOrItems()
  }, [companyType, deals])

  const salesPersonOptions = useMemo(() => {
    if (!usersList || usersList.length === 0) {
      const unique = Array.from(
        new Map(
          deals
            .filter(d => d.salespersonId && d.salesperson)
            .map(d => [String(d.salespersonId), { value: String(d.salespersonId), label: d.salesperson }])
        ).values()
      )
      return [{ value: 'all', label: t('All') }, ...unique]
    }

    if (!managerFilter || managerFilter === 'all') {
      const uniqueUsers = Array.from(new Map(usersList.map(u => [u.id, u])).values())
      return [
        { value: 'all', label: t('All') },
        ...uniqueUsers
          .filter(u => String(u?.name || '').trim() !== '')
          .map(u => ({ value: String(u.id), label: u.name }))
      ]
    }

    const selectedManagers = usersList.filter(u => String(u.id) === String(managerFilter))
    const hasSuperManager = selectedManagers.some(u => isSuperManagerRole(u.role))

    let candidates

    if (hasSuperManager) {
      candidates = usersList
    } else {
      const all = []
      selectedManagers.forEach(m => {
        all.push(m)
        const subs = getDescendants(m.id, usersList)
        subs.forEach(s => {
          all.push(s)
        })
      })
      const map = new Map()
      all.forEach(u => {
        if (!map.has(u.id)) {
          map.set(u.id, u)
        }
      })
      candidates = Array.from(map.values())
    }

    return [
      { value: 'all', label: t('All') },
      ...Array.from(new Map(
        candidates
          .filter(u => String(u?.name || '').trim() !== '')
          .map(u => [String(u.id), { value: String(u.id), label: u.name }])
      ).values())
    ]
  }, [usersList, managerFilter, deals, t])

  const managerOptions = useMemo(() => {
    if (!usersList || usersList.length === 0) {
      return [{ value: 'all', label: t('All') }]
    }
    const directManagerIds = new Set(usersList.map(u => Number(u.manager_id)).filter(Number.isFinite))
    const managers = usersList.filter(u => {
      const role = String(u.role || '').toLowerCase()
      const isSalesPerson = role.includes('sales person') || role.includes('salesperson')
      return !isSalesPerson && (directManagerIds.has(Number(u.id)) || isSuperManagerRole(role))
    })
    const uniqueManagers = Array.from(new Map(managers.map(m => [String(m.id), m])).values())
    return [
      { value: 'all', label: t('All') },
      ...uniqueManagers.map(m => ({
        value: String(m.id),
        label: m.role ? `${m.name || `#${m.id}`} (${m.role})` : (m.name || `#${m.id}`)
      }))
    ]
  }, [usersList, t])

  const sourceSelectOptions = useMemo(() => (
    sourceOptions.map(s => ({ value: s, label: s === 'all' ? t('All') : s }))
  ), [sourceOptions, t])

  const projectSelectOptions = useMemo(() => (
    projectOptions.map(p => ({ value: p, label: p === 'all' ? t('All') : p }))
  ), [projectOptions, t])

  const filtered = useMemo(() => {
    return deals.filter(d => {
      const bySales = salesPersonFilter === 'all' ? true : String(d.salespersonId || '') === String(salesPersonFilter)
      const byManager = (() => {
        if (!usersList || managerFilter === 'all') return true
        const mgr = usersList.find(u => String(u.id) === String(managerFilter))
        if (!mgr) return true
        const all = [mgr, ...getDescendants(mgr.id, usersList)]
        const salesIds = new Set(all.map(u => String(u.id)).filter(Boolean))
        return !d.salespersonId || salesIds.has(String(d.salespersonId))
      })()
      const bySource = sourceFilter === 'all' ? true : d.source === sourceFilter
      const byProject = projectFilter === 'all' ? true : d.project === projectFilter
      const byLastAction = (() => {
        if (!lastActionDateFrom && !lastActionDateTo) return true
        const d0 = d.lastActionDate || ''
        if (!d0) return false
        if (lastActionDateFrom && d0 < lastActionDateFrom) return false
        if (lastActionDateTo && d0 > lastActionDateTo) return false
        return true
      })()
      const byClosedDate = (() => {
        if (!closedDealDateFrom && !closedDealDateTo) return true
        const d0 = d.closedDate || ''
        if (!d0) return false
        if (closedDealDateFrom && d0 < closedDealDateFrom) return false
        if (closedDealDateTo && d0 > closedDealDateTo) return false
        return true
      })()
      return bySales && byManager && bySource && byProject && byLastAction && byClosedDate
    })
  }, [deals, salesPersonFilter, managerFilter, sourceFilter, projectFilter, lastActionDateFrom, lastActionDateTo, closedDealDateFrom, closedDealDateTo, usersList])

  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)

  useEffect(() => {
    setCurrentPage(1)
  }, [salesPersonFilter, managerFilter, sourceFilter, projectFilter, lastActionDateFrom, lastActionDateTo, closedDealDateFrom, closedDealDateTo])

  const totalDeals = filtered.length
  const pageCount = Math.ceil(totalDeals / entriesPerPage)
  const paginatedData = filtered.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  )

  const totalRevenue = filtered.reduce((sum, d) => sum + (d.value || 0), 0)
  const totalLeads = useMemo(() => {
    const set = new Set(filtered.map(d => d.leadName))
    return set.size
  }, [filtered])
  const target = useMemo(() => {
    if (!usersList || usersList.length === 0) return 0

    let relevantUsers = []

    if (salesPersonFilter !== 'all') {
      const u = usersList.find(user => String(user.id) === String(salesPersonFilter))
      if (u) relevantUsers = [u]
    } else if (managerFilter !== 'all') {
       const mgr = usersList.find(u => String(u.id) === String(managerFilter))
       if (mgr) {
           relevantUsers = [mgr, ...getDescendants(mgr.id, usersList)]
       }
    } else {
       relevantUsers = usersList
    }

    return relevantUsers.reduce((sum, user) => sum + (parseFloat(user.monthly_target) || 0), 0)
  }, [usersList, salesPersonFilter, managerFilter])

  const achievedPercent = target ? Math.round((totalRevenue / target) * 100) : 0

  const closedByChannelSegments = useMemo(() => {
    const map = new Map()
    filtered.forEach(d => {
      const key = d.source || t('Unknown')
      map.set(key, (map.get(key) || 0) + 1)
    })
    const baseColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#22c55e']
    return Array.from(map.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [filtered, t])

  const closedByProjectSegments = useMemo(() => {
    const map = new Map()
    filtered.forEach(d => {
      const key = d.project || t('Unknown')
      map.set(key, (map.get(key) || 0) + 1)
    })
    const baseColors = ['#8b5cf6', '#ec4899', '#10b981', '#f97316', '#3b82f6', '#22c55e']
    return Array.from(map.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [filtered, t])

  const barData = useMemo(() => {
    const map = new Map()
    filtered.forEach(d => {
      map.set(d.salesperson, (map.get(d.salesperson) || 0) + d.value)
    })
    const labels = Array.from(map.keys())
    const values = Array.from(map.values())
    return {
      labels,
      datasets: [
        {
          label: t('Deal Value'),
          data: values,
          backgroundColor: 'rgba(59, 130, 246, 0.7)'
        }
      ]
    }
  }, [filtered, t])

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'x',
    plugins: { legend: { display: false } },
    scales: {
      x: {
        title: {
          display: true,
          text: t('Sales Person')
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: t('Deal Value')
        }
      }
    }
  }

  const handleExportExcel = () => {
    const rows = filtered.map(d => ({
      [t('Sales Person')]: d.salesperson,
      [t('Lead Name')]: d.leadName,
      [t('Contact')]: d.contact,
      [t('Source')]: d.source,
      [projectLabel]: d.project,
      [t('Deal Type')]: d.dealType,
      [unitOrItemLabel]: d.unitOrItemName,
      [t('Deal Value')]: d.value,
      [t('Closed Deal Date')]: formatDateTime(d.closedDateTime),
      [t('Status')]: d.status
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ClosedDeals')
    const fileName = 'Closed_Deals_Report.xlsx'
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: 'Closed Deals Report',
      fileName,
      format: 'xlsx',
    })
    setShowExportMenu(false)
  }

  const handleExportPdf = () => {
    window.print()
    setShowExportMenu(false)
  }

  const handleExport = () => {
    window.print()
    setShowExportMenu(false)
  }

  const handlePreview = (deal) => {
    setSelectedLead({
      id: deal.leadId,
      name: deal.leadName,
      phone: deal.contact,
      source: deal.source,
      status: 'qualified',
      assignedTo: deal.salesperson,
      project: deal.project
    })
    setShowLeadModal(true)
  }

  const handleDelete = (id) => {
    setDeals(prev => prev.filter(d => d.id !== id))
  }

  const clearFilters = () => {
    setSalesPersonFilter('all')
    setManagerFilter('all')
    setSourceFilter('all')
    setProjectFilter('all')
    setLastActionDateFrom('')
    setLastActionDateTo('')
    setClosedDealDateFrom('')
    setClosedDealDateTo('')
  }

  const renderPieCard = (title, data) => {
    const total = data.reduce((sum, item) => sum + (item.value || 0), 0)
    return (
      <div className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
        <div className={`text-sm font-semibold mb-2 ${isLight ? 'text-black' : 'text-white'} text-center md:text-left`}>{title}</div>
        <div className="h-48 flex items-center justify-center">
          <PieChart
            segments={data}
            size={170}
            centerValue={total}
            centerLabel={t('Total')}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {data.map(segment => (
            <div key={segment.label} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></div>
              <span className={`${isLight ? 'text-black' : 'text-white'}`}>
                {segment.label}: {segment.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 bg-[var(--content-bg)] text-[var(--content-text)] overflow-hidden min-w-0 max-w-[1600px] mx-auto space-y-6">
      {/* Header & Back Button */}
      <div className="mb-8">
        <BackButton to="/reports" />
        <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-2`}>
          {t(' Closed Deals')}
        </h1>
        <p className={`${isLight ? 'text-black' : 'text-white'} text-sm`}>
          {t('Analyze your closed deals performance and revenue')}
        </p>
      </div>

      <div className="bg-theme-bg backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 p-6 mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3 className={`${isLight ? 'text-black' : 'text-white'}`}>{t('Filter')}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllFilters(prev => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <FaChevronDown
                size={12}
                className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`}
              />
            </button>
            <button
              onClick={clearFilters}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {t('Reset')}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <User size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Sales Person')}
              </label>
              <SearchableSelect
                options={salesPersonOptions}
                value={salesPersonFilter}
                onChange={v => setSalesPersonFilter(v)}
                placeholder={t('Sales Person')}
                isRTL={isRTL}
                icon={<User size={16} />}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Users size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Manager')}
              </label>
              <SearchableSelect
                options={managerOptions}
                value={managerFilter}
                onChange={v => setManagerFilter(v)}
                placeholder={t('Manager')}
                isRTL={isRTL}
                icon={<Users size={16} />}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Source')}
              </label>
              <SearchableSelect
                options={sourceSelectOptions}
                value={sourceFilter}
                onChange={v => setSourceFilter(v)}
                placeholder={t('Source')}
                isRTL={isRTL}
                icon={<Tag size={16} />}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? (isRealEstate ? 'المشروع' : 'المنتج') : projectLabel}
              </label>
              <SearchableSelect
                options={projectSelectOptions}
                value={projectFilter}
                onChange={v => setProjectFilter(v)}
                placeholder={projectLabel}
                isRTL={isRTL}
                icon={<Briefcase size={16} />}
              />
            </div>
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${
              showAllFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Last Action Date')}
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
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {t('Closed Deal Date')}
              </label>
              <DateRangePicker
                from={closedDealDateFrom}
                to={closedDealDateTo}
                onChange={({ from, to }) => {
                  setClosedDealDateFrom(from)
                  setClosedDealDateTo(to)
                }}
                isRTL={isRTL}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('Total Closed Deals'), value: totalDeals, accent: 'bg-emerald-500' },
          { label: t('Total Leads'), value: totalLeads, accent: 'bg-indigo-500' },
          { label: t('Total Revenue'), value: `${totalRevenue.toLocaleString()} EGP`, accent: 'bg-blue-500' },
          { label: t('Achieved of Target'), value: `${achievedPercent}%`, accent: 'bg-orange-500' }
        ].map(card => (
          <div
            key={card.label}
            className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex items-center justify-between"
          >
            <div>
              <div className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{card.label}</div>
              <div className="text-lg font-semibold">{card.value}</div>
            </div>
            <div className={`w-8 h-8 rounded-lg ${card.accent}`}></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {renderPieCard(t('Closed Deals by Channels'), closedByChannelSegments)}
        {renderPieCard(closedByProjectTitle, closedByProjectSegments)}
        <div className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <Trophy size={20} />
            </div>
            <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{t('Deal Value for each Person')}</div>
          </div>
          <div className="flex-1 mt-2 w-full min-h-[220px]">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{t('Closed Deals Overview')}</h2>
          {canExport && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(prev => !prev)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                <FaFileExport />
                {t('Export')}
                <FaChevronDown
                  className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`}
                  size={12}
                />
              </button>
              {showExportMenu && (
                <div className={`absolute top-full ${isRTL ? 'left-0' : 'right-0'} mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}>
                  <button
                    onClick={handleExportExcel}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFileExcel className="text-green-600" /> {t('Export to Excel')}
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className="text-red-600" /> {t('Export to PDF')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Mobile View - Cards */}
        <div className="md:hidden space-y-4 p-4">
          {paginatedData.map(deal => (
            <div key={deal.id} className=" rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className={`text-sm ${isLight ? 'text-black' : 'text-white'}`}>{deal.salesperson}</p>
                  <h3 className={`font-semibold ${isLight ? 'text-black' : 'text-white'} text-lg`}>{deal.leadName}</h3>
                  <p className={`text-sm ${isLight ? 'text-black' : 'text-white'}`}>{deal.contact}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-600 dark:text-blue-400">{deal.value.toLocaleString()} EGP</p>
                  <span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 mt-1">
                    {deal.dealType}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{projectLabel}</p>
                  <p className="font-medium dark:text-gray-200">{deal.project}</p>
                </div>
                <div className="space-y-1">
                  <p className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{unitOrItemLabel}</p>
                  <div className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{renderUnitOrItemCell(deal)}</div>
                </div>
                <div className="space-y-1">
                  <p className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{t('Source')}</p>
                  <p className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{deal.source}</p>
                </div>
                <div className="space-y-1">
                  <p className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{t('Closed Date')}</p>
                  <p className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{formatDateTime(deal.closedDateTime)}</p>
                </div>
                <div className="space-y-1">
                  <p className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{t('Status')}</p>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dealStatusClass(deal.status)}`}>{deal.status}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
                <button
                  onClick={() => handlePreview(deal)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                >
                  <Eye size={14} />
                  {t('Preview')}
                </button>
                <button
                  onClick={() => handleDelete(deal.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                  {t('Delete')}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('No closed deals found')}
            </div>
          )}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className={`w-full text-sm text-left ${isLight ? 'text-black' : 'text-white'}`}>
            <thead className={`text-xs uppercase bg-white/5 dark:bg-white/5 ${isLight ? 'text-black' : 'text-white'}`}>
              <tr>
                <th className="px-4 py-3">{t('Sales Person')}</th>
                <th className="px-4 py-3">{t('Lead Name')}</th>
                <th className="px-4 py-3">{t('Contact')}</th>
                <th className="px-4 py-3">{t('Source')}</th>
                <th className="px-4 py-3">{projectLabel}</th>
                <th className="px-4 py-3">{t('Deal Type')}</th>
                <th className="px-4 py-3">{unitOrItemLabel}</th>
                <th className="px-4 py-3 text-center">{t('Deal Value')}</th>
                <th className="px-4 py-3">{t('Closed Deal Date')}</th>
                <th className="px-4 py-3">{t('Status')}</th>
                <th className="px-4 py-3 text-center">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 dark:divide-gray-700/50">
              {paginatedData.map(deal => (
                <tr key={deal.id} className="hover:bg-white/5 dark:hover:bg-white/5 transition-colors">
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{deal.salesperson}</td>
                  <td className={`px-4 py-3 font-medium ${isLight ? 'text-black' : 'text-white'}`}>{deal.leadName}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{deal.contact}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{deal.source}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{deal.project}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{deal.dealType}</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{renderUnitOrItemCell(deal)}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{deal.value.toLocaleString()} EGP</td>
                  <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'}`}>{formatDateTime(deal.closedDateTime)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dealStatusClass(deal.status)}`}>{deal.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => handlePreview(deal)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title={t('Preview')}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(deal.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title={t('Delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className={`px-4 py-8 text-center ${isLight ? 'text-black' : 'text-white'}`}>
                    {t('No closed deals found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 bg-[var(--content-bg)]/80 border-t border-white/10 dark:border-gray-700/60 flex items-center justify-between gap-3">
          <div className="text-[11px] sm:text-xs text-[var(--muted-text)]">
            {isRTL
              ? `إظهار ${Math.min((currentPage - 1) * entriesPerPage + 1, totalDeals)}-${Math.min(currentPage * entriesPerPage, totalDeals)} من ${totalDeals}`
              : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, totalDeals)}-${Math.min(currentPage * entriesPerPage, totalDeals)} of ${totalDeals}`}
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
              <span className="text-sm whitespace-nowrap">
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
              <span className="text-[10px] sm:text-xs text-[var(--muted-text)] whitespace-nowrap">
                {isRTL ? 'لكل صفحة:' : 'Per page:'}
              </span>
              <select
                className="input w-24 text-sm py-0 px-2 h-8"
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
      <EnhancedLeadDetailsModal
        lead={selectedLead}
        isOpen={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        theme={theme}
      />
    </div>
  )
}
