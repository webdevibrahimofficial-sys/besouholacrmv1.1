import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle2, Copy, Eye, FilePlus2, RefreshCcw, Save, Trash2, Upload, X } from 'lucide-react'
import { api } from '@utils/api'
import { createContractTemplate, deleteContractTemplate, getContractTemplates, updateContractTemplate } from '@services/contractTemplateService'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'

const emptyDraft = () => ({
  id: null,
  name: '',
  project_id: '',
  status: 'Active',
  content_type: 'html', // html|pdf
  body: '',
  pdf_url: '',
  pdf_original_name: '',
})

const stripWordTipsFromHtml = (html) => {
  const raw = String(html || '')
  if (!raw) return raw

  const shouldStrip = /Word\s*:|نصائح\s*عند\s*نقل\s*المحتوى/i.test(raw)
  if (!shouldStrip) return raw

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    const body = doc?.body
    if (!body) return raw

    const matchesTips = (text) => {
      const t = String(text || '')
      if (!t.trim()) return false
      return (
        /Word\s*:/i.test(t) ||
        /نصائح\s*عند\s*نقل\s*المحتوى/i.test(t) ||
        t.includes('قم بنسخ') ||
        t.includes('ولصقه') ||
        t.includes('تأكد من كتابة البيانات') ||
        t.includes('بين القوسين') ||
        t.includes('يفضل مراجعة العقد') ||
        t.includes('محام') ||
        t.includes('لضمان التوافق') ||
        t.includes('القوانين المحلية')
      )
    }

    const all = Array.from(body.querySelectorAll('*'))
    for (const el of all) {
      const text = el.textContent || ''
      if (!matchesTips(text)) continue

      const prev = el.previousElementSibling
      if (prev && prev.tagName === 'HR') {
        try {
          prev.remove()
        } catch {}
      }

      try {
        el.remove()
      } catch {}
    }

    return body.innerHTML
  } catch {
    return raw
  }
}

