import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import "react-datepicker/dist/react-datepicker.css"
import { api } from '../../utils/api'
import { useThemeClasses } from '../../utils/themeClasses'
import { 
  FaFileExport,
  FaShoppingCart, 
  FaEye, 
  FaCheck, 
  FaBan, 
  FaEllipsisV, 
  FaExchangeAlt, 
  FaTrash,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa'
import { 
  Filter, 
  ChevronDown, 
  Search, 
  User, 
  DollarSign, 
  Calendar 
} from 'lucide-react'

import SearchableSelect from '../../components/SearchableSelect'
import DateRangePicker from '../../shared/components/DateRangePicker'
import RequestPreviewModal from '../../components/RequestPreviewModal'
import { useAppState } from '../../shared/context/AppStateProvider'
import { pickLeadAddressFields } from '../../shared/utils/leadToCustomerFields'
import { CATEGORY_TYPE_PRODUCTS, CATEGORY_TYPE_SERVICES, normalizeCategoryType } from '../../features/inventory/categoryType'

const CURRENCY_SYMBOLS = {
  EGP: 'E£', USD: '$', SAR: 'SAR', AED: 'AED',
}
const getCurrencySymbol = (code) =>
  CURRENCY_SYMBOLS[String(code || '').trim().toUpperCase()] || code || '$'

const getUniqueTextList = (values = []) =>
  [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))]

const normalizeRequestStageType = (value) => {
  const token = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['closing_deal', 'closing_deals', 'closing', 'deal', 'closed'].includes(token)) return 'closing_deal'
  if (['reservation', 'booking', 'reserved'].includes(token)) return 'reservation'
  return ''
}

const isServiceRequestLine = (row) => {
  const token = String(row?.type || row?.itemType || row?.business_type || row?.category_type || '').toLowerCase()
  return token.includes('service')
}

