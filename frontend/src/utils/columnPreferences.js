export const normalizeColumnOrder = (order, availableKeys, keepLastKeys = ['creationDate']) => {
  const keys = Array.isArray(availableKeys) ? availableKeys : []
  const input = Array.isArray(order) ? order : []
  const normalized = []

  input.forEach((key) => {
    if (keys.includes(key) && !normalized.includes(key)) {
      normalized.push(key)
    }
  })

  keys.forEach((key) => {
    if (!normalized.includes(key)) {
      normalized.push(key)
    }
  })

  let next = [...normalized]
  keepLastKeys.forEach((key) => {
    if (next.includes(key)) {
      next = [...next.filter(item => item !== key), key]
    }
  })

  return next
}

export const getFavoriteColumnOrder = (user, pageKey) => {
  const order = user?.meta_data?.ui_preferences?.[pageKey]?.favorite_order
  return Array.isArray(order) ? order.filter(Boolean) : []
}
