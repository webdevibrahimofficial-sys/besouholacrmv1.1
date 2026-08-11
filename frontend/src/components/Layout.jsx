import { useState, useEffect, useRef, createContext } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot } from 'lucide-react'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTenantFeature } from '@features/tenant-features/hooks/useTenantFeature'
import { TENANT_FEATURE_KEYS } from '@features/tenant-features/utils/featureKeys'
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
  
  // Initialize Notifications
  const { notifications, unreadCount, registerWebPush, fetchNotifications } = useNotifications(user);

  const isRtl = String(i18n.language || '').startsWith('ar')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobileView, setIsMobileView] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [isModalOpen, setIsModalOpen] = useState(() => document.body.classList.contains('app-modal-open'))
  const [isWebsiteIntegrationOpen, setIsWebsiteIntegrationOpen] = useState(() => document.body.classList.contains('website-integration-open'))
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const copilotDraggedRef = useRef(false)
  const [copilotButtonPosition, setCopilotButtonPosition] = useState(() => {
    try {
      const saved = window.localStorage.getItem('besouholaCopilotButtonPosition')
      if (saved) return JSON.parse(saved)
    } catch {}
    return null
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

    const buttonSize = 56
    const margin = 12
    const move = (event) => {
      const point = event.touches?.[0] || event
      const x = Math.min(
        Math.max(point.clientX - copilotDrag.offsetX, margin),
        window.innerWidth - buttonSize - margin,
      )
      const y = Math.min(
        Math.max(point.clientY - copilotDrag.offsetY, margin),
        window.innerHeight - buttonSize - margin,
      )

      setCopilotButtonPosition({ x, y })
      const moved = Math.abs(point.clientX - copilotDrag.startX) > 4 || Math.abs(point.clientY - copilotDrag.startY) > 4
      if (moved) copilotDraggedRef.current = true
      setCopilotDrag((current) => current ? { ...current, moved: current.moved || moved } : current)
    }

    const end = () => {
      setCopilotDrag((current) => {
        if ((current?.moved || copilotDraggedRef.current) && copilotButtonPosition) {
          try {
            window.localStorage.setItem('besouholaCopilotButtonPosition', JSON.stringify(copilotButtonPosition))
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
  }, [copilotDrag, copilotButtonPosition])

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
          <button
            type="button"
            aria-label={isRtl ? 'Besouhola Copilot — المساعد' : 'Besouhola Copilot'}
            title={isRtl ? 'Besouhola Copilot — المساعد' : 'Besouhola Copilot'}
            className={`fixed z-[140] rounded-full shadow-xl bg-gradient-to-br from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600 text-white flex items-center justify-center transition hover:scale-[1.03] cursor-grab active:cursor-grabbing touch-none select-none ${copilotButtonPosition ? '' : `bottom-6 ${isRtl ? 'left-6' : 'right-6'}`}`}
            style={{
              width: 56,
              height: 56,
              ...(copilotButtonPosition ? { left: copilotButtonPosition.x, top: copilotButtonPosition.y } : {}),
            }}
            onMouseDown={startCopilotDrag}
            onTouchStart={startCopilotDrag}
            onClick={toggleCopilotPanel}
          >
            <Bot className="w-6 h-6" />
          </button>

          <BesouholaCopilotPanel
            open={isAiPanelOpen}
            onClose={() => setIsAiPanelOpen(false)}
            isRtl={isRtl}
          />
        </>
      ) : null}
    </div>
  )
}
