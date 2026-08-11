import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Download, ExternalLink, Maximize2, Minimize2, Send, Sparkles, X, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api, logExportEvent } from '@utils/api'
import { COPILOT_REPORT_CATALOG } from '@features/ai-copilot/utils/reportCatalog'
import { useTheme } from '@shared/context/ThemeProvider.jsx'
import { useAppState } from '@shared/context/AppStateProvider'

function getCopilotText(entry, isRtl) {
  if (!entry || typeof entry !== 'object') return entry
  return isRtl ? (entry.ar ?? entry.en) : (entry.en ?? entry.ar)
}

function tUi(isRtl, en, ar) {
  return isRtl ? ar : en
}

function getCopilotBrandLabel(isRtl) {
  return isRtl ? 'Besouhola Copilot \u2014 \u0627\u0644\u0645\u0633\u0627\u0639\u062f' : 'Besouhola Copilot'
}

function getWelcomeMessage(isRtl) {
  return isRtl
    ? 'Besouhola Copilot (\u0627\u0644\u0645\u0633\u0627\u0639\u062f) \u062c\u0627\u0647\u0632. \u0627\u062e\u062a\u0627\u0631 \u0627\u062e\u062a\u0635\u0627\u0631 \u0623\u0648 \u0627\u0643\u062a\u0628 \u0633\u0624\u0627\u0644\u0643.'
    : 'Besouhola Copilot is ready. Pick a shortcut or type your question.'
}

function getInputPlaceholder(isRtl) {
  return isRtl
    ? '\u0627\u0633\u0623\u0644 \u0639\u0646 \u0627\u0644\u062a\u0642\u0627\u0631\u064a\u0631\u060c \u0627\u0644\u0644\u064a\u062f\u0632 \u0627\u0644\u0645\u062a\u0623\u062e\u0631\u0629\u060c \u0627\u0644\u0623\u0643\u0634\u0646\u0632\u060c \u0623\u0648 \u0627\u0644\u062a\u0627\u0633\u0643\u0627\u062a...'
    : 'Ask Copilot about reports, delayed leads, lead actions, or tasks...'
}

