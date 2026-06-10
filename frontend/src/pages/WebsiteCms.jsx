import { useEffect, useMemo, useState } from 'react'
import { systemCompanyWebsiteService } from '../services/systemCompanyWebsiteService'
import WebsiteAnalyticsPanel from '../components/website/WebsiteAnalyticsPanel'
import WebsiteCareersPanel, { emptyRole as emptyCareerRole } from '../components/website/WebsiteCareersPanel'

const defaultHeroSectionContent = {
  badge: 'AI-Powered CRM Platform',
  headline: 'One Intelligent CRM Built for Your Growth',
  headline_accent: '',
  subtitle:
    'Be Souhola adapts to your workflow. Capture leads, automate follow-ups, and close deals faster whether you are a growing business or a specialized real estate team.',
  secondary_cta: 'Explore Features',
  form_title: 'Book Your Free Demo',
  form_subtitle: 'Tell us what you need and our team will contact you within 24 hours.',
  form_badge: 'CRM Demo',
  form_side_title: 'Why Teams Choose Us',
  form_button_text: 'Request Demo',
  name_label: 'Full name *',
  name_placeholder: 'John Doe',
  phone_label: 'Phone number *',
  phone_placeholder: '+20 100 000 0000',
  email_label: 'Email address',
  email_placeholder: 'you@company.com',
  service_label: 'Service interested in',
  service_placeholder: 'Select your business type',
  message_label: 'Notes',
  message_placeholder: 'Anything we should know before we contact you?',
  privacy_note: 'Your data stays private and is only used to contact you.',
  success_title: 'Thank you!',
  success_message: 'We received your request. Our team will contact you shortly.',
  success_reset_text: 'Submit another request',
  benefit_points: ['Free consultation', 'Response within 24 hours', 'No commitment required'],
  form_panel_points: ['Setup support included', 'Tailored walkthrough', 'Clear next steps'],
  service_options: [
    'General Business CRM (Sales & Marketing)',
    'Real Estate CRM (Property & Lead Management)',
    'Other',
  ],
  stats: [
    { value: '500+', label: 'Teams onboarded' },
    { value: '24h', label: 'Average first response' },
    { value: '38%', label: 'Faster deal closing' },
  ],
}

