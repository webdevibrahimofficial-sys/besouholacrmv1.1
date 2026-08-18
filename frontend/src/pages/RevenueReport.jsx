import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { logExportEvent } from '../utils/api'
import { useNavigate, useLocation } from 'react-router-dom'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useAppState } from '@shared/context/AppStateProvider'
import { api } from '../utils/api'
import BackButton from '../components/BackButton'
import { PieChart } from '../shared/components/PieChart'
import SearchableSelect from '../components/SearchableSelect'
import ListHoverPopover from '../components/ListHoverPopover'
import DateRangePicker from '../shared/components/DateRangePicker'
import { getSourceCanonicalName, getSourceDisplayName } from '../shared/utils/sourceDisplay'
import { Filter, User, Users, Target, Tag, Briefcase, Package, Calendar, Trophy, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { FaFileExport, FaFileExcel, FaFilePdf } from 'react-icons/fa'
import { useTheme } from '@shared/context/ThemeProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import {
  effectiveDateRange,
  getPeriodBounds,
  isDateInRange,
  matchCommissionRate,
  periodsCoveredInYear,
  resolveRevenueProjectOrItem,
  extractRevenueDealItems,
  resolveTargetForYear,
  resolveCompanyPeriodTarget,
  resolveSalespersonRowTarget,
  resolveTiersForYear,
  calculateAchievementPercent,
  formatAchievementPercent,
  formatCompactMoney,
  indexUsersById,
  resolveManagerName,
  usesCompanyTarget,
  isManagerFilterRole,
  shouldIncludeInSalespersonRows,
  matchesManagerFilter,
  resolveReportKpiTarget,
  countClosedDeals,
  calculateInheritedCommission,
} from '../utils/targetRevenueReport'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function RevenueReport() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const isRTL = i18n.language === 'ar'
  const { user: currentUser, company } = useAppState()
  const canExport = canExportReport(currentUser, 'Targets & Revenue')
  const companyType = String(company?.company_type || '').toLowerCase()
  const [salesPersonFilter, setSalesPersonFilter] = useState('all')
  const [managerFilter, setManagerFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [dealTypeFilter, setDealTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))
  const [targetTypeFilter, setTargetTypeFilter] = useState('monthly')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showSalesGroupingMenu, setShowSalesGroupingMenu] = useState(false)
  const [showTimeGroupingMenu, setShowTimeGroupingMenu] = useState(false)
  const [revenuePieMode, setRevenuePieMode] = useState('project')
  const salesMenuRef = useRef(null)
  const timeMenuRef = useRef(null)
  const autoExportDoneRef = useRef(false)
  const [usersList, setUsersList] = useState([])
  const [targetHistory, setTargetHistory] = useState([])
  const [companyTargetHistory, setCompanyTargetHistory] = useState([])
  const [targetYears, setTargetYears] = useState([new Date().getFullYear()])
  const [tenantCreatedYear, setTenantCreatedYear] = useState(new Date().getFullYear())
  const [reportCurrentYear, setReportCurrentYear] = useState(new Date().getFullYear())
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const [projectOptions, setProjectOptions] = useState(['all'])
  const [records, setRecords] = useState([])
  const [closedDealActions, setClosedDealActions] = useState([])
  const [itemsCatalog, setItemsCatalog] = useState([])
  const projectLabel = companyType === 'general' ? t('Item') : t('Project')
  const revenueByProjectLabel = companyType === 'general' ? t('Revenue by Item') : t('Revenue by Project')
  const ProjectIcon = companyType === 'general' ? Package : Briefcase
  const formatMoney = (value) => `${Number(value || 0).toLocaleString()} EGP`
  const reportNow = useMemo(() => new Date(), [])
  const currentYear = Number(reportCurrentYear || reportNow.getFullYear())

  const usersById = useMemo(() => indexUsersById(usersList), [usersList])

  const targetHistoryByUser = useMemo(() => {
    const map = new Map()
    ;(targetHistory || []).forEach(row => {
      const uid = String(row.user_id || row.user?.id || '')
      if (!uid) return
      if (!map.has(uid)) map.set(uid, [])
      map.get(uid).push(row)
    })
    return map
  }, [targetHistory])

  const periodRange = useMemo(() => {
    const period = getPeriodBounds({
      yearFilter,
      targetType: targetTypeFilter,
      now: reportNow,
      tenantCreatedYear,
    })
    return effectiveDateRange({
      period,
      dateFrom: dateFromFilter,
      dateTo: dateToFilter,
    })
  }, [yearFilter, targetTypeFilter, reportNow, tenantCreatedYear, dateFromFilter, dateToFilter])

  const getUserRows = useCallback((user) => {
    const uid = String(user?.id || user?.salespersonId || '')
    return uid ? (targetHistoryByUser.get(uid) || []) : []
  }, [targetHistoryByUser])

  const getUserTarget = useCallback((user, type = targetTypeFilter, selectedYear = yearFilter) => (
    resolveSalespersonRowTarget({
      user,
      rows: getUserRows(user),
      yearFilter: selectedYear,
      type,
      currentYear,
      tenantCreatedYear,
      now: reportNow,
    })
  ), [getUserRows, targetTypeFilter, yearFilter, currentYear, tenantCreatedYear, reportNow])

  const getUserYearScopedTarget = useCallback((user, year, type = targetTypeFilter) => {
    if (usesCompanyTarget(user)) return 0
    const unit = resolveTargetForYear(user, getUserRows(user), year, type, currentYear)
    if (yearFilter !== 'all') return unit
    return unit * periodsCoveredInYear(year, type, { now: reportNow, tenantCreatedYear })
  }, [getUserRows, targetTypeFilter, yearFilter, currentYear, reportNow, tenantCreatedYear])

  const companyPeriodTarget = useMemo(() => (
    resolveCompanyPeriodTarget({
      rows: companyTargetHistory,
      yearFilter,
      type: targetTypeFilter,
      currentYear,
      tenantCreatedYear,
      now: reportNow,
    })
  ), [companyTargetHistory, yearFilter, targetTypeFilter, currentYear, tenantCreatedYear, reportNow])

  const sourceLabelMap = useMemo(() => {
    const map = new Map()
    ;(sourcesCatalog || []).forEach((source) => {
      const key = getSourceCanonicalName(source)
      const label = getSourceDisplayName(source, isRTL)
      if (key && label) map.set(key, label)
    })
    return map
  }, [isRTL, sourcesCatalog])

  const localizeSourceLabel = (value) => {
    const key = String(value || '').trim()
    if (!key) return key
    return sourceLabelMap.get(key) || key
  }

  const itemNameById = useMemo(() => {
    const map = new Map()
    ;(itemsCatalog || []).forEach((item) => {
      const name = String(item?.name || item?.product || item?.title || '').trim()
      if (item?.id == null || !name) return
      map.set(String(item.id), name)
    })
    return map
  }, [itemsCatalog])

  const resolvedRecords = useMemo(() => (
    records.map((row) => {
      const dealItems = extractRevenueDealItems(row, { itemsById: itemNameById })
      return {
        ...row,
        dealItems,
        project: resolveRevenueProjectOrItem(row.lead, {
          companyType,
          itemsById: itemNameById,
          dealItems,
          action: row.action,
          revenueItemName: row.item_name,
        }) || row.project || '',
      }
    })
  ), [records, companyType, itemNameById])

  const enrichedRecords = useMemo(() => {
    // Map to store records by user ID
    const revenueMap = new Map()
    resolvedRecords.forEach(r => {
        const uid = r.salespersonId ? String(r.salespersonId) : 'unknown'
        if (!revenueMap.has(uid)) revenueMap.set(uid, [])
        revenueMap.get(uid).push(r)
    })

    const allRows = []
    const processedUserIds = new Set()

    // 1. Process active users
    usersList.forEach(u => {
        const uid = String(u.id)
        processedUserIds.add(uid)
        
        // Check if this is a sales/manager/relevant user
        const resolvedTarget = getUserTarget(u)
        const hasRevenue = revenueMap.has(uid)

        if (!shouldIncludeInSalespersonRows(u, { personalTarget: resolvedTarget, hasRevenue })) {
          return
        }

        const userRevenues = revenueMap.get(uid) || []
        if (userRevenues.length > 0) {
            userRevenues.forEach(r => {
                const rowYear = r.date ? r.date.slice(0, 4) : String(currentYear)
                const rowTarget = yearFilter === 'all' && r.date
                  ? getUserYearScopedTarget(u, rowYear)
                  : resolvedTarget
                allRows.push({
                    ...r,
                    salesperson: u.name,
                    manager: resolveManagerName(u, usersById) || r.manager || resolveManagerName({ manager_id: r.lead?.manager_id }, usersById),
                    target: rowTarget,
                    monthlyTarget: getUserTarget(u, 'monthly'),
                    quarterlyTarget: getUserTarget(u, 'quarterly'),
                    semiAnnualTarget: getUserTarget(u, 'semi_annual'),
                    yearlyTarget: getUserTarget(u, 'yearly')
                })
            })
        } else {
            allRows.push({
               id: `empty-${uid}`,
               salesperson: u.name,
               salespersonId: u.id,
               manager: resolveManagerName(u, usersById),
               source: '-',
               project: '-',
               dealType: '-',
               status: 'No Sales',
               date: '',
               target: resolvedTarget,
               monthlyTarget: getUserTarget(u, 'monthly'),
               quarterlyTarget: getUserTarget(u, 'quarterly'),
               semiAnnualTarget: getUserTarget(u, 'semi_annual'),
               yearlyTarget: getUserTarget(u, 'yearly'),
               revenue: 0
            })
        }
    })

    // 2. Process orphaned records (users not in usersList)
    resolvedRecords.forEach(r => {
        const uid = r.salespersonId ? String(r.salespersonId) : 'unknown'
        if (!processedUserIds.has(uid) && uid !== 'unknown') {
            allRows.push({
                ...r,
                target: 0, // No user info = no target known
                monthlyTarget: 0,
                yearlyTarget: 0,
                commissionPercentage: 0
            })
        }
    })

    return allRows
  }, [resolvedRecords, usersList, usersById, getUserTarget, getUserYearScopedTarget, yearFilter, currentYear])

  useEffect(() => {
    const fetchRevenueRecords = async () => {
      try {
        const res = await api.get('/api/revenues')
        const raw = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        const mapped = raw.map(r => {
          const lead = r.lead || {}
          const user = r.user || {}
          
          const salesperson = user.name || lead.sales_person || lead.salesperson || ''
          const manager = resolveManagerName(user, usersById)
          const source = r.source || lead.source || ''
          const project = resolveRevenueProjectOrItem(lead, {
            companyType,
            action: r.action,
            dealItems: r.deal_items,
            revenueItemName: r.item_name,
          })
          const dealType = 'Closed Won' // Revenue implies it's closed/won
          const status = 'Closed Won'

          const revenue = parseFloat(r.amount || 0)

          const dateRaw = r.created_at || ''
          const date =
            typeof dateRaw === 'string' && dateRaw
              ? dateRaw.slice(0, 10)
              : ''

          // We will map target later from usersList
          const target = 0

          return {
            id: r.id,
            salesperson,
            salespersonId: r.user_id,
            lead_id: r.lead_id || lead.id || null,
            manager,
            source,
            project,
            lead,
            action: r.action || null,
            item_name: r.item_name || '',
            deal_items: Array.isArray(r.deal_items) ? r.deal_items : [],
            dealType,
            status,
            date,
            target,
            monthlyTarget: 0,
            yearlyTarget: 0,
            revenue
          }
        })
        setRecords(mapped)
      } catch (e) {
        console.error('Failed to fetch revenue records', e)
        setRecords([])
      }
    }

    fetchRevenueRecords()
  }, [companyType])

  useEffect(() => {
    const fetchClosedDeals = async () => {
      try {
        const res = await api.get('/api/lead-actions', {
          params: { next_action_type: 'closing_deals' },
        })
        const raw = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setClosedDealActions(raw)
      } catch (e) {
        console.error('Failed to fetch closed deals for revenue report', e)
        setClosedDealActions([])
      }
    }
    fetchClosedDeals()
  }, [])

  useEffect(() => {
    const handleClickOutside = event => {
      if (salesMenuRef.current && !salesMenuRef.current.contains(event.target)) {
        setShowSalesGroupingMenu(false)
      }
      if (timeMenuRef.current && !timeMenuRef.current.contains(event.target)) {
        setShowTimeGroupingMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/api/users')
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setUsersList(data)
      } catch (e) {
        console.error('Failed to fetch users for revenue report', e)
        setUsersList([])
      }
    }
    fetchUsers()
  }, [])

  useEffect(() => {
    const fetchTargets = async () => {
      try {
        const res = await api.get('/api/user-targets?year=all')
        const rows = Array.isArray(res.data?.data) ? res.data.data : []
        setTargetHistory(rows)
        const years = Array.isArray(res.data?.years) && res.data.years.length
          ? res.data.years
          : [new Date().getFullYear()]
        setTargetYears(years)
        if (res.data?.tenant_created_year) {
          setTenantCreatedYear(Number(res.data.tenant_created_year))
        }
        if (res.data?.current_year) {
          setReportCurrentYear(Number(res.data.current_year))
        }
        if (!yearFilter && res.data?.current_year) {
          setYearFilter(String(res.data.current_year))
        }
      } catch (e) {
        console.error('Failed to fetch target history for revenue report', e)
        setTargetHistory([])
      }
    }
    fetchTargets()
  }, [])

  useEffect(() => {
    const fetchCompanyTargets = async () => {
      try {
        const res = await api.get('/api/company-targets?year=all')
        const rows = Array.isArray(res.data?.data) ? res.data.data : []
        setCompanyTargetHistory(rows)
      } catch (e) {
        console.error('Failed to fetch company targets for revenue report', e)
        setCompanyTargetHistory([])
      }
    }
    fetchCompanyTargets()
  }, [])

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await api.get('/api/sources?active=1')
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setSourcesCatalog(data)
      } catch (e) {
        console.error('Failed to fetch sources for revenue report', e)
        setSourcesCatalog([])
      }
    }
    fetchSources()
  }, [])

  useEffect(() => {
    const fetchProjectsOrItems = async () => {
      try {
        let names = []
        if (companyType === 'real estate') {
          const res = await api.get('/api/projects')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          setItemsCatalog([])
          names = data.map(p => p.name || p.name_ar || p.title).filter(Boolean)
        } else if (companyType === 'general') {
          const res = await api.get('/api/items?all=1')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          setItemsCatalog(data)
          names = data.map(it => it.name || it.product || it.title).filter(Boolean)
        } else {
          setItemsCatalog([])
          const set = new Set(records.map(r => r.project).filter(Boolean))
          names = Array.from(set)
        }
        const unique = Array.from(new Set(names))
        setProjectOptions(['all', ...unique])
      } catch (e) {
        console.error('Failed to fetch projects/items for revenue report', e)
        setItemsCatalog([])
        const set = new Set(records.map(r => r.project).filter(Boolean))
        setProjectOptions(['all', ...Array.from(set)])
      }
    }
    fetchProjectsOrItems()
  }, [companyType, records])

  const salespersonOptions = useMemo(() => {
    if (!usersList.length) {
      const set = new Set(records.map(r => r.salesperson).filter(Boolean))
      return [
        { value: 'all', label: t('All') },
        ...Array.from(set).map(name => ({ value: name, label: name }))
      ]
    }
    const uniqueUsers = Array.from(new Map(usersList.map(u => [u.id, u])).values())
    
    // Filter by manager if selected
    const filteredUsers = uniqueUsers.filter(u => matchesManagerFilter(u, managerFilter, usersById))

    return [
      { value: 'all', label: t('All') },
      ...filteredUsers
        .filter(u => String(u?.name || '').trim() !== '')
        .map(u => {
          const roleName = (Array.isArray(u.roles) && u.roles[0]?.name) || u.role || ''
          return {
            value: u.name,
            label: u.name + (roleName ? ` (${roleName})` : '')
          }
        })
    ]
  }, [usersList, usersById, records, managerFilter, t])

  const managerOptions = useMemo(() => {
    if (!usersList.length) {
      return [{ value: 'all', label: t('All') }]
    }
    const managers = usersList.filter(isManagerFilterRole)
    const uniqueManagers = Array.from(new Map(managers.map(m => [m.id, m])).values())
    
    return [
      { value: 'all', label: t('All') },
      ...uniqueManagers.map(m => {
        const roleName = (Array.isArray(m.roles) && m.roles[0]?.name) || m.role || ''
        return {
          value: m.name || `#${m.id}`,
          label: m.name + (roleName ? ` (${roleName})` : '')
        }
      })
    ]
  }, [usersList, t])

  const normalizedSourceOptions = useMemo(() => {
    const values = Array.from(new Set([
      ...(sourcesCatalog || []).map((source) => getSourceCanonicalName(source)).filter(Boolean),
      ...records.map((record) => String(record?.source || '').trim()).filter(Boolean),
    ]))

    return [
      { value: 'all', label: t('All') },
      ...values.map((value) => ({ value, label: localizeSourceLabel(value) })),
    ]
  }, [records, sourceLabelMap, sourcesCatalog, t])

  const normalizedProjectOptions = useMemo(
    () => projectOptions.map(p => ({ value: p, label: p === 'all' ? t('All') : p })),
    [projectOptions, t]
  )

  const dealTypeOptions = useMemo(() => ([
    { value: 'all', label: t('All') },
    { value: 'Proposal', label: t('Proposal') },
    { value: 'Reservation', label: t('Reservation') },
    { value: 'Contract', label: t('Contract') }
  ]), [t])

  const statusOptions = useMemo(() => ([
    { value: 'all', label: t('All') },
    { value: 'Closed Won', label: t('Closed Won') },
    { value: 'Closed Lost', label: t('Closed Lost') },
    { value: 'In Progress', label: t('In Progress') }
  ]), [t])

  const filtered = useMemo(() => {
    const rows = enrichedRecords.filter(r => {
      const bySales = salesPersonFilter === 'all' || r.salesperson === salesPersonFilter
      const byManager = managerFilter === 'all' || r.manager === managerFilter || r.salesperson === managerFilter
      const bySource = sourceFilter === 'all' || r.source === sourceFilter
      const byProject = projectFilter === 'all' || r.project === projectFilter
      const byDealType = dealTypeFilter === 'all' || r.dealType === dealTypeFilter
      const byStatus = statusFilter === 'all' || r.status === statusFilter
      const byPeriod = !r.date || isDateInRange(r.date, periodRange)

      return bySales && byManager && bySource && byProject && byDealType && byStatus && byPeriod
    })

    const userKeyOf = (row) => (row.salespersonId ? String(row.salespersonId) : (row.salesperson || 'unknown'))
    const yearKeyOf = (row) => {
      if (row.date) return row.date.slice(0, 4)
      return yearFilter === 'all' ? String(currentYear) : String(yearFilter)
    }

    const aggregateByUserYear = new Map()
    rows.forEach(row => {
      const key = `${userKeyOf(row)}:${yearKeyOf(row)}`
      if (!aggregateByUserYear.has(key)) {
        const user = usersList.find(u => String(u.id) === String(row.salespersonId))
        const target = user
          ? (yearFilter === 'all' && row.date
              ? getUserYearScopedTarget(user, yearKeyOf(row))
              : getUserTarget(user))
          : (row.target || 0)
        aggregateByUserYear.set(key, { revenue: 0, target })
      }
      const current = aggregateByUserYear.get(key)
      current.revenue += row.revenue || 0
    })

    return rows.map(row => {
      const yearKey = yearKeyOf(row)
      const aggregate = aggregateByUserYear.get(`${userKeyOf(row)}:${yearKey}`) || { revenue: row.revenue || 0, target: row.target || 0 }
      const aggregateAchievement = calculateAchievementPercent(aggregate.revenue, aggregate.target)
      const user = usersList.find(u => String(u.id) === String(row.salespersonId)) || row
      const commissionRate = matchCommissionRate(
        resolveTiersForYear(user, getUserRows(user), yearKey, currentYear),
        aggregateAchievement
      )
      return {
        ...row,
        target: aggregate.target || row.target || 0,
        aggregateAchievement,
        commissionRate,
        commission: ((row.revenue || 0) * commissionRate) / 100,
      }
    })
  }, [
    enrichedRecords,
    usersList,
    salesPersonFilter,
    managerFilter,
    sourceFilter,
    projectFilter,
    dealTypeFilter,
    statusFilter,
    yearFilter,
    currentYear,
    periodRange,
    getUserTarget,
    getUserYearScopedTarget,
    getUserRows,
  ])

  const uniqueDisplay = (values) => {
    const unique = [...new Set((values || [])
      .map(value => String(value || '').trim())
      .filter(value => value && value !== '-'))]
    if (!unique.length) return '-'
    if (unique.length === 1) return unique[0]
    return unique.join(', ')
  }

  const dateDisplay = (dates) => {
    const valid = (dates || []).filter(Boolean).sort()
    if (!valid.length) return ''
    if (valid[0] === valid[valid.length - 1]) return valid[0]
    return `${valid[0]} → ${valid[valid.length - 1]}`
  }

  const overviewRows = useMemo(() => {
    const map = new Map()
    filtered.forEach(row => {
      const key = row.salespersonId ? String(row.salespersonId) : (row.salesperson || 'unknown')
      if (!map.has(key)) {
        map.set(key, {
          id: `user-${key}`,
          salespersonId: row.salespersonId,
          salesperson: row.salesperson,
          manager: row.manager || resolveManagerName(usersById.get(String(row.salespersonId || '')), usersById),
          projects: new Map(),
          sources: new Map(),
          dealTypes: [],
          dates: [],
          target: row.target || 0,
          revenue: 0,
          commission: 0,
        })
      }
      const item = map.get(key)
      item.revenue += row.revenue || 0
      item.commission += row.commission || 0
      const bumpNamed = (collection, name, amount) => {
        const named = String(name || '').trim()
        if (!named || named === '-' || !(Number(amount) > 0)) return
        const current = collection.get(named) || { label: named, revenue: 0 }
        current.revenue += Number(amount || 0) || 0
        collection.set(named, current)
      }
      if (row.date && Number(row.revenue) > 0) {
        const namedItems = (Array.isArray(row.dealItems) ? row.dealItems : [])
          .map((entry) => ({
            label: String(entry?.label || entry?.name || '').trim(),
            revenue: Number(entry?.revenue ?? entry?.amount ?? 0) || 0,
          }))
          .filter((entry) => entry.label && entry.label !== '-')
        if (namedItems.length) {
          const hasAmounts = namedItems.some((entry) => entry.revenue > 0)
          namedItems.forEach((entry) => {
            bumpNamed(
              item.projects,
              entry.label,
              hasAmounts ? entry.revenue : (namedItems.length === 1 ? row.revenue : 0)
            )
          })
        } else {
          bumpNamed(item.projects, row.project, row.revenue)
        }
        bumpNamed(item.sources, row.source, row.revenue)
      }
      if (row.dealType) item.dealTypes.push(row.dealType)
      if (row.date) item.dates.push(row.date)
      if (!item.manager && row.manager) item.manager = row.manager
    })

    return Array.from(map.values()).map(item => {
      const user = usersList.find(u => String(u.id) === String(item.salespersonId))
      const target = user ? getUserTarget(user) : (item.target || 0)
      const aggregateAchievement = calculateAchievementPercent(item.revenue, target)
      const yearKey = yearFilter === 'all' ? String(currentYear) : String(yearFilter)
      const matchedRate = matchCommissionRate(
        resolveTiersForYear(user || item, getUserRows(user || item), yearKey, currentYear),
        aggregateAchievement
      )
      const personalCommission = yearFilter === 'all'
        ? (item.commission || 0)
        : ((item.revenue || 0) * matchedRate) / 100
      const inherited = user
        ? calculateInheritedCommission({
            user,
            users: usersList,
            targetHistoryByUser,
            revenueRows: filtered,
            yearFilter,
            type: targetTypeFilter,
            currentYear,
            tenantCreatedYear,
            now: reportNow,
          })
        : { commission: 0, rate: 0, revenue: 0, target: 0, achievement: 0 }
      const commission = personalCommission + (inherited.commission || 0)
      const commissionRate = yearFilter === 'all' && item.revenue
        ? Number((((personalCommission || 0) / item.revenue) * 100).toFixed(2))
        : matchedRate
      const hasRevenue = (item.revenue || 0) > 0
      const projectItems = Array.from(item.projects.values())
        .sort((a, b) => (b.revenue - a.revenue) || String(a.label).localeCompare(String(b.label)))
      const sourceItems = Array.from(item.sources.values())
        .map(entry => ({ ...entry, label: localizeSourceLabel(entry.label) }))
        .sort((a, b) => (b.revenue - a.revenue) || String(a.label).localeCompare(String(b.label)))

      return {
        id: item.id,
        salespersonId: item.salespersonId,
        salesperson: item.salesperson,
        manager: resolveManagerName(user, usersById) || item.manager || '',
        project: uniqueDisplay(projectItems.map(entry => entry.label)),
        source: uniqueDisplay(sourceItems.map(entry => entry.label)),
        projectItems,
        sourceItems,
        dealType: hasRevenue ? uniqueDisplay(item.dealTypes) : '-',
        status: hasRevenue ? 'Closed Won' : 'No Sales',
        date: dateDisplay(item.dates),
        target,
        revenue: item.revenue || 0,
        commissionRate,
        personalCommission,
        inheritedCommission: inherited.commission || 0,
        inheritedCommissionRate: inherited.rate || 0,
        inheritedRevenue: inherited.revenue || 0,
        inheritedTarget: inherited.target || 0,
        commission,
        aggregateAchievement,
      }
    }).sort((a, b) => String(a.salesperson || '').localeCompare(String(b.salesperson || '')))
  }, [filtered, usersList, usersById, getUserTarget, getUserRows, yearFilter, currentYear, localizeSourceLabel, targetHistoryByUser, targetTypeFilter, tenantCreatedYear, reportNow])

  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)

  useEffect(() => {
    setCurrentPage(1)
  }, [salesPersonFilter, managerFilter, sourceFilter, projectFilter, dealTypeFilter, statusFilter, yearFilter, targetTypeFilter, dateFromFilter, dateToFilter])

  const totalRecords = overviewRows.length
  const pageCount = Math.ceil(totalRecords / entriesPerPage)
  const paginatedData = overviewRows.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  )

  const peopleScopedView = managerFilter !== 'all' || salesPersonFilter !== 'all'
  const totalTarget = useMemo(
    () => resolveReportKpiTarget({
      managerFilter,
      salesPersonFilter,
      visibleTargets: overviewRows.map((row) => row.target),
      companyTarget: companyPeriodTarget,
    }),
    [managerFilter, salesPersonFilter, overviewRows, companyPeriodTarget]
  )

  const totalRevenue = overviewRows.reduce((sum, r) => sum + (r.revenue || 0), 0)
  const totalCommission = overviewRows.reduce((sum, r) => sum + (r.commission || 0), 0)
  const achievementPercent = calculateAchievementPercent(totalRevenue, totalTarget)
  const closedDealRows = useMemo(() => (
    closedDealActions.map((action) => {
      const lead = action.lead || {}
      const details = action.details || {}
      const salesperson =
        lead.assigned_agent?.name
        || lead.assignedAgent?.name
        || lead.sales_person
        || lead.salesperson
        || action.user?.name
        || ''
      const salespersonId = lead.assigned_to ?? lead.assignedTo ?? action.user_id ?? action.user?.id
      const user = salespersonId != null ? usersById.get(String(salespersonId)) : null
      return {
        id: action.id,
        salesperson,
        manager: resolveManagerName(user, usersById),
        source: lead.source || '',
        project: lead.project || lead.project_name || lead.item?.name || lead.item?.title || '',
        date: String(action.created_at || details.date || '').slice(0, 10),
      }
    })
  ), [closedDealActions, usersById])
  const dealsCount = useMemo(() => countClosedDeals(closedDealRows, {
    periodRange,
    salesPersonFilter,
    managerFilter,
    sourceFilter,
    projectFilter,
  }), [closedDealRows, periodRange, salesPersonFilter, managerFilter, sourceFilter, projectFilter])

  const [chartMode, setChartMode] = useState('salesperson')
  const [salesGrouping, setSalesGrouping] = useState('salesperson')
  const [timeGrouping, setTimeGrouping] = useState('monthly')

  useEffect(() => {
    setTimeGrouping(targetTypeFilter)
  }, [targetTypeFilter])

  const selectSalesChart = (grouping = salesGrouping) => {
    setChartMode('salesperson')
    setSalesGrouping(grouping)
    setShowSalesGroupingMenu(false)
    setShowTimeGroupingMenu(false)
  }

  const selectTargetPeriod = (grouping = timeGrouping) => {
    setTargetTypeFilter(grouping)
    setTimeGrouping(grouping)
    setShowTimeGroupingMenu(false)
    setShowSalesGroupingMenu(false)
  }

  const makeTargetRevenueDatasets = useCallback((targets, revenues) => ([
    {
      label: isRTL ? 'الهدف' : 'Target',
      data: targets,
      backgroundColor: 'rgba(148, 163, 184, 0.8)',
      borderRadius: 6,
      barPercentage: 1,
      categoryPercentage: 0.22,
      maxBarThickness: 48,
      skipNull: true,
      yAxisID: 'y',
    },
    {
      label: isRTL ? 'الإيرادات الفعلية' : 'Actual Revenue',
      data: revenues,
      backgroundColor: 'rgba(59, 130, 246, 0.85)',
      borderRadius: 6,
      barPercentage: 1,
      categoryPercentage: 0.22,
      maxBarThickness: 48,
      skipNull: true,
      yAxisID: 'yRevenue',
    },
  ]), [isRTL])

  const barData = useMemo(() => {
    const userInPeopleScope = (u) => (
      matchesManagerFilter(u, managerFilter, usersById)
      && (salesPersonFilter === 'all' || String(u.name || '').trim() === salesPersonFilter)
      && !usesCompanyTarget(u)
    )

    const map = new Map()

      // Initialize with all salespersons/teams from usersList
      if (salesGrouping === 'salesperson') {
          usersList.forEach(u => {
              if (!userInPeopleScope(u)) return

              const userTarget = getUserTarget(u)
              if (shouldIncludeInSalespersonRows(u, { personalTarget: userTarget, hasRevenue: false })) {
                  map.set(String(u.id), {
                      label: u.name,
                      target: userTarget,
                      revenue: 0
                  })
              }
          })
      } else if (salesGrouping === 'team') {
          usersList.forEach(u => {
              if (!isManagerFilterRole(u)) return
              if (managerFilter !== 'all' && String(u.name || '').trim() !== managerFilter) return

              const reports = usersList.filter((child) => (
                String(child.id) !== String(u.id)
                && resolveManagerName(child, usersById) === u.name
              ))
              map.set(u.name, {
                  label: u.name,
                  target: getUserTarget(u) + reports.reduce((sum, child) => sum + getUserTarget(child), 0),
                  revenue: 0
              })
          })
      }
      
      filtered.forEach(r => {
        const id = r.salespersonId
        const name = r.salesperson || (isRTL ? 'غير معروف' : 'Unknown')
        const manager = r.manager || (isRTL ? 'غير معروف' : 'Unknown')
        const salespersonUser = id
          ? usersList.find(u => String(u.id) === String(id))
          : usersList.find(u => u.name === name)
        
        let key
        if (salesGrouping === 'team') {
            key = (salespersonUser && map.has(salespersonUser.name))
              ? salespersonUser.name
              : manager
        } else {
            key = id ? String(id) : name
        }
        
        if (!map.has(key)) {
          map.set(key, { 
            label: salesGrouping === 'team' ? manager : name,
            target: 0, 
            revenue: 0 
          })
        }
        const current = map.get(key)
        current.revenue += r.revenue || 0
      })

      const entries = Array.from(map.values())
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')))

      const labels = entries.map(v => v.label)
      const targets = entries.map(v => (v.target > 0 ? v.target : null))
      const revenues = entries.map(v => (v.revenue > 0 ? v.revenue : null))

      return {
        labels,
        datasets: makeTargetRevenueDatasets(targets, revenues)
      }
  }, [filtered, isRTL, salesGrouping, usersList, usersById, managerFilter, salesPersonFilter, getUserTarget, makeTargetRevenueDatasets])

  const barOptions = useMemo(() => {
    const xTitle = salesGrouping === 'team'
      ? (isRTL ? 'الفريق' : 'Team')
      : (isRTL ? 'موظف المبيعات' : 'Sales Person')

    const tickColor = isLight ? '#111827' : '#e5e7eb'
    const mutedColor = isLight ? '#6b7280' : '#9ca3af'
    const fontFamily = isRTL ? 'Cairo' : 'Inter'
    const compactTick = (value) => formatCompactMoney(value, { rtl: isRTL })

    const categoryCount = barData?.labels?.length || 1
    const categoryPercentage = categoryCount <= 1
      ? 0.16
      : categoryCount === 2
        ? 0.28
        : categoryCount <= 4
          ? 0.4
          : categoryCount <= 8
            ? 0.55
            : 0.7

    return {
      responsive: true,
      maintainAspectRatio: false,
      datasets: {
        bar: {
          barPercentage: 1,
          categoryPercentage,
        },
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'center',
          labels: {
            usePointStyle: true,
            color: tickColor,
            font: {
              family: fontFamily,
              size: 12,
            }
          },
          rtl: isRTL,
          textDirection: isRTL ? 'rtl' : 'ltr'
        },
        tooltip: {
          rtl: isRTL,
          textDirection: isRTL ? 'rtl' : 'ltr',
          titleFont: {
            family: fontFamily
          },
          bodyFont: {
            family: fontFamily
          },
          callbacks: {
            label: (context) => {
              const amount = Number(context.parsed?.y || 0)
              return `${context.dataset.label}: ${amount.toLocaleString()} EGP`
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xTitle,
            color: mutedColor,
            font: {
              family: fontFamily,
              size: 12,
            }
          },
          ticks: {
            color: tickColor,
            maxRotation: 0,
            minRotation: 0,
            font: {
              family: fontFamily,
              size: 12,
            }
          },
          reverse: isRTL
        },
        y: {
          beginAtZero: true,
          position: isRTL ? 'right' : 'left',
          title: {
            display: true,
            text: isRTL ? 'الهدف' : 'Target',
            color: mutedColor,
            font: { family: fontFamily, size: 11 },
          },
          ticks: {
            color: tickColor,
            callback: compactTick,
            font: {
              family: fontFamily,
              size: 11,
            }
          }
        },
        yRevenue: {
          beginAtZero: true,
          position: isRTL ? 'left' : 'right',
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: isRTL ? 'الإيرادات' : 'Revenue',
            color: mutedColor,
            font: { family: fontFamily, size: 11 },
          },
          ticks: {
            color: tickColor,
            callback: compactTick,
            font: {
              family: fontFamily,
              size: 11,
            }
          }
        }
      }
    }
  }, [barData, salesGrouping, isRTL, isLight])

  const revenueByProjectSegments = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      const key = r.project || (isRTL ? 'غير معروف' : 'Unknown')
      map.set(key, (map.get(key) || 0) + (r.revenue || 0))
    })
    const baseColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#22c55e']
    return Array.from(map.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [filtered, isRTL])

  const revenueBySourceSegments = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      const key = localizeSourceLabel(r.source || (isRTL ? 'غير معروف' : 'Unknown'))
      map.set(key, (map.get(key) || 0) + (r.revenue || 0))
    })
    const baseColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#22c55e']
    return Array.from(map.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [filtered, isRTL])

  const bestAchievers = useMemo(() => {
    const map = new Map()
    const processedUsers = new Set()

    enrichedRecords.forEach(r => {
      if (r.date && !isDateInRange(r.date, periodRange)) return

      const key = r.salesperson || (isRTL ? 'غير معروف' : 'Unknown')
      const uid = r.salespersonId ? String(r.salespersonId) : key
      const user = usersList.find(u => String(u.id) === uid) || usersList.find(u => u.name === key)
      if (usesCompanyTarget(user)) return

      if (!map.has(key)) {
        const role = user ? (Array.isArray(user.roles) ? user.roles[0]?.name : user.role) : ''
        map.set(key, { name: key, role: role || '', target: 0, revenue: 0 })
      }
      const item = map.get(key)
      item.revenue += r.revenue || 0

      if (!processedUsers.has(uid)) {
          processedUsers.add(uid)
          item.target = user ? getUserTarget(user) : (r.target || 0)
      }
    })
    
    const list = Array.from(map.values()).map(item => ({
      ...item,
      achievement: calculateAchievementPercent(item.revenue, item.target)
    }))
    return list.sort((a, b) => {
      if (b.achievement !== a.achievement) return b.achievement - a.achievement
      return b.revenue - a.revenue
    }).slice(0, 5)
  }, [enrichedRecords, isRTL, periodRange, usersList, getUserTarget])

  const handleExportExcel = () => {
    if (!canExport) return
    const rows = overviewRows.map(r => ({
      [isRTL ? 'موظف المبيعات' : 'Sales Person']: r.salesperson,
      [isRTL ? 'المدير' : 'Manager']: r.manager,
      [isRTL ? 'المصدر' : 'Source']: localizeSourceLabel(r.source),
      [isRTL ? 'المشروع' : projectLabel]: r.project,
      [isRTL ? 'نوع الصفقة' : 'Deal Type']: r.dealType,
      [isRTL ? 'الحالة' : 'Status']: r.status,
      [isRTL ? 'التاريخ' : 'Date']: r.date,
      [isRTL ? 'الهدف' : 'Target']: r.target,
      [isRTL ? 'الإيرادات' : 'Revenue']: r.revenue,
      [isRTL ? 'نسبة العمولة' : 'Commission %']: r.commissionRate,
      [isRTL ? 'عمولة شخصية' : 'Personal Commission']: r.personalCommission || 0,
      [isRTL ? 'عمولة الفريق' : 'Team Commission']: r.inheritedCommission || 0,
      [isRTL ? 'العمولة' : 'Commission']: r.commission,
      [isRTL ? 'نسبة الإنجاز' : 'Achievement %']: formatAchievementPercent(r.aggregateAchievement),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'TargetsRevenue')
    const fileName = 'Targets_Revenue_Report.xlsx'
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: 'Targets & Revenue Report',
      fileName,
      format: 'xlsx',
    })
    setShowExportMenu(false)
  }

  const handleExportPdf = () => {
    if (!canExport) return
    const doc = new jsPDF(isRTL ? 'p' : 'p', 'pt', 'a4')
    const tableColumn = [
      isRTL ? 'موظف المبيعات' : 'Sales Person',
      isRTL ? 'المدير' : 'Manager',
      isRTL ? 'المشروع' : projectLabel,
      isRTL ? 'المصدر' : 'Source',
      isRTL ? 'نوع الصفقة' : 'Deal Type',
      isRTL ? 'الحالة' : 'Status',
      isRTL ? 'التاريخ' : 'Date',
      isRTL ? 'الهدف' : 'Target',
      isRTL ? 'الإيرادات' : 'Revenue',
      isRTL ? 'نسبة العمولة' : 'Commission %',
      isRTL ? 'العمولة' : 'Commission',
      isRTL ? 'نسبة الإنجاز' : 'Achievement %',
    ]
    const tableRows = []

    overviewRows.forEach(r => {
      const rowData = [
        r.salesperson,
        r.manager,
        r.project,
        localizeSourceLabel(r.source),
        r.dealType,
        r.status,
        r.date,
        r.target,
        r.revenue,
        r.commissionRate,
        r.commission,
        formatAchievementPercent(r.aggregateAchievement),
      ]
      tableRows.push(rowData)
    })

    doc.text(isRTL ? 'تقرير الأهداف والإيرادات' : 'Targets & Revenue Report', 40, 40, {
      align: isRTL ? 'right' : 'left'
    })
    
    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 60,
      styles: {
        font: isRTL ? 'Cairo' : 'helvetica',
        halign: isRTL ? 'right' : 'left'
      },
      headStyles: {
        halign: isRTL ? 'right' : 'left'
      }
    })

    doc.save('Targets_Revenue_Report.pdf')
    logExportEvent({
      module: 'Targets & Revenue Report',
      fileName: 'Targets_Revenue_Report.pdf',
      format: 'pdf',
    })
    setShowExportMenu(false)
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('export') !== '1') {
      autoExportDoneRef.current = false
      return
    }

    if (!canExport || !overviewRows.length || autoExportDoneRef.current) return

    autoExportDoneRef.current = true

    const format = String(params.get('format') || 'xlsx').toLowerCase()
    if (format === 'pdf') {
      handleExportPdf()
    } else {
      handleExportExcel()
    }

    params.delete('export')
    params.delete('format')
    params.delete('file_name')
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
  }, [canExport, overviewRows, location.pathname, location.search, navigate])

  const clearFilters = () => {
    setSalesPersonFilter('all')
    setManagerFilter('all')
    setSourceFilter('all')
    setProjectFilter('all')
    setDealTypeFilter('all')
    setStatusFilter('all')
    setYearFilter(String(new Date().getFullYear()))
    setTargetTypeFilter('monthly')
    setDateFromFilter('')
    setDateToFilter('')
  }

  const renderPieCard = (title, data, headerRight) => {
    const total = data.reduce((sum, item) => sum + (item.value || 0), 0)
    return (
      <div className="group relative   backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{title}</div>
          {headerRight}
        </div>
        <div className="h-48 flex items-center justify-center">
          <PieChart
            segments={data}
            size={170}
            centerValue={total.toLocaleString()}
            centerLabel={isRTL ? 'الإيرادات' : 'Revenue'}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {data.map(segment => (
            <div key={segment.label} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></div>
              <span className={`${isLight ? 'text-black' : 'text-white'}`}>
                {segment.label}: {segment.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`p-4 md:p-6 bg-theme-bg ${isLight ? 'text-black' : 'text-white'} overflow-hidden min-w-0 max-w-[1600px] mx-auto space-y-6`}>
      <div>
        <BackButton to="/reports" />
        <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-1 flex items-center gap-2`}>
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500">
            <Target size={20} />
          </span>
          {isRTL ? 'تقرير الأهداف والإيرادات' : 'Targets & Revenue'}
        </h1>
        <p className={`${isLight ? 'text-black' : 'text-white'} text-sm opacity-80`}>
          {isRTL ? 'تتبع أهداف المبيعات والإيرادات الفعلية والإنجاز لفريقك' : 'Track sales targets, actual revenue and achievement for your team'}
        </p>
      </div>

      <div className="backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 p-6 mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3>{isRTL ? 'تصفية' : 'Filter'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllFilters(prev => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <ChevronDown
                size={12}
                className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`}
              />
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
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <User size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'موظف المبيعات' : 'Sales Person'}
              </label>
              <SearchableSelect
                options={salespersonOptions}
                value={salesPersonFilter}
                onChange={v => setSalesPersonFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Users size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'المدير' : 'Manager'}
              </label>
              <SearchableSelect
                options={managerOptions}
                value={managerFilter}
                onChange={v => setManagerFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'المصدر' : 'Source'}
              </label>
              <SearchableSelect
                options={normalizedSourceOptions}
                value={sourceFilter}
                onChange={v => setSourceFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                {projectLabel}
              </label>
              <SearchableSelect
                options={normalizedProjectOptions}
                value={projectFilter}
                onChange={v => setProjectFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${
              showAllFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="space-y-1 md:col-span-2 lg:col-span-2">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'نطاق التاريخ' : 'Date Range'}
              </label>
              <DateRangePicker
                from={dateFromFilter}
                to={dateToFilter}
                onChange={({ from, to }) => {
                  setDateFromFilter(from)
                  setDateToFilter(to)
                }}
                isRTL={isRTL}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'نوع الصفقة' : 'Deal Type'}
              </label>
              <SearchableSelect
                options={dealTypeOptions}
                value={dealTypeFilter}
                onChange={v => setDealTypeFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Target size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'الحالة' : 'Status'}
              </label>
              <SearchableSelect
                options={statusOptions}
                value={statusFilter}
                onChange={v => setStatusFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'السنة' : 'Year'}
              </label>
              <SearchableSelect
                options={[
                  { value: 'all', label: isRTL ? 'الكل' : 'All' },
                  ...targetYears.map(year => ({ value: String(year), label: String(year) })),
                ]}
                value={yearFilter}
                onChange={v => setYearFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Trophy size={12} className="text-blue-500 dark:text-blue-400" />
                {isRTL ? 'نوع التارجت' : 'Target Type'}
              </label>
              <SearchableSelect
                options={[
                  { value: 'monthly', label: isRTL ? 'شهري' : 'Monthly' },
                  { value: 'quarterly', label: isRTL ? 'ربع سنوي' : 'Quarterly' },
                  { value: 'semi_annual', label: isRTL ? 'نصف سنوي' : 'Semi Annual' },
                  { value: 'yearly', label: isRTL ? 'سنوي' : 'Yearly' },
                ]}
                value={targetTypeFilter}
                onChange={v => setTargetTypeFilter(v)}
                placeholder={isRTL ? 'اختر' : 'Select'}
                isRTL={isRTL}
                showAllOption={false}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: peopleScopedView || companyPeriodTarget <= 0
              ? (isRTL ? 'إجمالي الهدف' : 'Total Target')
              : (isRTL ? 'تارجت الشركة' : 'Company Target'),
            value: `${totalTarget.toLocaleString()} EGP`,
            accent: 'bg-slate-500',
          },
          { label: isRTL ? 'إجمالي الإيرادات' : 'Total Revenue', value: `${totalRevenue.toLocaleString()} EGP`, accent: 'bg-emerald-500' },
          { label: isRTL ? 'نسبة الإنجاز' : 'Achievement %', value: formatAchievementPercent(achievementPercent), accent: 'bg-indigo-500' },
          { label: isRTL ? 'إجمالي العمولة' : 'Total Commission', value: `${totalCommission.toLocaleString()} EGP`, accent: 'bg-fuchsia-500' },
          { label: isRTL ? 'عدد الصفقات' : 'Deals Count', value: dealsCount, accent: 'bg-amber-500' }
        ].map(card => (
          <div
            key={card.label}
            className="group relative  backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex items-center justify-between"
          >
            <div>
              <div className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{card.label}</div>
              <div className="text-lg font-semibold">{card.value}</div>
            </div>
            <div className={`w-8 h-8 rounded-lg ${card.accent}`}></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="group relative   backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
              <Target size={18} className="text-blue-500" />
              {salesGrouping === 'team'
                ? (isRTL ? 'الأهداف والإيرادات حسب الفريق' : 'Targets & Revenue by Team')
                : (isRTL ? 'الأهداف والإيرادات حسب موظف المبيعات' : 'Targets & Revenue by Salesperson')}
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-full p-1">
                <div ref={salesMenuRef} className="relative flex items-stretch">
                  <button
                    type="button"
                    onClick={() => selectSalesChart(salesGrouping)}
                    className={`px-3 py-1 text-xs rounded-l-full transition-colors border-r border-theme-border dark:border-gray-700/50 ${
                      chartMode === 'salesperson'
                        ? 'bg-blue-600 text-white'
                        : `${isLight ? 'text-black' : 'text-white'}`
                    }`}
                  >
                    {salesGrouping === 'team' ? (isRTL ? 'الفريق' : 'Team') : (isRTL ? 'موظف المبيعات' : 'Sales Person')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChartMode('salesperson')
                      setShowTimeGroupingMenu(false)
                      setShowSalesGroupingMenu(prev => !prev)
                    }}
                    className={`px-2 py-1 text-xs rounded-r-full transition-colors ${
                      chartMode === 'salesperson'
                        ? 'bg-blue-600 text-white'
                        : `${isLight ? 'text-black' : 'text-white'}`
                    }`}
                  >
                    <ChevronDown
                      size={10}
                      className={`transition-transform duration-200 ${
                        showSalesGroupingMenu && chartMode === 'salesperson' ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>
                  {showSalesGroupingMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-30 min-w-[140px]">
                      <button
                        type="button"
                        onClick={() => selectSalesChart('salesperson')}
                        className={`w-full text-left rtl:text-right px-3 py-1.5 text-xs hover:bg-[rgba(37,99,235,0.28)] dark:hover:bg-gray-700/60 ${
                          salesGrouping === 'salesperson'
                            ? 'text-blue-600 dark:text-blue-400'
                            : `${isLight ? 'text-black' : 'text-white'}`
                        }`}
                      >
                        {isRTL ? 'موظف المبيعات' : 'Sales Person'}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectSalesChart('team')}
                        className={`w-full text-left rtl:text-right px-3 py-1.5 text-xs hover:bg-[rgba(37,99,235,0.28)] dark:hover:bg-gray-700/60 ${
                          salesGrouping === 'team'
                            ? 'text-blue-600 dark:text-blue-400'
                            : `${isLight ? 'text-black' : 'text-white'}`
                        }`}
                      >
                        {isRTL ? 'الفريق' : 'Team'}
                      </button>
                    </div>
                  )}
                </div>

                <div ref={timeMenuRef} className="relative flex items-stretch">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSalesGroupingMenu(false)
                      setShowTimeGroupingMenu(prev => !prev)
                    }}
                    className={`px-3 py-1 text-xs rounded-l-full transition-colors border-r border-theme-border dark:border-gray-700/50 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    {timeGrouping === 'monthly'
                      ? (isRTL ? 'شهري' : 'Monthly')
                      : timeGrouping === 'quarterly'
                        ? (isRTL ? 'ربع سنوي' : 'Quarterly')
                        : timeGrouping === 'semi_annual'
                          ? (isRTL ? 'نصف سنوي' : 'Semi Annual')
                          : (isRTL ? 'سنوي' : 'Yearly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSalesGroupingMenu(false)
                      setShowTimeGroupingMenu(prev => !prev)
                    }}
                    className={`px-2 py-1 text-xs rounded-r-full transition-colors ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <ChevronDown
                      size={10}
                      className={`transition-transform duration-200 ${
                        showTimeGroupingMenu ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>
                  {showTimeGroupingMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-30 min-w-[150px]">
                      <button
                        type="button"
                        onClick={() => selectTargetPeriod('monthly')}
                        className={`w-full text-left rtl:text-right px-3 py-1.5 text-xs hover:bg-[rgba(37,99,235,0.28)] ${
                          timeGrouping === 'monthly'
                            ? 'text-blue-600 dark:text-blue-400'
                            : `${isLight ? 'text-black' : 'text-white'}`
                        }`}
                      >
                        {isRTL ? 'شهري' : 'Monthly'}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectTargetPeriod('quarterly')}
                        className={`w-full text-left rtl:text-right px-3 py-1.5 text-xs hover:bg-[rgba(37,99,235,0.28)] ${
                          timeGrouping === 'quarterly'
                            ? 'text-blue-600 dark:text-blue-400'
                            : `${isLight ? 'text-black' : 'text-white'}`
                        }`}
                      >
                        {isRTL ? 'ربع سنوي' : 'Quarterly'}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectTargetPeriod('semi_annual')}
                        className={`w-full text-left rtl:text-right px-3 py-1.5 text-xs hover:bg-[rgba(37,99,235,0.28)] ${
                          timeGrouping === 'semi_annual'
                            ? 'text-blue-600 dark:text-blue-400'
                            : `${isLight ? 'text-black' : 'text-white'}`
                        }`}
                      >
                        {isRTL ? 'نصف سنوي' : 'Semi Annual'}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectTargetPeriod('yearly')}
                        className={`w-full text-left rtl:text-right px-3 py-1.5 text-xs hover:bg-[rgba(37,99,235,0.28)] ${
                          timeGrouping === 'yearly'
                            ? 'text-blue-600 dark:text-blue-400'
                            : `${isLight ? 'text-black' : 'text-white'}`
                        }`}
                      >
                        {isRTL ? 'سنوي' : 'Yearly'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div
              className="h-72"
              style={{ minWidth: Math.max(280, (barData.labels?.length || 1) * 140) }}
            >
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderPieCard(
          revenuePieMode === 'project' 
            ? (isRTL ? 'الإيرادات حسب المشروع' : revenueByProjectLabel)
            : (isRTL ? 'الإيرادات حسب المصدر' : 'Revenue by source'),
          revenuePieMode === 'project' ? revenueByProjectSegments : revenueBySourceSegments,
          <div className="inline-flex items-center gap-1  rounded-full p-0.5">
            <button
              type="button"
              onClick={() => setRevenuePieMode('project')}
              className={`px-2.5 py-0.5 text-[0.7rem] rounded-full transition-colors ${
                revenuePieMode === 'project'
                  ? 'bg-blue-600 text-white'
                  : `${isLight ? 'text-black' : 'text-white'}`
              }`}
            >
              {isRTL ? 'المشروع' : projectLabel}
            </button>
            <button
              type="button"
              onClick={() => setRevenuePieMode('source')}
              className={`px-2.5 py-0.5 text-[0.7rem] rounded-full transition-colors ${
                revenuePieMode === 'source'
                  ? 'bg-blue-600 text-white'
                  : `${isLight ? 'text-black' : 'text-white'}`
              }`}
            >
              {isRTL ? 'المصدر' : 'Source'}
            </button>
          </div>
        )}

        <div className="group relative    backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-yellow-400" />
              <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'الأفضل أداءً' : 'The Best Achiever'}</div>
            </div>
          </div>
          <div className="space-y-2">
            {bestAchievers.map((user, index) => (
              <div
                key={user.name}
                className="flex items-center justify-between px-3 py-2 rounded-lg  border border-white/60 dark:border-gray-700/60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs font-semibold text-emerald-500">
                    {index + 1}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
                      {user.name}
                      {user.role && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          {user.role}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--muted-text)]">
                      {isRTL ? 'الإيرادات' : 'Revenue'}: {user.revenue.toLocaleString()} EGP
                    </div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-500">{formatAchievementPercent(user.achievement)}</div>
              </div>
            ))}
            {bestAchievers.length === 0 && (
              <div className="text-xs text-[var(--muted-text)]">{isRTL ? 'لا توجد بيانات للفلاتر الحالية' : 'No data for current filters'}</div>
            )}
          </div>
        </div>
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h2 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'نظرة عامة على الأهداف والإيرادات' : 'Targets & Revenue Overview'}</h2>
          {canExport && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(prev => !prev)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                <FaFileExport />
                {isRTL ? 'تصدير' : 'Export'}
                <ChevronDown
                  className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`}
                  size={16}
                />
              </button>
              {showExportMenu && (
                <div
                  className={`absolute top-full ${isRTL ? 'left-0' : 'right-0'} mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}
                >
                  <button
                    onClick={handleExportExcel}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/60 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFileExcel className="text-emerald-500" />
                    <span>{isRTL ? 'تصدير إلى Excel' : 'Export to Excel'}</span>
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/60 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className="text-red-500" />
                    <span>{isRTL ? 'تصدير إلى PDF' : 'Export to PDF'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Mobile View - Cards */}
        <div className="md:hidden space-y-4 p-4">
          {paginatedData.map(row => {
              const effectiveTarget = row.target || 0
              const achievement = Number.isFinite(row.aggregateAchievement)
                ? row.aggregateAchievement
                : calculateAchievementPercent(row.revenue, effectiveTarget)
              
              const dealTypeLabel = {
                'Reservation': isRTL ? 'حجز' : 'Reservation',
                'Contract': isRTL ? 'عقد' : 'Contract',
                'Proposal': isRTL ? 'عرض سعر' : 'Proposal'
              }[row.dealType] || row.dealType

              const statusLabel = {
                'Closed Won': isRTL ? 'مغلق (فوز)' : 'Closed Won',
                'Closed Lost': isRTL ? 'مغلق (خسارة)' : 'Closed Lost',
                'In Progress': isRTL ? 'قيد التنفيذ' : 'In Progress'
              }[row.status] || row.status

              const statusColors = {
                  'Closed Won': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
                  'Closed Lost': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                  'In Progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              }[row.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'

            return (
              <div key={row.id} className=" rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className={`font-semibold ${isLight ? 'text-black' : 'text-white'} text-lg`}>{row.salesperson}</h3>
                    <p className={`text-xs ${isLight ? 'text-black' : 'text-white'} mt-1`}>{row.manager || '-'}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors}`}>
                    {statusLabel}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'المشروع' : projectLabel}</span>
                    <ListHoverPopover
                      id={`${row.id}-item-mobile`}
                      icon={ProjectIcon}
                      items={row.projectItems}
                      title={projectLabel}
                      isRTL={isRTL}
                      formatValue={formatMoney}
                      emptyTitle={isRTL ? 'لا توجد بيانات' : 'No data'}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'المصدر' : 'Source'}</span>
                    <ListHoverPopover
                      id={`${row.id}-source-mobile`}
                      icon={Tag}
                      items={row.sourceItems}
                      title={isRTL ? 'المصدر' : 'Source'}
                      isRTL={isRTL}
                      formatValue={formatMoney}
                      emptyTitle={isRTL ? 'لا توجد بيانات' : 'No data'}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'نوع الصفقة' : 'Deal Type'}</span>
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{dealTypeLabel}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'التاريخ' : 'Date'}</span>
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{row.date}</span>
                  </div>
                </div>

                {/* Financials & Achievement */}
                <div className=" rounded-lg p-3 space-y-3">
                  <div className="flex justify-between items-center">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'الهدف' : 'Target'}</span>
                      <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{effectiveTarget.toLocaleString()} EGP</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'الإيرادات' : 'Revenue'}</span>
                      <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{row.revenue.toLocaleString()} EGP</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'العمولة' : 'Commission'}</span>
                      <span className={`font-semibold text-right ${isLight ? 'text-black' : 'text-white'}`}>
                        {(row.commission || 0).toLocaleString()} EGP {(row.commissionRate || 0) ? `(${row.commissionRate}%)` : ''}
                        {(row.inheritedCommission || 0) > 0 && (
                          <span className={`block text-[10px] font-normal ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                            {isRTL
                              ? `شخصي ${(row.personalCommission || 0).toLocaleString()} · فريق ${(row.inheritedCommission || 0).toLocaleString()}`
                              : `Personal ${(row.personalCommission || 0).toLocaleString()} · Team ${(row.inheritedCommission || 0).toLocaleString()}`}
                          </span>
                        )}
                      </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-xs">
                          <span className={`${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'نسبة الإنجاز' : 'Achievement'}</span>
                          <span className={`${achievement >= 100 ? 'text-emerald-600' : 'text-blue-600'} font-medium`}>{formatAchievementPercent(achievement)}</span>
                      </div>
                      <div className="w-full  rounded-full h-1.5 overflow-hidden">
                          <div 
                              className={`h-full rounded-full ${achievement >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(achievement, 100)}%` }}
                          />
                      </div>
                  </div>
                </div>
              </div>
            )
          })}
            {paginatedData.length === 0 && (
              <div className={`text-center py-8 ${isLight ? 'text-black' : 'text-white'}`}>
                  {isRTL ? 'لا توجد بيانات' : 'No data'}
              </div>
          )}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className={`w-full text-xs text-left rtl:text-right ${isLight ? 'text-black' : 'text-white'}`}>
            <thead className="text-[0.68rem] uppercase  bg-white/5 dark:bg-white/5 dark:te text-[var(--muted-text)]">
              <tr>
                <th className="px-4 py-3 font-medium">{isRTL ? 'موظف المبيعات' : 'Sales Person'}</th>
                <th className="px-4 py-3 font-medium">{isRTL ? 'المدير' : 'Manager'}</th>
                <th className="px-4 py-3 font-medium">{isRTL ? 'المشروع' : projectLabel}</th>
                <th className="px-4 py-3 font-medium">{isRTL ? 'المصدر' : 'Source'}</th>
                <th className="px-4 py-3 font-medium">{isRTL ? 'نوع الصفقة' : 'Deal Type'}</th>
                <th className="px-4 py-3 font-medium">{isRTL ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 font-medium">{isRTL ? 'التاريخ' : 'Date'}</th>
                <th className="px-4 py-3 font-medium text-right rtl:text-left">{isRTL ? 'الهدف' : 'Target'}</th>
                <th className="px-4 py-3 font-medium text-right rtl:text-left">{isRTL ? 'الإيرادات' : 'Revenue'}</th>
                <th className="px-4 py-3 font-medium text-right rtl:text-left">{isRTL ? 'نسبة العمولة' : 'Commission %'}</th>
                <th className="px-4 py-3 font-medium text-right rtl:text-left">{isRTL ? 'العمولة' : 'Commission'}</th>
                <th className="px-4 py-3 font-medium text-right rtl:text-left">{isRTL ? 'نسبة الإنجاز' : 'Achievement %'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/30 dark:divide-gray-800">
              {paginatedData.map(row => {
                const achievement = Number.isFinite(row.aggregateAchievement)
                  ? row.aggregateAchievement
                  : calculateAchievementPercent(row.revenue, row.target)
                
                const dealTypeLabel = {
                  'Reservation': isRTL ? 'حجز' : 'Reservation',
                  'Contract': isRTL ? 'عقد' : 'Contract',
                  'Proposal': isRTL ? 'عرض سعر' : 'Proposal'
                }[row.dealType] || row.dealType

                const statusLabel = {
                  'Closed Won': isRTL ? 'مغلق (فوز)' : 'Closed Won',
                  'Closed Lost': isRTL ? 'مغلق (خسارة)' : 'Closed Lost',
                  'In Progress': isRTL ? 'قيد التنفيذ' : 'In Progress'
                }[row.status] || row.status

                return (
                    <tr key={row.id} className="hover:bg-white/30 dark:hover:bg-gray-900/40 transition-colors">
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{row.salesperson}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{row.manager || '-'}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>
                        <ListHoverPopover
                          id={`${row.id}-item`}
                          icon={ProjectIcon}
                          items={row.projectItems}
                          title={projectLabel}
                          isRTL={isRTL}
                          formatValue={formatMoney}
                          emptyTitle={isRTL ? 'لا توجد بيانات' : 'No data'}
                        />
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>
                        <ListHoverPopover
                          id={`${row.id}-source`}
                          icon={Tag}
                          items={row.sourceItems}
                          title={isRTL ? 'المصدر' : 'Source'}
                          isRTL={isRTL}
                          formatValue={formatMoney}
                          emptyTitle={isRTL ? 'لا توجد بيانات' : 'No data'}
                        />
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{dealTypeLabel}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{statusLabel}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{row.date}</td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right rtl:text-left ${isLight ? 'text-black' : 'text-white'}`}>
                        {row.target.toLocaleString()} EGP
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right rtl:text-left ${isLight ? 'text-black' : 'text-white'}`}>
                        {row.revenue.toLocaleString()} EGP
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right rtl:text-left ${isLight ? 'text-black' : 'text-white'}`}>
                        {(row.commissionRate || 0)}%
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right rtl:text-left ${isLight ? 'text-black' : 'text-white'}`}>
                        {(row.commission || 0).toLocaleString()} EGP
                        {(row.inheritedCommission || 0) > 0 && (
                          <div className={`text-[10px] ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                            {isRTL
                              ? `شخصي ${(row.personalCommission || 0).toLocaleString()} · فريق ${(row.inheritedCommission || 0).toLocaleString()}`
                              : `Personal ${(row.personalCommission || 0).toLocaleString()} · Team ${(row.inheritedCommission || 0).toLocaleString()}`}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right rtl:text-left ${isLight ? 'text-black' : 'text-white'}`}>
                        {formatAchievementPercent(achievement)}
                      </td>
                    </tr>
                )
              })}
              {overviewRows.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-6 text-center text-xs text-[var(--muted-text)]"
                  >
                    {isRTL ? 'لا توجد سجلات تطابق الفلاتر الحالية' : 'No records match current filters'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 bg-[var(--content-bg)]/80 border-t border-white/10 dark:border-gray-700/60 flex items-center justify-between gap-3">
          <div className="text-[11px] sm:text-xs text-[var(--muted-text)]">
            {isRTL
              ? `إظهار ${Math.min((currentPage - 1) * entriesPerPage + 1, totalRecords)}-${Math.min(currentPage * entriesPerPage, totalRecords)} من ${totalRecords}`
              : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, totalRecords)}-${Math.min(currentPage * entriesPerPage, totalRecords)} of ${totalRecords}`}
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
    </div>
  )
}
