export const LEADS_LIST_STORAGE_PREFIX = 'besouhola:leads-list:'

const ARRAY_KEYS = [
  'sourceFilter',
  'agencyFilter',
  'priorityFilter',
  'projectFilter',
  'stageFilter',
  'managerFilter',
  'salesPersonFilter',
  'createdByFilter',
  'oldStageFilter',
  'campaignFilter',
  'countryFilter',
  'whatsappIntentsFilter',
  'actionTypeFilter',
  'duplicateStatusFilter',
]

const STRING_KEYS = [
  'searchTerm',
  'assignDateFrom',
  'assignDateTo',
  'lastActionFrom',
  'lastActionTo',
  'actionDateFrom',
  'actionDateTo',
  'creationDateFrom',
  'creationDateTo',
  'cancelReasonFilter',
  'closedDateFrom',
  'closedDateTo',
  'expectedRevenueFilter',
  'emailFilter',
  'sortBy',
  'sortOrder',
]

export function emptyLeadsListState() {
  return {
    searchTerm: '',
    sourceFilter: [],
    agencyFilter: [],
    priorityFilter: [],
    projectFilter: [],
    stageFilter: [],
    managerFilter: [],
    salesPersonFilter: [],
    createdByFilter: [],
    assignDateFrom: '',
    assignDateTo: '',
    lastActionFrom: '',
    lastActionTo: '',
    actionDateFrom: '',
    actionDateTo: '',
    creationDateFrom: '',
    creationDateTo: '',
    oldStageFilter: [],
    cancelReasonFilter: '',
    closedDateFrom: '',
    closedDateTo: '',
    campaignFilter: [],
    countryFilter: [],
    expectedRevenueFilter: '',
    emailFilter: '',
    whatsappIntentsFilter: [],
    actionTypeFilter: [],
    duplicateStatusFilter: [],
    sortBy: '',
    sortOrder: 'desc',
    currentPage: 1,
    itemsPerPage: 10,
    scrollY: 0,
    scrollX: 0,
  }
}

export function leadsListStorageKey(pathname) {
  const path = String(pathname || '') === '/leads/my-leads' ? '/leads/my-leads' : '/leads'
  return `${LEADS_LIST_STORAGE_PREFIX}${path}`
}

export function sameStringArray(a, b) {
  const left = Array.isArray(a) ? a.map((v) => String(v)) : []
  const right = Array.isArray(b) ? b.map((v) => String(v)) : []
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function readCsvParam(params, key) {
  const all = params.getAll(key).map((v) => String(v || '').trim()).filter(Boolean)
  if (all.length) {
    return all.flatMap((value) => value.split(',').map((part) => String(part || '').trim()).filter(Boolean))
  }
  const single = String(params.get(key) || '').trim()
  if (!single) return []
  return single.split(',').map((part) => String(part || '').trim()).filter(Boolean)
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function asString(value, fallback = '') {
  return value == null ? fallback : String(value)
}

function asPositiveInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function sanitizeLeadsListState(raw) {
  const defaults = emptyLeadsListState()
  if (!raw || typeof raw !== 'object') return defaults

  const next = { ...defaults }
  ARRAY_KEYS.forEach((key) => {
    next[key] = asStringArray(raw[key])
  })
  STRING_KEYS.forEach((key) => {
    next[key] = asString(raw[key], defaults[key])
  })
  next.currentPage = asPositiveInt(raw.currentPage, 1)
  next.itemsPerPage = asPositiveInt(raw.itemsPerPage, 10)
  next.scrollY = Math.max(0, Number.isFinite(Number(raw.scrollY)) ? Math.floor(Number(raw.scrollY)) : 0)
  next.scrollX = Math.max(0, Number.isFinite(Number(raw.scrollX)) ? Math.floor(Number(raw.scrollX)) : 0)
  next.sortOrder = next.sortOrder === 'asc' ? 'asc' : 'desc'
  return next
}

export function loadStoredLeadsListState(pathname, storage = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
  if (!storage) return null
  try {
    const raw = storage.getItem(leadsListStorageKey(pathname))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return sanitizeLeadsListState(parsed)
  } catch {
    return null
  }
}

export function saveStoredLeadsListState(pathname, state, storage = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
  if (!storage) return
  try {
    storage.setItem(leadsListStorageKey(pathname), JSON.stringify(sanitizeLeadsListState(state)))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearStoredLeadsListState(pathname, storage = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
  if (!storage) return
  try {
    storage.removeItem(leadsListStorageKey(pathname))
  } catch {
    // Ignore storage failures.
  }
}

export function readLeadsFiltersFromSearch(search) {
  const params = new URLSearchParams(search || '')
  const fromDashboard = String(params.get('src') || '').toLowerCase().trim() === 'dashboard'
  const present = {}

  if (params.has('s') || params.has('search')) {
    present.searchTerm = params.get('s') || params.get('search') || ''
  }
  if (params.has('stage')) {
    present.stageFilter = readCsvParam(params, 'stage')
  }
  if (params.has('assigned_to')) {
    present.salesPersonFilter = readCsvParam(params, 'assigned_to')
  }
  if (params.has('manager_id')) {
    present.managerFilter = readCsvParam(params, 'manager_id')
  }
  if (params.has('created_from')) present.creationDateFrom = String(params.get('created_from') || '').trim()
  if (params.has('created_to')) present.creationDateTo = String(params.get('created_to') || '').trim()
  if (params.has('action_date_from')) present.actionDateFrom = String(params.get('action_date_from') || '').trim()
  if (params.has('action_date_to')) present.actionDateTo = String(params.get('action_date_to') || '').trim()
  if (params.has('page')) present.currentPage = asPositiveInt(params.get('page'), 1)

  return { fromDashboard, present }
}

export function mergeLeadsListState({ urlFilters, stored, pathname, userId } = {}) {
  const defaults = emptyLeadsListState()
  const storedState = stored ? sanitizeLeadsListState(stored) : null
  const present = urlFilters?.present && typeof urlFilters.present === 'object' ? urlFilters.present : {}
  const merged = {
    ...defaults,
    ...(storedState || {}),
    ...present,
  }

  if (urlFilters?.fromDashboard && !Object.prototype.hasOwnProperty.call(present, 'salesPersonFilter')) {
    merged.salesPersonFilter = []
  }

  if (String(pathname || '') === '/leads/my-leads' && userId) {
    merged.salesPersonFilter = [String(userId)]
  }

  return sanitizeLeadsListState(merged)
}

export function stripLeadPreviewParams(search) {
  const params = new URLSearchParams(search || '')
  params.delete('lead_id')
  params.delete('action_id')
  params.delete('tab')
  const next = params.toString()
  return next ? `?${next}` : ''
}

export function stripDashboardSrcParam(search) {
  const params = new URLSearchParams(search || '')
  if (!params.has('src')) return search || ''
  params.delete('src')
  const next = params.toString()
  return next ? `?${next}` : ''
}
