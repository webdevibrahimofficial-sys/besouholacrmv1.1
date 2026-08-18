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

export const COMMISSION_SCOPE_PERSONAL = 'personal'
export const COMMISSION_SCOPE_INHERITED = 'inherited'

export function getCommissionTiers(record) {
  const tiers = record?.commission_tiers || record?.commissionTiers || []
  return Array.isArray(tiers) ? tiers : []
}

export function normalizeCommissionScope(value) {
  return String(value || COMMISSION_SCOPE_PERSONAL).trim().toLowerCase() === COMMISSION_SCOPE_INHERITED
    ? COMMISSION_SCOPE_INHERITED
    : COMMISSION_SCOPE_PERSONAL
}

export function filterTiersByScope(tiers, scope = COMMISSION_SCOPE_PERSONAL) {
  const list = Array.isArray(tiers) ? tiers : []
  const wanted = normalizeCommissionScope(scope)
  return list.filter((tier) => normalizeCommissionScope(tier?.scope) === wanted)
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

export function fallbackUserTiers(user, scope = COMMISSION_SCOPE_PERSONAL) {
  const wanted = normalizeCommissionScope(scope)
  const inheritedDirect = Array.isArray(user?.inherited_commission_tiers)
    ? user.inherited_commission_tiers
    : (Array.isArray(user?.inheritedCommissionTiers) ? user.inheritedCommissionTiers : [])
  const source = wanted === COMMISSION_SCOPE_INHERITED
    ? [...inheritedDirect, ...getCommissionTiers(user)]
    : getCommissionTiers(user)
  const direct = filterTiersByScope(source, wanted)
  if (direct.length) return direct
  if (wanted === COMMISSION_SCOPE_INHERITED) return []
  const rate = Number(user?.commission_percentage || 0) || 0
  if (!rate) return []
  return [{
    from_percentage: 0,
    to_percentage: null,
    commission_percentage: rate,
    scope: COMMISSION_SCOPE_PERSONAL,
  }]
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

export function resolveTiersForYear(user, rows, year, currentYear, scope = COMMISSION_SCOPE_PERSONAL) {
  const wanted = normalizeCommissionScope(scope)
  const row = snapshotForYear(rows, year)
  if (row) {
    const explicitInherited = Array.isArray(row.inherited_commission_tiers)
      ? row.inherited_commission_tiers
      : (Array.isArray(row.inheritedCommissionTiers) ? row.inheritedCommissionTiers : [])
    const tiers = wanted === COMMISSION_SCOPE_INHERITED && explicitInherited.length
      ? filterTiersByScope(explicitInherited, COMMISSION_SCOPE_INHERITED)
      : filterTiersByScope(getCommissionTiers(row), wanted)
    if (tiers.length) return tiers
    if (Number(year) === Number(currentYear)) return fallbackUserTiers(user, wanted)
    return []
  }
  if (Number(year) === Number(currentYear)) return fallbackUserTiers(user, wanted)
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

export function usersListFrom(users) {
  if (Array.isArray(users)) return users
  if (users instanceof Map) return Array.from(users.values())
  return []
}

export function indexUsersByManager(users) {
  const map = new Map()
  usersListFrom(users).forEach((user) => {
    if (user?.id == null) return
    const managerId = user.manager_id
      ?? user.managerId
      ?? (user.manager && typeof user.manager === 'object' ? user.manager.id : null)
    if (managerId == null || managerId === '') return
    const key = String(managerId)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(String(user.id))
  })
  return map
}

export function collectDescendantIds(userId, users, seen = new Set()) {
  const rootId = String(userId || '')
  if (!rootId) return []
  const byManager = indexUsersByManager(users)
  const result = []
  const stack = [...(byManager.get(rootId) || [])]
  while (stack.length) {
    const childId = String(stack.pop())
    if (!childId || seen.has(childId) || childId === rootId) continue
    seen.add(childId)
    result.push(childId)
    const nested = byManager.get(childId) || []
    for (let i = 0; i < nested.length; i += 1) stack.push(nested[i])
  }
  return result
}

export function resolveInheritedTargetForYear(user, users, targetHistoryByUser, year, type, currentYear) {
  const usersById = indexUsersById(usersListFrom(users))
  const descendantIds = collectDescendantIds(user?.id, users)
  let total = 0
  descendantIds.forEach((id) => {
    const descendant = usersById.get(String(id))
    if (!descendant || usesCompanyTarget(descendant)) return
    const rows = targetHistoryByUser instanceof Map
      ? (targetHistoryByUser.get(String(id)) || [])
      : []
    total += resolveTargetForYear(descendant, rows, year, type, currentYear)
  })
  return total
}

export function resolveInheritedPeriodTarget({
  user,
  users,
  targetHistoryByUser,
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
      const unit = resolveInheritedTargetForYear(user, users, targetHistoryByUser, year, type, currentYear)
      total += unit * periodsCoveredInYear(year, type, { now, tenantCreatedYear })
    }
    return total
  }

  return resolveInheritedTargetForYear(user, users, targetHistoryByUser, yearFilter, type, currentYear)
}

export function sumRevenueForUserIds(rows, userIds) {
  const ids = new Set((userIds || []).map((id) => String(id)))
  return (rows || []).reduce((sum, row) => {
    const uid = String(row?.salespersonId ?? row?.user_id ?? row?.userId ?? '')
    if (!ids.has(uid)) return sum
    return sum + (Number(row?.revenue) || 0)
  }, 0)
}

export function calculateInheritedCommission({
  user,
  users,
  targetHistoryByUser,
  revenueRows,
  yearFilter,
  type,
  currentYear,
  tenantCreatedYear,
  now,
}) {
  const empty = {
    revenue: 0,
    target: 0,
    achievement: 0,
    rate: 0,
    commission: 0,
  }
  if (!user?.id || isFieldSalesRole(user)) return empty

  const descendantIds = collectDescendantIds(user.id, users)
  if (!descendantIds.length) return empty

  const managerRows = targetHistoryByUser instanceof Map
    ? (targetHistoryByUser.get(String(user.id)) || [])
    : []

  if (yearFilter === 'all') {
    const revenueByYear = new Map()
    ;(revenueRows || []).forEach((row) => {
      const uid = String(row?.salespersonId ?? row?.user_id ?? '')
      if (!descendantIds.includes(uid)) return
      const year = row?.date ? String(row.date).slice(0, 4) : String(currentYear)
      revenueByYear.set(year, (revenueByYear.get(year) || 0) + (Number(row?.revenue) || 0))
    })

    let commission = 0
    let revenue = 0
    let target = 0
    revenueByYear.forEach((yearRevenue, year) => {
      const unit = resolveInheritedTargetForYear(user, users, targetHistoryByUser, year, type, currentYear)
      const yearTarget = unit * periodsCoveredInYear(year, type, { now, tenantCreatedYear })
      const achievement = calculateAchievementPercent(yearRevenue, yearTarget)
      const rate = matchCommissionRate(
        resolveTiersForYear(user, managerRows, year, currentYear, COMMISSION_SCOPE_INHERITED),
        achievement
      )
      commission += (yearRevenue * rate) / 100
      revenue += yearRevenue
      target += yearTarget
    })

    return {
      revenue,
      target,
      achievement: calculateAchievementPercent(revenue, target),
      rate: revenue ? Number(((commission / revenue) * 100).toFixed(2)) : 0,
      commission,
    }
  }

  const revenue = sumRevenueForUserIds(revenueRows, descendantIds)
  const target = resolveInheritedPeriodTarget({
    user,
    users,
    targetHistoryByUser,
    yearFilter,
    type,
    currentYear,
    tenantCreatedYear,
    now,
  })
  const achievement = calculateAchievementPercent(revenue, target)
  const rate = matchCommissionRate(
    resolveTiersForYear(user, managerRows, yearFilter, currentYear, COMMISSION_SCOPE_INHERITED),
    achievement
  )

  return {
    revenue,
    target,
    achievement,
    rate,
    commission: (revenue * rate) / 100,
  }
}

export function calculateAchievementPercent(revenue, target) {
  const amount = Number(revenue) || 0
  const goal = Number(target) || 0
  if (goal <= 0) return 0
  const raw = (amount / goal) * 100
  if (!Number.isFinite(raw)) return 0
  return Math.round(raw * 100) / 100
}

export function formatAchievementPercent(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0%'
  return `${Number(amount.toFixed(2))}%`
}

export function formatCompactMoney(value, { rtl = false } = {}) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0'
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) {
    const compact = Number((amount / 1_000_000).toFixed(1))
    return rtl ? `${compact} مليون` : `${compact}M`
  }
  if (abs >= 1_000) {
    const compact = Number((amount / 1_000).toFixed(1))
    return rtl ? `${compact} ألف` : `${compact}K`
  }
  return String(Math.round(amount))
}