export default function ContractsSettings() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.dir(i18n.language || 'en') === 'rtl'

  const shouldIgnoreNextEditorUpdateRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [projects, setProjects] = useState([])
  const [tenantInfo, setTenantInfo] = useState({
    id: '',
    name: '',
    logoUrl: '',
    phone: '',
    email: '',
    taxId: '',
  })

  const [draft, setDraft] = useState(emptyDraft())
  const [activeId, setActiveId] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfObjectUrl, setPdfObjectUrl] = useState('')

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [serverPreviewHtml, setServerPreviewHtml] = useState('')
  const [serverPreviewLoading, setServerPreviewLoading] = useState(false)
  const [pastePlainText, setPastePlainText] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [editorView, setEditorView] = useState('edit') // edit|preview
  const [templatesQuery, setTemplatesQuery] = useState('')

  const activeTemplate = useMemo(() => templates.find(tpl => tpl.id === activeId) || null, [templates, activeId])
  const activeProjectName = useMemo(() => {
    const id = Number(draft.project_id || 0)
    if (!id) return t('All')
    return projects.find(p => Number(p.id) === id)?.name || t('All')
  }, [draft.project_id, projects, t])

  const loadAll = async () => {
    setLoading(true)
    const [tplsRes, projRes, companyRes, smtpRes] = await Promise.allSettled([
      getContractTemplates(),
      api.get('/api/projects?all=1'),
      api.get('/api/company-info'),
      api.get('/api/smtp-settings'),
    ])

    if (tplsRes.status === 'fulfilled') {
      setTemplates(Array.isArray(tplsRes.value) ? tplsRes.value : [])
    } else {
      setTemplates([])
    }

    if (companyRes.status === 'fulfilled') {
      const tenant = companyRes.value?.data?.tenant || companyRes.value?.data?.data?.tenant || {}
      const profile = tenant?.profile || {}
      setTenantInfo((prev) => ({
        ...prev,
        id: tenant?.id || '',
        name: tenant?.name || '',
        logoUrl: profile?.logo_url || '',
        phone: profile?.phone || '',
        taxId: profile?.tax_id || '',
      }))
    } else {
      setTenantInfo((prev) => ({ ...prev, id: '', name: '', logoUrl: '', phone: '', taxId: '' }))
    }

    if (smtpRes.status === 'fulfilled') {
      const fromEmail = smtpRes.value?.data?.from_email || ''
      setTenantInfo((prev) => ({ ...prev, email: fromEmail || '' }))
    } else {
      setTenantInfo((prev) => ({ ...prev, email: '' }))
    }

    // Projects: ensure tenant-scoped list is populated (some APIs require tenant_id explicitly)
    const resolvedTenantId = companyRes.status === 'fulfilled'
      ? (companyRes.value?.data?.tenant?.id || companyRes.value?.data?.data?.tenant?.id || null)
      : null

    const normalizeProjects = (payload) => {
      const list =
        Array.isArray(payload) ? payload
          : Array.isArray(payload?.data) ? payload.data
            : Array.isArray(payload?.data?.data) ? payload.data.data
              : []
      const tenantId = Number(resolvedTenantId || 0)
      if (!tenantId) return list
      // If projects include tenant_id, filter by it. Otherwise keep as-is.
      const hasTenantKey = list.some(p => p && Object.prototype.hasOwnProperty.call(p, 'tenant_id'))
      return hasTenantKey ? list.filter(p => Number(p?.tenant_id || 0) === tenantId) : list
    }

    let nextProjects = []
    if (projRes.status === 'fulfilled') {
      nextProjects = normalizeProjects(projRes.value?.data)
    }

    // Prefer explicit tenant_id fetch when tenant is known (ensures tenant-scoped dropdown).
    if (resolvedTenantId) {
      try {
        const res = await api.get('/api/projects', { params: { all: 1, tenant_id: resolvedTenantId } })
        const tenantProjects = normalizeProjects(res?.data)
        if (tenantProjects.length) nextProjects = tenantProjects
      } catch {
      }
    }

    if (nextProjects.length === 0) {
      try {
        const res = await api.get('/api/projects', { params: { all: 1, tenant_id: resolvedTenantId || undefined } })
        nextProjects = normalizeProjects(res?.data)
      } catch {
      }
    }

    setProjects(Array.isArray(nextProjects) ? nextProjects : [])

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (!activeTemplate) return
    const nextDraft = {
      id: activeTemplate.id,
      name: activeTemplate.name || '',
      project_id: activeTemplate.project_id ?? '',
      status: activeTemplate.status || 'Active',
      content_type: activeTemplate.content_type || (activeTemplate.pdf_url ? 'pdf' : 'html'),
      body: activeTemplate.body || '',
      pdf_url: activeTemplate.pdf_url || '',
      pdf_original_name: activeTemplate.pdf_original_name || '',
    }
    setDraft(nextDraft)
    setPdfFile(null)
    setDirty(false)
    setLastSavedAt(null)
    setEditorView('edit')

    if (nextDraft.content_type === 'html') {
      safeSetEditorContent(nextDraft.body || '')
    }
  }, [activeTemplate, editor])

  useEffect(() => {
    if (!pdfFile) {
      if (pdfObjectUrl) {
        try { URL.revokeObjectURL(pdfObjectUrl) } catch {}
      }
      setPdfObjectUrl('')
      return
    }

    const nextUrl = URL.createObjectURL(pdfFile)
    setPdfObjectUrl(nextUrl)
    return () => {
      try { URL.revokeObjectURL(nextUrl) } catch {}
    }
  }, [pdfFile])

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    // Do not bind editor content to React state here; it causes re-initialization/cursor jumps on each keystroke.
    // We sync content explicitly when switching templates or starting a new template.
    content: '',
    editorProps: {
      attributes: {
        class:
          'tiptap-editor w-full min-h-[520px] p-4 bg-white text-black outline-none',
        dir: isRTL ? 'rtl' : 'ltr',
      },
    },
    onUpdate: ({ editor }) => {
      if (shouldIgnoreNextEditorUpdateRef.current) return
      setDirty(true)
      try {
        const html = editor.getHTML()
        setDraft((prev) => ({ ...prev, body: html }))
      } catch {
      }
    },
  })

  // Note: do not touch `editor.view.dom` here — the view may not be mounted yet and TipTap will throw.
  // Direction is controlled via `editorProps.attributes.dir` and the wrapper around `<EditorContent />`.

  const safeSetEditorContent = (html) => {
    const run = (attempt = 0) => {
      if (!editor || editor.isDestroyed) return

      // Accessing `editor.view.dom` (directly or indirectly) can throw before mount.
      // We treat failures as "not mounted yet" and retry a bit.
      let isMounted = false
      try {
        // `options.element` is set by <EditorContent /> once the view is mounted.
        isMounted = Boolean(editor?.options?.element)
      } catch {
        isMounted = false
      }

      if (isMounted) {
        try {
          shouldIgnoreNextEditorUpdateRef.current = true
          editor.commands.setContent(html, false)
        } catch {
        } finally {
          setTimeout(() => {
            shouldIgnoreNextEditorUpdateRef.current = false
          }, 0)
        }
        return
      }

      if (attempt >= 10) return
      setTimeout(() => run(attempt + 1), 50)
    }

    run(0)
  }

  const insertPlaceholder = (token) => {
    if (!token) return
    if (!editor) return
    editor.chain().focus().insertContent(token).run()
  }

  const onBodyPaste = (e) => {
    if (!pastePlainText) return
    if (!editor) return
    try {
      const text = e.clipboardData?.getData?.('text/plain') ?? ''
      if (!text) return
      e.preventDefault()
      editor.chain().focus().insertContent(text).run()
    } catch {
    }
  }

  const startNewTemplate = () => {
    setActiveId(null)
    const d = emptyDraft()
    setDraft(d)
    setPdfFile(null)
    setDirty(false)
    setLastSavedAt(null)
    setEditorView('edit')
    safeSetEditorContent('')
  }

  const save = async () => {
    const name = String(draft.name || '').trim()
    if (!name) return

    const projectId = draft.project_id ? Number(draft.project_id) : null
    const status = draft.status || 'Active'
    const contentType = draft.content_type || 'html'

    setSaving(true)
    try {
      let res
      if (contentType === 'pdf') {
        if (!pdfFile && !draft.pdf_url) {
          return
        }
        const fd = new FormData()
        fd.append('name', name)
        if (projectId) fd.append('project_id', String(projectId))
        fd.append('status', status)
        fd.append('content_type', 'pdf')
        if (pdfFile) fd.append('pdf', pdfFile)
        res = draft.id ? await updateContractTemplate(draft.id, fd) : await createContractTemplate(fd)
      } else {
        const rawHtml = editor ? editor.getHTML() : (draft.body || '')
        const cleanedHtml = stripWordTipsFromHtml(rawHtml)
        const payload = {
          name,
          project_id: projectId,
          status,
          content_type: 'html',
          body: cleanedHtml,
          pdf_path: null,
        }
        res = draft.id ? await updateContractTemplate(draft.id, payload) : await createContractTemplate(payload)
      }

      await loadAll()
      setActiveId(res?.id ?? null)
      setPdfFile(null)
      setDirty(false)
      setLastSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tpl) => {
    if (!tpl?.id) return
    const ok = window.confirm(t('Delete this template?'))
    if (!ok) return

    await deleteContractTemplate(tpl.id)
    await loadAll()
    if (activeId === tpl.id) startNewTemplate()
  }

  const previewHtml = () => {
    if (editor) return stripWordTipsFromHtml(editor.getHTML() || '')
    return stripWordTipsFromHtml(draft.body || '')
  }

  const fetchServerPreview = async () => {
    if (draft.content_type === 'pdf') return
    setServerPreviewLoading(true)
    try {
      const body = previewHtml()
      const res = await api.post('/api/contract-templates/preview', {
        template_id: activeId || null,
        project_id: draft.project_id || null,
        body,
        rtl: i18n.language === 'ar',
      }, { responseType: 'text' })
      setServerPreviewHtml(typeof res?.data === 'string' ? res.data : '')
    } catch {
      setServerPreviewHtml('')
    } finally {
      setServerPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (!previewOpen) return
    if (draft.content_type === 'pdf') return
    fetchServerPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen])

  const pdfPreviewUrl = pdfObjectUrl || draft.pdf_url || ''

  useEffect(() => {
    if (editorView !== 'preview') return
    if (draft.content_type === 'pdf') return
    const id = setTimeout(() => {
      fetchServerPreview()
    }, 600)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorView, draft.body, draft.project_id, activeId])

  const filteredTemplates = useMemo(() => {
    const q = String(templatesQuery || '').trim().toLowerCase()
    if (!q) return templates
    return templates.filter((tpl) => {
      const name = String(tpl?.name || '').toLowerCase()
      const project = String(tpl?.project?.name || '').toLowerCase()
      const status = String(tpl?.status || '').toLowerCase()
      return name.includes(q) || project.includes(q) || status.includes(q)
    })
  }, [templates, templatesQuery])

  const isNameValid = Boolean(String(draft.name || '').trim())
  const isPdfValid = draft.content_type !== 'pdf' ? true : Boolean(pdfFile || draft.pdf_url)
  const canSave = !saving && dirty && isNameValid && isPdfValid

  const templateTypeLabel = draft.content_type === 'pdf' ? t('PDF Template') : t('HTML Template')
  const saveStateLabel = saving
    ? t('Saving...')
    : dirty
      ? t('Unsaved changes')
      : lastSavedAt
        ? t('Saved')
        : ''

  const Header = () => (
    <div className="flex items-center justify-between gap-4 px-10 py-6 border-b border-gray-200">
      <div className="flex items-center gap-3">
        {tenantInfo.logoUrl ? (
          <img
            src={tenantInfo.logoUrl}
            alt={tenantInfo.name || 'Tenant Logo'}
            className="h-10 w-auto object-contain"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-gray-100 border border-gray-200" />
        )}
        <div className="font-semibold text-gray-900">{tenantInfo.name || t('Tenant')}</div>
      </div>
      <div className="text-right text-xs text-gray-700">
        <div><span className="text-gray-500">Phone:</span> {tenantInfo.phone || '-'}</div>
        <div><span className="text-gray-500">Email:</span> {tenantInfo.email || '-'}</div>
        <div><span className="text-gray-500">Tax No.:</span> {tenantInfo.taxId || '-'}</div>
      </div>
    </div>
  )

  const Footer = () => (
    <div className="px-10 py-5 border-t border-gray-200 text-xs text-gray-700">
      <div className="mt-5 grid grid-cols-2 gap-6 text-[11px]">
        <div>
          <div className="font-semibold mb-2">Seller</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Signature</span>
            <span className="flex-1 border-b border-gray-300 h-4" />
          </div>
        </div>
        <div>
          <div className="font-semibold mb-2">Buyer</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Signature</span>
            <span className="flex-1 border-b border-gray-300 h-4" />
          </div>
        </div>
        <div>
          <div className="font-semibold mb-2">Witness 1</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Signature</span>
            <span className="flex-1 border-b border-gray-300 h-4" />
          </div>
        </div>
        <div>
          <div className="font-semibold mb-2">Witness 2</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Signature</span>
            <span className="flex-1 border-b border-gray-300 h-4" />
          </div>
        </div>
      </div>
    </div>
  )

  const ContractPage = ({ children }) => (
    <div className="w-full flex justify-center">
      <div
        className="w-full max-w-[900px] rounded-2xl border border-[var(--panel-border)] overflow-hidden bg-white text-black shadow"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <Header />
        <div className="px-10 py-8">{children}</div>
        <Footer />
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
        <h2 className="text-2xl font-bold">{t('Contracts Settings')}</h2>
        <span className="ml-auto text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">{t('Admin Only')}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Editor */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
              onClick={save}
              disabled={!canSave}
              title={t('Save')}
            >
              <Save className="w-4 h-4" />
              {t('Save')}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 inline-flex items-center gap-2"
              onClick={() => setPreviewOpen(true)}
              title={t('Preview')}
            >
              <Eye className="w-4 h-4" />
              {t('Preview')}
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-[var(--content-text)] opacity-80">
              {saveStateLabel ? (
                <div className="inline-flex items-center gap-1.5">
                  {dirty ? <AlertCircle className="w-4 h-4 text-amber-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <span>{saveStateLabel}</span>
                </div>
              ) : null}
              <span className="px-2 py-1 rounded-lg border border-[var(--panel-border)] bg-white/5">{templateTypeLabel}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--content-text)]">{t('Template Info')}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[var(--content-text)] opacity-80">
                  {t('Template Name')} <span className="text-red-400">*</span>
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => {
                    setDraft(prev => ({ ...prev, name: e.target.value }))
                    setDirty(true)
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/70 text-white"
                  placeholder={t('e.g. Contract (1)')}
                />
                {!isNameValid && <div className="mt-1 text-xs text-red-400">{t('Template name is required')}</div>}
              </div>
              <div>
                <label className="text-sm text-[var(--content-text)] opacity-80">{t('Project')}</label>
                <select
                  value={draft.project_id}
                  onChange={(e) => {
                    setDraft(prev => ({ ...prev, project_id: e.target.value }))
                    setDirty(true)
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/70 text-white"
                >
                  <option value="">{t('All Projects')}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--content-text)]">{t('Content Type')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl border border-[var(--panel-border)] overflow-hidden" role="tablist" aria-label="content-type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={draft.content_type === 'html'}
                  className={`px-4 py-2 text-sm ${draft.content_type === 'html' ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'}`}
                  onClick={() => {
                    setDraft(prev => ({ ...prev, content_type: 'html', pdf_url: '', pdf_original_name: '' }))
                    setPdfFile(null)
                    safeSetEditorContent(draft.body || '')
                    setDirty(true)
                    setEditorView('edit')
                  }}
                >
                  {t('HTML Template')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={draft.content_type === 'pdf'}
                  className={`px-4 py-2 text-sm ${draft.content_type === 'pdf' ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'}`}
                  onClick={() => {
                    setDraft(prev => ({ ...prev, content_type: 'pdf' }))
                    safeSetEditorContent('')
                    setDirty(true)
                    setEditorView('edit')
                  }}
                >
                  {t('PDF Template')}
                </button>
              </div>

              <label className="ml-auto inline-flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--content-text)] opacity-80">
                <input type="checkbox" checked={pastePlainText} onChange={(e) => setPastePlainText(e.target.checked)} />
                {t('Paste as plain text')}
              </label>
            </div>
          </div>

           {draft.content_type !== 'pdf' && (
             <div className="flex flex-wrap items-center gap-2 border border-[var(--panel-border)] rounded-xl p-2">
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleBold().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 font-bold ${editor?.isActive('bold') ? 'bg-white/10' : ''}`}
                 disabled={!editor?.can().chain().focus().toggleBold().run()}
                 title={t('Bold')}
               >
                 B
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleItalic().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 italic ${editor?.isActive('italic') ? 'bg-white/10' : ''}`}
                 disabled={!editor?.can().chain().focus().toggleItalic().run()}
                 title={t('Italic')}
               >
                 I
               </button>
               <button
                 type="button"
                 onClick={() => {
                   if (!editor) return
                   if (typeof editor?.commands?.toggleUnderline !== 'function') return
                   editor.chain().focus().toggleUnderline().run()
                 }}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 underline ${editor?.isActive('underline') ? 'bg-white/10' : ''}`}
                 title={t('Underline')}
               >
                 U
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleStrike().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 line-through ${editor?.isActive('strike') ? 'bg-white/10' : ''}`}
                 title={t('Strike')}
               >
                 S
               </button>
               <div className="basis-full h-0" />

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />

               <button
                 type="button"
                 onClick={() => editor?.chain().focus().setParagraph().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('paragraph') ? 'bg-white/10' : ''}`}
               >
                 {t('P')}
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('heading', { level: 1 }) ? 'bg-white/10' : ''}`}
               >
                 H1
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('heading', { level: 2 }) ? 'bg-white/10' : ''}`}
               >
                 H2
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('heading', { level: 3 }) ? 'bg-white/10' : ''}`}
               >
                 H3
               </button>

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleBulletList().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 ${editor?.isActive('bulletList') ? 'bg-white/10' : ''}`}
                 title={t('Bullet List')}
               >
                 {t('• List')}
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 ${editor?.isActive('orderedList') ? 'bg-white/10' : ''}`}
                 title={t('Ordered List')}
               >
                 {t('1. List')}
               </button>
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                 className={`px-2 py-1 rounded hover:bg-gray-100/10 text-xs ${editor?.isActive('blockquote') ? 'bg-white/10' : ''}`}
                 title={t('Quote')}
               >
                 {t('Quote')}
               </button>

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('left').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">L</button>
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('center').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">C</button>
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('right').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">R</button>
               <button type="button" onClick={() => editor?.chain().focus().setTextAlign('justify').run()} className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs">J</button>

               <div className="basis-full h-0" />

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <button
                 type="button"
                 onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                 className="px-2 py-1 rounded hover:bg-gray-100/10 text-xs"
                 title={t('Insert Table')}
               >
                 {t('Table')}
               </button>

               <span className="w-px h-5 bg-[var(--panel-border)] mx-1" />
               <label className="text-xs opacity-80 flex items-center gap-2 px-2">
                 {t('Color')}
                 <input
                   type="color"
                   className="h-6 w-6 bg-transparent border-0 p-0"
                   onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                   title={t('Text Color')}
                 />
               </label>

                <select
                  className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-sm min-w-[220px]"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (v) insertPlaceholder(v)
                    e.target.value = ''
                  }}
                  title={t('Insert Field')}
                >
                  <option value="">{t('+ Insert Field')}</option>
                  <option value="{{contract_number}}">{t('Contract No.')}</option>
                  <option value="{{contract_date}}">{t('Contract Date')}</option>
                  <option value="{{customer_name}}">{t('Customer Name')}</option>
                  <option value="{{customer_phone}}">{t('Customer Phone')}</option>
                  <option value="{{unit_code}}">{t('Unit Code')}</option>
                 <option value="{{project_name}}">{t('Project')}</option>
                 <option value="{{total_price}}">{t('Total Price')}</option>
                 <option value="{{payment_plan_table}}">{t('Payment Plan Table')}</option>
                 <option value="{{installments_table}}">{t('Installments Table')}</option>
               </select>

               <button
                 type="button"
                 onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
                 className="ml-auto px-2 py-1 rounded hover:bg-gray-100/10 text-xs opacity-80"
               >
                 {t('Clear format')}
               </button>
             </div>
           )}

          {draft.content_type === 'pdf' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--panel-border)] cursor-pointer hover:bg-white/5">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{t('Browse PDF')}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setPdfFile(file)
                      setDraft(prev => ({ ...prev, content_type: 'pdf', pdf_original_name: file?.name || prev.pdf_original_name }))
                      setDirty(true)
                      setEditorView('edit')
                    }}
                  />
                </label>
                {(pdfFile || draft.pdf_url) && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-[var(--panel-border)] hover:bg-white/5 inline-flex items-center gap-2"
                      onClick={() => {
                        setPdfFile(null)
                        setDraft(prev => ({ ...prev, content_type: 'html', pdf_url: '', pdf_original_name: '' }))
                        safeSetEditorContent(draft.body || '')
                        setDirty(true)
                        setEditorView('edit')
                      }}
                      title={t('Remove PDF')}
                    >
                    <X className="w-4 h-4" />
                    {t('Remove PDF')}
                  </button>
                )}
                <div className="text-sm opacity-70">
                  {pdfFile?.name || draft.pdf_original_name || (draft.pdf_url ? t('PDF attached') : t('No PDF selected'))}
                </div>
              </div>

              {!isPdfValid && (
                <div className="text-xs text-red-400">{t('Please upload a PDF file')}</div>
              )}

              <ContractPage>
                {pdfPreviewUrl ? (
                  <div className="w-full">
                    <iframe
                      title="contract-pdf"
                      src={pdfPreviewUrl}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">{t('Upload a PDF to use as the contract template.')}</div>
                )}
              </ContractPage>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border border-[var(--panel-border)] overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-sm ${editorView === 'edit' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    onClick={() => setEditorView('edit')}
                  >
                    {t('Edit')}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-sm ${editorView === 'preview' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    onClick={() => setEditorView('preview')}
                  >
                    {t('Live Preview')}
                  </button>
                </div>

                {editorView === 'preview' && (
                  <button
                    type="button"
                    className="ml-auto px-3 py-1.5 rounded-lg border border-[var(--panel-border)] hover:bg-white/5 inline-flex items-center gap-2 text-sm disabled:opacity-50"
                    onClick={fetchServerPreview}
                    disabled={serverPreviewLoading}
                    title={t('Refresh preview')}
                  >
                    <RefreshCcw className="w-4 h-4" />
                    {t('Refresh')}
                  </button>
                )}
              </div>

              <ContractPage>
                {editorView === 'preview' ? (
                  serverPreviewLoading ? (
                    <div className="text-sm opacity-70">{t('Loading...')}</div>
                  ) : (
                    <iframe
                      title="contract-template-live-preview"
                      srcDoc={serverPreviewHtml || `<!doctype html><html><body>${previewHtml()}</body></html>`}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  )
                ) : (
                  <div onPaste={onBodyPaste} dir={isRTL ? 'rtl' : 'ltr'}>
                    <EditorContent editor={editor} />
                  </div>
                )}
              </ContractPage>
            </div>
          )}

          <div className="rounded-xl border border-[var(--panel-border)] bg-blue-500/10 p-3 text-xs text-[var(--content-text)]">
            <div className="font-semibold mb-1">{t('Header & Footer')}</div>
            <div className="opacity-80">{t('Header & footer are automatically added from company settings (logo, tenant name, phone, email, tax).')}</div>
            <div className="opacity-80 mt-1">{t('Tip: copy from Word and paste here, or upload a PDF to keep exact formatting.')}</div>
          </div>
        </div>

        {/* Templates list */}
        <div className="glass-panel rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{t('Contracts Templates')}</div>
            <button
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-2"
              onClick={startNewTemplate}
              title={t('Add template')}
            >
              <FilePlus2 className="w-4 h-4" />
              {t('Add template')}
            </button>
          </div>

          <input
            value={templatesQuery}
            onChange={(e) => setTemplatesQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/40 text-white"
            placeholder={t('Search templates...')}
          />

          <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100/10">
                <tr>
                  <th className="text-left px-3 py-2">{t('Template Name')}</th>
                  <th className="text-left px-3 py-2">{t('Project')}</th>
                  <th className="text-left px-3 py-2">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-3 opacity-70" colSpan={3}>{t('Loading...')}</td></tr>
                ) : templates.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 opacity-80" colSpan={3}>
                      <div className="text-sm font-medium">{t('No templates yet')}</div>
                      <div className="text-xs opacity-70 mt-1">{t('Create your first contract template to start printing contracts.')}</div>
                      <button
                        className="mt-3 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-2"
                        onClick={startNewTemplate}
                      >
                        <FilePlus2 className="w-4 h-4" />
                        {t('Create Template')}
                      </button>
                    </td>
                  </tr>
                ) : filteredTemplates.length === 0 ? (
                  <tr><td className="px-3 py-3 opacity-70" colSpan={3}>{t('No matching templates')}</td></tr>
                ) : (
                  filteredTemplates.map(tpl => {
                    const isActive = tpl.id === activeId
                    const isGlobal = !tpl.project_id && !tpl.project
                    const typeLabel = (tpl.content_type || (tpl.pdf_url ? 'pdf' : 'html')).toLowerCase() === 'pdf' ? t('PDF') : t('HTML')
                    return (
                      <tr key={tpl.id} className={`border-t border-[var(--panel-border)] ${isActive ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                        <td className="px-3 py-2">
                          <button className="text-left w-full" onClick={() => setActiveId(tpl.id)}>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                              <span className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-white/5">{tpl.status || 'Active'}</span>
                              <span className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-white/5">{typeLabel}</span>
                              <span className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-white/5">{isGlobal ? t('Global') : t('Project')}</span>
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-2">{tpl.project?.name || t('All')}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button className="p-2 rounded hover:bg-white/10" onClick={() => { setActiveId(tpl.id); setPreviewOpen(true) }} title={t('Preview')}>
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              className="p-2 rounded hover:bg-white/10 disabled:opacity-40"
                              disabled={(tpl.content_type || (tpl.pdf_url ? 'pdf' : 'html')) === 'pdf'}
                              onClick={async () => {
                                // Duplicate HTML templates only (PDF needs a binary re-upload)
                                if ((tpl.content_type || (tpl.pdf_url ? 'pdf' : 'html')) === 'pdf') return
                                const payload = {
                                  name: `${tpl.name || t('Template')} ${t('(Copy)')}`,
                                  project_id: tpl.project_id ?? null,
                                  status: tpl.status || 'Active',
                                  content_type: 'html',
                                  body: tpl.body || '',
                                  pdf_path: null,
                                }
                                const created = await createContractTemplate(payload)
                                await loadAll()
                                setActiveId(created?.id ?? null)
                              }}
                              title={t('Duplicate')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button className="p-2 rounded hover:bg-white/10 text-red-400" onClick={() => remove(tpl)} title={t('Delete')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4"
          onMouseDown={() => { setPreviewOpen(false); setServerPreviewHtml('') }}
        >
          <div className="w-full max-w-4xl rounded-2xl card border border-[var(--panel-border)] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--panel-border)] flex items-center justify-between">
              <div className="font-semibold">{t('Preview')}</div>
              <button className="px-3 py-1.5 rounded-lg hover:bg-white/10" onClick={() => { setPreviewOpen(false); setServerPreviewHtml('') }}>{t('Close')}</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-auto">
              <div className="mb-3 text-sm opacity-80">
                <div><span className="opacity-70">{t('Template')}:</span> {draft.name || activeTemplate?.name || '-'}</div>
                <div><span className="opacity-70">{t('Project')}:</span> {activeTemplate?.project?.name || activeProjectName}</div>
              </div>
              {draft.content_type === 'pdf' ? (
                <ContractPage>
                  {pdfPreviewUrl ? (
                    <iframe
                      title="contract-pdf-preview"
                      src={pdfPreviewUrl}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="text-sm text-gray-600">{t('No PDF selected')}</div>
                  )}
                </ContractPage>
              ) : (
                <ContractPage>
                  {serverPreviewLoading ? (
                    <div className="text-sm opacity-70">{t('Loading...')}</div>
                  ) : (
                    <iframe
                      title="contract-template-preview"
                      srcDoc={serverPreviewHtml || `<!doctype html><html><body>${previewHtml()}</body></html>`}
                      className="w-full h-[70vh] rounded-lg border border-gray-200"
                    />
                  )}
                </ContractPage>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
