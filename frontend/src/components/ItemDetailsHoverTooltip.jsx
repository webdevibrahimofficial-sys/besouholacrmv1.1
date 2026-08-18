import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const TOOLTIP_WIDTH = 360
const TWO_ITEMS_MAX_HEIGHT = 216

const parseMoney = (value) => parseFloat(String(value ?? '').replace(/,/g, '')) || 0

export default function ItemDetailsHoverTooltip({
  children,
  detailRows = [],
  totalValue = 0,
  summary = '',
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const closeTimer = useRef(null)

  const rows = Array.isArray(detailRows) ? detailRows : []
  const needsScroll = rows.length > 2

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setOpen(false), 140)
  }

  const positionTooltip = () => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const tooltipHeight = tooltip?.offsetHeight || (needsScroll ? TWO_ITEMS_MAX_HEIGHT + 72 : rows.length * 150 + 56)
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const placeAbove = spaceBelow < tooltipHeight && spaceAbove > spaceBelow

    let left = rect.left
    if (left + TOOLTIP_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - TOOLTIP_WIDTH - 8)
    }
    if (left < 8) left = 8

    let top = placeAbove ? rect.top - tooltipHeight - 4 : rect.bottom + 4
    if (top < 8) top = 8
    if (top + tooltipHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - tooltipHeight - 8)
    }

    setCoords({ top, left })
  }

  const showTooltip = () => {
    clearClose()
    const trigger = triggerRef.current
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      setCoords({ top: rect.bottom + 4, left: Math.max(8, rect.left) })
    }
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    positionTooltip()
  }, [open, rows.length, needsScroll, totalValue])

  useEffect(() => {
    if (!open) return
    const onReposition = () => positionTooltip()
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, rows.length, needsScroll])

  useEffect(() => () => clearClose(), [])

  if (rows.length === 0) {
    return children
  }

  const tooltip = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-[360px] max-w-[calc(100vw-16px)]"
          style={{ top: coords.top, left: coords.left }}
          onMouseEnter={showTooltip}
          onMouseLeave={scheduleClose}
        >
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-slate-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-white">
            <div className={needsScroll ? 'max-h-[13.5rem] overflow-y-auto overscroll-contain pr-1' : undefined}>
              {rows.map((row, index) => (
                <div
                  key={`${row.name}-${index}`}
                  className={index > 0 ? 'mt-2 border-t border-gray-200 pt-2 dark:border-gray-700' : ''}
                >
                  <div className="font-semibold">{row.name}</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <span>Category: {row.category}</span>
                    <span>Qty: {row.quantity}</span>
                    <span>Amount: {row.amount.toLocaleString()} EGP</span>
                    <span>Discount: {row.discount.toLocaleString()} EGP</span>
                    <span className="col-span-2">
                      Add-ons: {Array.isArray(row.addons) && row.addons.length > 0
                        ? row.addons.map((addon) => `${addon?.name || '-'} x${addon?.quantity || 0} (${parseMoney(addon?.total || (parseMoney(addon?.quantity) * parseMoney(addon?.price))).toLocaleString()} EGP)`).join(', ')
                        : '-'}
                    </span>
                    <span>Add-ons Amount: {Number(row.addonsTotal || 0).toLocaleString()} EGP</span>
                    <span className="font-semibold">Sub Total: {Number(row.subTotal || 0).toLocaleString()} EGP</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-gray-200 pt-2 font-semibold dark:border-gray-700">
              Total: {Number(totalValue || 0).toLocaleString()} EGP
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex max-w-[220px] truncate"
        aria-label={summary || undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleClose}
      >
        {children}
      </span>
      {tooltip}
    </>
  )
}