export function normalizeRoleName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function collectUserRoles(user) {
  const values = [
    user?.role,
    user?.job_title,
    user?.jobTitle,
    ...(Array.isArray(user?.roles) ? user.roles.map((role) => role?.name || role) : []),
  ]
  return values.map(normalizeRoleName).filter(Boolean)
}

export function usesCompanyTarget(user) {
  if (
    user?.uses_company_target === true
    || user?.usesCompanyTarget === true
    || user?.is_primary_admin === true
    || user?.isPrimaryAdmin === true
    || user?.is_tenant_admin === true
    || user?.is_super_admin === true
  ) return true
  return collectUserRoles(user).some((role) => {
    if (role === 'sales admin' || role.includes('sales admin')) return false
    return (
      role === 'admin'
      || role === 'owner'
      || role === 'tenant admin'
      || role.includes('tenant admin')
      || role === 'director'
      || role === 'operation manager'
      || role === 'operations manager'
    )
  })
}

export function resolveSalespersonRowTarget(params) {
  if (usesCompanyTarget(params?.user)) return 0
  return resolvePeriodTarget(params)
}

export function isFieldSalesRole(user) {
  return collectUserRoles(user).some((role) => {
    if (
      role.includes('manager')
      || role.includes('admin')
      || role.includes('director')
      || role.includes('leader')
    ) return false
    return (
      role.includes('sales person')
      || role === 'salesperson'
      || role.includes('telesales agent')
      || role.includes('sales agent')
      || role.includes('broker')
      || role.endsWith(' agent')
    )
  })
}

