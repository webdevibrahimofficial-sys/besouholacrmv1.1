/**
 * Resolve the "original" lead for a duplicate compare modal.
 * Never returns the same record as the duplicate.
 */

export function sameLeadId(a, b) {
  const left = String(a?.id ?? a?._id ?? '').trim()
  const right = String(b?.id ?? b?._id ?? '').trim()
  return left !== '' && left === right
}

export function cleanLeadPhone(value) {
  return String(value || '').replace(/[^0-9]/g, '')
}

export function isMarkedDuplicateLead(lead) {
  if (!lead) return false
  const stage = String(lead.stage || '').toLowerCase().trim()
  const status = String(lead.status || '').toLowerCase().trim()
  return stage === 'duplicate' || status === 'duplicate' || String(lead.stage || '').trim() === 'مكرر'
}

function leadCreatedAtMs(lead) {
  const raw = lead?.created_at || lead?.createdAt || lead?.created || null
  const ms = raw ? new Date(raw).getTime() : NaN
  return Number.isFinite(ms) ? ms : 0
}

function leadSortId(lead) {
  const n = Number(lead?.id ?? lead?._id ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Prefer non-duplicate rows with the same phone, oldest first (matches backend orderBy id asc).
 */
export function pickOldestOriginalCandidate(candidates, duplicateLead) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .filter((lead) => lead && !sameLeadId(lead, duplicateLead))

  const nonDuplicates = list.filter((lead) => !isMarkedDuplicateLead(lead))
  const pool = nonDuplicates.length > 0 ? nonDuplicates : list

  return [...pool].sort((a, b) => {
    const idDiff = leadSortId(a) - leadSortId(b)
    if (idDiff !== 0) return idDiff
    return leadCreatedAtMs(a) - leadCreatedAtMs(b)
  })[0] || null
}

function phonesMatch(a, b) {
  const left = cleanLeadPhone(a)
  const right = cleanLeadPhone(b)
  if (!left || !right) return false
  if (left === right) return true
  // Allow suffix match for normalized vs local formats (e.g. 20xxxxxxxxx vs 0xxxxxxxxx)
  const minLen = 9
  if (left.length >= minLen && right.length >= minLen) {
    return left.endsWith(right.slice(-minLen)) || right.endsWith(left.slice(-minLen))
  }
  return false
}

function extractLeadsPayload(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.leads)) return data.leads
  if (Array.isArray(data?.data?.data)) return data.data.data
  return []
}

/**
 * @param {{ api: any, duplicateLead: any, localLeads?: any[] }} args
 */
export async function resolveDuplicateOriginalLead({ api, duplicateLead, localLeads = [] }) {
  if (!duplicateLead) return null

  const targetPhone = cleanLeadPhone(duplicateLead.phone || duplicateLead.mobile)
  const duplicateOfId =
    duplicateLead?.meta_data?.duplicate_of ||
    duplicateLead?.meta_data?.duplicateOf ||
    duplicateLead?.metaData?.duplicate_of ||
    duplicateLead?.metaData?.duplicateOf ||
    duplicateLead?.original_lead_id ||
    duplicateLead?.originalLeadId ||
    null

  let originalLead = null

  // 1) Explicit backend link (must not be self)
  if (duplicateOfId && String(duplicateOfId) !== String(duplicateLead.id ?? duplicateLead._id ?? '')) {
    try {
      const { data } = await api.get(`/api/leads/${encodeURIComponent(String(duplicateOfId))}`)
      const loaded = data?.data || data
      if (loaded && !sameLeadId(loaded, duplicateLead) && !isMarkedDuplicateLead(loaded)) {
        originalLead = loaded
      } else if (loaded && !sameLeadId(loaded, duplicateLead)) {
        // Linked row exists but is itself marked duplicate — still usable as fallback later
        originalLead = loaded
      }
    } catch (err) {
      console.error('Failed to load original lead by duplicate_of', err)
    }
  }

  // If linked original is the same record or still a duplicate-looking self, discard it.
  if (originalLead && (sameLeadId(originalLead, duplicateLead) || isMarkedDuplicateLead(originalLead))) {
    originalLead = null
  }

  // 2) Local list (current page / loaded rows) — same phone, not self, prefer non-duplicates
  if (!originalLead && targetPhone) {
    const localMatches = (Array.isArray(localLeads) ? localLeads : []).filter((lead) =>
      phonesMatch(lead?.phone || lead?.mobile, targetPhone)
    )
    originalLead = pickOldestOriginalCandidate(localMatches, duplicateLead)
  }

  // 3) API search — critical when viewing Duplicate stage (local list has only duplicates)
  if (!originalLead && targetPhone) {
    try {
      const { data } = await api.get('/api/leads', {
        params: {
          search: targetPhone,
          // Avoid restricting to Duplicate stage; we need the real originals.
          per_page: 50,
        },
      })
      const apiLeads = extractLeadsPayload(data)
      const phoneMatches = apiLeads.filter((lead) =>
        phonesMatch(lead?.phone || lead?.mobile, targetPhone)
      )
      originalLead = pickOldestOriginalCandidate(phoneMatches, duplicateLead)
    } catch (err) {
      console.error('Failed to search original lead', err)
    }
  }

  if (originalLead && sameLeadId(originalLead, duplicateLead)) {
    return null
  }

  return originalLead
}
