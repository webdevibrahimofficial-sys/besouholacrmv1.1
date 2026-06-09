import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { systemCompanyWebsiteService } from '../services/systemCompanyWebsiteService'
import WebsiteAnalyticsPanel from '../components/website/WebsiteAnalyticsPanel'

const emptyService = {
  name: '',
  short_description: '',
  description: '',
  cta_text: 'Request a Demo',
  form_name: '',
  is_active: true,
}

export default function WebsiteCms() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(null)
  const [sections, setSections] = useState([])
  const [services, setServices] = useState([])
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [editingServiceId, setEditingServiceId] = useState(null)

  const heroSection = useMemo(
    () => sections.find((section) => section.type === 'hero'),
    [sections]
  )
  const servicesIntroSection = useMemo(
    () => sections.find((section) => section.type === 'services_intro'),
    [sections]
  )
  const ctaSection = useMemo(
    () => sections.find((section) => section.type === 'cta'),
    [sections]
  )

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [settingsData, sectionsData, servicesData] = await Promise.all([
        systemCompanyWebsiteService.getSettings(),
        systemCompanyWebsiteService.getHomepageSections(),
        systemCompanyWebsiteService.getServices(),
      ])
      setSettings(settingsData)
      setSections(sectionsData)
      setServices(servicesData)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load website CMS.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await systemCompanyWebsiteService.updateSettings(settings)
      setSettings(updated)
      setMessage('Website settings saved successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const saveSection = async (section, content) => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await systemCompanyWebsiteService.updateHomepageSection(section.id, { content })
      setSections((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setMessage(`${section.title || section.type} updated successfully.`)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save section.')
    } finally {
      setSaving(false)
    }
  }

  const saveService = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      if (editingServiceId) {
        const updated = await systemCompanyWebsiteService.updateService(editingServiceId, serviceForm)
        setServices((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        setMessage('Service updated successfully.')
      } else {
        const created = await systemCompanyWebsiteService.createService(serviceForm)
        setServices((prev) => [...prev, created])
        setMessage('Service created successfully.')
      }
      setServiceForm(emptyService)
      setEditingServiceId(null)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save service.')
    } finally {
      setSaving(false)
    }
  }

  const editService = (service) => {
    setEditingServiceId(service.id)
    setServiceForm({
      name: service.name || '',
      short_description: service.short_description || '',
      description: service.description || '',
      cta_text: service.cta_text || 'Request a Demo',
      form_name: service.form_name || '',
      is_active: service.is_active !== false,
    })
  }

  const removeService = async (serviceId) => {
    if (!window.confirm('Delete this service?')) return
    setSaving(true)
    setError('')
    try {
      await systemCompanyWebsiteService.deleteService(serviceId)
      setServices((prev) => prev.filter((item) => item.id !== serviceId))
      setMessage('Service deleted successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete service.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-[var(--muted-text)]">Loading website CMS...</div>
  }

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--content-text)]">Company Website</h1>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Manage besouhola.com content, homepage sections, services, and analytics.
        </p>
      </div>

      {message ? <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        {['settings', 'homepage', 'services', 'analytics'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm ${
              activeTab === tab
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--surface-2)] text-[var(--muted-text)]'
            }`}
          >
            {tab === 'settings'
              ? 'Settings'
              : tab === 'homepage'
                ? 'Homepage'
                : tab === 'services'
                  ? 'Services'
                  : 'Analytics'}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && settings ? (
        <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:grid-cols-2">
          {[
            ['company_name', 'Company Name'],
            ['logo_url', 'Logo URL'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['whatsapp', 'WhatsApp'],
            ['primary_color', 'Primary Color'],
            ['seo_title', 'SEO Title'],
          ].map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                value={settings[key] || ''}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-[var(--muted-text)]">Address</span>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              rows={3}
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-[var(--muted-text)]">SEO Description</span>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              rows={3}
              value={settings.seo_description || ''}
              onChange={(e) => setSettings({ ...settings, seo_description: e.target.value })}
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveSettings}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'homepage' ? (
        <div className="space-y-6">
          {[heroSection, servicesIntroSection, ctaSection].filter(Boolean).map((section) => (
            <div key={section.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="mb-4 text-lg font-semibold capitalize">{section.title || section.type}</h2>
              <textarea
                className="min-h-[220px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm"
                value={JSON.stringify(section.content || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    setSections((prev) =>
                      prev.map((item) =>
                        item.id === section.id ? { ...item, content: parsed } : item
                      )
                    )
                  } catch {
                    // Keep editing until valid JSON.
                  }
                }}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => saveSection(section, section.content || {})}
                className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
              >
                Save {section.title || section.type}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === 'analytics' ? <WebsiteAnalyticsPanel /> : null}

      {activeTab === 'services' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {editingServiceId ? 'Edit Service' : 'Add Service'}
            </h2>
            <div className="space-y-3">
              {[
                ['name', 'Name'],
                ['short_description', 'Short Description'],
                ['cta_text', 'CTA Text'],
                ['form_name', 'Form Name'],
              ].map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    value={serviceForm[key] || ''}
                    onChange={(e) => setServiceForm({ ...serviceForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-text)]">Description</span>
                <textarea
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                  rows={4}
                  value={serviceForm.description || ''}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={serviceForm.is_active !== false}
                  onChange={(e) => setServiceForm({ ...serviceForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveService}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingServiceId ? 'Update Service' : 'Create Service'}
                </button>
                {editingServiceId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingServiceId(null)
                      setServiceForm(emptyService)
                    }}
                    className="rounded-lg border border-[var(--border)] px-4 py-2"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {services.map((service) => (
              <div key={service.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{service.name}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-text)]">{service.short_description}</p>
                    <p className="mt-2 text-xs text-[var(--muted-text)]">
                      {service.is_active ? 'Active' : 'Inactive'} · {service.slug}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => editService(service)} className="text-sm text-[var(--primary)]">
                      Edit
                    </button>
                    <button type="button" onClick={() => removeService(service.id)} className="text-sm text-red-400">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
