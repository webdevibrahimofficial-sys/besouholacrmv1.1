import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminNotificationsApi } from '@api/adminNotificationsApi'
import { isAdminNotificationsV1Enabled } from '@utils/features'

export function useAdminNotifications(user) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const enabled = isAdminNotificationsV1Enabled() && !!user?.is_super_admin

  const fetchNotifications = useCallback(async (params = {}) => {
    if (!enabled) return
    setLoading(true)
    try {
      const { data } = await adminNotificationsApi.list(params)
      setNotifications(data?.notifications?.data || [])
      setUnreadCount(Number(data?.unread_count || 0))
    } finally {
      setLoading(false)
    }
  }, [enabled])

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) return
    const { data } = await adminNotificationsApi.unreadCount()
    setUnreadCount(Number(data?.count || 0))
  }, [enabled])

  useEffect(() => {
    fetchNotifications()
    if (!enabled) return undefined
    const interval = setInterval(() => {
      refreshUnreadCount().catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [enabled, fetchNotifications, refreshUnreadCount])

  const mappedNotifications = useMemo(() => {
    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body || '',
      severity: n.severity || 'info',
      category: n.category || 'system',
      source: n.source || 'system',
      actionUrl: n.action_url,
      relatedTenantId: n.related_tenant_id || null,
      data: n.data || {},
      read: !!n.read_at,
      archived: !!n.archived_at,
      createdAt: n.created_at,
    }))
  }, [notifications])

  const runAndRefresh = useCallback(async (request, params = {}) => {
    const response = await request()
    await fetchNotifications(params)
    return response
  }, [fetchNotifications])

  return {
    enabled,
    loading,
    notifications: mappedNotifications,
    unreadCount,
    fetchNotifications,
    refreshUnreadCount,
    markAsRead: (id, params = {}) => runAndRefresh(() => adminNotificationsApi.markAsRead(id), params),
    markAllAsRead: (params = {}) => runAndRefresh(() => adminNotificationsApi.markAllAsRead(), params),
    archive: (id, params = {}) => runAndRefresh(() => adminNotificationsApi.archive(id), params),
    archiveAllRead: (params = {}) => runAndRefresh(() => adminNotificationsApi.archiveAllRead(), params),
  }
}

