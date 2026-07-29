import React, { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '../shared/context/AppStateProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import { api, logExportEvent } from '../utils/api'
import BackButton from '../components/BackButton'
import SearchableSelect from '../components/SearchableSelect'
import DateRangePicker from '../shared/components/DateRangePicker'
import EnhancedLeadDetailsModal from '../shared/components/EnhancedLeadDetailsModal'
import { PieChart } from '../shared/components/PieChart'
import { Filter, ChevronDown, ChevronUp, User, Users, Tag, Briefcase, Calendar, Trophy, FileText, ChevronLeft, ChevronRight, Eye, Trash2 } from 'lucide-react'
import { FaChevronDown, FaFileExport, FaFileExcel, FaFilePdf } from 'react-icons/fa'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function ProposalsReport() {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const isRTL = (i18n?.language || '').toLowerCase().startsWith('ar')
  const { user, company } = useAppState()
  const canExport = canExportReport(user, 'Proposals Report')
  const companyType = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyType === 'real estate'
  const projectLabel = isRealEstate ? t('Project') : t('Item')

  const isAdminOrManager = useMemo(() => {
    if (!user) return false;
    if (user.is_super_admin) return true;
    const role = (user.role || '').toLowerCase();
    return ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager', 'sales manager', 'branch manager'].includes(role);
  }, [user]);

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

  const normalizeDate = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    return raw.slice(0, 10)
  }

  const [proposals, setProposals] = useState([])
  const [usersList, setUsersList] = useState([])
  const [sourceOptions, setSourceOptions] = useState(['all'])
  const [projectOptions, setProjectOptions] = useState(['all'])
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [expandedRows, setExpandedRows] = useState({})

  const getDescendants = (rootId, allUsers) => {
    let descendants = []
    const direct = allUsers.filter(u => u.manager_id === rootId)
    direct.forEach(u => {
      descendants.push(u)
      descendants = descendants.concat(getDescendants(u.id, allUsers))
    })
    return descendants
  }

  useEffect(() => {
    let isMounted = true

    const loadUsers = async () => {
      try {
        const res = await api.get('/api/users')
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        if (!isMounted) return
        setUsersList(data)
      } catch (e) {
        if (!isMounted) return
        setUsersList([])
      }
    }

    const loadProposals = async () => {
      try {
        const res = await api.get('/api/lead-actions', { params: { type: 'proposal' } })

        const unique = Array.isArray(res.data) ? res.data : (res.data?.data || [])

        const mapped = unique.map(action => {
          const details = action.details || {}
          const lead = action.lead || {}

          const rawAmount =
            details.proposalAmount ??
            details.proposal_amount ??
            details.amount ??
            0

          const value =
            typeof rawAmount === 'number'
              ? rawAmount
              : parseFloat(rawAmount || '0') || 0

          const dateRaw =
            details.proposalDate ||
            details.proposal_date ||
            action.date ||
            action.created_at

          const proposalDate = normalizeDate(dateRaw)

          const leadName =
            lead.name || lead.fullName || lead.company || ''

          const contact =
            lead.phone || lead.mobile || lead.whatsapp || ''

          const salesperson =
            (action.user && action.user.name) ||
            lead.sales_person ||
            lead.salesperson ||
            (lead.assigned_agent && lead.assigned_agent.name) ||
            (lead.assignedAgent && lead.assignedAgent.name) ||
            ''

          const salespersonId =
            lead.assigned_to ??
            lead.assignedTo ??
            (lead.assigned_agent && lead.assigned_agent.id) ??
            (lead.assignedAgent && lead.assignedAgent.id) ??
            action.user_id ??
            (action.user && action.user.id) ??
            null

          const source = lead.source || lead.channel || ''
          const project = lead.project || details.project || ''

          return {
            id: action.id,
            leadId: lead.id,
            leadName,
            contact,
            source,
            project,
            value,
            salesperson,
            salespersonId: salespersonId !== null && salespersonId !== undefined && salespersonId !== ''
              ? String(salespersonId)
              : '',
            proposalDate
          }
        })

        if (!isMounted) return
        setProposals(mapped)
      } catch (e) {
        if (!isMounted) return
        console.error('Failed to load proposals actions', e)
        setProposals([])
      }
    }

    loadUsers()
    loadProposals()

    const handleUpdate = () => {
      loadProposals()
    }

    window.addEventListener('leadsDataUpdated', handleUpdate)

    return () => {
      isMounted = false
      window.removeEventListener('leadsDataUpdated', handleUpdate)
    }
  }, [])

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await api.get('/api/sources?active=1')
        const data = Array.isArray(res.data) ? res.data : (res.data.data || [])
        const names = Array.from(new Set(data.map(s => s.name).filter(Boolean)))
        setSourceOptions(['all', ...names])
      } catch (e) {
        console.error('Failed to fetch sources for proposals report', e)
        const set = new Set(proposals.map(p => p.source).filter(Boolean))
        setSourceOptions(['all', ...Array.from(set)])
      }
    }

    fetchSources()
  }, [proposals])

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
          names = Array.from(new Set(proposals.map(p => p.project).filter(Boolean)))
        }

        const unique = Array.from(new Set(names))
        setProjectOptions(['all', ...unique])
      } catch (e) {
        console.error('Failed to fetch projects/items for proposals report', e)
        const set = new Set(proposals.map(p => p.project).filter(Boolean))
        setProjectOptions(['all', ...Array.from(set)])
      }
    }

    fetchProjectsOrItems()
  }, [companyType, proposals])

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [salesPersonFilter, setSalesPersonFilter] = useState('all')
  const [managerFilter, setManagerFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [proposalDateFrom, setProposalDateFrom] = useState('')
  const [proposalDateTo, setProposalDateTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const [entriesPerPage, setEntriesPerPage] = useState(10)

  const salesPersonOptions = useMemo(() => {
    if (!usersList || usersList.length === 0) {
      const unique = Array.from(
        new Map(
          proposals
            .filter(p => p.salespersonId && p.salesperson)
            .map(p => [String(p.salespersonId), { value: String(p.salespersonId), label: p.salesperson }])
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
        subs.forEach(s => all.push(s))
      })
      const map = new Map()
      all.forEach(u => {
        if (!map.has(u.id)) map.set(u.id, u)
      })
      candidates = Array.from(map.values())
    }

    return [
      { value: 'all', label: t('All') },
      ...Array.from(
        new Map(
          candidates
            .filter(u => String(u?.name || '').trim() !== '')
            .map(u => [String(u.id), { value: String(u.id), label: u.name }])
        ).values()
      )
    ]
  }, [usersList, managerFilter, proposals, t])

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
    return proposals.filter(p => {
      const bySales = salesPersonFilter === 'all' || String(p.salespersonId || '') === String(salesPersonFilter)
      const byManager = (() => {
        if (!usersList.length || managerFilter === 'all') return true
        const mgr = usersList.find(u => String(u.id) === String(managerFilter))
        if (!mgr) return true
        const all = [mgr, ...getDescendants(mgr.id, usersList)]
        const salesIds = new Set(all.map(u => String(u.id)).filter(Boolean))
        return !p.salespersonId || salesIds.has(String(p.salespersonId))
      })()
      const bySource = sourceFilter === 'all' || p.source === sourceFilter
      const byProject = projectFilter === 'all' || p.project === projectFilter
      const byDate = (() => {
        if (!proposalDateFrom && !proposalDateTo) return true
        const d = p.proposalDate || ''
        if (!d) return false
        if (proposalDateFrom && d < proposalDateFrom) return false
        if (proposalDateTo && d > proposalDateTo) return false
        return true
      })()
      return bySales && byManager && bySource && byProject && byDate
    })
  }, [proposals, salesPersonFilter, managerFilter, sourceFilter, projectFilter, proposalDateFrom, proposalDateTo, usersList])

  useEffect(() => {
    setCurrentPage(1)
  }, [salesPersonFilter, managerFilter, sourceFilter, projectFilter, proposalDateFrom, proposalDateTo])

  const totalRecords = filtered.length
  const pageCount = Math.ceil(totalRecords / entriesPerPage)
  const paginatedData = filtered.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  )

  const totalProposals = filtered.length
  const totalRevenue = filtered.reduce((sum, p) => sum + (p.value || 0), 0)
  const totalLeads = useMemo(() => {
    const set = new Set(filtered.map(p => p.leadName))
    return set.size
  }, [filtered])

  const proposalsByChannelSegments = useMemo(() => {
    const map = new Map()
    filtered.forEach(p => {
      const key = p.source || t('Unknown')
      map.set(key, (map.get(key) || 0) + 1)
    })
    const baseColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#22c55e']
    return Array.from(map.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [filtered, isRTL])

  const proposalsByProjectSegments = useMemo(() => {
    const map = new Map()
    filtered.forEach(p => {
      const key = p.project || t('Unknown')
      map.set(key, (map.get(key) || 0) + 1)
    })
    const baseColors = ['#8b5cf6', '#ec4899', '#10b981', '#f97316', '#3b82f6', '#22c55e']
    return Array.from(map.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [filtered, isRTL])

  const leaderboard = useMemo(() => {
    const map = new Map()
    filtered.forEach(p => {
      const key = p.salesperson || t('Unknown')
      if (!map.has(key)) {
        map.set(key, { name: key, proposals: 0, value: 0 })
      }
      const item = map.get(key)
      item.proposals += 1
      item.value += p.value || 0
    })
    return Array.from(map.values()).sort((a, b) => {
      if (b.proposals !== a.proposals) return b.proposals - a.proposals
      return b.value - a.value
    })
  }, [filtered, isRTL])

  const handleExportExcel = () => {
    if (!canExport) return
    const rows = filtered.map(p => ({
      [t('Lead Name')]: p.leadName,
      [t('Contact')]: p.contact,
      [t('Source')]: p.source,
      [projectLabel]: p.project,
      [t('Proposal Revenue')]: p.value,
      [t('Sales Person')]: p.salesperson,
      [t('Proposal Date')]: p.proposalDate
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Proposals')
    const fileName = 'Proposals_Report.xlsx'
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: 'Proposals Report',
      fileName,
      format: 'xlsx',
    })
    setShowExportMenu(false)
  }

  const exportToPdf = async () => {
    if (!canExport) return
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF()
      
      const tableColumn = [
        t('Lead Name'),
        t('Contact'),
        t('Source'),
        projectLabel,
        t('Proposal Revenue'),
        t('Sales Person'),
        t('Proposal Date')
      ]
      
      const tableRows = []

      filtered.forEach(p => {
        const rowData = [
          p.leadName,
          p.contact,
          p.source,
          p.project,
          p.value.toLocaleString(),
          p.salesperson,
          p.proposalDate
        ]
        tableRows.push(rowData)
      })

      doc.text(t('Proposals Report'), 14, 15)
      autoTable.default(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      })
      doc.save("proposals_report.pdf")
      logExportEvent({
        module: 'Proposals Report',
        fileName: 'proposals_report.pdf',
        format: 'pdf',
      })
      setShowExportMenu(false)
    } catch (error) {
      console.error("Export PDF Error:", error)
    }
  }

  const handleDelete = (id) => {
    setProposals(prev => prev.filter(p => p.id !== id))
  }

  const handlePreview = (proposal) => {
    setSelectedLead({
      id: proposal.leadId,
      name: proposal.leadName,
      phone: proposal.contact,
      source: proposal.source,
      status: 'proposal_sent',
      assignedTo: proposal.salesperson,
      project: proposal.project
    })
    setShowLeadModal(true)
  }

  const clearFilters = () => {
    setSalesPersonFilter('all')
    setManagerFilter('all')
    setSourceFilter('all')
    setProjectFilter('all')
    setProposalDateFrom('')
    setProposalDateTo('')
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
      <div>
        <BackButton to="/reports" />
        <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-2`}>
          {t('Proposals Report')}
        </h1>
        <p className={`${isLight ? 'text-black' : 'text-white'} text-sm`}>
          {t('Detailed analysis of sent proposals and conversion rates')}
        </p>
      </div>

      <div className="backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 p-6 mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-400" />
            <h3>{t('Filter')}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllFilters(prev => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? t('Hide') : t('Show All')}
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
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} `}>
                <User size={12} className="text-blue-400" />
                {t('Sales Person')}
              </label>
              <SearchableSelect options={salesPersonOptions} value={salesPersonFilter} onChange={v => setSalesPersonFilter(v)} placeholder={t('Sales Person')} isRTL={isRTL} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} `}>
                <Users size={12} className="text-blue-400" />
                {t('Manager')}
              </label>
              <SearchableSelect options={managerOptions} value={managerFilter} onChange={v => setManagerFilter(v)} placeholder={t('Manager')} isRTL={isRTL} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} `}>
                <Tag size={12} className="text-blue-400" />
                {t('Source')}
              </label>
              <SearchableSelect options={sourceSelectOptions} value={sourceFilter} onChange={v => setSourceFilter(v)} placeholder={t('Source')} isRTL={isRTL} />
            </div>
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} `}>
                <Briefcase size={12} className="text-blue-400" />
                {projectLabel}
              </label>
              <SearchableSelect options={projectSelectOptions} value={projectFilter} onChange={v => setProjectFilter(v)} placeholder={projectLabel} isRTL={isRTL} />
            </div>
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ease-in-out overflow-hidden ${
              showAllFilters ? 'max-h-[1000px] opacity-100 pt-2' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'} `}>
                <Calendar size={12} className="text-blue-400" />
                {t('Proposal Date')}
              </label>
              <DateRangePicker
                from={proposalDateFrom}
                to={proposalDateTo}
                onChange={({ from, to }) => {
                  setProposalDateFrom(from)
                  setProposalDateTo(to)
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
          { label: t('Total Proposals'), value: totalProposals, accent: 'bg-emerald-500' },
          { label: t('Total Leads'), value: totalLeads, accent: 'bg-indigo-500' },
          { label: t('Proposals Revenue'), value: `${totalRevenue.toLocaleString()} EGP`, accent: 'bg-blue-500' }
        ].map(card => (
          <div
            key={card.label}
            className="group relative  backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex items-center justify-between"
          >
            <div>
              <div className={`text-xs ${isLight ? 'text-black' : 'text-white'} `}>{card.label}</div>
              <div className="text-lg font-semibold">{card.value}</div>
            </div>
            <div className={`w-8 h-8 rounded-lg ${card.accent}`}></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {renderPieCard('Proposals by channel', proposalsByChannelSegments)}
        {renderPieCard(isRealEstate ? 'Proposals by project' : 'Proposals by item', proposalsByProjectSegments)}
        <div className="group relative  backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-yellow-400">
                <Trophy size={20} />
              </div>
              <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'} `}>{t('Top Performers')}</div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {leaderboard.length === 0 && (
                  <li className={`text-xs ${isLight ? 'text-black' : 'text-white'} text-center py-4`}>{t('No data')}</li>
                )}
                {leaderboard.map((item, index) => {
                  let rankColor = `bg-gray-700 ${isLight ? 'text-black' : 'text-white'}`
                  let rankIcon = null

                  if (index === 0) {
                    rankColor =
                      'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
                    rankIcon = <Trophy size={12} />
                  } else if (index === 1) {
                    rankColor =
                      'bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                  } else if (index === 2) {
                    rankColor =
                      'bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-700'
                  }

                  return (
                    <li
                      key={item.name}
                      className="flex items-center justify-between p-3 hover:bg-gray-700/50 transition-colors group/item"
                    >
                      <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-xs shadow-sm ${rankColor}`}
                      >
                        {rankIcon || index + 1}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm font-medium ${isLight ? 'text-black' : 'text-white'} group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400 transition-colors`}>
                          {item.name}
                        </span>
                        <span className={`text-[10px] ${isLight ? 'text-black' : 'text-white'}`}>
                          {t('Proposals')}: {item.proposals} - {t('Revenue')}: {item.value.toLocaleString()} EGP
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className=" backdrop-blur-md border border-theme-border dark:border-gray-700/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h2 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{t('Proposals Overview')}</h2>
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
                    onClick={exportToPdf}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className="text-red-600" /> {t('Export to PDF')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className={`text-xs uppercase  ${isLight ? 'text-black' : 'text-white'} hidden md:table-header-group`}>
              <tr>
                <th className="px-4 py-3">{t('Lead Name')}</th>
                <th className="px-4 py-3">{t('Contact')}</th>
                <th className="px-4 py-3">{t('Source')}</th>
                <th className="px-4 py-3">{projectLabel}</th>
                <th className="px-4 py-3 text-center">{t('Proposal Revenue')}</th>
                <th className="px-4 py-3">{t('Sales Person')}</th>
                <th className="px-4 py-3">{t('Proposal Date')}</th>
                <th className="px-4 py-3 text-center">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border dark:divide-gray-700/50">
              {paginatedData.map(proposal => (
                <React.Fragment key={proposal.id}>
                  <tr className="hover:bg-gray-700/30 transition-colors border-b border-theme-border dark:border-gray-700/50 last:border-0">
                    <td className={`px-4 py-3 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                      <div className="flex items-center gap-2">
                        <button 
                          className={`md:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded ${isLight ? 'text-black' : 'text-white'}`}
                          onClick={() => toggleRow(proposal.id)}
                        >
                          {expandedRows[proposal.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {proposal.leadName}
                      </div>
                      {/* Mobile-only info preview */}
                      <div className={`md:hidden text-xs ${isLight ? 'text-black' : 'text-white'} opacity-70 mt-1`}>
                        {proposal.value.toLocaleString()} EGP - {proposal.salesperson}
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'} hidden md:table-cell`}>{proposal.contact}</td>
                    <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'} hidden md:table-cell`}>{proposal.source}</td>
                    <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'} hidden md:table-cell`}>{proposal.project}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${isLight ? 'text-black' : 'text-white'} hidden md:table-cell`}>
                      {proposal.value.toLocaleString()} EGP
                    </td>
                    <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'} hidden md:table-cell`}>{proposal.salesperson}</td>
                    <td className={`px-4 py-3 ${isLight ? 'text-black' : 'text-white'} hidden md:table-cell`}>{proposal.proposalDate}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handlePreview(proposal)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title={t('Preview')}
                        >
                          <Eye size={16} />
                        </button>
                        {isAdminOrManager && (
                          <button
                            onClick={() => handleDelete(proposal.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title={t('Delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  
                  {/* Mobile Expandable Row */}
                  {expandedRows[proposal.id] && (
                    <tr className="md:hidden bg-white/5 dark:bg-white/5">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)]">{t('Contact')}</span>
                            <span className={`${isLight ? 'text-black' : 'text-white'} font-medium`}>{proposal.contact}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)]">{t('Source')}</span>
                            <span className={`${isLight ? 'text-black' : 'text-white'} font-medium`}>{proposal.source}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)]">{projectLabel}</span>
                            <span className={`${isLight ? 'text-black' : 'text-white'} font-medium`} >{proposal.project}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)]">{t('Proposal Revenue')}</span>
                            <span className={`${isLight ? 'text-black' : 'text-white'} font-medium`}>{proposal.value.toLocaleString()} EGP</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)]">{t('Sales Person')}</span>
                            <span className={`${isLight ? 'text-black' : 'text-white'} font-medium`}>{proposal.salesperson}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)]">{t('Proposal Date')}</span>
                            <span className={`${isLight ? 'text-black' : 'text-white'} font-medium`}>{proposal.proposalDate}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className={`px-4 py-8 text-center ${isLight ? 'text-black' : 'text-white'} `}>
                    {t('No proposals found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-theme-bg border-t border-theme-border dark:border-gray-700/60 flex items-center justify-between gap-3">
          <div className={`text-[11px] sm:text-xs ${isLight ? 'text-black' : 'text-white'}`}>
            {`Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, totalRecords)}-${Math.min(currentPage * entriesPerPage, totalRecords)} of ${totalRecords}`}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                title={t('Prev')}
              >
                {isRTL ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
              <span className="text-sm whitespace-nowrap">
                {`Page ${currentPage} of ${pageCount}`}
              </span>

              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))}
                disabled={currentPage === pageCount}
                title={t('Next')}
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
                {t('Per page:')}
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
