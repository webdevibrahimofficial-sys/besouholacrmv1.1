export const isAdminNotificationsV1Enabled = () => {
  const raw = String(import.meta.env.VITE_ADMIN_NOTIFICATIONS_V1 ?? '').trim().toLowerCase()
  // Enabled by default for super-admin UI unless explicitly disabled.
  if (!raw) return true
  return !['false', '0', 'off', 'no'].includes(raw)
}

export const isSecureQuickSwitchEnabled = () => {
  const raw = String(import.meta.env.VITE_SECURE_QUICK_SWITCH ?? '').trim().toLowerCase()
  if (!raw) return true
  return !['false', '0', 'off', 'no'].includes(raw)
}

