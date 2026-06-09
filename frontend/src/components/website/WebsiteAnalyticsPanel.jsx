import { useEffect, useState } from 'react'
import { systemCompanyWebsiteService } from '../../services/systemCompanyWebsiteService'

const MetricCard = ({ label, value, suffix = '' }) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
    <p className="text-sm text-[var(--muted-text)]">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-[var(--content-text)]">
      {value}
      {suffix}
    </p>
  </div>
)

export default function WebsiteAnalyticsPanel() {
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--content-text)]">Website Analytics</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Last 30 days · {overview?.range?.from} to {overview?.range?.to}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Visitors" value={overview?.visitors ?? 0} />
        <MetricCard label="Sessions" value={overview?.sessions ?? 0} />
        <MetricCard label="Page Views" value={overview?.page_views ?? 0} />
        <MetricCard label="Leads" value={overview?.leads ?? 0} />
        <MetricCard label="Conversion Rate" value={overview?.conversion_rate ?? 0} suffix="%" />
        <MetricCard label="CTA Clicks" value={overview?.cta_clicks ?? 0} />
        <MetricCard label="Form Starts" value={overview?.form_starts ?? 0} />
        <MetricCard label="Form Submits" value={overview?.form_submits ?? 0} />
        <MetricCard label="Form Errors" value={overview?.form_errors ?? 0} />
        <MetricCard label="Failed Intakes" value={overview?.failed_intakes ?? 0} />
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
