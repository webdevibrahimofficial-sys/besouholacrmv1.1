import { api } from '@utils/api'

export const adminNotificationsApi = {
  list(params = {}) {
    return api.get('/api/super-admin/notifications', { params })
  },
  unreadCount() {
    return api.get('/api/super-admin/notifications/unread-count')
  },
  markAsRead(id) {
    return api.post(`/api/super-admin/notifications/${id}/read`)
  },
  markAllAsRead() {
    return api.post('/api/super-admin/notifications/read-all')
  },
  archive(id) {
    return api.post(`/api/super-admin/notifications/${id}/archive`)
  },
  archiveAllRead() {
    return api.post('/api/super-admin/notifications/archive-all-read')
  },
  settings() {
    return api.get('/api/super-admin/notification-settings')
  },
  updateSettings(payload) {
    return api.put('/api/super-admin/notification-settings', payload)
  },
  subscribePush(subscription) {
    return api.post('/api/super-admin/push/subscribe', subscription)
  },
  unsubscribePush(endpoint) {
    return api.delete('/api/super-admin/push/unsubscribe', { data: endpoint ? { endpoint } : {} })
  },
}

