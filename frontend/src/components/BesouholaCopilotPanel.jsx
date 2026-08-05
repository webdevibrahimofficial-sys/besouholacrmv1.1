import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Send, Sparkles, X } from 'lucide-react'
import { api } from '@utils/api'

function ActionButtons({ actions, onConfirm, confirmingKey, onNavigate }) {
  if (!Array.isArray(actions) || actions.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((action, index) => {
        const key = `${action.type}-${index}`
        if (action.type === 'confirm_action') {
          return (
            <button
              key={key}
              type="button"
              disabled={confirmingKey === key}
              onClick={() => onConfirm(action, key)}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {confirmingKey === key ? 'Creating...' : (action.label || 'Confirm')}
            </button>
          )
        }

        if (action.type === 'lead_card') {
          return (
            <div
              key={key}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
            >
              <div className="font-semibold">{action.title}</div>
              <div className="text-slate-500">{action.subtitle}</div>
              <div className="mt-1 text-[11px] text-slate-400">Lead #{action.lead_id}</div>
            </div>
          )
        }

        if (action.type === 'navigate' || action.type === 'download') {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(action)}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
            >
              {action.label || (action.type === 'download' ? 'Download' : 'Open')}
            </button>
          )
        }

        return null
      })}
    </div>
  )
}

export default function BesouholaCopilotPanel({ open, onClose, isRtl = false }) {
  const navigate = useNavigate()
  const listRef = useRef(null)
  const [boot, setBoot] = useState({ loading: false, error: '', payload: null })
  const [conversationId, setConversationId] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState('')
  const [messages, setMessages] = useState([])

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
                  content: 'Besouhola Copilot is ready. Ask about reports, filters, exports, delayed leads, lead actions, or tasks.',
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
  }, [open])

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

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sending) return

    setDraft('')
    setSending(true)
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', content: text, ui_actions: [] },
    ])

    try {
      const response = await api.post('/api/ai/copilot/chat', {
        message: text,
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[180]">
      <button
        type="button"
        aria-label="Close Besouhola Copilot"
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`absolute bottom-24 ${isRtl ? 'left-6' : 'right-6'} w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[28px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.96))] text-slate-900 shadow-[0_30px_90px_-40px_rgba(14,116,144,0.65)]`}
        dir={isRtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex max-h-[min(620px,calc(100vh-128px))] flex-col">
          <div className="relative overflow-hidden border-b border-sky-100 px-4 pb-3 pt-3.5">
            <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_65%)]" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-200">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                    <Sparkles className="h-3 w-3" />
                    Besouhola Copilot
                  </div>
                  <h2 className="mt-2 text-base font-semibold">
                    {boot.payload?.tenant?.name || 'Workspace'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                onClick={onClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {boot.loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-500">
                Loading Copilot...
              </div>
            ) : null}

            {boot.error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {boot.error}
              </div>
            ) : null}

            {!boot.loading && !boot.error ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'ms-auto bg-sky-600 text-white'
                      : 'me-auto border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.role === 'assistant' ? (
                    <ActionButtons
                      actions={message.ui_actions}
                      onConfirm={handleConfirm}
                      confirmingKey={confirmingKey}
                      onNavigate={handleNavigate}
                    />
                  ) : null}
                </div>
              ))
            ) : null}

            {sending ? (
              <div className="me-auto rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                Thinking...
              </div>
            ) : null}
          </div>

          {!boot.loading && !boot.error ? (
            <div className="border-t border-slate-200 bg-white/90 p-3">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-2">
                <textarea
                  className="min-h-[72px] w-full resize-none bg-transparent px-2 pt-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  placeholder="Ask Copilot about reports, delayed leads, lead actions, or tasks..."
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
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-700 hover:to-cyan-600 disabled:opacity-50"
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