export function isMidLevelManagerRole(user) {
  if (usesCompanyTarget(user)) return false
  return collectUserRoles(user).some((role) => (
    role.includes('team leader')
    || role === 'teamleader'
    || role.includes('sales manager')
    || role.includes('branch manager')
    || role.includes('telesales manager')
  ))
}

export function isManagerFilterRole(user) {
  if (!user) return false
  if (usesCompanyTarget(user)) return false
  if (isFieldSalesRole(user)) return false
  return !collectUserRoles(user).some((role) => role.includes('sales admin'))
}

export function shouldIncludeInSalespersonRows(user, { personalTarget = 0, hasRevenue = false } = {}) {
  if (usesCompanyTarget(user)) return Boolean(hasRevenue)
  if (isFieldSalesRole(user) || isMidLevelManagerRole(user)) return true
  return Number(personalTarget) > 0 || Boolean(hasRevenue)
}

export function matchesManagerFilter(user, managerFilter, usersById) {
  if (!managerFilter || managerFilter === 'all') return true
  const selfName = String(user?.name || '').trim()
  if (selfName === managerFilter) return true
  return resolveManagerName(user, usersById) === managerFilter
}

export function resolveReportKpiTarget({
  managerFilter,
  salesPersonFilter,
  visibleTargets,
  companyTarget,
}) {
  const peopleScoped = (
    (managerFilter && managerFilter !== 'all')
    || (salesPersonFilter && salesPersonFilter !== 'all')
  )
  const visibleSum = (visibleTargets || []).reduce((sum, value) => sum + (Number(value) || 0), 0)
  if (peopleScoped) return visibleSum
  const company = Number(companyTarget) || 0
  return company > 0 ? company : visibleSum
}

export function countClosedDeals(rows, {
  periodRange,
  salesPersonFilter = 'all',
  managerFilter = 'all',
  sourceFilter = 'all',
  projectFilter = 'all',
} = {}) {
  return (rows || []).filter((row) => {
    if (String(row?.id || '').startsWith('empty-')) return false
    if (String(row?.status || '') === 'No Sales') return false
    if (salesPersonFilter !== 'all' && row.salesperson !== salesPersonFilter) return false
    if (managerFilter !== 'all' && row.manager !== managerFilter && row.salesperson !== managerFilter) return false
    if (sourceFilter !== 'all' && row.source !== sourceFilter) return false
    if (projectFilter !== 'all' && row.project !== projectFilter) return false
    if (periodRange && row.date && !isDateInRange(row.date, periodRange)) return false
    return true
  }).length
}

export function resolveCompanyTargetForYear(rows, year, type) {
  const row = snapshotForYear(rows, year)
  if (!row) return 0
  return Number(row[targetField(type)] || 0) || 0
}

export function resolveCompanyPeriodTarget({
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
      const unit = resolveCompanyTargetForYear(rows, year, type)
      total += unit * periodsCoveredInYear(year, type, { now, tenantCreatedYear })
    }
    return total
  }

  return resolveCompanyTargetForYear(rows, yearFilter, type)
}

export function resolveEffectivePeriodTarget({
  user,
  rows,
  companyRows,
  yearFilter,
  type,
  currentYear,
  tenantCreatedYear,
  now,
}) {
  if (usesCompanyTarget(user)) {
    return resolveCompanyPeriodTarget({
      rows: companyRows,
      yearFilter,
      type,
      currentYear,
      tenantCreatedYear,
      now,
    })
  }

  return resolvePeriodTarget({
    user,
    rows,
    yearFilter,
    type,
    currentYear,
    tenantCreatedYear,
    now,
  })
}

export function indexUsersById(users) {
  const map = new Map()
  ;(users || []).forEach((user) => {
    if (user?.id == null) return
    map.set(String(user.id), user)
  })
  return map
}

export function resolveManagerName(user, usersById) {
  if (!user) return ''

  const nested = user.manager
  if (nested && typeof nested === 'object') {
    const nestedName = String(nested.name || nested.full_name || nested.fullName || '').trim()
    if (nestedName) return nestedName
  }
  if (typeof nested === 'string' && nested.trim() && Number.isNaN(Number(nested))) {
    return nested.trim()
  }

  const managerId = user.manager_id
    ?? user.managerId
    ?? (typeof nested === 'number' || (typeof nested === 'string' && nested.trim() !== '' && !Number.isNaN(Number(nested)))
      ? nested
      : nested?.id)

  if (managerId != null && managerId !== '' && usersById) {
    const manager = usersById.get(String(managerId))
    const lookedUp = String(manager?.name || '').trim()
    if (lookedUp) return lookedUp
  }

  const teamLeader = user.team?.leader
  if (teamLeader && typeof teamLeader === 'object') {
    const leaderName = String(teamLeader.name || '').trim()
    if (leaderName) return leaderName
  }

  return ''
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
