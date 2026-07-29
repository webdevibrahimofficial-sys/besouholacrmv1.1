function normalizeRoleValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getUserRole(user) {
  return normalizeRoleValue(user?.role || user?.job_title || '')
}

function isHierarchyLimitedRole(user) {
  const role = getUserRole(user)
  if (!role) return false
  if (role === 'telesales agent') return true
  if (role.includes('team leader')) return true
  if (role === 'manager' || role.includes('telesales manager')) return true
  return false
}

function collectScopedUserIds(rootUserId, users) {
  const allUsers = Array.isArray(users) ? users : []
  const byManager = new Map()

  allUsers.forEach((entry) => {
    const managerId = Number(entry?.manager_id || 0)
    if (!byManager.has(managerId)) byManager.set(managerId, [])
    byManager.get(managerId).push(entry)
  })

  const queue = [Number(rootUserId || 0)].filter((id) => id > 0)
  const visited = new Set(queue)
  const scopedIds = new Set(queue)

  while (queue.length > 0) {
    const currentId = queue.shift()
    const children = byManager.get(currentId) || []
    children.forEach((child) => {
      const childId = Number(child?.id || 0)
      if (!childId || visited.has(childId)) return
      visited.add(childId)
      scopedIds.add(childId)
      queue.push(childId)
    })
  }

  return Array.from(scopedIds)
}

export function getScopedTelesalesUserIds(viewer, users) {
  const viewerId = Number(viewer?.id || 0)
  if (!viewerId) return null
  if (!isHierarchyLimitedRole(viewer)) return null
  return collectScopedUserIds(viewerId, users)
}

export function filterTelesalesRowsByScope(rows, viewer, users) {
  const scopedIds = getScopedTelesalesUserIds(viewer, users)
  if (!Array.isArray(scopedIds) || scopedIds.length === 0) {
    return Array.isArray(rows) ? rows : []
  }

  const allowedIds = new Set(scopedIds.map((id) => Number(id)).filter((id) => id > 0))

  return (Array.isArray(rows) ? rows : []).filter((lead) => {
    const assignedTo = Number(lead?.assigned_to || lead?.assigned_to_id || 0)
    const managerId = Number(lead?.manager_id || 0)
    const transferFromAssigneeId = Number(lead?.transfer_from_assignee_id || 0)
    const convertById = Number(lead?.convert_by_id || 0)

    return (
      (assignedTo > 0 && allowedIds.has(assignedTo))
      || (managerId > 0 && allowedIds.has(managerId))
      || (transferFromAssigneeId > 0 && allowedIds.has(transferFromAssigneeId))
      || (convertById > 0 && allowedIds.has(convertById))
    )
  })
}

export function shouldUseLocalScopedSummary(viewer, users) {
  const scopedIds = getScopedTelesalesUserIds(viewer, users)
  return Array.isArray(scopedIds) && scopedIds.length > 0
}
