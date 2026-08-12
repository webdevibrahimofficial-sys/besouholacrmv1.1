import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X } from 'lucide-react'

function tUi(isRtl, en, ar) {
  return isRtl ? ar : en
}

function severityDot(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'bg-rose-500'
    case 'medium':
    case 'warning':
      return 'bg-amber-400'
    default:
      return 'bg-sky-400'
  }
}

export default function CopilotNotificationBell({
  notifications = [],
  unreadCount = 0,
  loading = false,
  isRtl = false,
  isLight = true,
  onRefresh,
  onOpen,
  onDismiss,
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const updateMenuPosition = () => {
    const button = buttonRef.current
    if (!button) return

    const panel = button.closest('[role="dialog"]')
    const panelRect = panel?.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const viewportPadding = 16
    const menuWidth = Math.min(320, window.innerWidth - viewportPadding * 2)

    let left = buttonRect.right - menuWidth
    if (panelRect) {
      left = isRtl
        ? panelRect.left + viewportPadding
        : panelRect.right - menuWidth - viewportPadding
    } else {
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding))
    }

    setMenuStyle({
      position: 'fixed',
      top: buttonRect.bottom + 8,
      left,
      width: menuWidth,
      zIndex: 190,
    })
  }

  useEffect(() => {
    if (!open) {
      setMenuStyle(null)
      return undefined
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, notifications.length, isRtl])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (open) onRefresh?.()
  }, [open, onRefresh])

  const buttonClass = isLight
    ? 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-600'
    : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500 hover:text-sky-300'

  return (
    <div ref={rootRef} className="relative overflow-visible">
      <div className="relative overflow-visible">
        {unreadCount > 0 ? (
          <span className="pointer-events-none absolute left-1/2 bottom-full z-[30] mb-0.5 flex min-h-[15px] min-w-[15px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          className={`relative z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${buttonClass}`}
          onClick={() => setOpen((current) => !current)}
          title={tUi(isRtl, 'Copilot inbox', 'صندوق Copilot')}
          aria-label={tUi(isRtl, 'Copilot inbox', 'صندوق Copilot')}
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>

      {open && menuStyle && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className={`overflow-hidden rounded-2xl border shadow-xl ${
            isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-700 bg-slate-950 text-slate-100'
          }`}
        >
          <div className={`flex items-center justify-between border-b px-3 py-2 ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em]">
              {tUi(isRtl, 'Lead intelligence', 'ذكاء الليد')}
            </div>
            <button
              type="button"
              className={`rounded-full p-1 ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setOpen(false)}
              aria-label={tUi(isRtl, 'Close', 'إغلاق')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className={`px-3 py-4 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {tUi(isRtl, 'Loading...', 'جاري التحميل...')}
              </div>
            ) : null}

            {!loading && notifications.length === 0 ? (
              <div className={`px-3 py-4 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {tUi(isRtl, 'No intelligence cards yet.', 'لا توجد بطاقات ذكاء بعد.')}
              </div>
            ) : null}

            {!loading ? notifications.map((notification) => {
              const isUnread = !notification.read_at
              return (
                <div
                  key={notification.id}
                  className={`border-b px-3 py-3 last:border-b-0 ${
                    isLight ? 'border-slate-100' : 'border-slate-800'
                  } ${isUnread ? (isLight ? 'bg-sky-50/70' : 'bg-sky-950/20') : ''}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={async () => {
                      setOpen(false)
                      await onOpen?.(notification)
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(notification.severity)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{notification.title}</div>
                        {notification.type === 'lead_rescue' ? (
                          <div className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${isLight ? 'text-rose-600' : 'text-rose-300'}`}>
                            {tUi(isRtl, 'Rescue', 'إنقاذ')}
                          </div>
                        ) : null}
                        {notification.type === 'escalation' ? (
                          <div className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                            {tUi(isRtl, 'Escalation', 'تصعيد')}
                          </div>
                        ) : null}
                        {notification.type === 'lost_detective' ? (
                          <div className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${isLight ? 'text-violet-700' : 'text-violet-300'}`}>
                            {tUi(isRtl, 'Detective', 'تحقيق')}
                          </div>
                        ) : null}
                        <div className={`mt-1 whitespace-pre-line text-xs leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {notification.preview}
                        </div>
                      </div>
                    </div>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      className={`text-[11px] font-medium ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'}`}
                      onClick={async (event) => {
                        event.stopPropagation()
                        await onDismiss?.(notification)
                      }}
                    >
                      {tUi(isRtl, 'Dismiss', 'تجاهل')}
                    </button>
                  </div>
                </div>
              )
            }) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
