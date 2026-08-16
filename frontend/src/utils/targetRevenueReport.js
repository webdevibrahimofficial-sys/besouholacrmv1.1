export function pad2(value) {
  return String(value).padStart(2, '0')
}

export function toIsoDate(year, monthIndex, day) {
  return `${Number(year)}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

export function lastDayOfMonth(year, monthIndex) {
  return new Date(Number(year), monthIndex + 1, 0).getDate()
}

export function targetField(type) {
  return type === 'semi_annual' ? 'semi_annual_target' : `${type}_target`
}

export function getCommissionTiers(record) {
  const tiers = record?.commission_tiers || record?.commissionTiers || []
  return Array.isArray(tiers) ? tiers : []
}

export function fallbackUserTarget(user, type) {
  const yearly = Number(user?.yearly_target || 0) || 0
  if (type === 'yearly') return yearly
  if (type === 'quarterly') return Number(user?.quarterly_target || 0) || 0
  if (type === 'semi_annual') {
    const explicit = Number(user?.semi_annual_target || 0) || 0
    return explicit || yearly / 2
  }
  return Number(user?.monthly_target || 0) || 0
}

export function fallbackUserTiers(user) {
  const direct = getCommissionTiers(user)
  if (direct.length) return direct
  const rate = Number(user?.commission_percentage || 0) || 0
  if (!rate) return []
  return [{ from_percentage: 0, to_percentage: null, commission_percentage: rate }]
}

export function snapshotForYear(rows, year) {
  return (rows || []).find(item => Number(item.year) === Number(year)) || null
}

export function resolveTargetForYear(user, rows, year, type, currentYear) {
  const row = snapshotForYear(rows, year)
  if (row) return Number(row[targetField(type)] || 0) || 0
  if (Number(year) === Number(currentYear)) return fallbackUserTarget(user, type)
  return 0
}

export function resolveTiersForYear(user, rows, year, currentYear) {
  const row = snapshotForYear(rows, year)
  if (row) {
    const tiers = getCommissionTiers(row)
    if (tiers.length) return tiers
    if (Number(year) === Number(currentYear)) return fallbackUserTiers(user)
    return []
  }
  if (Number(year) === Number(currentYear)) return fallbackUserTiers(user)
  return []
}

export function matchCommissionRate(tiers, achievementPercent) {
  const sorted = [...(tiers || [])].sort(
    (a, b) => Number(a.from_percentage || 0) - Number(b.from_percentage || 0)
  )
  const matched = sorted.find((tier) => {
    const from = Number(tier.from_percentage || 0)
    const to = tier.to_percentage === null || tier.to_percentage === undefined || tier.to_percentage === ''
      ? Infinity
      : Number(tier.to_percentage)
    return Number(achievementPercent) >= from && Number(achievementPercent) <= to
  })
  return Number(matched?.commission_percentage || 0) || 0
}

export function periodsCoveredInYear(year, type, { now, tenantCreatedYear } = {}) {
  const current = now || new Date()
  const currentYear = current.getFullYear()
  const y = Number(year)
  if (y > currentYear) return 0
  if (tenantCreatedYear && y < Number(tenantCreatedYear)) return 0

  const currentMonth = current.getMonth()
  const endMonth = y === currentYear ? currentMonth : 11
  if (type === 'monthly') return endMonth + 1
  if (type === 'quarterly') return Math.floor(endMonth / 3) + 1
  if (type === 'semi_annual') return endMonth < 6 ? 1 : 2
  return 1
}

export function resolvePeriodTarget({
  user,
  rows,
  yearFilter,
  type,
  currentYear,
  tenantCreatedYear,
  now,
}) {
  if (yearFilter === 'all') {
    const startYear = Number(tenantCreatedYear || currentYear)
    const endYear = Number(currentYear)
    let total = 0
    for (let year = startYear; year <= endYear; year += 1) {
      const unit = resolveTargetForYear(user, rows, year, type, currentYear)
      total += unit * periodsCoveredInYear(year, type, { now, tenantCreatedYear })
    }
    return total
  }

  return resolveTargetForYear(user, rows, yearFilter, type, currentYear)
}

export function getPeriodBounds({ yearFilter, targetType, now, tenantCreatedYear }) {
  const current = now || new Date()
  const currentYear = current.getFullYear()
  const currentMonth = current.getMonth()
  const today = current.getDate()

  if (yearFilter === 'all') {
    const fromYear = Number(tenantCreatedYear || currentYear)
    return {
      from: toIsoDate(fromYear, 0, 1),
      to: toIsoDate(currentYear, currentMonth, today),
    }
  }

  const year = Number(yearFilter)
  const isCurrent = year === currentYear

  if (targetType === 'yearly') {
    return {
      from: toIsoDate(year, 0, 1),
      to: isCurrent ? toIsoDate(year, currentMonth, today) : toIsoDate(year, 11, 31),
    }
  }

  if (targetType === 'monthly') {
    const last = lastDayOfMonth(year, currentMonth)
    return {
      from: toIsoDate(year, currentMonth, 1),
      to: isCurrent ? toIsoDate(year, currentMonth, today) : toIsoDate(year, currentMonth, last),
    }
  }

  if (targetType === 'quarterly') {
    const startMonth = Math.floor(currentMonth / 3) * 3
    const endMonth = startMonth + 2
    return {
      from: toIsoDate(year, startMonth, 1),
      to: isCurrent
        ? toIsoDate(year, currentMonth, today)
        : toIsoDate(year, endMonth, lastDayOfMonth(year, endMonth)),
    }
  }

  const startMonth = currentMonth < 6 ? 0 : 6
  const endMonth = startMonth + 5
  return {
    from: toIsoDate(year, startMonth, 1),
    to: isCurrent
      ? toIsoDate(year, currentMonth, today)
      : toIsoDate(year, endMonth, lastDayOfMonth(year, endMonth)),
  }
}

function toDayStamp(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

export function effectiveDateRange({ period, dateFrom, dateTo }) {
  if (!period?.from || !period?.to) return null
  let from = period.from
  let to = period.to
  const fromFilter = toDayStamp(dateFrom)
  const toFilter = toDayStamp(dateTo)
  if (fromFilter) from = fromFilter > from ? fromFilter : from
  if (toFilter) to = toFilter < to ? toFilter : to
  if (from > to) return null
  return { from, to }
}

export function isDateInRange(dateStr, range) {
  if (!range || !dateStr) return false
  const day = String(dateStr).slice(0, 10)
  return day >= range.from && day <= range.to
}

export function timeBucketIndex(dateStr, grouping) {
  if (!dateStr || dateStr.length < 7) return -1
  const monthIndex = Number.parseInt(dateStr.substring(5, 7), 10) - 1
  if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return -1
  if (grouping === 'monthly') return monthIndex
  if (grouping === 'quarterly') return Math.floor(monthIndex / 3)
  if (grouping === 'semi_annual') return monthIndex < 6 ? 0 : 1
  if (grouping === 'yearly') return Number.parseInt(dateStr.substring(0, 4), 10)
  return -1
}

export function bucketDateRange(year, grouping, index) {
  const y = Number(year)
  if (grouping === 'monthly') {
    return {
      from: toIsoDate(y, index, 1),
      to: toIsoDate(y, index, lastDayOfMonth(y, index)),
    }
  }
  if (grouping === 'quarterly') {
    const startMonth = index * 3
    const endMonth = startMonth + 2
    return {
      from: toIsoDate(y, startMonth, 1),
      to: toIsoDate(y, endMonth, lastDayOfMonth(y, endMonth)),
    }
  }
  if (grouping === 'semi_annual') {
    const startMonth = index * 6
    const endMonth = startMonth + 5
    return {
      from: toIsoDate(y, startMonth, 1),
      to: toIsoDate(y, endMonth, lastDayOfMonth(y, endMonth)),
    }
  }
  return {
    from: toIsoDate(y, 0, 1),
    to: toIsoDate(y, 11, 31),
  }
}

export function rangesOverlap(a, b) {
  if (!a?.from || !a?.to || !b?.from || !b?.to) return false
  return a.from <= b.to && b.from <= a.to
}

function asDisplayName(value) {
  if (value == null) return ''
  if (typeof value === 'object') {
    return String(value.name || value.title || value.product || value.name_ar || '').trim()
  }
  const text = String(value).trim()
  if (!text || text === '-') return ''
  return text
}

function isNumericId(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const text = value.trim()
  return text !== '' && /^\d+$/.test(text)
}

function catalogName(itemsById, id) {
  if (id == null || id === '') return ''
  if (itemsById instanceof Map) return asDisplayName(itemsById.get(String(id)))
  if (!itemsById) return ''
  return asDisplayName(itemsById[id] || itemsById[String(id)])
}

function namedDealItem(row = {}, itemsById) {
  const id = row.item ?? row.item_id ?? row.itemId ?? ''
  const name = asDisplayName(row.item_name)
    || asDisplayName(row.name)
    || asDisplayName(row.label)
    || catalogName(itemsById, id)
  if (!name) return null
  return {
    name,
    amount: Number(row.line_total ?? row.total ?? row.sub_total ?? row.amount ?? row.revenue ?? 0) || 0,
  }
}

export function extractRevenueDealItems(revenue = {}, { itemsById } = {}) {
  const fromApi = Array.isArray(revenue.deal_items) ? revenue.deal_items : []
  const mappedApi = fromApi.map((row) => namedDealItem(row, itemsById)).filter(Boolean)
  if (mappedApi.length) return mappedApi

  const meta = (revenue && (revenue.meta_data || revenue.metaData)) || {}
  const fromMeta = Array.isArray(meta.deal_items) ? meta.deal_items : []
  const mappedMeta = fromMeta.map((row) => namedDealItem(row, itemsById)).filter(Boolean)
  if (mappedMeta.length) return mappedMeta

  const details = revenue.action?.details || revenue.details || {}
  const rows = Array.isArray(details.reservationGeneralItems) ? details.reservationGeneralItems : []
  const mappedAction = rows.map((row) => namedDealItem(row, itemsById)).filter(Boolean)
  if (mappedAction.length) return mappedAction

  const single = namedDealItem({
    item: details.reservationItem,
    item_id: details.item_id,
    item_name: details.item_name || details.product || meta.item_name,
  }, itemsById)
  return single ? [single] : []
}

export function resolveRevenueProjectOrItem(lead = {}, {
  companyType = '',
  itemsById,
  dealItems,
  action,
  revenueItemName,
} = {}) {
  const closingItems = Array.isArray(dealItems) && dealItems.length
    ? dealItems
    : extractRevenueDealItems({ action, deal_items: dealItems }, { itemsById })
  const closingName = [...new Set(closingItems.map((row) => asDisplayName(row.name || row.label)).filter(Boolean))].join(', ')

  const meta = (lead && (lead.meta_data || lead.metaData)) || {}
  const itemId = lead.item_id ?? lead.itemId ?? (isNumericId(lead.item) ? lead.item : '')
  const catalogValue = catalogName(itemsById, itemId)

  const itemName = closingName
    || asDisplayName(revenueItemName)
    || asDisplayName(lead.item_name)
    || asDisplayName(lead.itemName)
    || (!isNumericId(lead.item) ? asDisplayName(lead.item) : '')
    || asDisplayName(meta.lead_item_name)
    || asDisplayName(meta.item_name)
    || asDisplayName(lead.product)
    || asDisplayName(catalogValue)

  const projectName = asDisplayName(lead.project)
    || asDisplayName(lead.project_name)
    || asDisplayName(lead.projectName)
    || asDisplayName(lead.projectRelation)
    || asDisplayName(lead.project_relation)

  const type = String(companyType || '').toLowerCase()
  if (type === 'general') return itemName || projectName
  return projectName || itemName
}