const toLocalDateKey = (value) => {
  if (!value) return ''
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const hasFilledFilter = (value) => String(value ?? '').trim() !== ''

const formatAddonPeriodLabel = (period, isRTL) => {
  const option = String(period || '').trim()
  if (!option) return ''
  if (!isRTL) return option
  if (option === 'Monthly') return 'شهري'
  if (option === 'Quarterly') return 'ربع سنوي'
  if (option === 'Semi-annual' || option === 'Semi Annually') return 'نصف سنوي'
  if (option === 'Annually') return 'سنوي'
  if (option === 'One-time') return 'مرة واحدة'
  if (option === 'Subscription') return 'اشتراك'
  return option
}

function SmartCellTooltip({ values = [], display, label, isRTL, isLight, className = '' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const [placeAbove, setPlaceAbove] = useState(false)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const closeTimer = useRef(null)
  const items = getUniqueTextList(values)
  const text = display || items.join(', ') || '-'

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const positionTooltip = () => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = tooltip?.offsetWidth || 240
    const height = tooltip?.offsetHeight || 88
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const above = spaceBelow < height && rect.top > spaceBelow
    let left = isRTL ? rect.right - width : rect.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    const top = above ? rect.top - height - 10 : rect.bottom + 10
    setPlaceAbove(above)
    setCoords({ top, left })
  }

  const showTooltip = () => {
    if (items.length === 0 || text === '-') return
    clearClose()
    const trigger = triggerRef.current
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      setCoords({ top: rect.bottom + 10, left: rect.left })
    }
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    positionTooltip()
  }, [open, items.length, isRTL])

  useEffect(() => {
    if (!open) return
    const onReposition = () => positionTooltip()
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, items.length, isRTL])

  useEffect(() => () => clearClose(), [])

  const tooltip = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{ top: coords.top, left: coords.left }}
        >
          <div
            className={`relative min-w-[180px] max-w-[280px] rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur-md ${
              isLight
                ? 'border-slate-200/80 bg-white/95 text-slate-800'
                : 'border-slate-700/80 bg-slate-900/95 text-slate-100'
            }`}
          >
            <div
              className={`absolute start-5 h-2.5 w-2.5 rotate-45 border ${
                placeAbove
                  ? `bottom-[-5px] ${isLight ? 'border-r border-b border-slate-200/80 bg-white/95' : 'border-r border-b border-slate-700/80 bg-slate-900/95'}`
                  : `top-[-5px] ${isLight ? 'border-l border-t border-slate-200/80 bg-white/95' : 'border-l border-t border-slate-700/80 bg-slate-900/95'}`
              }`}
            />
            {label && (
              <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                {label}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {items.map((value) => (
                <span
                  key={value}
                  className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isLight ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/15 text-blue-300'
                  }`}
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div
        ref={triggerRef}
        className={`max-w-full truncate cursor-default ${className}`}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleClose}
        onFocus={showTooltip}
        onBlur={scheduleClose}
        tabIndex={items.length > 0 && text !== '-' ? 0 : undefined}
      >
        {text}
      </div>
      {tooltip}
    </>
  )
}

export default function RequestsPage() {
  const { t, i18n } = useTranslation()
  const th = useThemeClasses()
  const { isLight } = th
  const isRTL = String(i18n.language || '').startsWith('ar')

  const { user, crmSettings } = useAppState()
  const currencySymbol = getCurrencySymbol(
    crmSettings?.defaultCurrency || crmSettings?.default_currency || '$'
  )

  const modulePermissions = (user?.meta_data && user.meta_data.module_permissions) || {}
  const hasExplicitInventoryPerms = Object.prototype.hasOwnProperty.call(modulePermissions, 'Inventory')
  const inventoryModulePerms = hasExplicitInventoryPerms && Array.isArray(modulePermissions.Inventory)
    ? modulePermissions.Inventory : []
  const effectiveInventoryPerms = hasExplicitInventoryPerms ? inventoryModulePerms : []
  const roleLower = String(user?.role || '').toLowerCase()
  const isTenantAdmin = roleLower === 'admin' || roleLower === 'tenant admin' || roleLower === 'tenant-admin'
  const canManageRequests =
    effectiveInventoryPerms.includes('showRequests') || user?.is_super_admin || isTenantAdmin

  const stageTypeLabel = (value) => {
    const key = normalizeRequestStageType(value)
    if (key === 'closing_deal') return isRTL ? 'إغلاق صفقة' : 'Closing Deal'
    if (key === 'reservation') return isRTL ? 'حجز' : 'Reservation'
    return isRTL ? '—' : '—'
  }
  const stageTypeBadge = (value) => {
    const key = normalizeRequestStageType(value)
    const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none'
    if (key === 'closing_deal') return `${base} border border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700`
    if (key === 'reservation') return `${base} border border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700`
    return `${base} border border-gray-200 text-[var(--muted-text)]`
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewItem, setPreviewItem] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [usersList, setUsersList] = useState([])
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [selectedAddonByRequestId, setSelectedAddonByRequestId] = useState({})

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        openMenuId &&
        !event.target.closest('.action-menu-dropdown') &&
        !event.target.closest('.action-menu-btn')
      ) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  // ── Filters ───────────────────────────────────────────────────────────────
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({
    item: '', category: '', categoryType: '', status: '',
    dateFrom: '', dateTo: '', createdBy: '',
    salesPerson: '', stageType: '', minTotal: '', maxTotal: '', minQuantity: '', maxQuantity: ''
  })
  const [showAllFilters, setShowAllFilters] = useState(false)

  // ── Pagination & sort ─────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedItems, setSelectedItems] = useState([])

  const formatAmount = (value) => {
    const amount = Number(Number(value || 0).toFixed(2))
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currencySymbol}`
  }
  const getRequestAddons = (item) => Array.isArray(item?.expandedAddons) ? item.expandedAddons : []
  const getSelectedRequestAddon = (item) => {
    const addons = getRequestAddons(item)
    if (addons.length === 0) return null
    const selectedId = selectedAddonByRequestId[item.id]
    return addons.find(addon => String(addon.id) === String(selectedId)) || addons[0]
  }
  const getSelectedRequestAddonAmount = (item) => {
    const addon = getSelectedRequestAddon(item)
    return addon ? Number(addon.totalPrice || 0) : 0
  }
  const getRequestAddonLabel = (item, addon) => {
    const name = String(addon?.name || '').trim()
    const parent = String(addon?.parentName || '').trim()
    const mixed = (Array.isArray(item?.items) ? item.items : []).length > 1
    if (mixed && parent && parent.toLowerCase() !== name.toLowerCase()) return `${parent} · ${name}`
    return name
  }
  const getSelectedRequestAddonQtyOrPeriod = (item) => {
    const addon = getSelectedRequestAddon(item)
    if (!addon) return '—'
    if (addon.isService) return formatAddonPeriodLabel(addon.period, isRTL) || '—'
    const qty = Number(addon.quantity || 0)
    return qty > 0 ? qty : '—'
  }
  const quantityDisplay = (item) => {
    const rows = Array.isArray(item?.items) ? item.items : []
    const hasProduct = rows.some((row) => !isServiceRequestLine(row))
    if (!hasProduct) return '—'
    return item.quantityTotal || 0
  }

  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  // ── Load Data (unchanged business logic) ─────────────────────────────────
  const load = async () => {
    try {
      setLoading(true); setError('')
      const [requestsRes, usersRes, itemsRes] = await Promise.allSettled([
        api.get('/api/inventory-requests'),
        api.get('/api/users?all=1'),
        api.get('/api/items?all=true')
      ])
      if (requestsRes.status !== 'fulfilled') throw requestsRes.reason
      if (usersRes.status !== 'fulfilled') throw usersRes.reason

      const requestsData = requestsRes.value.data
      const usersPayload = usersRes.value.data
      const usersData = Array.isArray(usersPayload)
        ? usersPayload
        : (usersPayload?.data || usersPayload?.users || [])
      const itemsDbData = itemsRes.status === 'fulfilled'
        ? (itemsRes.value.data.data || itemsRes.value.data || []) : []

      if (itemsRes.status !== 'fulfilled')
        console.warn('Optional items enrichment failed:', itemsRes.reason)

      const itemByName = new Map(
        itemsDbData.filter(item => String(item?.name || '').trim() !== '')
          .map(item => [String(item.name).trim().toLowerCase(), item])
      )
      const itemById = new Map(
        itemsDbData.filter(item => item?.id !== undefined && item?.id !== null)
          .map(item => [String(item.id), item])
      )
      const userNameById = new Map(
        usersData.map(u => [String(u?.id), u?.name || u?.full_name || u?.email || `User #${u?.id}`])
      )
      setUsersList(Array.isArray(usersData) ? usersData : [])

      const mappedItems = (requestsData.data || []).map(item => {
        let requestItems = []
        const meta = item.meta_data || {}
        const actionRows = Array.isArray(meta.reservationGeneralItems) ? meta.reservationGeneralItems : null
        const rawRows = actionRows || (Array.isArray(meta.items) ? meta.items : null)
        if (rawRows) {
          requestItems = rawRows.map(reqItem => {
            const matched =
              itemById.get(String(reqItem?.item ?? reqItem?.item_id ?? '')) ||
              itemByName.get(String(reqItem?.name || reqItem?.item_name || '').trim().toLowerCase())
            const finalCategory = matched?.category || reqItem.category || '-'
            const quantity = Number(reqItem?.quantity || 1)
            const price = Number(reqItem?.price ?? matched?.price ?? 0)
            const matchedAddons = Array.isArray(matched?.addons) ? matched.addons : []
            const selectedAddonIds = Array.isArray(reqItem?.addon_ids)
              ? reqItem.addon_ids.map(id => String(id))
              : []
            const addonSource = Array.isArray(reqItem?.addons) && reqItem.addons.length > 0
              ? reqItem.addons
              : selectedAddonIds.length > 0
                ? matchedAddons.filter(addon => selectedAddonIds.includes(String(addon?.id ?? addon?.addon_id)))
                : []
            return {
              ...reqItem,
              name: reqItem?.name || reqItem?.item_name || matched?.name || item.product || '',
              quantity,
              price,
              type: normalizeCategoryType(
                reqItem.business_type || reqItem.type || matched?.category_type || matched?.type
              ) || reqItem.business_type || reqItem.type || '-',
              itemType: reqItem.item_type || reqItem.itemType || matched?.item_type || matched?.itemType || '-',
              category: reqItem?.category_name || (typeof finalCategory === 'object' ? finalCategory?.name || '-' : finalCategory),
              addons: addonSource.map(a => {
                const catalog = matchedAddons.find(addon =>
                  String(addon?.id ?? addon?.addon_id) === String(a?.id ?? a?.addon_id)
                )
                return {
                  id: a?.id ?? a?.addon_id,
                  addon_id: a?.addon_id ?? a?.id,
                  name: a?.name || catalog?.name || '',
                  quantity: Number(a?.quantity || 0),
                  price: Number(a?.price ?? catalog?.price ?? 0),
                  period: String(a?.period || catalog?.period || '').trim(),
                }
              })
            }
          })
        } else if (item.product) {
          const matchedItem = itemByName.get(String(item.product || '').trim().toLowerCase())
          const finalCategory = matchedItem?.category || '-'
          requestItems = [{
            id: 1, name: item.product,
            type: normalizeCategoryType(matchedItem?.category_type || matchedItem?.type) || matchedItem?.type || '-',
            itemType: matchedItem?.item_type || matchedItem?.itemType || '-',
            category: typeof finalCategory === 'object' ? finalCategory?.name || '-' : finalCategory,
            quantity: item.quantity || 0, price: item.meta_data?.price || 0,
            addons: [],
          }]
        }

        const itemNames = getUniqueTextList(requestItems.map(r => r.name))
        const categoryNames = getUniqueTextList(requestItems.map(r => r.category))
        const categoryTypes = getUniqueTextList(requestItems.map(r => r.type))
        const itemTypes = getUniqueTextList(requestItems.map(r => r.itemType))
        const totalQuantity = requestItems.reduce((s, r) => (
          isServiceRequestLine(r) ? s : s + Number(r.quantity || 0)
        ), 0)
        const baseItemsPrice = requestItems.reduce((s, r) => {
          const price = Number(r.price || 0)
          if (isServiceRequestLine(r)) return s + price
          return s + Number(r.quantity || 0) * price
        }, 0)

        const expandedAddons = requestItems.flatMap((r, rowIndex) => {
          const service = isServiceRequestLine(r)
          const parentName = String(r.name || '').trim()
          return (Array.isArray(r.addons) ? r.addons : [])
            .filter(a => String(a?.name || '').trim() !== '')
            .map((a, addonIndex) => {
              const qty = service ? 0 : Number(a.quantity || 0) * Number(r.quantity || 0)
              const price = Number(a.price || 0)
              return {
                id: `${rowIndex}-${a.id ?? a.addon_id ?? addonIndex}`,
                name: String(a.name).trim(),
                parentName,
                isService: service,
                quantity: qty,
                period: String(a.period || '').trim(),
                price,
                totalPrice: service ? price : qty * price,
              }
            })
        })

        const addonNames = getUniqueTextList(expandedAddons.map(a => a.name))
        const addonsTotalQty = expandedAddons.reduce((s, a) => (
          a.isService ? s : s + Number(a.quantity || 0)
        ), 0)
        const addonsQtyPeriodDisplay = expandedAddons.map(a => (
          a.isService
            ? (formatAddonPeriodLabel(a.period, isRTL) || '—')
            : String(Number(a.quantity || 0))
        )).join('; ')
        const addonsTotalPrice = expandedAddons.reduce((s, a) => s + Number(a.totalPrice || 0), 0)
        const salesPersonId = String(
          item.assigned_to
          || meta.assigned_to_id
          || meta.assigned_to
          || ''
        ).trim()
        const createdById = String(
          meta.created_by_id
          || item.created_by
          || item.created_by_id
          || ''
        ).trim()
        const resolvedSalesPerson = userNameById.get(salesPersonId)
          || item.assigned_to_name
          || meta.assigned_to_name
          || (salesPersonId && !userNameById.has(salesPersonId) ? salesPersonId : '')
          || '-'
        const resolvedCreatedBy = userNameById.get(createdById)
          || meta.created_by_name
          || item.created_by_name
          || '-'
        const explicitTotal = Number(
          meta.line_total ??
          meta.reservationAmount ??
          meta.reservation_amount ??
          meta.total_amount ??
          meta.total ??
          item.amount ??
          0
        )

        return {
          ...item,
          customerCode: item.customer_name, customerName: item.customer_name,
          customerPhone: item.meta_data?.customer_phone || '',
          items: requestItems,
          itemNames, itemNamesDisplay: itemNames.join(', ') || '-',
          categoryNames, categoryNamesDisplay: categoryNames.join(', ') || '-',
          categoryTypes, categoryTypesDisplay: categoryTypes.join(', ') || '-',
          itemTypes, itemTypesDisplay: itemTypes.join(', ') || '-',
          quantityTotal: totalQuantity, itemsPriceTotal: baseItemsPrice,
          addonsNames: addonNames, addonsNamesDisplay: addonNames.join(', ') || '-',
          expandedAddons,
          addonsTotalQuantity: addonsTotalQty,
          addonsQtyPeriodDisplay,
          addonsTotalPrice,
          total: explicitTotal || baseItemsPrice + addonsTotalPrice,
          notes: item.description, salesPerson: resolvedSalesPerson,
          salesPersonId,
          createdBy: resolvedCreatedBy,
          createdById,
          orderBy: resolvedCreatedBy,
          createdAt: item.created_at || new Date().toISOString(),
          stageType: normalizeRequestStageType(
            item.stage_type
            || meta.stage_type
            || meta.source_action_type
            || meta.general_inventory?.stage_type
          ),
        }
      })
      setItems(mappedItems)
    } catch (e) {
      console.error(e); setError('Failed to load requests'); setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [q, filters])

  // ── Derived filter options ─────────────────────────────────────────────────
  const itemOptions = useMemo(() =>
    getUniqueTextList(items.flatMap(r => r.itemNames || [])).filter(n => n !== '-').map(n => ({ value: n, label: n })), [items])
  const categoryOptions = useMemo(() =>
    getUniqueTextList(items.flatMap(r => r.categoryNames || [])).filter(n => n !== '-').map(n => ({ value: n, label: n })), [items])
  const categoryTypeOptions = useMemo(() => ([
    { value: CATEGORY_TYPE_PRODUCTS, label: isRTL ? 'منتجات' : 'Products' },
    { value: CATEGORY_TYPE_SERVICES, label: isRTL ? 'خدمات' : 'Services' },
  ]), [isRTL])
  const statusOptions = useMemo(() => ([
    { value: 'Pending', label: isRTL ? 'قيد الانتظار' : 'Pending' },
    { value: 'Approved', label: isRTL ? 'موافق عليه' : 'Approved' },
    { value: 'Rejected', label: isRTL ? 'مرفوض' : 'Rejected' },
    { value: 'Converted', label: isRTL ? 'محوّل' : 'Converted' },
  ]), [isRTL])
  const stageTypeOptions = useMemo(() => ([
    { value: 'reservation', label: isRTL ? 'حجز' : 'Reservation' },
    { value: 'closing_deal', label: isRTL ? 'إغلاق صفقة' : 'Closing Deal' },
  ]), [isRTL])
  const tenantUserOptions = useMemo(() => {
    return [...usersList]
      .map((u) => ({
        value: String(u?.id ?? ''),
        label: String(u?.name || u?.full_name || u?.email || '').trim() || `User #${u?.id}`,
      }))
      .filter((opt) => opt.value)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [usersList])
  const createdByOptions = tenantUserOptions
  const salesPersonOptions = tenantUserOptions

  const filteredItems = useMemo(() => items.filter(item => {
    if (q) {
      const query = q.toLowerCase().trim()
      const paddedId = String(item.id || '').padStart(4, '0')
      const match =
        String(item.id || '').toLowerCase().includes(query) ||
        paddedId.toLowerCase().includes(query) ||
        String(item.customerCode || '').toLowerCase().includes(query) ||
        String(item.customerName || '').toLowerCase().includes(query) ||
        String(item.customerPhone || '').toLowerCase().includes(query) ||
        String(item.itemNamesDisplay || '').toLowerCase().includes(query) ||
        String(item.categoryNamesDisplay || '').toLowerCase().includes(query) ||
        String(item.categoryTypesDisplay || '').toLowerCase().includes(query) ||
        String(item.addonsNamesDisplay || '').toLowerCase().includes(query) ||
        String(item.salesPerson || '').toLowerCase().includes(query) ||
        String(item.orderBy || '').toLowerCase().includes(query) ||
        String(item.status || '').toLowerCase().includes(query) ||
        String(item.notes || '').toLowerCase().includes(query) ||
        String(item.stageType || '').toLowerCase().includes(query) ||
        String(stageTypeLabel(item.stageType) || '').toLowerCase().includes(query) ||
        ({
          Pending: 'pending قيد الانتظار',
          Approved: 'approved موافق عليه',
          Rejected: 'rejected مرفوض',
          Converted: 'converted محول محوّل',
        }[item.status] || '').includes(query) ||
        (item.categoryTypes || []).some((type) => {
          const normalized = normalizeCategoryType(type)
          if (normalized === CATEGORY_TYPE_PRODUCTS) return 'products منتجات'.includes(query)
          if (normalized === CATEGORY_TYPE_SERVICES) return 'services خدمات'.includes(query)
          return String(type || '').toLowerCase().includes(query)
        })
      if (!match) return false
    }

    const itemDate = toLocalDateKey(item.createdAt)
    if (hasFilledFilter(filters.dateFrom) && itemDate && itemDate < filters.dateFrom) return false
    if (hasFilledFilter(filters.dateTo) && itemDate && itemDate > filters.dateTo) return false
    if ((hasFilledFilter(filters.dateFrom) || hasFilledFilter(filters.dateTo)) && !itemDate) return false

    if (hasFilledFilter(filters.item) && !(item.itemNames || []).includes(filters.item)) return false
    if (hasFilledFilter(filters.category) && !(item.categoryNames || []).includes(filters.category)) return false

    if (hasFilledFilter(filters.categoryType)) {
      const wanted = normalizeCategoryType(filters.categoryType) || filters.categoryType
      const types = (item.categoryTypes || [])
        .map((type) => normalizeCategoryType(type) || type)
        .filter(Boolean)
      if (!types.includes(wanted)) return false
    }

    if (hasFilledFilter(filters.createdBy)) {
      const wanted = String(filters.createdBy)
      const wantedName = tenantUserOptions.find(opt => opt.value === wanted)?.label
      const matches = String(item.createdById || '') === wanted
        || (wantedName && item.createdBy === wantedName)
      if (!matches) return false
    }
    if (hasFilledFilter(filters.salesPerson)) {
      const wanted = String(filters.salesPerson)
      const wantedName = tenantUserOptions.find(opt => opt.value === wanted)?.label
      const matches = String(item.salesPersonId || '') === wanted
        || (wantedName && item.salesPerson === wantedName)
      if (!matches) return false
    }
    if (hasFilledFilter(filters.status) && String(item.status || '') !== String(filters.status)) return false
    if (hasFilledFilter(filters.stageType) && item.stageType !== filters.stageType) return false

    if (hasFilledFilter(filters.minTotal) && Number(item.total || 0) < Number(filters.minTotal)) return false
    if (hasFilledFilter(filters.maxTotal) && Number(item.total || 0) > Number(filters.maxTotal)) return false

    if (hasFilledFilter(filters.minQuantity) || hasFilledFilter(filters.maxQuantity)) {
      const hasProduct = (Array.isArray(item.items) ? item.items : []).some((row) => !isServiceRequestLine(row))
      if (!hasProduct) return false
      const qty = Number(item.quantityTotal || 0)
      if (hasFilledFilter(filters.minQuantity) && qty < Number(filters.minQuantity)) return false
      if (hasFilledFilter(filters.maxQuantity) && qty > Number(filters.maxQuantity)) return false
    }

    return true
  }), [items, q, filters, isRTL, tenantUserOptions])

  const paginatedItems = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy]
      if (av === bv) return 0
      return sortOrder === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
    return sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  }, [filteredItems, sortBy, sortOrder, currentPage, itemsPerPage])

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('desc') }
  }
  const handleSelectAll = (e) =>
    setSelectedItems(e.target.checked ? paginatedItems.map(i => i.id) : [])
  const handleSelectRow = (id) =>
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const handleApprove = async (id) => {
    if (!window.confirm(isRTL ? 'هل أنت متأكد من الموافقة على هذا الطلب؟' : 'Are you sure you want to approve this request?')) return
    try {
      await api.put(`/api/inventory-requests/${id}`, { status: 'Approved' })
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Approved' } : i))
      showSuccess(isRTL ? 'تمت الموافقة على الطلب بنجاح' : 'Request approved successfully')
    } catch (e) { console.error(e); alert('Failed to approve request') }
  }

  const handleReject = async (id) => {
    if (!window.confirm(isRTL ? 'هل أنت متأكد من رفض هذا الطلب؟' : 'Are you sure you want to reject this request?')) return
    try {
      await api.put(`/api/inventory-requests/${id}`, { status: 'Rejected' })
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Rejected' } : i))
      showSuccess(isRTL ? 'تم رفض الطلب بنجاح' : 'Request rejected successfully')
    } catch (e) { console.error(e); alert('Failed to reject request') }
  }

  const handleDelete = async (id) => {
    if (!canManageRequests) {
      alert(isRTL ? 'لا تملك صلاحية حذف الطلبات' : 'You do not have permission to delete requests')
      return
    }
    if (!window.confirm(isRTL ? 'هل أنت متأكد من حذف هذا الطلب؟' : 'Are you sure you want to delete this request?')) return
    try {
      await api.delete(`/api/inventory-requests/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
      showSuccess(isRTL ? 'تم حذف الطلب بنجاح' : 'Request deleted successfully')
    } catch (e) { console.error(e); alert('Failed to delete request') }
  }

  const handleConvertToQuotation = async (item) => {
    if (!window.confirm(isRTL ? 'هل تريد تحويل هذا الطلب إلى عرض سعر؟' : 'Convert this request to quotation?')) return
    try {
      setLoading(true)
      let customerId = null
      try {
        const searchName = String(item.customerName || '').trim()
        const { data: customersData } = await api.get('/api/customers', { params: { q: searchName, per_page: 1 } })
        const existing = Array.isArray(customersData?.data)
          ? (customersData.data[0] || null)
          : (Array.isArray(customersData) ? (customersData[0] || null) : null)
        if (existing) {
          customerId = String(existing.id)
        } else {
          let phone = String(item.customerPhone || '').trim()
          if (!phone) {
            const v = window.prompt(isRTL ? 'رقم هاتف العميل مطلوب. ادخل رقم الهاتف:' : 'Customer phone is required. Enter phone:')
            phone = String(v || '').trim()
          }
          if (!phone) { alert(isRTL ? 'تم إلغاء التحويل' : 'Conversion canceled'); setLoading(false); return }
          let leadEmail = '', leadAssignedTo = null, leadId = null, leadSource = ''
          let leadCountry = '', leadCity = '', leadAddressLine = ''
          const meta = item.meta_data || item.metaData || {}
          const requestLeadId = meta.lead_id || meta.leadId || item.lead_id || item.leadId || null
          try {
            const lr = await api.get('/api/leads', { params: { q: phone, per_page: 1 } })
            const lf = Array.isArray(lr?.data?.data) ? (lr.data.data[0] || null) : (Array.isArray(lr?.data) ? (lr.data[0] || null) : null)
            leadEmail = String(lf?.email || '').trim()
            leadAssignedTo = lf?.assigned_to || (typeof lf?.assignedTo === 'object' ? lf.assignedTo?.id : null)
            leadId = lf?.id || requestLeadId || null
            leadSource = String(lf?.source || '').trim()
            const addr = pickLeadAddressFields(lf || {})
            leadCountry = addr.country
            leadCity = addr.city
            leadAddressLine = addr.addressLine
          } catch {
            leadId = requestLeadId || null
          }
          // Prefer original lead/request source — never store "Converted Request" as Source
          const customerSource = String(item.source || leadSource || '').trim() || 'Unknown'
          const nr = await api.post('/api/customers', {
            name: item.customerName, phone, email: leadEmail || undefined,
            assigned_to: leadAssignedTo ? String(leadAssignedTo) : undefined,
            source: customerSource,
            type: 'Individual',
            country: leadCountry || undefined,
            city: leadCity || undefined,
            addressLine: leadAddressLine || undefined,
            notes: `Auto-created from Request ${item.id}`,
            meta_data: {
              created_from: 'inventory_request',
              converted_from_request_id: item.id,
              ...(leadId ? { lead_id: Number(leadId) || leadId } : {}),
            },
          })
          customerId = String(nr.data.id)
        }
      } catch (err) {
        const msg = err?.response?.data?.errors
          ? (isRTL ? 'فشل إنشاء/جلب العميل (بيانات غير مكتملة)' : 'Failed to find/create customer (invalid data)')
          : (isRTL ? 'فشل إنشاء/جلب العميل' : 'Failed to find or create customer')
        alert(msg); setLoading(false); return
      }
      const subtotal = (item.items || []).reduce((a, i) => a + (i.quantity * i.price), 0)
      const tax = subtotal * 0.14
      await api.post('/api/quotations', {
        customer_id: String(customerId || ''), customer_name: item.customerName,
        status: 'Draft', date: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: item.items || [], notes: `Converted from Request ${item.id}. ${item.notes || ''}`,
        subtotal, tax, total: subtotal + tax, sales_person: item.salesPerson || user?.name || '',
        meta_data: { converted_from_request_id: item.id, customer_phone: item.customerPhone }
      })
      await api.put(`/api/inventory-requests/${item.id}`, { status: 'Converted' })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'Converted' } : i))
      showSuccess(isRTL ? 'تم التحويل إلى عرض سعر بنجاح' : 'Converted to Quotation successfully')
    } catch (e) {
      console.error(e)
      const msg = e?.response?.data?.message
        || (e?.response?.data?.errors ? JSON.stringify(e.response.data.errors) : null)
        || (isRTL ? 'فشل التحويل إلى عرض سعر' : 'Failed to convert to quotation')
      alert(msg)
    } finally { setLoading(false) }
  }

  const handleExportSelected = () => {
    const selected = items.filter(i => selectedItems.includes(i.id))
    if (!selected.length) { alert(isRTL ? 'اختر طلبًا واحدًا على الأقل' : 'Select at least one request'); return }
    const L = isRTL
    const header = [L?'رقم الطلب':'Order ID',L?'اسم العميل':'Customer Name',L?'نوع المرحلة':'Stage Type',L?'العناصر':'Items',L?'الكمية':'Quantity',L?'اسم الفئة':'Category Name',L?'نوع الفئة':'Category Type',L?'المبلغ':'Amount',L?'أسماء الإضافات':'Add-ons Name',L?'كمية / فترة الإضافات':'Add-ons Qty / Period',L?'مبلغ الإضافات':'Add-ons Amount',L?'إجمالي المبلغ':'Total Amount',L?'مندوب المبيعات':'Sales Person',L?'بواسطة':'Order By',L?'التاريخ':'Order Date',L?'الحالة':'Status',L?'ملاحظات':'Notes']
    const formatExportAmount = (value) => String(Number(Number(value || 0).toFixed(2)))
    const rows = selected.map(i => [i.id,i.customerName||'',stageTypeLabel(i.stageType),i.itemNamesDisplay||'',quantityDisplay(i),i.categoryNamesDisplay||'',i.categoryTypesDisplay||'',formatExportAmount(i.itemsPriceTotal),i.addonsNamesDisplay||'',i.addonsQtyPeriodDisplay||'',formatExportAmount(i.addonsTotalPrice),formatExportAmount(i.total),i.salesPerson||'',i.orderBy||'',new Date(i.createdAt).toLocaleDateString(),i.status||'',i.notes||''])
    const csv = [header,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `order-requests-${new Date().toISOString().slice(0,10)}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setQ('')
    setFilters({ item:'',category:'',categoryType:'',status:'',dateFrom:'',dateTo:'',createdBy:'',salesPerson:'',stageType:'',minTotal:'',maxTotal:'',minQuantity:'',maxQuantity:'' })
    setShowAllFilters(false)
  }

  // ── Status badge helper ───────────────────────────────────────────────────
  const statusBadge = (status) => {
    if (status === 'Approved')  return 'border border-green-300 text-green-700'
    if (status === 'Converted') return 'border border-purple-300 text-purple-700'
    if (status === 'Rejected')  return 'border border-red-300 text-red-700'
    return 'border border-yellow-300 text-yellow-700'
  }
  const statusBadgeMobile = (status) => {
    if (status === 'Approved')  return 'bg-green-100 text-green-700'
    if (status === 'Converted') return 'bg-purple-100 text-purple-700'
    if (status === 'Rejected')  return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={`p-4 md:p-6 space-y-6 min-h-screen ${th.page}`}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-4 md:p-6 relative mb-6">
        <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-start gap-3">
            <div className="relative flex flex-col items-start gap-1">
              <h1 className={`text-xl md:text-2xl font-bold text-start ${th.title} flex items-center gap-2`}>
                {t('Order Requests')}
                <span className={`text-sm font-normal px-2 py-1 rounded-full ${th.badgeNeutral}`}>
                  {filteredItems.length}
                </span>
              </h1>
              <span aria-hidden="true" className="inline-block h-[2px] w-full rounded bg-gradient-to-r from-blue-500 to-purple-600" />
              <p className={`text-sm mt-1 ${th.muted}`}>
                {isRTL ? 'إدارة طلبات الشراء' : 'Manage your order requests'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {successMessage && (
        <div className="mb-3 p-3 rounded border border-green-300 bg-green-50 text-green-700">{successMessage}</div>
      )}
      {error && (
        <div className="mb-3 p-3 rounded border border-red-300 bg-red-50 text-red-700">{error}</div>
      )}

      {/* Filter Section - Identical structure to SalesQuotations */}
      <div className={`${th.cardGlass} p-4 rounded-xl mb-6`}>
        <div className="flex justify-between items-center mb-3">
          <h2 className={`text-sm font-semibold flex items-center gap-2 ${th.title}`}>
            <Filter className="text-blue-500" size={16} /> {isRTL ? 'تصفية' : 'Filter'}
          </h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setShowAllFilters(prev => !prev)}
              className={`flex items-center gap-1.2 px-2.5 py-1.5 text-[11px] md:text-sm font-medium text-blue-600 ${isLight ? 'bg-blue-50 hover:bg-blue-100 border-blue-100' : 'bg-blue-900/30 hover:bg-blue-900/40 border-blue-800'} rounded-lg transition-all border`}
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <ChevronDown size={14} className={`transform transition-transform ${showAllFilters ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={clearFilters}
              className={`px-2.5 py-1.5 text-[11px] md:text-sm font-medium ${th.muted} hover:text-red-600 ${isLight ? 'hover:bg-red-50' : 'hover:bg-red-900/20'} rounded-lg transition-all`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Search className="text-blue-500" size={10} /> {isRTL ? 'بحث عام' : 'Search'}
            </label>
            <input
              className="input w-full"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={isRTL ? 'ابحث في الطلبات...' : 'Search requests...'}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <FaShoppingCart className="text-blue-500" size={10} /> {isRTL ? 'العنصر' : 'Item'}
            </label>
            <SearchableSelect
              options={itemOptions}
              value={filters.item}
              onChange={(val) => setFilters(prev => ({ ...prev, item: val }))}
              placeholder={isRTL ? 'اختر عنصرا...' : 'Select Item...'}
              isRTL={isRTL}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Filter className="text-blue-500" size={10} /> {isRTL ? 'اسم الفئة' : 'Category Name'}
            </label>
            <SearchableSelect
              options={categoryOptions}
              value={filters.category}
              onChange={(val) => setFilters(prev => ({ ...prev, category: val }))}
              placeholder={isRTL ? 'اختر فئة...' : 'Select Category...'}
              isRTL={isRTL}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Filter className="text-blue-500" size={10} /> {isRTL ? 'نوع الفئة' : 'Category Type'}
            </label>
            <SearchableSelect
              options={categoryTypeOptions}
              value={filters.categoryType}
              onChange={(val) => setFilters(prev => ({ ...prev, categoryType: val }))}
              placeholder={isRTL ? 'اختر نوعا...' : 'Select Type...'}
              isRTL={isRTL}
            />
          </div>
        </div>

        {showAllFilters && (
          <div className="space-y-4 mt-4 pt-4 border-t border-[var(--card-border)]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <User className="text-blue-500" size={10} /> {isRTL ? 'مندوب المبيعات' : 'Sales Person'}
                </label>
                <SearchableSelect
                  options={salesPersonOptions}
                  value={filters.salesPerson}
                  onChange={(val) => setFilters(prev => ({ ...prev, salesPerson: val }))}
                  placeholder={isRTL ? 'اختر...' : 'Select...'}
                  isRTL={isRTL}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <User className="text-blue-500" size={10} /> {isRTL ? 'تم الإنشاء بواسطة' : 'Created By'}
                </label>
                <SearchableSelect
                  options={createdByOptions}
                  value={filters.createdBy}
                  onChange={(val) => setFilters(prev => ({ ...prev, createdBy: val }))}
                  placeholder={isRTL ? 'اختر...' : 'Select...'}
                  isRTL={isRTL}
                />
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <Calendar className="text-blue-500" size={10} /> {isRTL ? 'تاريخ الطلب' : 'Order Date'}
                </label>
                <DateRangePicker
                  from={filters.dateFrom}
                  to={filters.dateTo}
                  onChange={({ from, to }) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }))}
                  isRTL={isRTL}
                  className="input w-full"
                  wrapperClassName="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <FaShoppingCart className="text-blue-500" size={10} /> {isRTL ? 'عدد الكمية' : 'No. of Quantity'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'من' : 'Min'}
                    value={filters.minQuantity}
                    onChange={e => setFilters(prev => ({ ...prev, minQuantity: e.target.value }))}
                  />
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'إلى' : 'Max'}
                    value={filters.maxQuantity}
                    onChange={e => setFilters(prev => ({ ...prev, maxQuantity: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <DollarSign className="text-blue-500" size={10} /> {isRTL ? 'إجمالي المبلغ' : 'Total Amount'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'من' : 'From'}
                    value={filters.minTotal}
                    onChange={e => setFilters(prev => ({ ...prev, minTotal: e.target.value }))}
                  />
                  <input
                    type="number"
                    className="input w-full text-xs"
                    placeholder={isRTL ? 'إلى' : 'To'}
                    value={filters.maxTotal}
                    onChange={e => setFilters(prev => ({ ...prev, maxTotal: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <Filter className="text-blue-500" size={10} /> {isRTL ? 'الحالة' : 'Status'}
                </label>
                <SearchableSelect
                  options={statusOptions}
                  value={filters.status}
                  onChange={(val) => setFilters(prev => ({ ...prev, status: val }))}
                  placeholder={isRTL ? 'اختر حالة...' : 'Select Status...'}
                  isRTL={isRTL}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
                  <Filter className="text-blue-500" size={10} /> {isRTL ? 'نوع المرحلة' : 'Stage Type'}
                </label>
                <SearchableSelect
                  options={stageTypeOptions}
                  value={filters.stageType}
                  onChange={(val) => setFilters(prev => ({ ...prev, stageType: val }))}
                  placeholder={isRTL ? 'اختر النوع...' : 'Select type...'}
                  isRTL={isRTL}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden md:block card p-0 overflow-hidden border border-[var(--card-border)]">
        {selectedItems.length > 0 && (
          <div className="flex justify-end px-4 py-3 border-b border-[var(--card-border)] bg-[var(--body-background)]">
            <button
              onClick={handleExportSelected}
              className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 !text-white border-none flex items-center justify-center gap-2"
            >
              <FaFileExport />
              {isRTL ? 'تصدير المحدد' : 'Export Selected'}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="nova-table categories-table w-full text-sm text-left">
            <thead className="thead-soft">
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={paginatedItems.length > 0 && selectedItems.length === paginatedItems.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleSort('id')}>{isRTL ? 'رقم الطلب' : 'Order ID'}</th>
                <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleSort('customerName')}>{isRTL ? 'اسم العميل' : 'Customer Name'}</th>
                <th className="p-4 whitespace-nowrap cursor-pointer hover:text-blue-600" onClick={() => handleSort('stageType')}>{isRTL ? 'نوع المرحلة' : 'Stage Type'}</th>
                <th className="p-4 min-w-[180px]">{isRTL ? 'العناصر' : 'Items'}</th>
                <th className="p-4 text-center">{isRTL ? 'الكمية' : 'Quantity'}</th>
                <th className="p-4 min-w-[160px]">{isRTL ? 'اسم الفئة' : 'Category Name'}</th>
                <th className="p-4 min-w-[140px]">{isRTL ? 'نوع الفئة' : 'Category Type'}</th>
                <th className="p-4 text-end">{isRTL ? 'المبلغ' : 'Amount'}</th>
                <th className="p-4 min-w-[160px]">{isRTL ? 'أسماء الإضافات' : 'Add-ons Name'}</th>
                <th className="p-4 text-center whitespace-nowrap">{isRTL ? 'كمية / فترة الإضافات' : 'Add-ons Qty / Period'}</th>
                <th className="p-4 text-end">{isRTL ? 'مبلغ الإضافات' : 'Add-ons Amount'}</th>
                <th className="p-4 text-end cursor-pointer hover:text-blue-600" onClick={() => handleSort('total')}>{isRTL ? 'إجمالي المبلغ' : 'Total Amount'}</th>
                <th className="p-4 min-w-[140px]">{isRTL ? 'مندوب المبيعات' : 'Sales Person'}</th>
                <th className="p-4 min-w-[140px]">{isRTL ? 'تم بواسطة' : 'Order By'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'تاريخ الطلب' : 'Order Date'}</th>
                <th className="p-4 text-center">{isRTL ? 'الحالة' : 'Status'}</th>
                <th className="p-4 whitespace-nowrap min-w-[280px]">{isRTL ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-[var(--muted-text)]">
                    {isRTL ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-[var(--muted-text)]">
                    {isRTL ? 'لا توجد طلبات مطابقة' : 'No matching requests found'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className="group cursor-pointer transition-colors duration-150 hover:bg-blue-50/80 dark:hover:bg-blue-900/20">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectRow(item.id)}
                      />
                    </td>
                    <td className="p-4 font-medium text-blue-600">
                      {String(item.id).padStart(4, '0')}
                    </td>
                    <td className="p-4 font-medium">
                      {item.customerName}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={stageTypeBadge(item.stageType)}>
                        {stageTypeLabel(item.stageType)}
                      </span>
                    </td>
                    <td className="p-4 font-medium">
                      <div className="max-w-[180px]">
                        <SmartCellTooltip
                          values={item.itemNames}
                          display={item.itemNamesDisplay}
                          label={isRTL ? 'العناصر' : 'Items'}
                          isRTL={isRTL}
                          isLight={isLight}
                        />
                      </div>
                    </td>
                    <td className="p-4 text-center font-medium">
                      {quantityDisplay(item)}
                    </td>
                    <td className="p-4">
                      <div className="max-w-[160px]">
                        <SmartCellTooltip
                          values={item.categoryNames}
                          display={item.categoryNamesDisplay}
                          label={isRTL ? 'اسم الفئة' : 'Category Name'}
                          isRTL={isRTL}
                          isLight={isLight}
                        />
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="max-w-[140px]">
                        <SmartCellTooltip
                          values={item.categoryTypes}
                          display={item.categoryTypesDisplay}
                          label={isRTL ? 'نوع الفئة' : 'Category Type'}
                          isRTL={isRTL}
                          isLight={isLight}
                        />
                      </div>
                    </td>
                    <td className="p-4 text-end font-mono font-medium">
                      {formatAmount(item.itemsPriceTotal)}
                    </td>
                    <td className="p-4">
                      {getRequestAddons(item).length > 0 ? (
                        <select
                          className="select select-xs h-8 min-h-0 w-44 max-w-full rounded-md border border-gray-300 bg-transparent text-xs text-theme"
                          value={String(getSelectedRequestAddon(item)?.id || '')}
                          onChange={(e) => setSelectedAddonByRequestId(prev => ({ ...prev, [item.id]: e.target.value }))}
                          title={item.addonsNamesDisplay}
                        >
                          {getRequestAddons(item).map((addon, index) => (
                            <option key={`${item.id}-request-addon-${index}`} value={addon.id}>{getRequestAddonLabel(item, addon)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`${th.badgeNeutral} px-2 py-1 rounded text-xs whitespace-nowrap`}>
                        {getSelectedRequestAddonQtyOrPeriod(item)}
                      </span>
                    </td>
                    <td className="p-4 text-end font-mono font-medium">
                      {getRequestAddons(item).length > 0 ? formatAmount(getSelectedRequestAddonAmount(item)) : '—'}
                    </td>
                    <td className="p-4 text-end font-mono font-semibold">
                      {formatAmount(item.total)}
                    </td>
                    <td className="p-4 text-sm">
                      {item.salesPerson || '-'}
                    </td>
                    <td className="p-4 text-sm">
                      {item.orderBy || '-'}
                    </td>
                    <td className="p-4 text-sm text-[var(--muted-text)] whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border bg-transparent ${statusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2 relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewItem(item)
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${isLight ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-blue-900/20 text-blue-400 hover:bg-blue-900/40'} transition-colors shadow-sm`}
                          title={isRTL ? 'معاينة' : 'Preview'}
                        >
                          <FaEye size={14} />
                          <span className="hidden xl:inline">{isRTL ? 'معاينة' : 'Preview'}</span>
                        </button>

                        {item.status === 'Pending' ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleApprove(item.id)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors shadow-sm"
                              title={isRTL ? 'موافقة' : 'Approve'}
                            >
                              <FaCheck size={14} />
                              <span className="hidden xl:inline">{isRTL ? 'موافقة' : 'Approve'}</span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReject(item.id)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40 transition-colors shadow-sm"
                              title={isRTL ? 'رفض' : 'Reject'}
                            >
                              <FaBan size={14} />
                              <span className="hidden xl:inline">{isRTL ? 'رفض' : 'Reject'}</span>
                            </button>

                            <div className="relative shrink-0">
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (openMenuId === item.id) {
                                    setOpenMenuId(null)
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setMenuPos({
                                      top: rect.bottom + 5,
                                      left: isRTL ? rect.left : rect.right - 192
                                    })
                                    setOpenMenuId(item.id)
                                  }
                                }}
                                className={`action-menu-btn flex items-center justify-center w-8 h-8 rounded-full ${th.btnMore} transition-colors`}
                              >
                                <FaEllipsisV size={14} />
                              </button>

                              {openMenuId === item.id && createPortal(
                                <div
                                  className={`action-menu-dropdown fixed z-[9999] w-48 ${th.dropdown} rounded-lg overflow-hidden`}
                                  style={{
                                    top: menuPos.top,
                                    left: menuPos.left
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleConvertToQuotation(item)
                                      setOpenMenuId(null)
                                    }}
                                    className={`w-full text-start px-4 py-3 text-sm text-purple-600 ${isLight ? 'hover:bg-purple-50' : 'hover:bg-purple-900/20'} flex items-center gap-3 transition-colors`}
                                  >
                                    <FaExchangeAlt size={16} />
                                    <span className="font-medium">{isRTL ? 'تحويل إلى عرض سعر' : 'Convert to Quotation'}</span>
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(item.id)
                                      setOpenMenuId(null)
                                    }}
                                    className={`w-full text-start px-4 py-3 text-sm text-red-600 ${isLight ? 'hover:bg-red-50' : 'hover:bg-red-900/20'} flex items-center gap-3 ${th.border} border-t transition-colors`}
                                  >
                                    <FaTrash size={16} />
                                    <span className="font-medium">{isRTL ? 'حذف' : 'Delete'}</span>
                                  </button>
                                </div>,
                                document.body
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {item.status === 'Approved' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleConvertToQuotation(item)
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40 transition-colors shadow-sm"
                                title={isRTL ? 'تحويل إلى عرض سعر' : 'Convert to Quotation'}
                              >
                                <FaExchangeAlt size={14} />
                                <span className="hidden xl:inline">{isRTL ? 'تحويل' : 'Convert'}</span>
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(item.id)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors shadow-sm"
                              title={isRTL ? 'حذف' : 'Delete'}
                            >
                              <FaTrash size={14} />
                              <span className="hidden xl:inline">{isRTL ? 'حذف' : 'Delete'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden grid grid-cols-1 gap-4 mt-4">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted-text)]">
            {isRTL ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted-text)]">
            {isRTL ? 'لا توجد طلبات مطابقة' : 'No matching requests found'}
          </div>
        ) : (
          paginatedItems.map((item) => (
            <div key={item.id} className={`${th.card} p-4 rounded-xl shadow-sm space-y-3`}>
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-xs text-blue-600 font-mono">#{String(item.id).padStart(4, '0')}</span>
                  <h3 className={`font-bold ${th.title}`}>{item.customerName}</h3>
                  <span className={`mt-1 ${stageTypeBadge(item.stageType)}`}>
                    {stageTypeLabel(item.stageType)}
                  </span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadgeMobile(item.status)}`}>
                  {item.status}
                </span>
              </div>

              <div className={`grid grid-cols-2 gap-2 text-sm ${th.text}`}>
                <div className="flex flex-col col-span-2">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'العناصر' : 'Items'}</span>
                  <SmartCellTooltip
                    values={item.itemNames}
                    display={item.itemNamesDisplay}
                    label={isRTL ? 'العناصر' : 'Items'}
                    isRTL={isRTL}
                    isLight={isLight}
                    className="font-medium"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'إجمالي المبلغ' : 'Total Amount'}</span>
                  <span className="font-mono font-medium">{formatAmount(item.total)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'المبلغ' : 'Amount'}</span>
                  <span className="font-mono">{formatAmount(item.itemsPriceTotal)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'الكمية' : 'Quantity'}</span>
                  <span>{quantityDisplay(item)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'اسم الفئة' : 'Category Name'}</span>
                  <SmartCellTooltip
                    values={item.categoryNames}
                    display={item.categoryNamesDisplay}
                    label={isRTL ? 'اسم الفئة' : 'Category Name'}
                    isRTL={isRTL}
                    isLight={isLight}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'نوع الفئة' : 'Category Type'}</span>
                  <SmartCellTooltip
                    values={item.categoryTypes}
                    display={item.categoryTypesDisplay}
                    label={isRTL ? 'نوع الفئة' : 'Category Type'}
                    isRTL={isRTL}
                    isLight={isLight}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'أسماء الإضافات' : 'Add-ons Name'}</span>
                  {getRequestAddons(item).length > 0 ? (
                    <select
                      className="select select-xs h-8 min-h-0 rounded-md border border-gray-300 bg-transparent text-xs text-theme"
                      value={String(getSelectedRequestAddon(item)?.id || '')}
                      onChange={(e) => setSelectedAddonByRequestId(prev => ({ ...prev, [item.id]: e.target.value }))}
                      title={item.addonsNamesDisplay}
                    >
                      {getRequestAddons(item).map((addon, index) => (
                        <option key={`${item.id}-mobile-request-addon-${index}`} value={addon.id}>{getRequestAddonLabel(item, addon)}</option>
                      ))}
                    </select>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'كمية / فترة الإضافات' : 'Add-ons Qty / Period'}</span>
                  <span>{getSelectedRequestAddonQtyOrPeriod(item)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'مبلغ الإضافات' : 'Add-ons Amount'}</span>
                  <span className="font-mono">{getRequestAddons(item).length > 0 ? formatAmount(getSelectedRequestAddonAmount(item)) : '—'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'التاريخ' : 'Date'}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'تم بواسطة' : 'Order By'}</span>
                  <span>{item.orderBy}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--muted-text)]">{isRTL ? 'مندوب المبيعات' : 'Sales Person'}</span>
                  <span>{item.salesPerson}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--card-border)] mt-auto">
                <button
                  onClick={() => setPreviewItem(item)}
                  className="flex-1 btn btn-xs h-9 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 dark:bg-blue-900/10 dark:text-blue-400 dark:border-blue-900/30 flex items-center justify-center gap-1.5 rounded-lg transition-colors"
                >
                  <FaEye size={12} /> {isRTL ? 'معاينة' : 'Preview'}
                </button>
                {(item.status === 'Pending' || item.status === 'Inquiry') && (
                  <>
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="w-10 h-9 flex items-center justify-center bg-green-50 text-green-600 border border-green-100 hover:bg-green-100 dark:bg-green-900/10 dark:text-green-400 dark:border-green-900/30 rounded-lg transition-colors"
                      title={isRTL ? 'موافقة' : 'Approve'}
                    >
                      <FaCheck size={12} />
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      className="w-10 h-9 flex items-center justify-center bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:border-red-900/30 rounded-lg transition-colors"
                      title={isRTL ? 'رفض' : 'Reject'}
                    >
                      <FaBan size={12} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleConvertToQuotation(item)}
                  className="w-10 h-9 flex items-center justify-center bg-purple-50 text-purple-600 border border-purple-100 hover:bg-purple-100 dark:bg-purple-900/10 dark:text-purple-400 dark:border-purple-900/30 rounded-lg transition-colors"
                  title={isRTL ? 'تحويل إلى عرض سعر' : 'Convert to Quotation'}
                >
                  <FaExchangeAlt size={12} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="w-10 h-9 flex items-center justify-center bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:border-red-900/30 rounded-lg transition-colors"
                  title={isRTL ? 'حذف' : 'Delete'}
                >
                  <FaTrash size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {filteredItems.length > 0 && (
        <div className={`mt-4 flex flex-wrap items-center justify-between rounded-xl p-2 border ${th.border} gap-4`}>
          <div className="text-xs text-theme">
            {isRTL
              ? `عرض ${(currentPage - 1) * itemsPerPage + 1} إلى ${Math.min(currentPage * itemsPerPage, filteredItems.length)} من ${filteredItems.length} صنف`
              : `Showing ${(currentPage - 1) * itemsPerPage + 1} to ${Math.min(currentPage * itemsPerPage, filteredItems.length)} of ${filteredItems.length} items`
            }
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              title={isRTL ? 'السابق' : 'Prev'}
            >
              <FaChevronLeft className={isRTL ? 'scale-x-[-1]' : ''} />
            </button>
            <span className="text-sm whitespace-nowrap text-theme">
              {isRTL
                ? `الصفحة ${currentPage} من ${Math.ceil(filteredItems.length / itemsPerPage)}`
                : `Page ${currentPage} of ${Math.ceil(filteredItems.length / itemsPerPage)}`
              }
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredItems.length / itemsPerPage), p + 1))}
              disabled={currentPage >= Math.ceil(filteredItems.length / itemsPerPage)}
              title={isRTL ? 'التالي' : 'Next'}
            >
              <FaChevronRight className={isRTL ? 'scale-x-[-1]' : ''} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-xs ${th.muted} whitespace-nowrap`}>{isRTL ? 'لكل صفحة:' : 'Per page:'}</span>
            <select
              className="select select-bordered select-sm w-18 text-xs py-0 px-2 h-8 min-h-0"
              value={itemsPerPage}
              onChange={e => setItemsPerPage(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      <RequestPreviewModal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        request={previewItem}
      />
    </div>
  )
}

