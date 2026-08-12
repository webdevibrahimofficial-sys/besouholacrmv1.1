import { useCallback, useState } from 'react'
import { api } from '@utils/api'

export function useCopilotNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, countRes] = await Promise.all([
        api.get('/api/ai/copilot/notifications'),
        api.get('/api/ai/copilot/notifications/unread-count'),
      ])

      const listData = listRes?.data?.data || {}
      setNotifications(Array.isArray(listData.notifications) ? listData.notifications : [])
      setUnreadCount(Number(
        countRes?.data?.data?.unread_count
        ?? listData.unread_count
        ?? 0,
      ))
    } catch {
      setNotifications([])
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const openNotification = useCallback(async (notificationId, locale = 'en') => {
    const response = await api.post(`/api/ai/copilot/notifications/${notificationId}/open`, { locale })
    const data = response?.data?.data || {}

    if (typeof data.unread_count === 'number') {
      setUnreadCount(data.unread_count)
    }

    await refresh()
    return data
  }, [refresh])

  const dismissNotification = useCallback(async (notificationId) => {
    const response = await api.patch(`/api/ai/copilot/notifications/${notificationId}/dismiss`)
    const data = response?.data?.data || {}

    if (typeof data.unread_count === 'number') {
      setUnreadCount(data.unread_count)
    }

    await refresh()
    return data
  }, [refresh])

  const syncEnqueueResult = useCallback((result) => {
    if (!result || result.ok === false) return

    if (typeof result.unread_count === 'number') {
      setUnreadCount(result.unread_count)
    }

    if (!result.notification) return

    setNotifications((current) => {
      const incoming = result.notification
      const existingIndex = current.findIndex((item) => item.id === incoming.id)
      if (existingIndex >= 0) {
        const next = [...current]
        next[existingIndex] = incoming
        return next
      }

      return [incoming, ...current]
    })
  }, [])

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    openNotification,
    dismissNotification,
    syncEnqueueResult,
  }
}
