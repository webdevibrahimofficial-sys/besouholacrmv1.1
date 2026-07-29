import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
  ChevronDown,
  FileText,
  Filter,
  MousePointerClick,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useTheme } from '../../shared/context/ThemeProvider'
import { systemCompanyWebsiteService } from '../../services/systemCompanyWebsiteService'

const PRESET_OPTIONS = [
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
]

const DEFAULT_FILTERS = {
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  device: '',
}

const DEVICE_OPTIONS = [
  { value: '', label: 'All devices' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
]

const EMPTY_FILTER_OPTIONS = {
  utm_sources: [],
  utm_mediums: [],
  utm_campaigns: [],
  devices: [],
}

const formatInputDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const shiftDate = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

const startOfMonth = () => {
  const date = new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

const buildRangeFromPreset = (preset) => {
  const today = new Date()

  switch (preset) {
    case 'last7':
      return { from: formatInputDate(shiftDate(-7)), to: formatInputDate(today) }
    case 'last90':
      return { from: formatInputDate(shiftDate(-90)), to: formatInputDate(today) }
    case 'thisMonth':
      return { from: formatInputDate(startOfMonth()), to: formatInputDate(today) }
    case 'custom':
      return { from: formatInputDate(shiftDate(-30)), to: formatInputDate(today) }
    case 'last30':
    default:
      return { from: formatInputDate(shiftDate(-30)), to: formatInputDate(today) }
  }
}

const MetricCard = ({ label, value, suffix = '', icon: Icon, iconTone }) => (
  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-[var(--muted-text)]">{label}</p>
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${iconTone}`}>
        <Icon size={18} />
      </span>
    </div>
    <p className="mt-3 text-2xl font-semibold text-[var(--content-text)]">
      {value}
      {suffix}
    </p>
  </div>
)

export default function WebsiteAnalyticsPanel() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const defaultRange = useMemo(() => buildRangeFromPreset('last30'), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [pages, setPages] = useState([])
  const [forms, setForms] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS)
  const [preset, setPreset] = useState('last30')
  const [draftRange, setDraftRange] = useState(defaultRange)
  const [appliedRange, setAppliedRange] = useState(defaultRange)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [showMoreFilters, setShowMoreFilters] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [overviewData, pagesData, formsData, campaignsData] = await Promise.all([
          systemCompanyWebsiteService.getAnalyticsOverview(appliedRange.from, appliedRange.to, filters),
          systemCompanyWebsiteService.getAnalyticsPages(appliedRange.from, appliedRange.to, filters),
          systemCompanyWebsiteService.getAnalyticsForms(appliedRange.from, appliedRange.to, filters),
          systemCompanyWebsiteService.getAnalyticsCampaigns(appliedRange.from, appliedRange.to, filters),
        ])
        setOverview(overviewData)
        setPages(pagesData)
        setForms(formsData)
        setCampaigns(campaignsData)
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load analytics.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [appliedRange.from, appliedRange.to, filters])

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const options = await systemCompanyWebsiteService.getAnalyticsFilterOptions(
          appliedRange.from,
          appliedRange.to
        )
        setFilterOptions({
          utm_sources: options?.utm_sources || [],
          utm_mediums: options?.utm_mediums || [],
          utm_campaigns: options?.utm_campaigns || [],
          devices: options?.devices || [],
        })
      } catch {
        setFilterOptions(EMPTY_FILTER_OPTIONS)
      }
    }

    loadFilterOptions()
  }, [appliedRange.from, appliedRange.to])

  const rangeLabel = useMemo(() => {
    const matchedPreset = PRESET_OPTIONS.find((option) => option.key === preset)
    return matchedPreset?.label || 'Selected range'
  }, [preset])

  const filterBtnClass = isDark
    ? 'bg-blue-950/40 text-blue-300 hover:bg-blue-900/50'
    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'

  const fieldClass = isDark
    ? 'h-10 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400'
    : 'h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400'

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters]
  )

  const sourceOptions = useMemo(
    () => [{ value: '', label: 'All sources' }, ...filterOptions.utm_sources.map((value) => ({ value, label: value }))],
    [filterOptions.utm_sources]
  )

  const mediumOptions = useMemo(
    () => [{ value: '', label: 'All mediums' }, ...filterOptions.utm_mediums.map((value) => ({ value, label: value }))],
    [filterOptions.utm_mediums]
  )

  const campaignOptions = useMemo(
    () => [{ value: '', label: 'All campaigns' }, ...filterOptions.utm_campaigns.map((value) => ({ value, label: value }))],
    [filterOptions.utm_campaigns]
  )

  const deviceOptions = useMemo(() => {
    const dynamicDevices = filterOptions.devices.map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
    }))

    if (dynamicDevices.length > 0) {
      return [{ value: '', label: 'All devices' }, ...dynamicDevices]
    }

    return DEVICE_OPTIONS
  }, [filterOptions.devices])

  const metricCards = [
    { label: 'Visitors', value: overview?.visitors ?? 0, icon: Users, iconTone: isDark ? 'border-blue-400/20 bg-blue-500/14 text-blue-300' : 'border-blue-200/80 bg-blue-100 text-blue-700' },
    { label: 'Sessions', value: overview?.sessions ?? 0, icon: BarChart3, iconTone: isDark ? 'border-violet-400/20 bg-violet-500/14 text-violet-300' : 'border-violet-200/80 bg-violet-100 text-violet-700' },
    { label: 'Page Views', value: overview?.page_views ?? 0, icon: FileText, iconTone: isDark ? 'border-emerald-400/20 bg-emerald-500/14 text-emerald-300' : 'border-emerald-200/80 bg-emerald-100 text-emerald-700' },
    { label: 'Leads', value: overview?.leads ?? 0, icon: MousePointerClick, iconTone: isDark ? 'border-amber-400/20 bg-amber-500/14 text-amber-300' : 'border-amber-200/80 bg-amber-100 text-amber-700' },
    { label: 'Conversion Rate', value: overview?.conversion_rate ?? 0, suffix: '%', icon: BarChart3, iconTone: isDark ? 'border-cyan-400/20 bg-cyan-500/14 text-cyan-300' : 'border-cyan-200/80 bg-cyan-100 text-cyan-700' },
    { label: 'CTA Clicks', value: overview?.cta_clicks ?? 0, icon: MousePointerClick, iconTone: isDark ? 'border-fuchsia-400/20 bg-fuchsia-500/14 text-fuchsia-300' : 'border-fuchsia-200/80 bg-fuchsia-100 text-fuchsia-700' },
    { label: 'Form Starts', value: overview?.form_starts ?? 0, icon: FileText, iconTone: isDark ? 'border-indigo-400/20 bg-indigo-500/14 text-indigo-300' : 'border-indigo-200/80 bg-indigo-100 text-indigo-700' },
    { label: 'Form Submits', value: overview?.form_submits ?? 0, icon: FileText, iconTone: isDark ? 'border-emerald-400/20 bg-emerald-500/14 text-emerald-300' : 'border-emerald-200/80 bg-emerald-100 text-emerald-700' },
    { label: 'Form Errors', value: overview?.form_errors ?? 0, icon: FileText, iconTone: isDark ? 'border-rose-400/20 bg-rose-500/14 text-rose-300' : 'border-rose-200/80 bg-rose-100 text-rose-700' },
    { label: 'Failed Intakes', value: overview?.failed_intakes ?? 0, icon: FileText, iconTone: isDark ? 'border-orange-400/20 bg-orange-500/14 text-orange-300' : 'border-orange-200/80 bg-orange-100 text-orange-700' },
  ]

  const handlePresetChange = (nextPreset) => {
    setPreset(nextPreset)

    if (nextPreset === 'custom') {
      return
    }

    const nextRange = buildRangeFromPreset(nextPreset)
    setDraftRange(nextRange)
    setAppliedRange(nextRange)
  }

  const handleDateRangeChange = (key, value) => {
    setPreset('custom')

    setDraftRange((prev) => {
      const nextRange = { ...prev, [key]: value }

      if (!nextRange.from || !nextRange.to) {
        setError('Please select both From and To dates.')
        return nextRange
      }

      if (nextRange.from > nextRange.to) {
        setError('The From date must be earlier than the To date.')
        return nextRange
      }

      setError('')
      setAppliedRange(nextRange)
      return nextRange
    })
  }

  const resetRange = () => {
    const nextRange = buildRangeFromPreset('last30')
    setError('')
    setPreset('last30')
    setDraftRange(nextRange)
    setAppliedRange(nextRange)
    setFilters(DEFAULT_FILTERS)
  }

  const handleFilterChange = (key, value) => {
    setError('')
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return <div className="text-[var(--muted-text)]">Loading website analytics...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--content-text)]">Website Analytics</h2>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            {rangeLabel} - {overview?.range?.from || appliedRange.from} to {overview?.range?.to || appliedRange.to}
          </p>
        </div>

        <div className="w-full max-w-4xl rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_16px_35px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                  isDark
                    ? 'border-slate-700 bg-slate-900 text-blue-300'
                    : 'border-blue-100 bg-blue-50 text-blue-600'
                }`}>
                  <Filter size={16} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-[var(--content-text)]">Filters</h3>
                  <p className="mt-1 text-xs text-[var(--muted-text)]">Filters apply automatically when you choose a range or update any filter.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowMoreFilters((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-colors ${filterBtnClass}`}
                >
                  <span>{showMoreFilters ? 'Hide filters' : 'More filters'}</span>
                  {activeFilterCount > 0 ? (
                    <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] ${
                      isDark ? 'bg-blue-400/15 text-blue-200' : 'bg-white text-blue-700'
                    }`}>
                      {activeFilterCount}
                    </span>
                  ) : null}
                  <ChevronDown size={16} className={`transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={resetRange}
                  className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-[11px] font-medium transition-colors ${
                    isDark ? 'text-slate-200 hover:text-white' : 'text-slate-950 hover:text-slate-600'
                  }`}
                >
                  <RefreshCw size={13} />
                  Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                  Quick range
                </span>
                <select
                  value={preset}
                  onChange={(event) => handlePresetChange(event.target.value)}
                  className={`${fieldClass} font-semibold`}
                >
                  {PRESET_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                  </select>
                </label>

              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                  UTM Source
                </span>
                <select
                  value={filters.utm_source}
                  onChange={(event) => handleFilterChange('utm_source', event.target.value)}
                  className={fieldClass}
                >
                  {sourceOptions.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                  UTM Medium
                </span>
                <select
                  value={filters.utm_medium}
                  onChange={(event) => handleFilterChange('utm_medium', event.target.value)}
                  className={fieldClass}
                >
                  {mediumOptions.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                  Device
                </span>
                <select
                  value={filters.device}
                  onChange={(event) => handleFilterChange('device', event.target.value)}
                  className={fieldClass}
                >
                  {deviceOptions.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {showMoreFilters ? (
              <div className={`space-y-4 border-t pt-4 ${
                isDark ? 'border-slate-800' : 'border-slate-100'
              }`}>
                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                      UTM Campaign
                    </span>
                    <select
                      value={filters.utm_campaign}
                      onChange={(event) => handleFilterChange('utm_campaign', event.target.value)}
                      className={fieldClass}
                    >
                      {campaignOptions.map((option) => (
                        <option key={option.value || 'all'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                      <CalendarRange size={13} />
                      From
                    </span>
                    <input
                      type="date"
                      value={draftRange.from}
                      onChange={(event) => handleDateRangeChange('from', event.target.value)}
                      className={fieldClass}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-text)]">
                      <CalendarRange size={13} />
                      To
                    </span>
                    <input
                      type="date"
                      value={draftRange.to}
                      onChange={(event) => handleDateRangeChange('to', event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                isDark
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-red-200 bg-red-50 text-red-600'
              }`}>
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="mb-4 font-semibold">Top Pages</h3>
          <div className="space-y-3">
            {(overview?.top_pages || []).map((row) => (
              <div key={row.page_path} className="flex items-center justify-between text-sm">
                <span>{row.page_path}</span>
                <span className="text-[var(--muted-text)]">{row.views} views</span>
              </div>
            ))}
            {pages.slice(0, 5).map((row) => (
              <div key={`page-${row.page_path}`} className="flex items-center justify-between text-sm">
                <span>{row.page_path}</span>
                <span className="text-[var(--muted-text)]">
                  {row.views} views - {row.conversion_rate}% conv.
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="mb-4 font-semibold">Top Forms</h3>
          <div className="space-y-3">
            {(overview?.top_forms || []).map((row) => (
              <div key={row.form_name} className="flex items-center justify-between text-sm">
                <span>{row.form_name}</span>
                <span className="text-[var(--muted-text)]">{row.submits} submits</span>
              </div>
            ))}
            {forms.slice(0, 5).map((row) => (
              <div key={`form-${row.form_name}`} className="flex items-center justify-between text-sm">
                <span>{row.form_name}</span>
                <span className="text-[var(--muted-text)]">
                  {row.starts} starts · {row.submits} submits
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-4 font-semibold">Campaigns</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted-text)]">
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2 pr-4">Medium</th>
                <th className="pb-2 pr-4">Campaign</th>
                <th className="pb-2 pr-4">Sessions</th>
                <th className="pb-2 pr-4">Leads</th>
                <th className="pb-2">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row, index) => (
                <tr key={`${row.utm_source}-${row.utm_campaign}-${index}`} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4">{row.utm_source || '-'}</td>
                  <td className="py-2 pr-4">{row.utm_medium || '-'}</td>
                  <td className="py-2 pr-4">{row.utm_campaign || '-'}</td>
                  <td className="py-2 pr-4">{row.sessions}</td>
                  <td className="py-2 pr-4">{row.leads}</td>
                  <td className="py-2">{row.conversion_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
