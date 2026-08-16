import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as LucideIcons from 'lucide-react'
import { FaSearch, FaTimes, FaChevronDown } from 'react-icons/fa'

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  isRTL,
  icon: Icon,
  multiple = false,
  className = '',
  showAllOption = true,
  dropdownZIndex = 20050,
  placement = 'auto',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 })
  const wrapperRef = useRef(null)
  const dropdownRef = useRef(null)
  const rafRef = useRef(null)

  const updatePosition = () => {
    if (!wrapperRef.current) return

    const rect = wrapperRef.current.getBoundingClientRect()
    const margin = 8
    const gap = 4
    const viewportWidth = window.innerWidth || 0
    const viewportHeight = window.innerHeight || 0

    let width = rect.width
    if (width > viewportWidth - margin * 2) {
      width = Math.max(0, viewportWidth - margin * 2)
    }

    let left = rect.left
    left = Math.min(Math.max(left, margin), Math.max(margin, viewportWidth - width - margin))

    const estimatedHeight = 280
    const dropdownHeight = dropdownRef.current?.getBoundingClientRect?.().height || estimatedHeight

    const belowTop = rect.bottom + gap
    const belowSpace = Math.max(0, viewportHeight - margin - belowTop)

    const aboveBottom = rect.top - gap
    const aboveSpace = Math.max(0, aboveBottom - margin)

    const clampMaxHeight = (h) => Math.max(0, Math.min(280, h))
    const minUsableHeight = 160

    const wantTop = placement === 'top'
    const wantBottom = placement === 'bottom'

    let openDirection = 'bottom'
    if (wantTop) openDirection = 'top'
    else if (wantBottom) openDirection = 'bottom'
    else if (belowSpace >= minUsableHeight) openDirection = 'bottom'
    else if (aboveSpace >= minUsableHeight) openDirection = 'top'
    else openDirection = belowSpace >= aboveSpace ? 'bottom' : 'top'

    let top = belowTop
    let maxHeight = clampMaxHeight(belowSpace)

    if (openDirection === 'top') {
      maxHeight = clampMaxHeight(aboveSpace)
      top = rect.top - gap - Math.min(dropdownHeight, maxHeight || dropdownHeight)
    }

    const maxTop = Math.max(margin, viewportHeight - margin - Math.max(0, maxHeight))
    top = Math.min(Math.max(top, margin), maxTop)

    setCoords({ top, left, width, maxHeight })
  }

  const renderIcon = (icon) => {
    if (!icon) return null
    if (typeof icon !== 'string') return icon
    const LucideIcon = LucideIcons[icon]
    if (LucideIcon) return <LucideIcon size={14} />
    return icon
  }

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedWrapper = wrapperRef.current && wrapperRef.current.contains(event.target)
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(event.target)
      if (!clickedWrapper && !clickedDropdown) {
        setIsOpen(false)
      }
    }

    function handleScroll(event) {
      if (!isOpen) return

      const target = event?.target
      const insideDropdown =
        target && dropdownRef.current && (dropdownRef.current === target || dropdownRef.current.contains(target))

      if (insideDropdown) return

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => updatePosition())
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isOpen])

  const toggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true)
      updatePosition()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => updatePosition())
      return
    }

    setIsOpen(false)
  }

  const getOptionValue = (opt) => (typeof opt === 'object' && opt !== null && 'value' in opt ? opt.value : opt)
  const getOptionLabel = (opt) => (typeof opt === 'object' && opt !== null && 'label' in opt ? opt.label : String(opt))
  const normalizeComparableValue = (val) => (val === undefined || val === null ? '' : String(val))

  const allSentinelValues = new Set(['', 'all', 'All', 'الكل'])
  const hasEmbeddedAllOption = (options || []).some((opt) =>
    allSentinelValues.has(normalizeComparableValue(getOptionValue(opt)))
  )
  const shouldRenderBuiltInAllOption = showAllOption && !hasEmbeddedAllOption

  const filteredOptions = (options || []).filter((opt) => {
    if (!opt) return false
    return String(getOptionLabel(opt)).toLowerCase().includes(search.toLowerCase())
  })

  const isSelected = (opt) => {
    const val = getOptionValue(opt)
    return multiple
      ? Array.isArray(value) &&
          value.some((selectedValue) => normalizeComparableValue(selectedValue) === normalizeComparableValue(val))
      : normalizeComparableValue(value) === normalizeComparableValue(val)
  }

  const clearValue = () => (multiple ? onChange([]) : onChange(''))

  const allOptionValues =
    multiple && shouldRenderBuiltInAllOption
      ? Array.from(
          new Set((options || []).map(getOptionValue).filter((v) => v !== undefined && v !== null && v !== ''))
        )
      : []

  const allSelected =
    multiple &&
    shouldRenderBuiltInAllOption &&
    Array.isArray(value) &&
    allOptionValues.length > 0 &&
    allOptionValues.every((v) =>
      value.some((selectedValue) => normalizeComparableValue(selectedValue) === normalizeComparableValue(v))
    )

  const isSingleAllValue = !multiple && allSentinelValues.has(normalizeComparableValue(value))

  const isEmpty = multiple
    ? !Array.isArray(value) || value.length === 0 || (shouldRenderBuiltInAllOption && allSelected)
    : !value || isSingleAllValue

  const getDisplayValue = () => {
    if (multiple) {
      if (shouldRenderBuiltInAllOption && allSelected) return isRTL ? 'الكل' : 'All'

      if (Array.isArray(value) && value.length > 0) {
        return value
          .map((v) => {
            const opt = (options || []).find(
              (o) => normalizeComparableValue(getOptionValue(o)) === normalizeComparableValue(v)
            )
            return opt ? getOptionLabel(opt) : v
          })
          .join(', ')
      }

      return placeholder || (shouldRenderBuiltInAllOption ? (isRTL ? 'الكل' : 'All') : '')
    }

    if (!value) {
      return placeholder || (shouldRenderBuiltInAllOption ? (isRTL ? 'الكل' : 'All') : '')
    }

    const opt = (options || []).find(
      (o) => normalizeComparableValue(getOptionValue(o)) === normalizeComparableValue(value)
    )

    return opt ? getOptionLabel(opt) : value
  }

  const dropdownContent = (
    <div
      ref={dropdownRef}
      data-searchable-select-dropdown="true"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        zIndex: dropdownZIndex,
        maxHeight: coords.maxHeight,
      }}
      className="rounded-xl shadow-xl bg-[var(--card-bg)] border border-[var(--panel-border)] backdrop-blur-md overflow-hidden flex flex-col"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="p-2 border-b border-[var(--panel-border)]/70">
        <div className="relative">
          <FaSearch
            className={`absolute top-1/2 -translate-y-1/2 text-[var(--theme-text)] ${isRTL ? 'right-3' : 'left-3'}`}
            size={12}
          />
          <input
            autoFocus
            type="text"
            className={`input input-sm w-full bg-[var(--app-bg)] border border-[var(--panel-border)]/80 text-sm ${isRTL ? 'pr-8 pl-2' : 'pl-8 pr-2'} text-[var(--theme-text)] placeholder-slate-500 dark:placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-[var(--nova-accent)]`}
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <div className="overflow-y-auto py-1 scrollbar-thin-blue" style={{ maxHeight: Math.max(0, coords.maxHeight - 58) }}>
        {shouldRenderBuiltInAllOption && (
          <div
            className={`mx-1 rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${(!multiple && value === '') || (multiple && allSelected) ? 'bg-[rgba(37,99,235,0.28)] text-white' : 'text-[var(--theme-text)] hover:bg-[rgba(37,99,235,0.18)]'}`}
            onClick={() => {
              if (multiple) {
                onChange(allSelected ? [] : allOptionValues)
              } else {
                clearValue()
              }
              setIsOpen(false)
              setSearch('')
            }}
          >
            {isRTL ? 'الكل' : 'All'}
          </div>
        )}

        {filteredOptions.length > 0 ? (
          filteredOptions.map((opt, idx) => {
            const labelValue = getOptionLabel(opt)
            const val = getOptionValue(opt)
            const color = typeof opt === 'object' && opt !== null && 'color' in opt ? opt.color : null
            const iconValue = typeof opt === 'object' && opt !== null && 'icon' in opt ? opt.icon : null

            const disabled = typeof opt === 'object' && opt !== null && Boolean(opt.disabled)

            return (
              <div
                key={idx}
                className={`mx-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                  disabled
                    ? 'cursor-not-allowed opacity-50 text-[var(--muted-text)]'
                    : `cursor-pointer ${isSelected(opt) ? 'bg-[rgba(37,99,235,0.28)] text-white' : 'text-[var(--theme-text)] hover:bg-[rgba(37,99,235,0.18)]'}`
                }`}
                onClick={() => {
                  if (disabled) return
                  if (multiple) {
                    const current = Array.isArray(value) ? value : []
                    const exists = current.some(
                      (v) => normalizeComparableValue(v) === normalizeComparableValue(val)
                    )
                    const next = exists
                      ? current.filter((v) => normalizeComparableValue(v) !== normalizeComparableValue(val))
                      : [...current, val]
                    onChange(next)
                  } else {
                    onChange(val)
                    setIsOpen(false)
                  }
                  setSearch('')
                }}
              >
                <div className="flex items-center gap-2">
                  {iconValue && <span className="shrink-0">{renderIcon(iconValue)}</span>}
                  {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }}></span>}
                  {labelValue}
                </div>
              </div>
            )
          })
        ) : (
          <div className="px-3 py-4 text-center text-sm text-[var(--muted-text)]">
            {isRTL ? 'لا توجد نتائج' : 'No results found'}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className={`relative ${isOpen ? 'z-50' : ''}`} ref={wrapperRef}>
      <div
        className={`input w-full flex items-center justify-between cursor-pointer bg-[var(--card-bg)] border border-[var(--panel-border)] text-[var(--theme-text)] ${className}`}
        onClick={toggleOpen}
      >
        <span className={`text-sm ${isEmpty ? 'text-[var(--muted-text)] opacity-100' : 'text-[var(--theme-text)]'}`}>
          {getDisplayValue()}
        </span>
        <div className="flex items-center gap-2">
          {((!multiple && value && !isSingleAllValue) || (multiple && Array.isArray(value) && value.length > 0)) ? (
            <FaTimes
              className="text-[var(--theme-text)] hover:text-red-500 z-10"
              size={12}
              onClick={(e) => {
                e.stopPropagation()
                clearValue()
              }}
            />
          ) : null}
          <FaChevronDown className={`text-[var(--theme-text)] transition-transform ${isOpen ? 'rotate-180' : ''}`} size={10} />
        </div>
      </div>

      {isOpen && createPortal(dropdownContent, document.body)}
    </div>
  )
}
