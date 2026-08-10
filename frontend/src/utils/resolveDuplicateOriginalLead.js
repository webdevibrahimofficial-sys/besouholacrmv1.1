/**
 * Fetch the original lead for a duplicate from the backend.
 * Pairing / enable / resolve decisions stay server-side — this is a thin API helper only.
 */

export async function resolveDuplicateOriginalLead({ api, duplicateLead }) {
  const duplicateId = duplicateLead?.id ?? duplicateLead?._id
  if (!duplicateId) return null

  try {
    const { data } = await api.get(`/api/leads/${encodeURIComponent(String(duplicateId))}/duplicate-original`)
    const original = data?.original || data?.data?.original || null
    const originalId = original?.id ?? original?._id ?? data?.original_lead_id ?? null

    if (!original || originalId == null) return null
    if (String(originalId) === String(duplicateId)) return null

    return original
  } catch (err) {
    console.error('Failed to load duplicate original from backend', err)
    return null
  }
}
