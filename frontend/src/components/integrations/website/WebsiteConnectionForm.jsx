import { useMemo } from 'react'

const toOriginsText = (value) => {
  if (Array.isArray(value)) return value.join('\n')
  return value || ''
}

export default function WebsiteConnectionForm({
  mode = 'create',
  form,
  campaigns,
  sources,
  saving,
  onChange,
  onSubmit,
  onCancel,
}) {
  const title = mode === 'edit' ? 'Edit Website Connection' : 'Create Website Connection'

  const availableSources = useMemo(() => sources || [], [sources])
  const availableCampaigns = useMemo(() => campaigns || [], [campaigns])

  return (
    <div className="card rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-theme">{title}</h3>
        <p className="text-sm text-[var(--muted-text)]">Configure CRM routing, source, origin policy, and activation state.</p>
      </div>

      <form onSubmit={onSubmit} className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme mb-1">Connection Name</label>
            <input
              className="input w-full"
              value={form.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="Main Website"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme mb-1">Website URL</label>
            <input
              className="input w-full"
              value={form.url || ''}
              onChange={(e) => onChange('url', e.target.value)}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme mb-1">Default Campaign</label>
            <select
              className="select w-full"
              value={form.default_campaign_id ?? ''}
              onChange={(e) => onChange('default_campaign_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No default campaign</option>
              {availableCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme mb-1">Default Source</label>
            <select
              className="select w-full"
              value={form.default_source_id ?? ''}
              onChange={(e) => onChange('default_source_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Auto Website source</option>
              {availableSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme mb-1">Allowed Origins</label>
          <textarea
            className="textarea w-full h-28"
            value={toOriginsText(form.allowed_origins)}
            onChange={(e) => onChange('allowed_origins', e.target.value)}
            placeholder={'https://example.com\nhttps://www.example.com'}
          />
          <p className="mt-1 text-xs text-[var(--muted-text)]">Add one origin per line or separated by commas.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              checked={!!form.allow_all_origins_for_testing}
              onChange={(e) => onChange('allow_all_origins_for_testing', e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-theme">Allow all origins for testing</span>
              <span className="block text-xs text-[var(--muted-text)]">Use only in development or temporary testing scenarios.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              checked={form.is_active !== false}
              onChange={(e) => onChange('is_active', e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-theme">Connection is active</span>
              <span className="block text-xs text-[var(--muted-text)]">Inactive connections reject incoming website leads.</span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-theme">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--primary-color)] text-white font-medium hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create Connection'}
          </button>
        </div>
      </form>
    </div>
  )
}

