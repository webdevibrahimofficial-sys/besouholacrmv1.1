import { useEffect, useState } from 'react'
import { BarChart3, FileText, MousePointerClick, Users } from 'lucide-react'
import { useTheme } from '../../shared/context/ThemeProvider'
import { systemCompanyWebsiteService } from '../../services/systemCompanyWebsiteService'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [pages, setPages] = useState([])
  const [forms, setForms] = useState([])
  const [campaigns, setCampaigns] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [overviewData, pagesData, formsData, campaignsData] = await Promise.all([
          systemCompanyWebsiteService.getAnalyticsOverview(),
          systemCompanyWebsiteService.getAnalyticsPages(),
          systemCompanyWebsiteService.getAnalyticsForms(),
          systemCompanyWebsiteService.getAnalyticsCampaigns(),
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
  }, [])

  if (loading) {
    return <div className="text-[var(--muted-text)]">Loading website analytics...</div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
  }

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--content-text)]">Website Analytics</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Last 30 days · {overview?.range?.from} to {overview?.range?.to}
        </p>
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
                  {row.views} views · {row.conversion_rate}% conv.
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
                  <td className="py-2 pr-4">{row.utm_source || '—'}</td>
                  <td className="py-2 pr-4">{row.utm_medium || '—'}</td>
                  <td className="py-2 pr-4">{row.utm_campaign || '—'}</td>
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