function escapeRegex(value) {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

function parseActionLocation(action = {}) {
  const path = String(action.path || '')
  const pathname = action.pathname || (path ? path.split('?')[0] : '')
  const search = action.search || (path.includes('?') ? `?${path.split('?').slice(1).join('?')}` : '')
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return { pathname, search, params }
}

async function downloadPipelineReportFromApi({ params, fileName }) {
  const apiParams = {
    assigned_to: params.get('assigned_to') || undefined,
    stage: params.get('stage') || undefined,
    created_from: params.get('created_from') || params.get('date_from') || undefined,
    created_to: params.get('created_to') || params.get('date_to') || undefined,
    manager_id: params.get('manager_id') || undefined,
    source: params.get('source') || undefined,
    agency: params.get('agency') || undefined,
    project: params.get('project') || undefined,
  }

  const res = await api.get('/api/leads/pipeline-report', { params: apiParams })
  const rows = (res.data?.salesPersonStats || []).map((stat) => ({
    'Sales Person': stat.name || 'Unassigned',
    'Total Leads': stat.total ?? 0,
    'Pending (New)': stat.pendingNew ?? 0,
    'Pending (Cold)': stat.pendingCold ?? 0,
    'Follow up': stat.followUp ?? 0,
    Proposal: stat.proposal ?? 0,
    Meeting: stat.meeting ?? 0,
    Reservation: stat.reservation ?? 0,
    Closed: stat.closed ?? 0,
    Canceled: stat.canceled ?? 0,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads Overview')
  const outName = fileName || `leads-pipeline-${Date.now()}.xlsx`
  XLSX.writeFile(wb, outName)
  await logExportEvent({
    module: 'Leads Pipeline Report',
    fileName: outName,
    format: 'xlsx',
  })
}

function renderLinkedReportText(text, navigate, visibleCatalog) {
  if (!text || typeof text !== 'string') return text

  const reports = (visibleCatalog || []).map((r) => r.name)
  if (!reports.length) return renderInlineMarkdown(text)

  const sorted = reports.sort((a, b) => b.length - a.length)
  const matcher = new RegExp(`(${sorted.map(escapeRegex).join('|')})`, 'g')

  const parts = []
  let lastIndex = 0
  let match
  while ((match = matcher.exec(text)) !== null) {
    const reportName = match[0]
    const report = (visibleCatalog || []).find((item) => item.name === reportName)
    if (!report) continue

    const start = match.index
    if (start > lastIndex) {
      parts.push(...renderInlineMarkdownParts(text.slice(lastIndex, start), `t-${start}`))
    }
    parts.push(
      <button
        key={`${report.key}-${start}`}
        type="button"
        onClick={(event) => {
          event.preventDefault()
          navigate(report.path)
        }}
        className="inline text-sky-500 underline transition hover:text-sky-400 focus:outline-none"
      >
        {reportName}
      </button>,
    )
    lastIndex = start + reportName.length
  }
  if (lastIndex === 0) return renderInlineMarkdown(text)
  if (lastIndex < text.length) {
    parts.push(...renderInlineMarkdownParts(text.slice(lastIndex), `t-end`))
  }
  return parts
}

function renderInlineMarkdown(text) {
  return renderInlineMarkdownParts(text, 'md')
}

function renderInlineMarkdownParts(text, keyPrefix = 'md') {
  if (text == null || text === '') return []
  const source = String(text)
  const parts = []
  const matcher = /\*\*(.+?)\*\*/gs
  let lastIndex = 0
  let match
  let index = 0

  while ((match = matcher.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push(source.slice(lastIndex, match.index))
    }
    parts.push(
      <strong key={`${keyPrefix}-b-${index}`} className="font-semibold">
        {match[1]}
      </strong>,
    )
    lastIndex = match.index + match[0].length
    index += 1
  }

  if (lastIndex === 0) return [source]
  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex))
  }
  return parts
}

function QuickActions({ actions, isRtl, sending, onSelect }) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={sending}
          onClick={() => onSelect(action)}
          className={`inline-flex max-w-full items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/25 ${isLight ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100' : 'border-violet-700 bg-violet-900/20 text-violet-200 hover:bg-violet-800/30'}`}
        >
          {getCopilotText(action.label, isRtl)}
        </button>
      ))}
    </div>
  )
}