const emptyService = {
  name: '',
  short_description: '',
  description: '',
  cta_text: 'Request a Demo',
  form_name: '',
  is_active: true,
}
export default function WebsiteCms() {
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
  const [careerPage, setCareerPage] = useState(null)
  const [careerRoles, setCareerRoles] = useState([])
  const [careerApplications, setCareerApplications] = useState([])
  const [careerRoleForm, setCareerRoleForm] = useState(emptyCareerRole)
  const [editingCareerRoleId, setEditingCareerRoleId] = useState(null)

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
  const heroContent = useMemo(() => {
    if (!heroSection) return defaultHeroSectionContent
    return {
      ...defaultHeroSectionContent,
      ...(heroSection.content || {}),
      benefit_points: Array.isArray(heroSection.content?.benefit_points)
        ? heroSection.content.benefit_points
        : defaultHeroSectionContent.benefit_points,
      form_panel_points: Array.isArray(heroSection.content?.form_panel_points)
        ? heroSection.content.form_panel_points
        : defaultHeroSectionContent.form_panel_points,
      service_options: Array.isArray(heroSection.content?.service_options)
        ? heroSection.content.service_options
        : defaultHeroSectionContent.service_options,
      stats: Array.isArray(heroSection.content?.stats)
        ? heroSection.content.stats
        : defaultHeroSectionContent.stats,
    }
  }, [heroSection])

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [settingsData, sectionsData, servicesData, careerPageData, careerRolesData, careerApplicationsData] = await Promise.all([
        systemCompanyWebsiteService.getSettings(),
        systemCompanyWebsiteService.getHomepageSections(),
        systemCompanyWebsiteService.getServices(),
        systemCompanyWebsiteService.getCareerPage(),
        systemCompanyWebsiteService.getCareerRoles(),
        systemCompanyWebsiteService.getCareerApplications(),
      ])
      setSettings(settingsData)
      setSections(sectionsData)
      setServices(servicesData)
      setCareerPage(careerPageData)
      setCareerRoles(careerRolesData)
      setCareerApplications(careerApplicationsData)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load website CMS.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const updateSectionContent = (sectionId, nextContent) => {
    setSections((prev) =>
      prev.map((item) =>
        item.id === sectionId ? { ...item, content: nextContent } : item
      )
    )
  }

  const updateHeroField = (key, value) => {
    if (!heroSection) return
    updateSectionContent(heroSection.id, {
      ...heroContent,
      [key]: value,
    })
  }

  const updateHeroList = (key, text) => {
    updateHeroField(
      key,
      text
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }

  const updateHeroStats = (text) => {
    const stats = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [value, ...labelParts] = line.split('|')
        return {
          value: value?.trim() || '',
          label: labelParts.join('|').trim(),
        }
      })
      .filter((item) => item.value || item.label)

    updateHeroField('stats', stats)
  }

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

  const saveCareerPage = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await systemCompanyWebsiteService.updateCareerPage({
        content: careerPage?.content || {},
        is_active: careerPage?.is_active !== false,
      })
      setCareerPage(updated)
      setMessage('Careers page updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save careers page.')
    } finally {
      setSaving(false)
    }
  }

  const saveCareerRole = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      if (editingCareerRoleId) {
        const updated = await systemCompanyWebsiteService.updateCareerRole(editingCareerRoleId, careerRoleForm)
        setCareerRoles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        setMessage('Career role updated successfully.')
      } else {
        const created = await systemCompanyWebsiteService.createCareerRole(careerRoleForm)
        setCareerRoles((prev) => [...prev, created])
        setMessage('Career role created successfully.')
      }

      setCareerRoleForm(emptyCareerRole)
      setEditingCareerRoleId(null)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save career role.')
    } finally {
      setSaving(false)
    }
  }

  const editCareerRole = (role) => {
    setEditingCareerRoleId(role.id)
    setCareerRoleForm({
      title: role.title || '',
      slug: role.slug || '',
      department: role.department || '',
      location: role.location || '',
      work_type: role.work_type || '',
      employment_type: role.employment_type || '',
      experience_level: role.experience_level || '',
      summary: role.summary || '',
      description: role.description || '',
      responsibilities: Array.isArray(role.responsibilities) ? role.responsibilities : [],
      requirements: Array.isArray(role.requirements) ? role.requirements : [],
      benefits: Array.isArray(role.benefits) ? role.benefits : [],
      sort_order: role.sort_order || 0,
      is_featured: role.is_featured === true,
      is_active: role.is_active !== false,
    })
  }

  const removeCareerRole = async (roleId) => {
    if (!window.confirm('Delete this career role?')) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await systemCompanyWebsiteService.deleteCareerRole(roleId)
      setCareerRoles((prev) => prev.filter((item) => item.id !== roleId))
      setMessage('Career role deleted successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete career role.')
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
        {['settings', 'homepage', 'services', 'careers', 'analytics'].map((tab) => (
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
                  : tab === 'careers'
                    ? 'Careers'
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
          {heroSection ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Hero</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  Edit only the hero fields currently used on the public website.
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Hero Content
                    </h3>
                  </div>

                {[
                  ['badge', 'Top Badge'],
                  ['headline', 'Headline'],
                  ['headline_accent', 'Headline Accent'],
                  ['secondary_cta', 'Secondary CTA'],
                  ['form_badge', 'Form Badge'],
                  ['form_title', 'Form Title'],
                  ['form_side_title', 'Form Side Title'],
                  ['form_button_text', 'Form Button Text'],
                  ['name_label', 'Name Label'],
                  ['name_placeholder', 'Name Placeholder'],
                  ['phone_label', 'Phone Label'],
                  ['phone_placeholder', 'Phone Placeholder'],
                  ['email_label', 'Email Label'],
                  ['email_placeholder', 'Email Placeholder'],
                  ['service_label', 'Service Label'],
                  ['service_placeholder', 'Service Placeholder'],
                  ['message_label', 'Message Label'],
                  ['privacy_note', 'Privacy Note'],
                  ['success_title', 'Success Title'],
                  ['success_reset_text', 'Success Reset Button'],
                ].map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                      value={heroContent[key] || ''}
                      onChange={(e) => updateHeroField(key, e.target.value)}
                    />
                  </label>
                ))}
                </div>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Subtitle</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={3}
                    value={heroContent.subtitle || ''}
                    onChange={(e) => updateHeroField('subtitle', e.target.value)}
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Form Subtitle</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={3}
                    value={heroContent.form_subtitle || ''}
                    onChange={(e) => updateHeroField('form_subtitle', e.target.value)}
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Form Fields
                    </h3>
                  </div>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Message Placeholder</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={2}
                    value={heroContent.message_placeholder || ''}
                    onChange={(e) => updateHeroField('message_placeholder', e.target.value)}
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Success Message</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={2}
                    value={heroContent.success_message || ''}
                    onChange={(e) => updateHeroField('success_message', e.target.value)}
                  />
                </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Lists And Stats
                    </h3>
                  </div>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Benefit Points</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={(heroContent.benefit_points || []).join('\n')}
                    onChange={(e) => updateHeroList('benefit_points', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One point per line.</span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Form Panel Points</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={(heroContent.form_panel_points || []).join('\n')}
                    onChange={(e) => updateHeroList('form_panel_points', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One point per line.</span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Service Options</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={(heroContent.service_options || []).join('\n')}
                    onChange={(e) => updateHeroList('service_options', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One option per line.</span>
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Stats</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm"
                    rows={4}
                    value={(heroContent.stats || [])
                      .map((item) => `${item.value || ''} | ${item.label || ''}`)
                      .join('\n')}
                    onChange={(e) => updateHeroStats(e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">
                    Use one stat per line in this format: value | label
                  </span>
                </label>
                </div>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => saveSection(heroSection, heroContent)}
                className="mt-5 rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
              >
                Save Hero
              </button>
            </div>
          ) : null}

          {[servicesIntroSection, ctaSection].filter(Boolean).map((section) => (
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

      {activeTab === 'careers' ? (
        <WebsiteCareersPanel
          saving={saving}
          careerPage={careerPage}
          setCareerPage={setCareerPage}
          saveCareerPage={saveCareerPage}
          careerRoles={careerRoles}
          roleForm={careerRoleForm}
          setRoleForm={setCareerRoleForm}
          editingCareerRoleId={editingCareerRoleId}
          saveCareerRole={saveCareerRole}
          editCareerRole={editCareerRole}
          removeCareerRole={removeCareerRole}
          cancelCareerRoleEdit={() => {
            setEditingCareerRoleId(null)
            setCareerRoleForm(emptyCareerRole)
          }}
          careerApplications={careerApplications}
        />
      ) : null}

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
