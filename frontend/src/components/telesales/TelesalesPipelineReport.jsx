import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Filter, Layers, Tag, Users, User, Briefcase } from 'lucide-react'
import { FaChevronDown, FaFileExcel, FaFileExport, FaFilePdf } from 'react-icons/fa'
import * as XLSX from 'xlsx'
import SearchableSelect from '../SearchableSelect'
import DateRangePicker from '../../shared/components/DateRangePicker'
import { LeadsAnalysisChart } from '../../features/Dashboard/components/LeadsAnalysisChart'
import BackButton from '../BackButton'
import { ICON_MAP } from '../settings/IconSelector'

function normalizeStageKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRoleValue(value) {
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

function getLeadDisplayStage(lead) {
  return lead?.display_stage || lead?.stageRelation?.name || lead?.stage || '-'
}

function getLeadStageKey(lead) {
  return normalizeStageKey(
    lead?.display_stage_key ||
      lead?.display_stage ||
      lead?.stageRelation?.type ||
      lead?.stageRelation?.name ||
      lead?.stage ||
      ''
  )
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

function getLeadAgencyName(lead) {
  return (
    lead?.agency ||
    lead?.agency_name ||
    lead?.agencyRelation?.name ||
    lead?.agency_relation?.name ||
    ''
  )
}

function getLeadOwnerName(lead) {
  return (
    lead?.assigned_to_name ||
    lead?.assignedAgent?.name ||
    lead?.sales_person_name ||
    lead?.assigned_to_user?.name ||
    ''
  )
}

function getLeadOwnerId(lead) {
  return String(
    lead?.assigned_to ||
      lead?.assignedAgent?.id ||
      lead?.assigned_to_user?.id ||
      ''
  )
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

export default function TelesalesPipelineReport({
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
  const { i18n } = useTranslation()
  const [salesPersonFilter, setSalesPersonFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [agencyFilter, setAgencyFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [assignDateFrom, setAssignDateFrom] = useState('')
  const [assignDateTo, setAssignDateTo] = useState('')
  const [creationDateFrom, setCreationDateFrom] = useState('')
  const [creationDateTo, setCreationDateTo] = useState('')
  const [lastActionDateFrom, setLastActionDateFrom] = useState('')
  const [lastActionDateTo, setLastActionDateTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [expandedRows, setExpandedRows] = useState({})
  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)
  const normalizedCompanyType = String(companyType || '').toLowerCase().trim()
  const isRealEstateTenant = normalizedCompanyType === 'real estate'
  const scopedEntityLabel = isRealEstateTenant
    ? (isRtl ? 'المشروع' : 'Project')
    : (isRtl ? 'الصنف' : 'Item')
  const scopedEntityPlaceholder = isRealEstateTenant
    ? (isRtl ? 'اختر المشروع' : 'Project')
    : (isRtl ? 'اختر الصنف' : 'Item')
  const allScopedEntitiesLabel = isRealEstateTenant
    ? (isRtl ? 'كل المشاريع' : 'All Projects')
    : (isRtl ? 'كل الأصناف' : 'All Items')

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const managerOptions = useMemo(() => {
    const allowedRoles = new Set(['telesales manager', 'telesales team leader', 'tenant admin', 'admin'])
    const managers = (users || [])
      .filter((entry) => allowedRoles.has(normalizeRoleValue(entry?.role || entry?.job_title)))
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

  const stageDefinitions = useMemo(() => {
    const provided = Array.isArray(stageCards) ? stageCards : []
    if (provided.length > 0) {
      return provided
        .map((stage, index) => ({
          key: normalizeStageKey(stage?.key || stage?.stage_key || stage?.name),
          title: stage?.name || stage?.stage_name || `Stage ${index + 1}`,
          color: String(stage?.color || '').toLowerCase(),
          icon: stage?.icon || 'BarChart2',
          type: normalizeStageKey(stage?.type || stage?.stage_type),
          order: Number(stage?.order ?? index),
        }))
        .filter((stage) => {
          if (!stage.key) return false
          if (['fresh', 'duplicate', 'cold calls', 'cold call'].includes(stage.key)) return false
          if (stage.type === 'convert') return false
          return true
        })
    }

    return Array.from(
      new Map((rows || []).map((lead, index) => [
        getLeadStageKey(lead),
        {
          key: getLeadStageKey(lead),
          title: getLeadDisplayStage(lead),
          color: '',
          icon: 'BarChart2',
          type: normalizeStageKey(lead?.stageRelation?.type || ''),
          order: index,
        },
      ])).values()
    ).filter((stage) => {
      if (!stage.key) return false
      if (['fresh', 'duplicate', 'cold calls', 'cold call'].includes(stage.key)) return false
      if (stage.type === 'convert') return false
      return true
    })
  }, [rows, stageCards])

  const stageOptions = useMemo(() => {
    return [
      { value: '', label: isRtl ? 'الكل' : 'All Stages' },
      ...stageDefinitions.map((stage) => ({ value: stage.title, label: stage.title })),
    ]
  }, [isRtl, stageDefinitions])

  const sourceOptions = useMemo(() => {
    const options = Array.from(new Set((rows || []).map((lead) => String(lead?.source || '').trim()).filter(Boolean)))
      .map((value) => ({ value, label: value }))
    return [{ value: '', label: isRtl ? 'الكل' : 'All Sources' }, ...options]
  }, [isRtl, rows])

  const agencyOptions = useMemo(() => {
    const options = Array.from(new Set((rows || []).map(getLeadAgencyName).filter(Boolean)))
      .map((value) => ({ value, label: value }))
    return [{ value: '', label: isRtl ? 'الكل' : 'All Agencies' }, ...options]
  }, [isRtl, rows])

  const scopedProjectOptions = useMemo(() => {
    const options = Array.from(new Set((rows || []).map(getLeadProjectName).filter(Boolean)))
      .map((value) => ({ value, label: value }))
    return [{ value: '', label: allScopedEntitiesLabel }, ...options]
  }, [allScopedEntitiesLabel, rows])

  const filteredRows = useMemo(() => {
    return (rows || []).filter((lead) => {
      if (salesPersonFilter && String(getLeadOwnerId(lead)) !== String(salesPersonFilter)) return false

      if (managerFilter) {
        const validIds = new Set([String(managerFilter)])
        getDescendants(managerFilter, users || []).forEach((entry) => validIds.add(String(entry.id)))
        const ownerId = String(getLeadOwnerId(lead))
        const owner = (users || []).find((entry) => String(entry.id) === ownerId)
        const ownerManagerId = String(owner?.manager_id || '')
        if (!validIds.has(ownerId) && !validIds.has(ownerManagerId)) return false
      }

      if (stageFilter && getLeadDisplayStage(lead) !== stageFilter) return false
      if (sourceFilter && String(lead?.source || '').trim() !== sourceFilter) return false
      if (agencyFilter && getLeadAgencyName(lead) !== agencyFilter) return false
      if (projectFilter && getLeadProjectName(lead) !== projectFilter) return false
      if (!inDateRange(lead?.assigned_at || lead?.assignedAt, assignDateFrom, assignDateTo)) return false
      if (!inDateRange(lead?.created_at || lead?.createdAt, creationDateFrom, creationDateTo)) return false
      if (!inDateRange(lead?.latest_action_at || lead?.last_action_at || lead?.updated_at, lastActionDateFrom, lastActionDateTo)) return false
      return true
    })
  }, [
    rows,
    salesPersonFilter,
    managerFilter,
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
    users,
  ])

  const stageCountMap = useMemo(() => {
    const counts = {}
    filteredRows.forEach((lead) => {
      const key = getLeadStageKey(lead)
      if (!key) return
      counts[key] = Number(counts[key] || 0) + 1
    })
    return counts
  }, [filteredRows])

  const growthData = useMemo(() => {
    const counts = {}
    filteredRows.forEach((lead) => {
      const raw = lead?.created_at || lead?.createdAt || lead?.creation_date
      const normalized = parseDateOnly(raw)
      if (!normalized) return
      const monthKey = normalized.slice(0, 7)
      counts[monthKey] = (counts[monthKey] || 0) + 1
    })

    return Object.keys(counts).sort().map((month) => {
      const [year, m] = month.split('-')
      const date = new Date(Number(year), Number(m) - 1, 1)
      return {
        label: date.toLocaleString(i18n.language, { month: 'short', year: 'numeric' }),
        value: counts[month],
      }
    })
  }, [filteredRows, i18n.language])

  const salesPersonStats = useMemo(() => {
    const groups = new Map()

    filteredRows.forEach((lead) => {
      const ownerName = getLeadOwnerName(lead) || (isRtl ? 'غير معين' : 'Unassigned')
      const stageKey = getLeadStageKey(lead)
      const current = groups.get(ownerName) || {
        name: ownerName,
        total: 0,
        stages: {},
      }

      current.total += 1
      if (stageKey) {
        current.stages[stageKey] = Number(current.stages[stageKey] || 0) + 1
      }

      groups.set(ownerName, current)
    })

    return Array.from(groups.values()).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [filteredRows, isRtl])

  const pageCount = Math.max(1, Math.ceil(salesPersonStats.length / entriesPerPage))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return salesPersonStats.slice(start, start + entriesPerPage)
  }, [currentPage, entriesPerPage, salesPersonStats])

  const exportSummaryRows = useMemo(() => {
    return salesPersonStats.map((stat) => {
      const row = {
        [isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent']: stat.name,
        [isRtl ? 'إجمالي الليدز' : 'Total Leads']: stat.total,
      }

      stageDefinitions.forEach((stage) => {
        row[stage.title] = Number(stat.stages?.[stage.key] || 0)
      })

      return row
    })
  }, [isRtl, salesPersonStats, stageDefinitions])

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportSummaryRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Telesales Pipeline')
    XLSX.writeFile(wb, 'telesales_pipeline_report.xlsx')
    setShowExportMenu(false)
  }

  const handleExportPdf = async () => {
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'landscape' })
      const columns = Object.keys(exportSummaryRows[0] || {})
      const rowsData = exportSummaryRows.map((row) => columns.map((key) => row[key]))
      doc.text(isRtl ? 'تقرير بايبلاين التيليسيلز' : 'Telesales Pipeline Report', 14, 15)
      autoTable.default(doc, {
        head: [columns],
        body: rowsData,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        margin: { left: 10, right: 10 },
      })
      doc.save('telesales_pipeline_report.pdf')
      setShowExportMenu(false)
    } catch (error) {
      console.error('Export PDF Error:', error)
    }
  }

  const resetFilters = () => {
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
    setShowAllFilters(false)
  }

  const toggleRow = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const kpiCards = useMemo(() => {
    const colorMap = {
      blue: { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
      indigo: { color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-50 dark:bg-indigo-900/20' },
      purple: { color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/20' },
      cyan: { color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-900/20' },
      amber: { color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20' },
      orange: { color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20' },
      emerald: { color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20' },
      green: { color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20' },
      red: { color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20' },
      pink: { color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-900/20' },
      teal: { color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-50 dark:bg-teal-900/20' },
    }

    const cards = [
      {
        title: isRtl ? 'إجمالي الليدز' : 'Total Leads',
        value: filteredRows.length,
        sub: isRtl ? '(الكل)' : '(Total)',
        Icon: Users,
        color: 'text-blue-500 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      },
    ]

    stageDefinitions.forEach((stage) => {
      const Icon = ICON_MAP[String(stage.icon || '')] || ICON_MAP.BarChart2 || Layers
      const palette = colorMap[String(stage.color || '').toLowerCase()] || {
        color: isLight ? 'text-black' : 'text-white',
        bgColor: isLight ? 'bg-gray-50' : 'bg-gray-800',
      }

      cards.push({
        title: stage.title,
        value: Number(stageCountMap[stage.key] || 0),
        sub: `(${stage.title})`,
        Icon,
        color: palette.color,
        bgColor: palette.bgColor,
      })
    })

    return cards
  }, [filteredRows.length, isLight, isRtl, stageCountMap, stageDefinitions])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 min-h-screen">
      <div>
        <BackButton to="/telesales/dashboard?view=reports" onClick={onBack} className="relative z-[20060] pointer-events-auto" />
      </div>

      <div className="flex flex-wrap md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} flex items-center gap-3`}>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Layers size={32} />
          </div>
          {isRtl ? 'تيليسيلز بايبلاين' : 'Telesales Pipeline'}
        </h1>
      </div>

      <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl inline-flex mb-2">
        <button className="px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm">
          {isRtl ? 'تقرير المسار' : 'Pipeline Report'}
        </button>
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3>{isRtl ? 'الفلاتر' : 'Filters'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllFilters((prev) => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? (isRtl ? 'إخفاء' : 'Hide') : (isRtl ? 'إظهار الكل' : 'Show All')}
              <ChevronDown size={12} className={`transform transition-transform duration-300 ${showAllFilters ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            <button
              onClick={resetFilters}
              className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isRtl ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <User size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'}
              </label>
              <SearchableSelect options={salesPersonOptions} value={salesPersonFilter} onChange={setSalesPersonFilter} placeholder={isRtl ? 'اختر' : 'Telesales Agent'} icon={<User size={16} />} isRTL={isRtl} />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Users size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'المدير' : 'Manager'}
              </label>
              <SearchableSelect options={managerOptions} value={managerFilter} onChange={setManagerFilter} placeholder={isRtl ? 'اختر' : 'Manager'} icon={<Users size={16} />} isRTL={isRtl} />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Layers size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'المرحلة' : 'Stage'}
              </label>
              <SearchableSelect options={stageOptions} value={stageFilter} onChange={setStageFilter} placeholder={isRtl ? 'اختر' : 'Stage Pipeline'} icon={<Layers size={16} />} isRTL={isRtl} />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'المصدر' : 'Source'}
              </label>
              <SearchableSelect options={sourceOptions} value={sourceFilter} onChange={setSourceFilter} placeholder={isRtl ? 'اختر' : 'Source'} icon={<Tag size={16} />} isRTL={isRtl} />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Building2 size={12} className="text-blue-500 dark:text-blue-400" />
                {isRtl ? 'الوكالة' : 'Agency'}
              </label>
              <SearchableSelect options={agencyOptions} value={agencyFilter} onChange={setAgencyFilter} placeholder={isRtl ? 'اختر' : 'Agency'} icon={<Building2 size={16} />} isRTL={isRtl} />
            </div>

            <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                {scopedEntityLabel}
              </label>
              <SearchableSelect options={scopedProjectOptions} value={projectFilter} onChange={setProjectFilter} placeholder={scopedEntityPlaceholder} icon={<Briefcase size={16} />} isRTL={isRtl} />
            </div>
          </div>

          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showAllFilters ? 'max-h-[800px] opacity-100 pt-3' : 'max-h-0 opacity-0'}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'تاريخ التعيين' : 'Assign Date'}</label>
                <DateRangePicker
                  from={assignDateFrom}
                  to={assignDateTo}
                  onChange={({ from, to }) => {
                    setAssignDateFrom(from)
                    setAssignDateTo(to)
                  }}
                  isRTL={isRtl}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>
              <div className="space-y-1">
                <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'تاريخ الإنشاء' : 'Creation Date'}</label>
                <DateRangePicker
                  from={creationDateFrom}
                  to={creationDateTo}
                  onChange={({ from, to }) => {
                    setCreationDateFrom(from)
                    setCreationDateTo(to)
                  }}
                  isRTL={isRtl}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>
              <div className="space-y-1">
                <label className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'تاريخ آخر أكشن' : 'Last Action Date'}</label>
                <DateRangePicker
                  from={lastActionDateFrom}
                  to={lastActionDateTo}
                  onChange={({ from, to }) => {
                    setLastActionDateFrom(from)
                    setLastActionDateTo(to)
                  }}
                  isRTL={isRtl}
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm ${isLight ? 'text-black' : 'text-white'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${kpiCards.length >= 6 ? 'xl:grid-cols-4 2xl:grid-cols-6' : 'xl:grid-cols-4'} gap-4`}>
        {kpiCards.map((card, idx) => {
          const Icon = card.Icon
          return (
            <div key={idx} className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden h-32">
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
                  <span className={`text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>{card.sub}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-6">
        <h2 className={`text-lg font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'نمو الليدز' : 'Leads Growth'}</h2>
        <div className="h-64 sm:h-80">
          {growthData.length > 0 ? (
            <LeadsAnalysisChart data={growthData} chartType="line" legendLabel={isRtl ? 'عدد الليدز' : 'No. of Leads'} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">{isRtl ? 'لا توجد بيانات متاحة للعرض' : 'No data available to display'}</div>
          )}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 overflow-hidden">
        <div className="p-6 border-b border-theme-border dark:border-gray-700/50 flex items-center justify-between">
          <h3 className={`text-lg font-bold ${isLight ? 'text-black' : 'text-white'}`}>{isRtl ? 'قائمة نظرة عامة على ليدز التيلي' : 'Telesales overview List:'}</h3>
          {canExport && (
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu((prev) => !prev)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
              <FaFileExport /> {isRtl ? 'تصدير' : 'Export'}
              <FaChevronDown className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} size={12} />
            </button>
            {showExportMenu && (
              <div className={`absolute top-full ${isRtl ? 'left-0' : 'right-0'} mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48`}>
                <button onClick={handleExportExcel} className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                  <FaFileExcel className="text-green-600" /> {isRtl ? 'تصدير كـ Excel' : 'Export to Excel'}
                </button>
                <button onClick={handleExportPdf} className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                  <FaFilePdf className="text-red-600" /> {isRtl ? 'تصدير كـ PDF' : 'Export to PDF'}
                </button>
              </div>
            )}
          </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className={`text-xs uppercase bg-white/5 dark:bg-white/5 ${isLight ? 'text-black' : 'text-white'}`}>
              <tr>
                <th className="md:hidden px-6 py-4 border-b border-theme-border dark:border-gray-700/50"></th>
                <th className="px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRtl ? 'مسؤول التيليسيلز' : 'Telesales Agent'}</th>
                <th className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">{isRtl ? 'إجمالي الليدز' : 'Total Leads'}</th>
                {stageDefinitions.map((stage) => (
                  <th key={`head-${stage.key}`} className="hidden md:table-cell px-6 py-4 font-medium border-b border-theme-border dark:border-gray-700/50">
                    {stage.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border dark:divide-gray-700/50">
              {salesPersonStats.length === 0 && (
                <tr>
                  <td colSpan={stageDefinitions.length + 3} className="px-6 py-6 text-center text-gray-500 dark:text-gray-400">
                    {isRtl ? 'لا توجد بيانات' : 'No data'}
                  </td>
                </tr>
              )}
              {salesPersonStats.length > 0 && paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={stageDefinitions.length + 3} className="px-6 py-6 text-center text-gray-500 dark:text-gray-400">
                    {isRtl ? 'لا توجد نتائج' : 'No results'}
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
                    {stageDefinitions.map((stage) => (
                      <td key={`cell-${stat.name}-${stage.key}`} className="hidden md:table-cell px-6 py-4 text-blue-600 dark:text-blue-400">
                        {Number(stat.stages?.[stage.key] || 0)}
                      </td>
                    ))}
                  </tr>
                  {expandedRows[stat.name] && (
                    <tr className="md:hidden bg-gray-50 dark:bg-white/5">
                      <td colSpan={2} className="px-6 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--muted-text)] text-xs">{isRtl ? 'إجمالي الليدز' : 'Total Leads'}</span>
                            <span className={`font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{stat.total}</span>
                          </div>
                          {stageDefinitions.map((stage) => (
                            <div key={`mobile-${stat.name}-${stage.key}`} className="flex flex-col gap-1">
                              <span className="text-[var(--muted-text)] text-xs">{stage.title}</span>
                              <span className="font-semibold text-blue-600 dark:text-blue-400">{Number(stat.stages?.[stage.key] || 0)}</span>
                            </div>
                          ))}
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
              {isRtl
                ? `إظهار ${Math.min((currentPage - 1) * entriesPerPage + 1, salesPersonStats.length)}-${Math.min(currentPage * entriesPerPage, salesPersonStats.length)} من ${salesPersonStats.length}`
                : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, salesPersonStats.length)}-${Math.min(currentPage * entriesPerPage, salesPersonStats.length)} of ${salesPersonStats.length}`}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button className="btn btn-sm btn-ghost" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} title={isRtl ? 'السابق' : 'Prev'}>
                  {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
                <span className={`text-sm whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>
                  {isRtl ? `الصفحة ${currentPage} من ${pageCount}` : `Page ${currentPage} of ${pageCount}`}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => setCurrentPage((p) => Math.min(p + 1, pageCount))} disabled={currentPage === pageCount} title={isRtl ? 'التالي' : 'Next'}>
                  {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className={`text-[10px] sm:text-xs ${isLight ? 'text-black' : 'text-white'} whitespace-nowrap`}>
                  {isRtl ? 'لكل صفحة:' : 'Per page:'}
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
    </div>
  )
}
