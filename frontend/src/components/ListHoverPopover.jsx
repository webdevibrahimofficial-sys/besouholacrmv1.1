import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

let activePopover = null

export default function ListHoverPopover({
  id,
  icon: Icon,
  items = [],
  title,
  isRTL = false,
  formatValue,
  emptyTitle,
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0, align: 'start' })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const closeTimer = useRef(null)
  const instanceRef = useRef({ close: () => {} })
  const hasItems = Array.isArray(items) && items.length > 0

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const closePanel = () => {
    clearCloseTimer()
    setOpen(false)
    if (activePopover === instanceRef.current) {
      activePopover = null
    }
  }

  instanceRef.current.close = closePanel

  const updatePosition = () => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const panelWidth = panel?.offsetWidth || 280
    const panelHeight = panel?.offsetHeight || 220
    const margin = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let align = isRTL ? 'end' : 'start'
    let left = isRTL ? rect.left - panelWidth - margin : rect.right + margin
    if (left < margin) {
      left = rect.right + margin
      align = 'start'
    }
    if (left + panelWidth > viewportWidth - margin) {
      left = Math.max(margin, rect.left - panelWidth - margin)
      align = 'end'
    }

    let top = rect.top
    if (top + panelHeight > viewportHeight - margin) {
      top = Math.max(margin, viewportHeight - panelHeight - margin)
    }

    setPos({ left, top, align })
  }

  const openPanel = () => {
    if (!hasItems) return
    clearCloseTimer()
    if (activePopover && activePopover !== instanceRef.current) {
      activePopover.close()
    }
    activePopover = instanceRef.current
    updatePosition()
    setOpen(true)
  }

  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => closePanel(), 120)
  }

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open, items, isRTL])

  useEffect(() => {
    if (!open) return undefined

    const onScrollOrResize = () => updatePosition()
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return
      closePanel()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closePanel()
    }

    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => {
    clearCloseTimer()
    if (activePopover === instanceRef.current) activePopover = null
  }, [])

  const countLabel = items.length > 99 ? '99+' : String(items.length)
  const ariaLabel = hasItems
    ? `${title} (${items.length})`
    : (emptyTitle || title)

  return (
    <div className="inline-flex items-center justify-center">
      <button
        ref={triggerRef}
        type="button"
        disabled={!hasItems}
        onMouseEnter={() => {
          if (window.matchMedia('(hover: hover)').matches) openPanel()
        }}
        onMouseLeave={() => {
          if (window.matchMedia('(hover: hover)').matches) scheduleClose()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!hasItems) return
          if (window.matchMedia('(hover: hover)').matches) return
          if (open) closePanel()
          else openPanel()
        }}
        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          hasItems
            ? 'text-blue-600 hover:bg-blue-500/10 dark:text-blue-400'
            : 'text-slate-400/70 cursor-default dark:text-slate-500'
        }`}
        aria-label={ariaLabel}
        title={hasItems ? undefined : ariaLabel}
      >
        <Icon size={16} strokeWidth={2.1} />
        {hasItems && (
          <span className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-[10px] leading-4 font-semibold text-white text-center">
            {countLabel}
          </span>
        )}
      </button>

      {open && hasItems && createPortal(
        <div
          ref={panelRef}
          data-popover-id={id || title}
          className="fixed z-[10000] w-[280px] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
          style={{ left: pos.left, top: pos.top }}
          dir={isRTL ? 'rtl' : 'ltr'}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </div>
            <div className="text-[10px] text-slate-400">
              {isRTL ? `${items.length} عنصر` : `${items.length} items`}
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto overscroll-contain py-1">
            {items.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="flex items-start justify-between gap-3 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <span className="min-w-0 font-medium text-slate-700 dark:text-slate-100 break-words">
                  {item.label}
                </span>
                {typeof (item.value ?? item.revenue) === 'number' && formatValue && (
                  <span className="shrink-0 font-mono text-slate-500 dark:text-slate-300" dir="ltr">
                    {formatValue(item.value ?? item.revenue)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
