import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../shared/context/ThemeProvider'

const emptyRole = {
  title: '',
  slug: '',
  department: '',
  location: '',
  work_type: '',
  employment_type: 'Full-time',
  experience_level: '',
  summary: '',
  description: '',
  responsibilities: [],
  requirements: [],
  benefits: [],
  sort_order: 0,
  is_featured: false,
  is_active: true,
}

const parseLineItems = (text) =>
  text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

const parseObjectLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...descriptionParts] = line.split('|')
      return {
        title: title?.trim() || '',
        description: descriptionParts.join('|').trim(),
      }
    })
    .filter((item) => item.title || item.description)

const normalizeList = (value) => (Array.isArray(value) ? value : [])

const formatDate = (value) => {
  if (!value) return 'Unknown'

  try {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const formatFileSize = (value) => {
  if (!value || Number.isNaN(Number(value))) return null
  const size = Number(value)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function SectionBlock({ title, description, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/65">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h4 className="text-base font-semibold text-[var(--content-text)]">{title}</h4>
          {description ? (
            <p className="mt-1 text-sm text-[var(--muted-text)]">{description}</p>
          ) : null}
        </div>
        <span className="mt-0.5 text-xs uppercase tracking-wide text-[var(--muted-text)]">
          {isOpen ? 'Hide' : 'Show'}
        </span>
      </button>

      {isOpen ? <div className="border-t border-[var(--border)] px-5 py-5">{children}</div> : null}
    </div>
  )
}

function FieldRenderer({ label, value, onChange, textarea = false, rows = 3 }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
      {textarea ? (
        <textarea
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          rows={rows}
          value={value || ''}
          onChange={onChange}
        />
      ) : (
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          value={value || ''}
          onChange={onChange}
        />
      )}
    </label>
  )
}

function ApplicationsPanel({ applications }) {
  if (!applications?.length) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted-text)]">
        No career applications have been submitted yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {applications.map((application) => (
        <div
          key={application.id}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-[var(--content-text)]">
                  {application.full_name}
                </h3>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs uppercase tracking-wide text-[var(--muted-text)]">
                  {application.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--muted-text)]">
                {application.role_title || 'General application'} · {formatDate(application.created_at)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              {application.cv_url ? (
                <a
                  href={application.cv_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-[var(--primary)] px-3 py-2 text-white"
                >
                  Open CV
                </a>
              ) : null}
              {application.linkedin_url ? (
                <a
                  href={application.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--content-text)]"
                >
                  LinkedIn
                </a>
              ) : null}
              {application.portfolio_url ? (
                <a
                  href={application.portfolio_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--content-text)]"
                >
                  Portfolio
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Email', application.email],
              ['Phone', application.phone],
              ['Current Role', application.current_role || '—'],
              ['Experience', application.years_experience || '—'],
              ['Location', application.location || '—'],
              ['Work Preference', application.work_preference || '—'],
              ['Availability', application.availability || '—'],
              ['Salary Expectation', application.salary_expectation || '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[var(--surface-2)] px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-[var(--muted-text)]">{label}</div>
                <div className="mt-1 text-sm text-[var(--content-text)]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {[
              ['Motivation', application.motivation],
              ['Biggest Achievement', application.biggest_achievement],
              ['Additional Notes', application.cover_letter],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[var(--surface-2)] px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-[var(--muted-text)]">{label}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--content-text)]">
                  {value || '—'}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--muted-text)]">
            <span>Source: {application.source || 'website_careers'}</span>
            <span>Origin: {application.origin || '—'}</span>
            <span>
              CV: {application.cv_original_name || 'No file'}
              {application.cv_size ? ` · ${formatFileSize(application.cv_size)}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RoleEditorModal({
  open,
  saving,
  roleForm,
  setRoleForm,
  editingCareerRoleId,
  saveCareerRole,
  cancelCareerRoleEdit,
}) {
  useEffect(() => {
    if (!open) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        cancelCareerRoleEdit()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, cancelCareerRoleEdit])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] shadow-[0_30px_80px_rgba(15,23,42,0.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.24),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.18),transparent_30%)]" />

        <div className="relative flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-text)]">Careers CMS</p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--content-text)]">
              {editingCareerRoleId ? 'Edit Career Role' : 'Add Career Role'}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-text)]">
              Build a polished role card with clear hiring details and website-ready content.
            </p>
          </div>

          <button
            type="button"
            onClick={cancelCareerRoleEdit}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-[var(--content-text)] transition hover:bg-white/15"
          >
            Close
          </button>
        </div>

        <div className="relative max-h-[calc(90vh-92px)] overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['title', 'Role Title'],
              ['slug', 'Slug'],
              ['department', 'Department'],
              ['location', 'Location'],
              ['work_type', 'Work Type'],
              ['employment_type', 'Employment Type'],
              ['experience_level', 'Experience Level'],
              ['sort_order', 'Sort Order'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1.5 block text-[var(--muted-text)]">{label}</span>
                <input
                  className="w-full rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-[var(--content-text)] outline-none transition placeholder:text-[var(--muted-text)]/70 focus:border-[var(--primary)] focus:bg-white/14"
                  value={roleForm[key] ?? ''}
                  onChange={(e) =>
                    setRoleForm((prev) => ({
                      ...prev,
                      [key]: key === 'sort_order' ? Number(e.target.value || 0) : e.target.value,
                    }))
                  }
                />
              </label>
            ))}

            {[
              ['summary', 'Summary', 3],
              ['description', 'Description', 5],
            ].map(([key, label, rows]) => (
              <label key={key} className="block text-sm md:col-span-2">
                <span className="mb-1.5 block text-[var(--muted-text)]">{label}</span>
                <textarea
                  className="w-full rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-[var(--content-text)] outline-none transition placeholder:text-[var(--muted-text)]/70 focus:border-[var(--primary)] focus:bg-white/14"
                  rows={rows}
                  value={roleForm[key] || ''}
                  onChange={(e) => setRoleForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}

            {[
              ['responsibilities', 'Responsibilities'],
              ['requirements', 'Requirements'],
              ['benefits', 'Benefits'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm md:col-span-2">
                <span className="mb-1.5 block text-[var(--muted-text)]">{label}</span>
                <textarea
                  className="w-full rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-[var(--content-text)] outline-none transition placeholder:text-[var(--muted-text)]/70 focus:border-[var(--primary)] focus:bg-white/14"
                  rows={4}
                  value={normalizeList(roleForm[key]).join('\n')}
                  onChange={(e) =>
                    setRoleForm((prev) => ({
                      ...prev,
                      [key]: parseLineItems(e.target.value),
                    }))
                  }
                />
                <span className="mt-1 block text-xs text-[var(--muted-text)]">One item per line.</span>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-[var(--content-text)]">
              <input
                type="checkbox"
                checked={roleForm.is_featured === true}
                onChange={(e) => setRoleForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
              />
              Featured role
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--content-text)]">
              <input
                type="checkbox"
                checked={roleForm.is_active !== false}
                onChange={(e) => setRoleForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Active role
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={saveCareerRole}
              className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(99,102,241,0.35)] transition hover:brightness-110 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingCareerRoleId ? 'Update Role' : 'Create Role'}
            </button>
            <button
              type="button"
              onClick={cancelCareerRoleEdit}
              className="rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm text-[var(--content-text)] transition hover:bg-white/12"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WebsiteCareersPanel({
  saving,
  careerPage,
  setCareerPage,
  saveCareerPage,
  careerRoles,
  roleForm,
  setRoleForm,
  editingCareerRoleId,
  saveCareerRole,
  editCareerRole,
  removeCareerRole,
  cancelCareerRoleEdit,
  careerApplications,
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [activeSubTab, setActiveSubTab] = useState('page')
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const content = useMemo(() => careerPage?.content || {}, [careerPage])
  const glassPanel = isDark
    ? 'border border-slate-800/90 bg-slate-900/70 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl'
    : 'border border-slate-200/70 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl'

  const updateContentField = (key, value) => {
    setCareerPage((prev) => ({
      ...prev,
      content: {
        ...(prev?.content || {}),
        [key]: value,
      },
    }))
  }

  const roleList = careerRoles || []
  const featuredRolesCount = roleList.filter((role) => role.is_featured).length

  const openCreateRoleModal = () => {
    setRoleForm({ ...emptyRole })
    setIsRoleModalOpen(true)
  }

  const openEditRoleModal = (role) => {
    editCareerRole(role)
    setIsRoleModalOpen(true)
  }

  const handleCloseRoleModal = () => {
    cancelCareerRoleEdit()
    setIsRoleModalOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl p-4 ${glassPanel}`}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Careers</h2>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            Manage page content, open jobs, and submitted applications from the company website.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['page', 'Page Content'],
            ['jobs', 'Jobs'],
            ['applications', 'Applications'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSubTab(key)}
              className={`rounded-xl px-4 py-2 text-sm ${
                activeSubTab === key
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface-2)] text-[var(--muted-text)] hover:bg-[var(--surface)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'page' ? (
        <div className={`rounded-2xl p-6 ${glassPanel}`}>
          <div className="mb-5 flex flex-col gap-2">
            <h3 className="text-lg font-semibold">Careers Page Content</h3>
            <p className="text-sm text-[var(--muted-text)]">
              Control the public careers landing page through smaller grouped sections instead of one long form.
            </p>
          </div>

          <div className="space-y-4">
            <SectionBlock
              title="Hero"
              description="Main heading, subtitle, and top-level career CTAs."
              defaultOpen
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="Top Badge"
                  value={content.badge}
                  onChange={(e) => updateContentField('badge', e.target.value)}
                />
                <FieldRenderer
                  label="Hiring Badge"
                  value={content.hiring_badge}
                  onChange={(e) => updateContentField('hiring_badge', e.target.value)}
                />
                <FieldRenderer
                  label="Hero Title"
                  value={content.title}
                  onChange={(e) => updateContentField('title', e.target.value)}
                />
                <FieldRenderer
                  label="Availability Note"
                  value={content.availability_note}
                  onChange={(e) => updateContentField('availability_note', e.target.value)}
                />
                <div className="md:col-span-2">
                  <FieldRenderer
                    label="Hero Subtitle"
                    value={content.subtitle}
                    onChange={(e) => updateContentField('subtitle', e.target.value)}
                    textarea
                  />
                </div>
                <FieldRenderer
                  label="Primary CTA"
                  value={content.primary_cta}
                  onChange={(e) => updateContentField('primary_cta', e.target.value)}
                />
                <FieldRenderer
                  label="Secondary CTA"
                  value={content.secondary_cta}
                  onChange={(e) => updateContentField('secondary_cta', e.target.value)}
                />
              </div>
            </SectionBlock>

            <SectionBlock
              title="Roles Section"
              description="Controls the open positions heading and the filters above job cards."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="Roles Label"
                  value={content.roles_title}
                  onChange={(e) => updateContentField('roles_title', e.target.value)}
                />
                <FieldRenderer
                  label="Roles Heading"
                  value={content.roles_heading}
                  onChange={(e) => updateContentField('roles_heading', e.target.value)}
                />
                <div className="md:col-span-2">
                  <FieldRenderer
                    label="Roles Subtitle"
                    value={content.roles_subtitle}
                    onChange={(e) => updateContentField('roles_subtitle', e.target.value)}
                    textarea
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">Role Filters</span>
                    <textarea
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      rows={4}
                      value={normalizeList(content.role_filters).join('\n')}
                      onChange={(e) => updateContentField('role_filters', parseLineItems(e.target.value))}
                    />
                    <span className="mt-1 block text-xs text-[var(--muted-text)]">One filter per line.</span>
                  </label>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock
              title="Sidebar"
              description="Content shown in the right-side highlight card."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="Sidebar Badge"
                  value={content.sidebar_badge}
                  onChange={(e) => updateContentField('sidebar_badge', e.target.value)}
                />
                <div className="md:col-span-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">Sidebar Cards</span>
                    <textarea
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      rows={5}
                      value={normalizeList(content.sidebar_cards)
                        .map((item) => `${item.title || ''} | ${item.description || ''}`)
                        .join('\n')}
                      onChange={(e) => updateContentField('sidebar_cards', parseObjectLines(e.target.value))}
                    />
                    <span className="mt-1 block text-xs text-[var(--muted-text)]">
                      Use one item per line in this format: title | description
                    </span>
                  </label>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock
              title="Highlights"
              description="The section that explains why someone should join."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="Highlights Label"
                  value={content.highlights_title}
                  onChange={(e) => updateContentField('highlights_title', e.target.value)}
                />
                <FieldRenderer
                  label="Highlights Heading"
                  value={content.highlights_heading}
                  onChange={(e) => updateContentField('highlights_heading', e.target.value)}
                />
                <div className="md:col-span-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">Highlights</span>
                    <textarea
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      rows={5}
                      value={normalizeList(content.highlights)
                        .map((item) => `${item.title || ''} | ${item.description || ''}`)
                        .join('\n')}
                      onChange={(e) => updateContentField('highlights', parseObjectLines(e.target.value))}
                    />
                    <span className="mt-1 block text-xs text-[var(--muted-text)]">
                      Use one item per line in this format: title | description
                    </span>
                  </label>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock
              title="Values"
              description="How the team works together and the culture messaging."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="Values Label"
                  value={content.values_title}
                  onChange={(e) => updateContentField('values_title', e.target.value)}
                />
                <FieldRenderer
                  label="Values Heading"
                  value={content.values_heading}
                  onChange={(e) => updateContentField('values_heading', e.target.value)}
                />
                <div className="md:col-span-2">
                  <FieldRenderer
                    label="Values Subtitle"
                    value={content.values_subtitle}
                    onChange={(e) => updateContentField('values_subtitle', e.target.value)}
                    textarea
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">Values</span>
                    <textarea
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      rows={5}
                      value={normalizeList(content.values)
                        .map((item) => `${item.title || ''} | ${item.description || ''}`)
                        .join('\n')}
                      onChange={(e) => updateContentField('values', parseObjectLines(e.target.value))}
                    />
                    <span className="mt-1 block text-xs text-[var(--muted-text)]">
                      Use one item per line in this format: title | description
                    </span>
                  </label>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock
              title="Benefits"
              description="Benefits and work environment content."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="Benefits Label"
                  value={content.benefits_title}
                  onChange={(e) => updateContentField('benefits_title', e.target.value)}
                />
                <FieldRenderer
                  label="Benefits Heading"
                  value={content.benefits_heading}
                  onChange={(e) => updateContentField('benefits_heading', e.target.value)}
                />
                <div className="md:col-span-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">Benefits</span>
                    <textarea
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      rows={5}
                      value={normalizeList(content.benefits)
                        .map((item) => `${item.title || ''} | ${item.description || ''}`)
                        .join('\n')}
                      onChange={(e) => updateContentField('benefits', parseObjectLines(e.target.value))}
                    />
                    <span className="mt-1 block text-xs text-[var(--muted-text)]">
                      Use one item per line in this format: title | description
                    </span>
                  </label>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock
              title="General Application"
              description="Controls the call-to-action and the dedicated general application form copy."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldRenderer
                  label="General Application Badge"
                  value={content.general_application_badge}
                  onChange={(e) => updateContentField('general_application_badge', e.target.value)}
                />
                <FieldRenderer
                  label="General Application Button"
                  value={content.general_application_button_text}
                  onChange={(e) => updateContentField('general_application_button_text', e.target.value)}
                />
                <FieldRenderer
                  label="General Application Heading"
                  value={content.general_application_heading}
                  onChange={(e) => updateContentField('general_application_heading', e.target.value)}
                />
                <FieldRenderer
                  label="General Form Headline"
                  value={content.general_form_headline}
                  onChange={(e) => updateContentField('general_form_headline', e.target.value)}
                />
                <div className="md:col-span-2">
                  <FieldRenderer
                    label="General Application Subtitle"
                    value={content.general_application_subtitle}
                    onChange={(e) => updateContentField('general_application_subtitle', e.target.value)}
                    textarea
                  />
                </div>
                <div className="md:col-span-2">
                  <FieldRenderer
                    label="General Form Subtitle"
                    value={content.general_form_subtitle}
                    onChange={(e) => updateContentField('general_form_subtitle', e.target.value)}
                    textarea
                  />
                </div>
              </div>
            </SectionBlock>

            <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/65 px-4 py-4 text-sm">
              <input
                type="checkbox"
                checked={careerPage?.is_active !== false}
                onChange={(e) => setCareerPage((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Careers page is active
            </label>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={saveCareerPage}
            className="mt-5 rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Careers Page'}
          </button>
        </div>
      ) : null}

      {activeSubTab === 'jobs' ? (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.88))] p-6 text-white shadow-[0_25px_80px_rgba(15,23,42,0.2)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.28),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.18),transparent_28%)]" />
            <div className="relative flex flex-wrap gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.32em] text-white/55">Hiring Pipeline</p>
                <h3 className="mt-2 text-2xl font-semibold">Career Roles</h3>
                <p className="mt-2 max-w-2xl text-sm text-white/70">
                  Add, refine, and spotlight open roles with a cleaner publishing experience and a more premium jobs overview.
                </p>
              </div>

              <div className="flex shrink-0 flex-nowrap items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-white/55">Total Roles</div>
                  <div className="mt-1 text-xl font-semibold">{roleList.length}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-white/55">Featured</div>
                  <div className="mt-1 text-xl font-semibold">{featuredRolesCount}</div>
                </div>
                <button
                  type="button"
                  onClick={openCreateRoleModal}
                  className="rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:scale-[1.01]"
                >
                  Add Career
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {roleList.map((role) => (
              <div
                key={role.id}
                className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-xl"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_28%)]" />

                <div className="relative flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/12 bg-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[var(--muted-text)]">
                          {role.department || 'General'}
                        </span>
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-600">
                          {role.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {role.is_featured ? (
                          <span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-indigo-600">
                            Featured
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-4 text-xl font-semibold text-[var(--content-text)]">{role.title}</h3>
                      <p className="mt-2 text-sm text-[var(--muted-text)]">
                        {[role.location, role.work_type, role.employment_type].filter(Boolean).join(' · ') || 'No hiring details yet'}
                      </p>
                    </div>

                    <div className="text-right text-xs text-[var(--muted-text)]">
                      <div>#{role.sort_order ?? 0}</div>
                      <div className="mt-1 uppercase tracking-wide">{role.slug}</div>
                    </div>
                  </div>

                  <p className="min-h-[72px] text-sm leading-6 text-[var(--muted-text)]">
                    {role.summary || 'Add a sharp summary so visitors instantly understand the opportunity.'}
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ['Responsibilities', normalizeList(role.responsibilities).length],
                      ['Requirements', normalizeList(role.requirements).length],
                      ['Benefits', normalizeList(role.benefits).length],
                    ].map(([label, count]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted-text)]">{label}</div>
                        <div className="mt-2 text-lg font-semibold text-[var(--content-text)]">{count}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <div className="text-xs text-[var(--muted-text)]">
                      {role.experience_level || 'Experience not specified'}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditRoleModal(role)}
                        className="rounded-full border border-white/12 bg-white/12 px-4 py-2 text-sm text-[var(--content-text)] transition hover:bg-white/16"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCareerRole(role.id)}
                        className="rounded-full border border-red-400/20 bg-red-500/8 px-4 py-2 text-sm text-red-500 transition hover:bg-red-500/12"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {roleList.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-text)] xl:col-span-2">
                No career roles yet. Click Add Career to create the first glass card for the careers page.
              </div>
            ) : null}
          </div>

          <RoleEditorModal
            open={isRoleModalOpen}
            saving={saving}
            roleForm={roleForm}
            setRoleForm={setRoleForm}
            editingCareerRoleId={editingCareerRoleId}
            saveCareerRole={saveCareerRole}
            cancelCareerRoleEdit={handleCloseRoleModal}
          />
        </div>
      ) : null}

      {activeSubTab === 'applications' ? <ApplicationsPanel applications={careerApplications} /> : null}
    </div>
  )
}

export { emptyRole }
