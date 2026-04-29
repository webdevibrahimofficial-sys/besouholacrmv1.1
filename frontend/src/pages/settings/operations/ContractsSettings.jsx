import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, FilePlus2, Save, Trash2, Upload, X } from 'lucide-react'
import i18n from '../../../i18n'
import { api } from '@utils/api'
import { createContractTemplate, deleteContractTemplate, getContractTemplates, updateContractTemplate } from '@services/contractTemplateService'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
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

export default function ContractsSettings() {
  const { t } = useTranslation()
  const isRTL = useMemo(() => i18n.language === 'ar', [])

  const shouldIgnoreNextEditorUpdateRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [projects, setProjects] = useState([])
  const [tenantInfo, setTenantInfo] = useState({
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
  const [pastePlainText, setPastePlainText] = useState(false)

  const activeTemplate = useMemo(() => templates.find(tpl => tpl.id === activeId) || null, [templates, activeId])
  const activeProjectName = useMemo(() => {
    const id = Number(draft.project_id || 0)
    if (!id) return t('All')
    return projects.find(p => Number(p.id) === id)?.name || t('All')
  }, [draft.project_id, projects, t])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [tpls, projRes, companyRes, smtpRes] = await Promise.all([
        getContractTemplates(),
        api.get('/api/projects?all=1'),
        api.get('/api/company-info'),
        api.get('/api/smtp-settings'),
      ])
      setTemplates(Array.isArray(tpls) ? tpls : [])
      setProjects(Array.isArray(projRes?.data?.data) ? projRes.data.data : (Array.isArray(projRes?.data) ? projRes.data : []))

      const tenant = companyRes?.data?.tenant || companyRes?.data?.data?.tenant || {}
      const profile = tenant?.profile || {}
      const fromEmail = smtpRes?.data?.from_email || ''
      setTenantInfo({
        name: tenant?.name || '',
        logoUrl: profile?.logo_url || '',
        phone: profile?.phone || '',
        email: fromEmail || '',
        taxId: profile?.tax_id || '',
      })
    } catch {
      setTemplates([])
      setProjects([])
      setTenantInfo({ name: '', logoUrl: '', phone: '', email: '', taxId: '' })
    } finally {
      setLoading(false)
    }
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

    if (nextDraft.content_type === 'html' && editor) {
      try {
        shouldIgnoreNextEditorUpdateRef.current = true
        editor.commands.setContent(nextDraft.body || '', false)
      } catch {
      } finally {
        // Clear on next tick to avoid catching chained updates
        setTimeout(() => {
          shouldIgnoreNextEditorUpdateRef.current = false
        }, 0)
      }
    }
  }, [activeTemplate])

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
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: draft.body || '',
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

  useEffect(() => {
    if (!editor) return
    // Keep editor direction synced
    editor.view.dom.setAttribute('dir', isRTL ? 'rtl' : 'ltr')
  }, [editor, isRTL])

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
    if (editor) {
      try {
        shouldIgnoreNextEditorUpdateRef.current = true
        editor.commands.setContent('', false)
      } catch {
      } finally {
        setTimeout(() => {
          shouldIgnoreNextEditorUpdateRef.current = false
        }, 0)
      }
    }
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
        const payload = {
          name,
          project_id: projectId,
          status,
          content_type: 'html',
          body: editor ? editor.getHTML() : (draft.body || ''),
          pdf_path: null,
        }
        res = draft.id ? await updateContractTemplate(draft.id, payload) : await createContractTemplate(payload)
      }

      await loadAll()
      setActiveId(res?.id ?? null)
      setPdfFile(null)
      setDirty(false)
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
    if (editor) return editor.getHTML() || ''
    return draft.body || ''
  }

  const pdfPreviewUrl = pdfObjectUrl || draft.pdf_url || ''

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
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div><span className="text-gray-500">Phone:</span> {tenantInfo.phone || '-'}</div>
        <div><span className="text-gray-500">Email:</span> {tenantInfo.email || '-'}</div>
        <div><span className="text-gray-500">Tax No.:</span> {tenantInfo.taxId || '-'}</div>
      </div>

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
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
              onClick={save}
              disabled={saving || !dirty || !String(draft.name || '').trim()}
              title={t('Save')}
            >
              <Save className="w-4 h-4" />
              {saving ? t('Saving...') : t('Save')}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 inline-flex items-center gap-2"
              onClick={() => setPreviewOpen(true)}
              title={t('Preview')}
            >
              <Eye className="w-4 h-4" />
              {t('Preview')}
            </button>
            <div className="ml-auto flex items-center gap-2 text-xs text-[var(--content-text)] opacity-80">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={pastePlainText} onChange={(e) => setPastePlainText(e.target.checked)} />
                {t('Paste as plain text')}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[var(--content-text)] opacity-80">{t('Template Name')}</label>
              <input
                value={draft.name}
                onChange={(e) => {
                  setDraft(prev => ({ ...prev, name: e.target.value }))
                  setDirty(true)
                }}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--panel-border)] bg-gray-900/70 text-white"
                placeholder={t('e.g. Contract (1)')}
              />
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

           <div className="flex flex-wrap items-center gap-2">
             <div className="text-sm text-[var(--content-text)] opacity-80">{t('Content')}</div>
             <div className="flex items-center gap-2">
               <button
                 className={`px-3 py-1.5 rounded-lg border ${draft.content_type === 'html' ? 'bg-white/10' : 'bg-transparent'} border-[var(--panel-border)]`}
                 onClick={() => {
                   setDraft(prev => ({ ...prev, content_type: 'html', pdf_url: '', pdf_original_name: '' }))
                   setPdfFile(null)
                   if (editor) {
                     try {
                       shouldIgnoreNextEditorUpdateRef.current = true
                       editor.commands.setContent(draft.body || '', false)
                     } catch {
                     } finally {
                       setTimeout(() => {
                         shouldIgnoreNextEditorUpdateRef.current = false
                       }, 0)
                     }
                   }
                   setDirty(true)
                 }}
                 type="button"
               >
                 {t('Copy / Paste')}
               </button>
               <button
                 className={`px-3 py-1.5 rounded-lg border ${draft.content_type === 'pdf' ? 'bg-white/10' : 'bg-transparent'} border-[var(--panel-border)]`}
                 onClick={() => {
                   setDraft(prev => ({ ...prev, content_type: 'pdf' }))
                   if (editor) {
                     try {
                       shouldIgnoreNextEditorUpdateRef.current = true
                       editor.commands.setContent('', false)
                     } catch {
                     } finally {
                       setTimeout(() => {
                         shouldIgnoreNextEditorUpdateRef.current = false
                       }, 0)
                     }
                   }
                   setDirty(true)
                 }}
                 type="button"
               >
                 {t('Upload PDF')}
               </button>
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
                 onClick={() => editor?.chain().focus().toggleUnderline().run()}
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
                 className="px-2 py-1 rounded bg-gray-900/40 border border-[var(--panel-border)] text-sm"
                 defaultValue=""
                 onChange={(e) => {
                   const v = e.target.value
                   if (v) insertPlaceholder(v)
                   e.target.value = ''
                 }}
                 title={t('Insert Field')}
               >
                 <option value="">{t('Insert Field')}</option>
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
                  <span className="text-sm">{t('Choose PDF')}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setPdfFile(file)
                      setDraft(prev => ({ ...prev, content_type: 'pdf', pdf_original_name: file?.name || prev.pdf_original_name }))
                      setDirty(true)
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
                      if (editor) {
                        try {
                          shouldIgnoreNextEditorUpdateRef.current = true
                          editor.commands.setContent(draft.body || '', false)
                        } catch {
                        } finally {
                          setTimeout(() => {
                            shouldIgnoreNextEditorUpdateRef.current = false
                          }, 0)
                        }
                      }
                        setDirty(true)
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
            <ContractPage>
              <div onPaste={onBodyPaste}>
                <EditorContent editor={editor} />
              </div>
            </ContractPage>
          )}

          <div className="text-xs text-[var(--content-text)] opacity-70">
            {t('Header & footer are auto-filled from tenant settings. Tip: you can copy from Word and paste here, or upload a PDF to keep exact formatting.')}
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
                  <tr><td className="px-3 py-3 opacity-70" colSpan={3}>{t('No templates yet')}</td></tr>
                ) : (
                  templates.map(tpl => {
                    const isActive = tpl.id === activeId
                    return (
                      <tr key={tpl.id} className={`border-t border-[var(--panel-border)] ${isActive ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                        <td className="px-3 py-2">
                          <button className="text-left w-full" onClick={() => setActiveId(tpl.id)}>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="text-xs opacity-70">{tpl.status || 'Active'}</div>
                          </button>
                        </td>
                        <td className="px-3 py-2">{tpl.project?.name || t('All')}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button className="p-2 rounded hover:bg-white/10" onClick={() => { setActiveId(tpl.id); setPreviewOpen(true) }} title={t('Preview')}>
                              <Eye className="w-4 h-4" />
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
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" onMouseDown={() => setPreviewOpen(false)}>
          <div className="w-full max-w-4xl rounded-2xl bg-gray-950 border border-[var(--panel-border)] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--panel-border)] flex items-center justify-between">
              <div className="font-semibold">{t('Preview')}</div>
              <button className="px-3 py-1.5 rounded-lg hover:bg-white/10" onClick={() => setPreviewOpen(false)}>{t('Close')}</button>
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
                  <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml() }} />
                </ContractPage>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