function FormAction({ action, onSubmit, sending, isRtl = false }) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  const fields = Array.isArray(action?.fields) ? action.fields : []
  const [values, setValues] = useState(() => (
    fields.reduce((carry, field) => {
      carry[field.name] = field.value ?? ''
      return carry
    }, {})
  ))

  useEffect(() => {
    setValues(fields.reduce((carry, field) => {
      carry[field.name] = field.value ?? ''
      return carry
    }, {}))
  }, [action, fields])

  if (!fields.length) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit(action, values)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`mt-3 w-full rounded-2xl border p-3 shadow-sm ${isLight ? 'border-sky-100 bg-sky-50/80 text-slate-900' : 'border-slate-700 bg-slate-900/80 text-slate-100'}`}
    >
      <div className={`mb-3 text-xs font-semibold ${isLight ? 'text-sky-700' : 'text-sky-200'}`}>
        {action.label || tUi(isRtl, 'Complete the form', 'كمّل البيانات')}
      </div>
      <div className="space-y-2.5">
        {fields.map((field) => (
          <label key={field.name} className={`block text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
            <span className={`mb-1 block font-medium ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            {field.type === 'select' ? (
              <select
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-300/30 ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                value={values[field.name] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              >
                <option value="">{tUi(isRtl, 'Select', 'اختر')}</option>
                {(field.options || []).map((option) => (
                  <option key={`${field.name}-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'email' ? 'email' : 'text'}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-300/30 ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                value={values[field.name] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {action.submit_label || tUi(isRtl, 'Submit', 'إرسال')}
        </button>
      </div>
    </form>
  )
}

function ActionButtons({
  actions,
  onConfirm,
  confirmingKey,
  onNavigate,
  onDownload,
  downloadingKey,
  onPrompt,
  onSubmitForm,
  sending,
  isRtl = false,
}) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  if (!Array.isArray(actions) || actions.length === 0) return null

  const navigateActions = actions.filter((action) => action?.type === 'navigate')
  const otherActions = actions.filter((action) => action?.type !== 'navigate')
  const useModuleGrid = navigateActions.length > 1

  const renderAction = (action, index) => {
    const key = `${action.type}-${index}`

    if (action.type === 'confirm_action') {
      return (
        <button
          key={key}
          type="button"
          disabled={confirmingKey === key}
          onClick={() => onConfirm(action, key)}
          className="inline-flex w-fit max-w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 shadow-sm"
        >
          {confirmingKey === key
            ? (isRtl ? 'جاري الإنشاء...' : 'Creating...')
            : (action.label || (isRtl ? 'تأكيد' : 'Confirm'))}
        </button>
      )
    }

    if (action.type === 'prompt_message') {
      return (
        <button
          key={key}
          type="button"
          disabled={sending}
          onClick={() => onPrompt(action)}
          className={`inline-flex w-fit max-w-full items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/25 shadow-sm ${isLight ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100' : 'border-violet-700 bg-violet-900/20 text-violet-200 hover:bg-violet-800/30'}`}
        >
          {action.label || (isRtl ? 'اسأل الكوبايلوت' : 'Ask Copilot')}
        </button>
      )
    }

    if (action.type === 'download') {
      return (
        <button
          key={key}
          type="button"
          disabled={sending || downloadingKey === key}
          onClick={() => onDownload?.(action, key)}
          className="inline-flex w-fit max-w-full items-center justify-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/30 shadow-sm"
        >
          <Download className="h-3.5 w-3.5" />
          {downloadingKey === key
            ? (isRtl ? 'جاري التحميل...' : 'Downloading...')
            : (action.label || (isRtl ? 'تحميل' : 'Download'))}
        </button>
      )
    }

    if (action.type === 'form') {
      return (
        <FormAction
          key={key}
          action={action}
          onSubmit={onSubmitForm}
          sending={sending}
          isRtl={isRtl}
        />
      )
    }

    if (action.type === 'lead_card') {
      return (
        <button
          key={key}
          type="button"
          disabled={sending}
          onClick={() =>
            onPrompt({
              message:
                action.prompt_message ||
                `Give me smart follow-up advice for lead ${action.lead_id}`,
              display_text: action.prompt_label || action.title,
              label: action.prompt_label || `ابدأ بـ ${action.title}`,
            })
          }
          className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition disabled:opacity-60 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/20 ${isLight ? 'border-slate-200 bg-slate-100 text-slate-700 hover:border-violet-300 hover:bg-violet-50' : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-violet-500 hover:bg-violet-900/50'}`}
        >
          <div className="font-semibold">{action.title}</div>
          <div className={`${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{action.subtitle}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className={`${isLight ? 'text-slate-400' : 'text-slate-500'} text-[11px]`}>
              {tUi(isRtl, `Lead #${action.lead_id}`, `ليد #${action.lead_id}`)}
            </span>
            <span className={`${isLight ? 'text-violet-600' : 'text-violet-300'} text-[11px] font-semibold`}>
              {isRtl ? 'اضغط للبدء' : 'Click to start'}
            </span>
          </div>
        </button>
      )
    }

    return null
  }

  const navigateButtonClass = useModuleGrid
    ? `inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/25 shadow-sm ${isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50' : 'border-slate-600 bg-slate-800/80 text-slate-100 hover:border-sky-500 hover:bg-slate-800'}`
    : `inline-flex w-fit max-w-full items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/25 shadow-sm ${isLight ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'}`

  return (
    <div className="mt-3 flex w-full flex-col gap-2">
      {otherActions.map((action, index) => renderAction(action, index))}

      {navigateActions.length > 0 ? (
        <div className={useModuleGrid ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
          {navigateActions.map((action, index) => (
            <button
              key={`navigate-${index}`}
              type="button"
              disabled={sending}
              onClick={() => onNavigate?.(action)}
              className={navigateButtonClass}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="truncate">{getCopilotText(action.label, isRtl) || tUi(isRtl, 'Open', 'افتح')}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function BesouholaCopilotPanel({ open, onClose, isRtl = false }) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  const { user, activeModules } = useAppState()
  const navigate = useNavigate()
  const listRef = useRef(null)
  const [boot, setBoot] = useState({ loading: false, error: '', payload: null })
  const [conversationId, setConversationId] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState('')
  const [downloadingKey, setDownloadingKey] = useState('')
  const [messages, setMessages] = useState([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false

    const load = async () => {
      setBoot((current) => ({ ...current, loading: true, error: '' }))

      try {
        const response = await api.get('/api/ai/copilot/status')
        if (!cancelled) {
          setBoot({
            loading: false,
            error: '',
            payload: response?.data?.data || null,
          })
          setMessages((current) => (
            current.length
              ? current
              : [{
                  id: 'welcome',
                  role: 'assistant',
                  content: getWelcomeMessage(isRtl),
                  ui_actions: [],
                }]
          ))
        }
      } catch (error) {
        if (!cancelled) {
          setBoot({
            loading: false,
            error: error?.response?.data?.message || tUi(isRtl, 'Unable to load Besouhola Copilot.', 'تعذر تحميل Besouhola Copilot — المساعد.'),
            payload: null,
          })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [open, isRtl])

  useEffect(() => {
    if (!open) return

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, sending, open])

  const handleNavigate = (actionOrPath) => {
    const action = typeof actionOrPath === 'string'
      ? { path: actionOrPath }
      : (actionOrPath || {})

    let { pathname, search } = parseActionLocation(action)
    if (!pathname) return

    // App opens lead details via query on /leads (no /leads/:id route).
    const leadPathMatch = pathname.match(/^\/leads\/(\d+)\/?$/)
    if (leadPathMatch) {
      pathname = '/leads'
      search = `?lead_id=${leadPathMatch[1]}`
    }

    navigate({ pathname, search })
  }

  const handleDownload = async (action, key) => {
    const downloadAction = action || {}
    const { pathname, params } = parseActionLocation(downloadAction)
    if (!pathname) return

    setDownloadingKey(key || 'download')
    try {
      const isPipeline = pathname.includes('/reports/sales/pipeline')
      if (isPipeline) {
        await downloadPipelineReportFromApi({
          params,
          fileName: downloadAction.file_name || params.get('file_name') || undefined,
        })
        return
      }

      // Fallback for reports without in-chat exporters yet: open with export intent.
      const searchParams = new URLSearchParams(params.toString())
      searchParams.set('export', '1')
      if (!searchParams.get('format')) {
        searchParams.set('format', downloadAction.format || 'xlsx')
      }
      if (downloadAction.file_name && !searchParams.get('file_name')) {
        searchParams.set('file_name', downloadAction.file_name)
      }
      navigate({ pathname, search: `?${searchParams.toString()}` })
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `dl-err-${Date.now()}`,
          role: 'assistant',
          content: error?.response?.data?.message || tUi(isRtl, 'Could not download the export. Please try again or open the report.', 'تعذر تحميل الملف. حاول مرة أخرى أو افتح التقرير.'),
          ui_actions: [],
        },
      ])
    } finally {
      setDownloadingKey('')
    }
  }

  const sendMessage = async (text, visibleText = null) => {
    const message = text.trim()
    if (!message || sending) return

    setDraft('')
    setSending(true)
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', content: visibleText || message, ui_actions: [] },
    ])

    try {
      const response = await api.post('/api/ai/copilot/chat', {
        message,
        conversation_id: conversationId || undefined,
        locale: isRtl ? 'ar' : 'en',
      })
      const data = response?.data?.data || {}
      if (data.conversation_id) setConversationId(data.conversation_id)

      const actions = data.ui_actions || []
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.message || (isRtl ? 'تم.' : 'Done.'),
          ui_actions: actions,
        },
      ])

      const hasDownload = actions.some((action) => action?.type === 'download')
      const autoNavigate = actions.find(
        (action) => action?.type === 'navigate' && action?.auto === true && (action.pathname || action.path)
      )
      // Auto-open only when the tool marks navigate as auto (report open/export).
      // Overview replies expose multiple module links as buttons only.
      if (!hasDownload && autoNavigate) {
        handleNavigate(autoNavigate)
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: error?.response?.data?.message || tUi(isRtl, 'Sorry, I could not process that request.', 'عذرًا، معرفتش أنفّذ الطلب ده.'),
          ui_actions: [],
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const handleSend = async () => {
    await sendMessage(draft)
  }

  const handlePrompt = async (action) => {
    await sendMessage(action?.message || '', action?.display_text || action?.label || action?.message || '')
  }

  const handleSubmitForm = async (action, values) => {
    const prefix = action?.message_prefix || tUi(isRtl, 'Create lead', 'إنشاء ليد')
    const lines = prefix.startsWith('__') ? [] : [prefix]

    ;(action?.fields || []).forEach((field) => {
      const value = values[field.name]
      if (value === undefined || value === null || String(value).trim() === '') return

      if (field.type === 'select') {
        const selected = (field.options || []).find((option) => String(option.value) === String(value))
        if (field.name === 'source') {
          lines.push(`source: ${selected?.label || value}`)
        } else if (field.name === 'assigned_to' || field.name.endsWith('_id')) {
          // Always send the option value (user/item/project id), not the display label.
          const key = field.name.endsWith('_id') ? field.name.replace(/_id$/, '') : field.name
          lines.push(`${key}: ${value}`)
        } else {
          lines.push(`${field.name}: ${selected?.label || value}`)
        }
        return
      }

      lines.push(`${field.name}: ${value}`)
    })

    const outgoing = lines.join('\n').trim()
    await sendMessage(outgoing, action?.label || tUi(isRtl, 'Continue', 'متابعة'))
  }

  const handleConfirm = async (action, key) => {
    setConfirmingKey(key)
    try {
      const response = await api.post('/api/ai/copilot/actions/confirm', {
        action: action.action,
        payload: action.payload || {},
      })
      const data = response?.data?.data || {}
      setMessages((current) => [
        ...current,
        {
          id: `c-${Date.now()}`,
          role: 'assistant',
          content: data.message || (data.ok
            ? tUi(isRtl, 'Action completed.', 'تم تنفيذ الإجراء.')
            : tUi(isRtl, 'Action failed.', 'فشل تنفيذ الإجراء.')),
          ui_actions: data.ui_actions || [],
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `ce-${Date.now()}`,
          role: 'assistant',
          content: error?.response?.data?.message || error?.response?.data?.data?.message || tUi(isRtl, 'Could not confirm the action.', 'تعذر تأكيد الإجراء.'),
          ui_actions: [],
        },
      ])
    } finally {
      setConfirmingKey('')
    }
  }

  const handleQuickAction = async (action) => {
    const spoken = getCopilotText(action.displayText, isRtl) || action.message
    await sendMessage(spoken, spoken)
  }

  const showQuickActions = !sending
    && !boot.loading
    && !boot.error
    && messages.length === 1
    && messages[0]?.id === 'welcome'

  // Compute the list of catalog reports that the current user is allowed to see.
  const visibleCatalog = (() => {
    const modulePermissions = (user?.meta_data && user.meta_data.module_permissions) || {}
    const controlModulePerms = Array.isArray(modulePermissions.Control) ? modulePermissions.Control : []
    const reportsModulePerms = Array.isArray(modulePermissions.Reports) ? modulePermissions.Reports : []
    const hasExplicitReportsPerms = Object.prototype.hasOwnProperty.call(modulePermissions, 'Reports')
    const isTelesalesModuleEnabled = Array.isArray(activeModules) && activeModules.includes('telesales')
    const roleLower = String(user?.role || '').toLowerCase()
    const isAdminRole = user?.is_super_admin || roleLower === 'admin' || roleLower === 'tenant admin' || roleLower === 'tenant-admin'
    const hasReportsAccess = isAdminRole || controlModulePerms.includes('showReports')

    if (!hasReportsAccess) return []

    return COPILOT_REPORT_CATALOG.filter((report) => {
      if (report.requiresModule === 'telesales' && !isTelesalesModuleEnabled) return false
      if (report.key === 'sales_to_telesales' && !isTelesalesModuleEnabled) return false
      if (isAdminRole) return true
      if (!hasExplicitReportsPerms) return true
      const reportModuleName = report.permission
      if (!reportModuleName) return false
      return reportsModulePerms.includes(`${reportModuleName}_show`)
    })
  })()

  const panelSizeClasses = expanded
    ? 'h-full w-[min(760px,100vw)]'
    : 'h-full w-[min(430px,100vw)]'

  return (
    <div className={`fixed inset-0 z-[180] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={tUi(isRtl, 'Close Besouhola Copilot', 'إغلاق Besouhola Copilot — المساعد')}
        className={`absolute inset-0 bg-slate-950/25 backdrop-blur-[1px] transition-opacity duration-1000 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      <div
        className={`${open ? 'pointer-events-auto' : 'pointer-events-none'} absolute inset-y-0 right-0 ${panelSizeClasses} overflow-hidden rounded-l-[24px] border border-r-0 ${isLight ? 'border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.96))] text-slate-900 shadow-[0_30px_90px_-40px_rgba(14,116,144,0.65)] ring-1 ring-slate-900/5' : 'border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.96))] text-slate-100 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.65)] ring-1 ring-slate-950/20'} transform-gpu transition-[transform,width] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'translate-x-0' : 'translate-x-full'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col">
          <div className={`relative overflow-hidden border-b px-4 pb-3 pt-3.5 ${isLight ? 'border-slate-200/80 bg-white/80 text-slate-900' : 'border-slate-700 bg-slate-950/70 text-slate-100'}`}>
            <div className={`absolute inset-x-0 top-0 h-20 ${isLight ? 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_65%)]' : 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_65%)]'}`} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-200">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold ${isLight ? 'border-sky-200 bg-white/90 text-sky-700' : 'border-slate-700 bg-slate-900/80 text-sky-200'}`}>
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className={`truncate ${isRtl ? 'normal-case tracking-normal' : 'uppercase tracking-[0.16em]'}`}>
                      {getCopilotBrandLabel(isRtl)}
                    </span>
                  </div>
                  <h2 className="mt-2 truncate text-base font-semibold">
                    {boot.payload?.tenant?.name || tUi(isRtl, 'Workspace', 'مساحة العمل')}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-600' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500 hover:text-sky-300'}`}
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? tUi(isRtl, 'Reduce size', 'تصغير') : tUi(isRtl, 'Expand', 'تكبير')}
                  aria-label={expanded ? tUi(isRtl, 'Reduce size', '\u062a\u0635\u063a\u064a\u0631') : tUi(isRtl, 'Expand', '\u062a\u0643\u0628\u064a\u0631')}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-green-200 hover:text-green-600' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-green-500 hover:text-green-300'}`}
                  onClick={() => {
                    // New chat handler
                    if (draft && draft.trim()) {
                      if (!window.confirm(tUi(
                        isRtl,
                        'You have an unsent draft. Discard and start a new chat?',
                        'عندك مسودة غير مرسلة. هل تتجاهلها وتبدأ محادثة جديدة؟'
                      ))) return
                    }
                    setConversationId(null)
                    setMessages([{
                      id: 'welcome', role: 'assistant', content: getWelcomeMessage(isRtl), ui_actions: []
                    }])
                    setDraft('')
                  }}
                  title={tUi(isRtl, 'New chat', 'محادثة جديدة')}
                  aria-label={tUi(isRtl, 'New chat', 'محادثة جديدة')}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-rose-500 hover:text-rose-300'}`}
                  onClick={onClose}
                  title={tUi(isRtl, 'Close', 'إغلاق')}
                  aria-label={tUi(isRtl, 'Close', 'إغلاق')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {boot.loading ? (
              <div className={`rounded-2xl border p-4 text-sm ${isLight ? 'border-slate-200 bg-white/90 text-slate-500' : 'border-slate-700 bg-slate-900/90 text-slate-300'}`}>
                {tUi(isRtl, 'Loading Copilot...', 'جاري تحميل الكوبايلوت...')}
              </div>
            ) : null}

            {boot.error ? (
              <div className={`rounded-2xl border p-4 text-sm ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-600 bg-rose-900/20 text-rose-200'}`}>
                {boot.error}
              </div>
            ) : null}

            {!boot.loading && !boot.error ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`w-full rounded-2xl px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'ml-auto max-w-[92%] bg-sky-600 text-white'
                      : isLight
                    ? 'mr-auto max-w-full border border-slate-200 bg-white text-slate-700'
                    : 'mr-auto max-w-full border border-slate-700 bg-slate-900 text-slate-100'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {message.id === 'welcome'
                      ? getWelcomeMessage(isRtl)
                      : renderLinkedReportText(message.content, navigate, visibleCatalog)}
                  </div>
                  {message.role === 'assistant' && message.id === 'welcome' && showQuickActions ? (
                    <QuickActions
                      actions={boot.payload?.quick_actions || []}
                      isRtl={isRtl}
                      sending={sending}
                      onSelect={handleQuickAction}
                    />
                  ) : null}
                  {message.role === 'assistant' ? (
                    <ActionButtons
                      actions={message.ui_actions}
                      onConfirm={handleConfirm}
                      confirmingKey={confirmingKey}
                      onNavigate={handleNavigate}
                      onDownload={handleDownload}
                      downloadingKey={downloadingKey}
                      onPrompt={handlePrompt}
                      onSubmitForm={handleSubmitForm}
                      sending={sending}
                      isRtl={isRtl}
                    />
                  ) : null}
                </div>
              ))
            ) : null}

            {sending ? (
              <div className={`mr-auto max-w-[75%] rounded-2xl border px-3 py-2 text-sm ${isLight ? 'border-slate-200 bg-white text-slate-400' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
                {isRtl ? 'بيفكّر...' : 'Thinking...'}
              </div>
            ) : null}
          </div>

          {!boot.loading && !boot.error ? (
            <div className={`border-t p-3 ${isLight ? 'border-slate-200 bg-white/90' : 'border-slate-700 bg-slate-950/90'}`}>
              <div className={`rounded-[20px] border p-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-900/80'}`}>
                <textarea
                  className={`min-h-[72px] w-full resize-none bg-transparent px-2 pt-2 text-sm outline-none ${isLight ? 'text-slate-700 placeholder:text-slate-400' : 'text-slate-100 placeholder:text-slate-500'}`}
                  placeholder={getInputPlaceholder(isRtl)}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={sending || !draft.trim()}
                    onClick={handleSend}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-700 hover:to-cyan-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                  >
                    <Send className="h-4 w-4" />
                    {tUi(isRtl, 'Send', 'إرسال')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}



