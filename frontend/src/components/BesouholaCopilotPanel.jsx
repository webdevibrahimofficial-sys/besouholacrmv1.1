import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Maximize2, Minimize2, Send, Sparkles, X, Plus } from 'lucide-react'
import { api } from '@utils/api'
import { COPILOT_REPORT_CATALOG } from '@features/ai-copilot/utils/reportCatalog'
import { useTheme } from '@shared/context/ThemeProvider.jsx'
import { useAppState } from '@shared/context/AppStateProvider'

function getCopilotText(entry, isRtl) {
  return isRtl ? entry.ar : entry.en
}

function getWelcomeMessage(isRtl) {
  return isRtl
    ? 'Besouhola Copilot جاهز. اختار اختصار أو اكتب سؤالك.'
    : 'Besouhola Copilot is ready. Pick a shortcut or type your question.'
}

function getInputPlaceholder(isRtl) {
  return isRtl
    ? 'اسأل عن التقارير، الليدز المتأخرة، الأكشنز، أو التاسكات...'
    : 'Ask Copilot about reports, delayed leads, lead actions, or tasks...'
}

function escapeRegex(value) {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

function renderLinkedReportText(text, navigate, visibleCatalog) {
  if (!text || typeof text !== 'string') return text

  const reports = (visibleCatalog || []).map((r) => r.name)
  if (!reports.length) return text

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
      parts.push(text.slice(lastIndex, start))
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
  if (lastIndex === 0) return text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
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

function FormAction({ action, onSubmit, sending }) {
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
      <div className={`mb-3 text-xs font-semibold ${isLight ? 'text-sky-700' : 'text-sky-200'}`}>{action.label || 'Complete the form'}</div>
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
                <option value="">Select</option>
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
          {action.submit_label || 'Submit'}
        </button>
      </div>
    </form>
  )
}

function ActionButtons({ actions, onConfirm, confirmingKey, onNavigate, onPrompt, onSubmitForm, sending }) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  if (!Array.isArray(actions) || actions.length === 0) return null

  return (
    <div className="mt-3 flex w-full flex-col gap-2">
      {actions.map((action, index) => {
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
              {confirmingKey === key ? 'Creating...' : (action.label || 'Confirm')}
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
              {action.label || 'Ask Copilot'}
            </button>
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
                <span className={`${isLight ? 'text-slate-400' : 'text-slate-500'} text-[11px]`}>Lead #{action.lead_id}</span>
                <span className={`${isLight ? 'text-violet-600' : 'text-violet-300'} text-[11px] font-semibold`}>اضغط للبدء</span>
              </div>
            </button>
          )
        }

        return null
      })}
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
            error: error?.response?.data?.message || 'Unable to load Besouhola Copilot.',
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

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
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

    const pathname = action.pathname || (action.path ? String(action.path).split('?')[0] : '')
    const search = action.search || (action.path && String(action.path).includes('?')
      ? `?${String(action.path).split('?').slice(1).join('?')}`
      : '')

    if (!pathname) return
    navigate({ pathname, search })
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
      })
      const data = response?.data?.data || {}
      if (data.conversation_id) setConversationId(data.conversation_id)

      const actions = data.ui_actions || []
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.message || 'Done.',
          ui_actions: actions,
        },
      ])

      const autoNavigate = actions.find((action) => action?.type === 'navigate' && (action.pathname || action.path))
      if (autoNavigate) {
        handleNavigate(autoNavigate)
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: error?.response?.data?.message || 'Sorry, I could not process that request.',
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
    const prefix = action?.message_prefix || 'Create lead'
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
    await sendMessage(outgoing, action?.label || 'Continue')
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
          content: data.message || (data.ok ? 'Action completed.' : 'Action failed.'),
          ui_actions: data.ui_actions || [],
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `ce-${Date.now()}`,
          role: 'assistant',
          content: error?.response?.data?.message || error?.response?.data?.data?.message || 'Could not confirm the action.',
          ui_actions: [],
        },
      ])
    } finally {
      setConfirmingKey('')
    }
  }

  const handleQuickAction = async (action) => {
    await sendMessage(action.message, getCopilotText(action.displayText, isRtl))
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
      if (report.key === 'sales_to_telesales_transfers' && !isTelesalesModuleEnabled) return false
      if (isAdminRole) return true
      if (!hasExplicitReportsPerms) return true
      const reportModuleName = report.permission
      if (!reportModuleName) return false
      return reportsModulePerms.includes(`${reportModuleName}_show`)
    })
  })()

  if (!open) return null

  const panelSizeClasses = expanded
    ? 'h-[min(82vh,820px)] w-[min(760px,calc(100vw-24px))]'
    : 'h-[min(620px,calc(100vh-128px))] w-[min(420px,calc(100vw-24px))]'

  return (
    <div className="fixed inset-0 z-[180]">
      <button
        type="button"
        aria-label="Close Besouhola Copilot"
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`absolute bottom-24 ${isRtl ? 'left-6' : 'right-6'} ${panelSizeClasses} overflow-hidden rounded-[28px] border ${isLight ? 'border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.96))] text-slate-900 shadow-[0_30px_90px_-40px_rgba(14,116,144,0.65)] ring-1 ring-slate-900/5' : 'border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.96))] text-slate-100 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.65)] ring-1 ring-slate-950/20'} transition-[width,height] duration-200`}
        dir={isRtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
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
                  <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${isLight ? 'border-sky-200 bg-white/90 text-sky-700' : 'border-slate-700 bg-slate-900/80 text-sky-200'}`}>
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="truncate">Besouhola Copilot</span>
                  </div>
                  <h2 className="mt-2 truncate text-base font-semibold">
                    {boot.payload?.tenant?.name || 'Workspace'}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-600' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500 hover:text-sky-300'}`}
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? 'Reduce size' : 'Expand'}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-green-200 hover:text-green-600' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-green-500 hover:text-green-300'}`}
                  onClick={() => {
                    // New chat handler
                    if (draft && draft.trim()) {
                      if (!window.confirm('You have an unsent draft. Discard and start a new chat?')) return
                    }
                    setConversationId(null)
                    setMessages([{
                      id: 'welcome', role: 'assistant', content: getWelcomeMessage(isRtl), ui_actions: []
                    }])
                    setDraft('')
                  }}
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-rose-500 hover:text-rose-300'}`}
                  onClick={onClose}
                  title="Close"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {boot.loading ? (
              <div className={`rounded-2xl border p-4 text-sm ${isLight ? 'border-slate-200 bg-white/90 text-slate-500' : 'border-slate-700 bg-slate-900/90 text-slate-300'}`}>
                Loading Copilot...
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
                  <div className="whitespace-pre-wrap break-words">
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
                      onPrompt={handlePrompt}
                      onSubmitForm={handleSubmitForm}
                      sending={sending}
                    />
                  ) : null}
                </div>
              ))
            ) : null}

            {sending ? (
              <div className={`mr-auto max-w-[75%] rounded-2xl border px-3 py-2 text-sm ${isLight ? 'border-slate-200 bg-white text-slate-400' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
                Thinking...
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
                    Send
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



