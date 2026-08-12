import { useState, useEffect, useRef, useCallback, createContext } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot } from 'lucide-react'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTenantFeature } from '@features/tenant-features/hooks/useTenantFeature'
import { TENANT_FEATURE_KEYS } from '@features/tenant-features/utils/featureKeys'
import { useCopilotNotifications } from '@features/ai-copilot/hooks/useCopilotNotifications'
import { useCopilotLeadOpenedListener } from '@features/ai-copilot/hooks/useCopilotLeadOpenedListener'
import { useCopilotRescueScan } from '@features/ai-copilot/hooks/useCopilotRescueScan'
import { useCopilotEscalationScan } from '@features/ai-copilot/hooks/useCopilotEscalationScan'
import { useCopilotLostDetectiveScan } from '@features/ai-copilot/hooks/useCopilotLostDetectiveScan'
import { useNotifications } from '../hooks/useNotifications'
import Topbar from '../shared/components/Topbar'
import AppSidebar from '../shared/components/AppSidebar'
import ImpersonationBanner from '@features/Impersonation/ImpersonationBanner'
import BesouholaCopilotPanel from './BesouholaCopilotPanel'

export const LayoutContext = createContext(null)

export default function Layout({ children }) {
  const { i18n } = useTranslation()
  const { user, crmSettings } = useAppState()
  const isBesouholaCopilotEnabled = useTenantFeature(TENANT_FEATURE_KEYS.BESOUHOLA_COPILOT)
  const isRtl = String(i18n.language || '').startsWith('ar')
  
  // Initialize Notifications
  const { notifications, unreadCount, registerWebPush, fetchNotifications } = useNotifications(user);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobileView, setIsMobileView] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [isModalOpen, setIsModalOpen] = useState(() => document.body.classList.contains('app-modal-open'))
  const [isWebsiteIntegrationOpen, setIsWebsiteIntegrationOpen] = useState(() => document.body.classList.contains('website-integration-open'))
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const copilotDraggedRef = useRef(false)
  const [copilotButtonY, setCopilotButtonY] = useState(() => {
    try {
      const savedY = window.localStorage.getItem('besouholaCopilotButtonY')
      if (savedY) return Number(savedY)

      const savedPosition = window.localStorage.getItem('besouholaCopilotButtonPosition')
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition)
        if (Number.isFinite(parsed?.y)) return parsed.y
      }
    } catch {}
    return Math.max(window.innerHeight - 136, 96)
  })
  const [copilotDrag, setCopilotDrag] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = window.localStorage.getItem('sidebarCollapsed')
      return saved === 'true'
    } catch {
      return false
    }
  })

  const {
    notifications: copilotNotifications,
    unreadCount: copilotUnreadCount,
    loading: copilotNotificationsLoading,
    refresh: refreshCopilotNotifications,
    openNotification: openCopilotNotification,
    dismissNotification: dismissCopilotNotification,
    syncEnqueueResult: syncCopilotEnqueueResult,
  } = useCopilotNotifications()

  const handleCopilotLeadEnqueued = useCallback((result) => {
    syncCopilotEnqueueResult(result)
  }, [syncCopilotEnqueueResult])

  const handleCopilotRescueScanned = useCallback((result) => {
    if ((result?.created ?? 0) > 0) {
      refreshCopilotNotifications()
    }
  }, [refreshCopilotNotifications])

  const handleCopilotEscalationScanned = useCallback((result) => {
    if ((result?.created ?? 0) > 0) {
      refreshCopilotNotifications()
    }
  }, [refreshCopilotNotifications])

  const handleCopilotLostDetectiveScanned = useCallback((result) => {
    if ((result?.created ?? 0) > 0) {
      refreshCopilotNotifications()
    }
  }, [refreshCopilotNotifications])

  useCopilotLeadOpenedListener({
    enabled: Boolean(isBesouholaCopilotEnabled && user?.id),
    locale: isRtl ? 'ar' : 'en',
    onEnqueued: handleCopilotLeadEnqueued,
  })

  useCopilotRescueScan({
    enabled: Boolean(isBesouholaCopilotEnabled && user?.id),
    locale: isRtl ? 'ar' : 'en',
    onScanned: handleCopilotRescueScanned,
  })

  useCopilotEscalationScan({
    enabled: Boolean(isBesouholaCopilotEnabled && user?.id),
    locale: isRtl ? 'ar' : 'en',
    userRole: user?.role || user?.job_title || '',
    onScanned: handleCopilotEscalationScanned,
  })

  useCopilotLostDetectiveScan({
    enabled: Boolean(isBesouholaCopilotEnabled && user?.id),
    locale: isRtl ? 'ar' : 'en',
    onScanned: handleCopilotLostDetectiveScanned,
  })

  useEffect(() => {
    if (!isBesouholaCopilotEnabled || !user?.id) return
    refreshCopilotNotifications()
  }, [isBesouholaCopilotEnabled, user?.id, refreshCopilotNotifications])

  // Lock scroll only when mobile sidebar is open
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    if (isMobile && isMobileSidebarOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }
    return () => document.body.classList.remove('overflow-hidden')
  }, [isMobileSidebarOpen])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e) => setIsMobileView(e.matches)
    mq.addEventListener('change', handler)
    setIsMobileView(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const update = () => setIsModalOpen(document.body.classList.contains('app-modal-open'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const update = () => setIsWebsiteIntegrationOpen(document.body.classList.contains('website-integration-open'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

useEffect(() => {
  // تأكد من أن الاتجاه مطابق للغة الحالية في i18n عند كل رندر
  const currentLang = i18n.language || 'ar';
  const isRtl = currentLang.startsWith('ar');
  
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
  
  // حل إضافي: إضافة class للـ body يساعد الـ CSS في الاستقرار
  document.body.dir = isRtl ? 'rtl' : 'ltr';
  }, [i18n.language]);

  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    const permission = window.Notification.permission;
    if (permission === 'denied') return;

    let alreadySubscribed = false;
    try {
      alreadySubscribed = window.localStorage.getItem('webPushSubscribed') === 'true';
    } catch {}

    if (permission === 'granted' || !alreadySubscribed) {
      const timer = window.setTimeout(() => {
        registerWebPush().catch(() => {});
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [user?.id, registerWebPush]);

  useEffect(() => {
    const allowCollapse = !crmSettings || crmSettings.sidebarCollapsible !== false
    const effectiveCollapsed = allowCollapse ? sidebarCollapsed : false
    const width = effectiveCollapsed ? '88px' : '280px'
    document.documentElement.style.setProperty('--sidebar-desktop-width', width)
  }, [sidebarCollapsed, crmSettings])

  useEffect(() => {
    if (!copilotDrag) return undefined

    const buttonSize = 34
    const margin = 12
    const move = (event) => {
      if (event.cancelable) event.preventDefault()
      const point = event.touches?.[0] || event
      const y = Math.min(
        Math.max(point.clientY - copilotDrag.offsetY, margin),
        window.innerHeight - buttonSize - margin,
      )

      setCopilotButtonY(y)
      const moved = Math.abs(point.clientX - copilotDrag.startX) > 4 || Math.abs(point.clientY - copilotDrag.startY) > 4
      if (moved) copilotDraggedRef.current = true
      setCopilotDrag((current) => current ? { ...current, moved: current.moved || moved } : current)
    }

    const end = () => {
      setCopilotDrag((current) => {
        if (current?.moved || copilotDraggedRef.current) {
          try {
            window.localStorage.setItem('besouholaCopilotButtonY', String(copilotButtonY))
            window.localStorage.removeItem('besouholaCopilotButtonPosition')
          } catch {}
        }
        return null
      })
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)

    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
    }
  }, [copilotDrag, copilotButtonY])

  useEffect(() => {
    const clampCopilotButtonY = () => {
      const buttonSize = 34
      const margin = 12
      setCopilotButtonY((current) => Math.min(
        Math.max(Number.isFinite(current) ? current : window.innerHeight - 136, margin),
        window.innerHeight - buttonSize - margin,
      ))
    }

    window.addEventListener('resize', clampCopilotButtonY)
    clampCopilotButtonY()
    return () => window.removeEventListener('resize', clampCopilotButtonY)
  }, [])

  const startCopilotDrag = (event) => {
    const point = event.touches?.[0] || event
    const rect = event.currentTarget.getBoundingClientRect()
    copilotDraggedRef.current = false
    setCopilotDrag({
      offsetX: point.clientX - rect.left,
      offsetY: point.clientY - rect.top,
      startX: point.clientX,
      startY: point.clientY,
      moved: false,
    })
  }

  const toggleCopilotPanel = () => {
    if (copilotDraggedRef.current) {
      copilotDraggedRef.current = false
      return
    }
    setIsAiPanelOpen((value) => !value)
  }

  const copilotLauncherLabel = isRtl ? 'Besouhola Copilot — المساعد' : 'Besouhola Copilot'
  const copilotLauncherTitle = copilotUnreadCount > 0
    ? (isRtl
      ? `${copilotLauncherLabel} (${copilotUnreadCount} غير مقروء)`
      : `${copilotLauncherLabel} (${copilotUnreadCount} unread)`)
    : copilotLauncherLabel

  return (
    <div className="relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] app-glass-neon">
      <ImpersonationBanner />

      {/* Topbar */}
      <div className={`${(isModalOpen || isWebsiteIntegrationOpen) ? 'hidden' : (isMobileSidebarOpen && isMobileView ? 'hidden md:block' : '')}`}>
        <Topbar
          onMobileToggle={() => setIsMobileSidebarOpen(v => !v)}
          mobileSidebarOpen={isMobileSidebarOpen}
          notifications={notifications}
          unreadCount={unreadCount}
        />
      </div>

      {/* Layout Wrapper */}
      <div className="flex w-full">
        {/* Sidebar (direct sibling) */}
        <AppSidebar 
          className={isWebsiteIntegrationOpen ? 'hidden' : ''}
          open={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          collapsed={!crmSettings || crmSettings.sidebarCollapsible !== false ? sidebarCollapsed : false}
          setCollapsed={(val) => {
            setSidebarCollapsed(val)
            try { window.localStorage.setItem('sidebarCollapsed', String(val)) } catch {}
          }}
        />

        <div 
          className={`content-container flex flex-col min-h-0 flex-1 min-w-0 transition-all duration-300 ease-in-out`}
        
        >
          <main className="main-pane flex-1 px-0 m-0 overflow-x-clip min-w-0">
            <div className="w-full px-4 md:px-6">
              {children ?? <Outlet context={{ notifications, unreadCount, registerWebPush, fetchNotifications }} />}
            </div>
          </main>
        </div>
      </div>
      
      {isBesouholaCopilotEnabled ? (
        <>
          <div
            className={`fixed right-0 z-[181] ${isAiPanelOpen ? 'pointer-events-none translate-x-full opacity-0' : 'translate-x-0 opacity-100'} transition-[transform,opacity] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]`}
            style={{ top: copilotButtonY }}
          >
            <div className="relative overflow-visible">
              {copilotUnreadCount > 0 ? (
                <span className="pointer-events-none absolute left-1/2 bottom-full z-[30] mb-0.5 flex min-h-[15px] min-w-[15px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white shadow-md">
                  {copilotUnreadCount > 9 ? '9+' : copilotUnreadCount}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={copilotLauncherTitle}
                title={copilotLauncherTitle}
                className="copilot-launcher relative flex h-[34px] w-[20px] items-center justify-center rounded-l-md border border-r-0 border-cyan-100/70 bg-gradient-to-b from-sky-400 via-cyan-500 to-sky-700 text-white hover:brightness-110 cursor-grab active:cursor-grabbing touch-none select-none"
                onMouseDown={startCopilotDrag}
                onTouchStart={startCopilotDrag}
                onClick={toggleCopilotPanel}
              >
                <Bot className="relative z-[1] h-3 w-3 drop-shadow-[0_0_6px_rgba(255,255,255,0.85)]" />
              </button>
            </div>
          </div>

          <BesouholaCopilotPanel
            open={isAiPanelOpen}
            onClose={() => setIsAiPanelOpen(false)}
            isRtl={isRtl}
            notifications={copilotNotifications}
            unreadCount={copilotUnreadCount}
            notificationsLoading={copilotNotificationsLoading}
            onRefreshNotifications={refreshCopilotNotifications}
            onOpenNotification={openCopilotNotification}
            onDismissNotification={dismissCopilotNotification}
          />
        </>
      ) : null}
    </div>
  )
}
