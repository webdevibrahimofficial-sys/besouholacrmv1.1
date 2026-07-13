import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { login as svcLogin, logout as svcLogout, getProfile } from '@services/auth'
import { captureDeviceInfo, saveDeviceForUser } from '@utils/device'
import { api } from '@utils/api'
import { preloadRotationSettings } from '@services/rotationService'
import { isSystemAdminContext, shouldUseAdminPanel } from '@utils/authRouting'
import { isTenantAdminUser } from '@services/leadPermissions'
import { isRealEstateCompanyType, resolveTenantCompanyTypeSources } from '@shared/utils/tenantCompanyType'
import { getCrmTimeZone } from '@shared/utils/crmDateTime'
import { useTheme } from '@shared/context/ThemeProvider'
import i18n from '../../i18n'
import { ensureEcho, disconnectEcho } from '../../echo'

const AppStateContext = createContext(null)

export function AppStateProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { syncThemeFromUser, syncCrmTimezone } = useTheme()
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [impersonation, setImpersonation] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [activeModules, setActiveModules] = useState([])
  const [permissions, setPermissions] = useState([])
  const [bootstrapped, setBootstrapped] = useState(false)
  const [crmSettings, setCrmSettings] = useState(null)
  const [inventoryBadges, setInventoryBadges] = useState(null)
  const isSubscriptionActive = useMemo(() => {
    if (!subscription) return false
    const status = String(subscription.status || '').toLowerCase()
    if (status !== 'active') return false
    const end = subscription.end_date ? new Date(subscription.end_date) : null
    return end ? end.getTime() >= Date.now() : true
  }, [subscription])

  const userId = user?.id ?? null
  const isSuperAdminUser = Boolean(user?.is_super_admin)

  const setProfile = useCallback((payload) => {
    if (!payload) return
    
    // Normalize role name for display purposes
    const rawUser = payload.user || null
    if (rawUser && rawUser.role) {
      const roleLower = rawUser.role.toLowerCase()
      if (roleLower === 'tenant admin' || roleLower === 'tenant-admin') {
        rawUser.role = 'admin'
      }
    }
    
    setUser(rawUser)

    // Sync Language Preference from User Profile
    if (rawUser && rawUser.locale) {
      const currentLng = i18n.language;
      if (currentLng !== rawUser.locale) {
        i18n.changeLanguage(rawUser.locale);
        localStorage.setItem('language', rawUser.locale);
      }
    }

    // Sync Theme Preference from User Profile — DB is the source of truth.
    // This fixes mobile browsers (Android Night Mode / cleared localStorage)
    // where localStorage may be empty or stale, causing wrong theme on load.
    // IMPORTANT: go through ThemeProvider (single source of truth) instead of
    // touching the DOM/localStorage directly — otherwise the <html> class and
    // React's resolvedTheme desync and text keeps the old theme's colors.
    if (rawUser?.theme_mode) {
      syncThemeFromUser(rawUser.theme_mode)
    }

    setCompany(payload.company || payload.tenant || null)

    let nextImpersonation = payload.impersonation || null
    try {
      const bootstrapRaw = window.sessionStorage.getItem('impersonation_bootstrap')
      if (bootstrapRaw) {
        // The bootstrap key is only a one-shot fallback to bridge the gap right
        // after ImpersonationCallback, before the backend profile confirms the
        // session. Once we've read it here, the backend response (payload.impersonation)
        // is authoritative, so we ALWAYS clear it — otherwise a stale 'active: true'
        // value survives (in sessionStorage) past logout/exit and silently blocks
        // super admin routing on the next login in the same tab.
        if (!nextImpersonation?.active) {
          try {
            const bootstrap = JSON.parse(bootstrapRaw)
            if (bootstrap?.active) {
              nextImpersonation = bootstrap
            }
          } catch {
            // ignore parse errors
          }
        }
        window.sessionStorage.removeItem('impersonation_bootstrap')
      }
    } catch {
      // ignore storage errors
    }
    setImpersonation(nextImpersonation)
    
    setSubscription(payload.subscription || null)
    setSubscriptionPlan(payload.subscription_plan || null)
    setPanelMode(payload.panel_mode || null)

    setPermissions(payload.user_permissions || payload.permissions || [])
    
    let modules = []
    if (payload.enabled_modules && Array.isArray(payload.enabled_modules)) {
      modules = payload.enabled_modules.map(m => m.slug)
    } else if (Array.isArray(payload.activeModules)) {
      modules = payload.activeModules
    }
    setActiveModules(modules)
  }, [syncThemeFromUser])

  const fetchCompanyInfo = useCallback(async () => {
    const payload = await getProfile()
    setProfile(payload)

    // Start / refresh WebSocket connection (Reverb) after a valid token exists.
    try { ensureEcho() } catch {}

    const isSuperAdmin = isSystemAdminContext(payload, {
      permissions: payload?.user_permissions || payload?.permissions,
      subscriptionPlan: payload?.subscription_plan,
      panelMode: payload?.panel_mode,
      isSystemAdmin: payload?.is_system_admin,
    })

    if (isSuperAdmin) {
      return payload
    }

    try {
      const res = await api.get('/api/crm-settings')
      const settings = res?.data?.settings || null
      setCrmSettings(settings)
      if (settings) {
        syncCrmTimezone(getCrmTimeZone(settings))
      }
      await preloadRotationSettings()
    } catch {}
    return payload
  }, [setProfile, syncCrmTimezone])

  const refreshInventoryBadges = useCallback(async () => {
    try {
      const res = await api.get('/api/inventory/new-counts')
      const data = res?.data?.data || res?.data || {}
      setInventoryBadges(data)
    } catch {
      setInventoryBadges(prev => prev || {})
    }
  }, [])

  const saveUiPreference = useCallback(async (page, favoriteOrder) => {
    if (!page) return null
    const response = await api.post('/api/profile/preferences', {
      page,
      favorite_order: Array.isArray(favoriteOrder) ? favoriteOrder : [],
    })
    try {
      await fetchCompanyInfo()
    } catch {}
    return response?.data || null
  }, [fetchCompanyInfo])

  const login = useCallback(async (email, password, subdomain, rememberMe = false) => {
    const result = await svcLogin(email, password, subdomain, rememberMe)
    if (result?.requires_2fa) {
      return result
    }

    const shouldSkipProfileFetchDuringRedirect = (() => {
      if (!result?.redirected || typeof window === 'undefined') {
        return false
      }

      if (result?.redirect_mode === 'local_hash' || result?.redirect_mode === 'same_origin') {
        return false
      }

      if (!result?.redirect_url) {
        return false
      }

      try {
        const targetUrl = new URL(result.redirect_url, window.location.origin)
        return targetUrl.origin !== window.location.origin
          || targetUrl.hostname !== window.location.hostname
      } catch {
        return false
      }
    })()

    if (shouldSkipProfileFetchDuringRedirect) {
      return result
    }
    
    // Always fetch latest profile data to ensure state is fresh, 
    // even if redirection is flagged (e.g. for Super Admin)
    let payload = null
    try {
      payload = await fetchCompanyInfo()
    } catch {
      payload = result || null
      if (payload?.user) {
        setProfile({
          user: payload.user,
          company: payload.tenant || payload.company || null,
          impersonation: payload.impersonation || null,
          subscription_plan: payload.subscription_plan || null,
          panel_mode: payload.panel_mode || null,
          user_permissions: payload.user_permissions || [],
          enabled_modules: payload.enabled_modules || result?.enabled_modules || [],
        })
      } else if (result?.token) {
        setProfile({
          user: result.user || null,
          company: result.tenant || result.company || null,
          impersonation: result.impersonation || null,
          subscription_plan: result.subscription_plan || null,
          panel_mode: result.panel_mode || null,
          user_permissions: result.user_permissions || [],
          enabled_modules: result.enabled_modules || [],
        })
      }
    }
    try {
      const uid = payload?.user?.id || email
      const device = captureDeviceInfo()
      saveDeviceForUser(uid, device)
    } catch {}
    
    // Check if user is Super Admin
    const isSuperAdmin = isSystemAdminContext(payload, {
      permissions: payload?.user_permissions || payload?.permissions,
      subscriptionPlan: payload?.subscription_plan,
      panelMode: payload?.panel_mode,
      isSystemAdmin: payload?.is_system_admin,
    }) || !!result?.isSuperAdmin;

    if (isSuperAdmin) {
       // Super Admin routing is handled in Login.jsx
       result.isSuperAdmin = true;
    }

    return {
      ...result,
      user: payload?.user || result?.user || null,
      tenant: payload?.company || payload?.tenant || result?.tenant || null,
      impersonation: payload?.impersonation || result?.impersonation || null,
      user_permissions: payload?.user_permissions || payload?.permissions || result?.user_permissions || [],
      subscription_plan: payload?.subscription_plan || result?.subscription_plan || null,
      panel_mode: payload?.panel_mode || result?.panel_mode || null,
      is_system_admin: payload?.is_system_admin ?? result?.is_system_admin ?? null,
      enabled_modules: payload?.enabled_modules || result?.enabled_modules || [],
      next_path: result?.next_path || null,
    }
  }, [fetchCompanyInfo])

  const logout = useCallback(async () => {
    const logoutToken =
      window.localStorage.getItem('token') ||
      window.sessionStorage.getItem('token') ||
      null

    // 1. Clear state immediately to stop UI from trying to fetch user-dependent data
    setUser(null)
    setCompany(null)
    setSubscription(null)
    setSubscriptionPlan(null)
    setPanelMode(null)
    setActiveModules([])
    setPermissions([])
    
    // 2. Clear tokens immediately (don't wait for server)
    window.localStorage.removeItem('token')
    window.sessionStorage.removeItem('token')
    try { window.sessionStorage.removeItem('impersonation_bootstrap') } catch {}
    try { disconnectEcho() } catch {}
     
    // Clear cookies with domain handling (Matching auth.js logic)
    document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    const host = window.location.hostname;
    const parts = host.split('.');
    if (parts[0] === 'www') parts.shift();
    
    // 1. Root domain
    const rootDomain = parts.length > 1 ? '.' + parts.slice(-2).join('.') : null;
    if (rootDomain) {
       document.cookie = `token=; Path=/; Domain=${rootDomain}; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
    }
    
    // 2. Current domain (subdomain)
    const currentDomain = '.' + parts.join('.');
    if (currentDomain !== rootDomain) {
        document.cookie = `token=; Path=/; Domain=${currentDomain}; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
    }
    
    // 3. Localhost
    if (host === 'localhost') {
        document.cookie = `token=; Path=/; Domain=.localhost; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
    }
    
    // 3. Navigate immediately
    navigate('/login', { replace: true })
    
    // 4. Call service logout (clears tokens again and calls API)
    try {
      await svcLogout({ tokenOverride: logoutToken })
    } catch {}
  }, [navigate])

  useEffect(() => {
    if (!bootstrapped || !userId || isSuperAdminUser) return undefined

    let cancelled = false

    const heartbeat = async () => {
      if (cancelled || typeof document === 'undefined' || document.visibilityState === 'hidden') {
        return
      }

      try {
        const res = await api.get('/api/me')
        const payload = res?.data?.data || res?.data
        if (payload) {
          setProfile(payload)
        }
      } catch {
        // Global API interceptor handles redirect/logout for blocked tenants or revoked tokens.
      }
    }

    heartbeat()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        heartbeat()
      }
    }

    const handleWindowFocus = () => {
      heartbeat()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [bootstrapped, userId, isSuperAdminUser, setProfile])

  const canAccess = useCallback((moduleKey, requiredPermission = null) => {
    if (!moduleKey) return false
    
    const roleLower = String(user?.role || '').toLowerCase()
    const isSuperAdmin = isSystemAdminContext(user, { permissions, subscriptionPlan, panelMode })
    const isRealEstateTenant = isRealEstateCompanyType(...resolveTenantCompanyTypeSources(company, crmSettings))
    
    const isTenantAdmin = isTenantAdminUser(user)

    if (isSuperAdmin) return true

    // Support module is removed systemwide (all tenants).
    if (moduleKey === 'support') return false
    if (moduleKey === 'customers' && isRealEstateTenant) return false
    if (moduleKey === 'contract_collections' && !isRealEstateTenant) return false
    
    // Tenant Admin has full access to reports regardless of module settings
    if (isTenantAdmin && moduleKey === 'reports') return true

    const inventoryFallbackModules = isRealEstateTenant
      ? [
          'projects',
          'properties',
          'developers',
          'brokers',
          'requests',
          'buyerRequests',
          'sellerRequests',
        ]
      : [
          'items',
          'products',
          'suppliers',
          'warehouse',
          'stockManagement',
          'inventoryTransactions',
          'orders',
        ]

    const expandedModulesMap = {
      inventory: ['inventory', ...inventoryFallbackModules],
      sales: [
        'leads',
        'customers',
        'orders',
        'sales',
        'quotations',
        'invoices'
      ],
      items: isRealEstateTenant ? ['items'] : ['items', 'inventory'],
      orders: isRealEstateTenant ? ['orders', 'sales'] : ['orders', 'inventory', 'sales'],
      products: isRealEstateTenant ? ['products'] : ['products', 'inventory'],
      suppliers: isRealEstateTenant ? ['suppliers'] : ['suppliers', 'inventory'],
      warehouse: isRealEstateTenant ? ['warehouse'] : ['warehouse', 'inventory'],
      stockManagement: isRealEstateTenant ? ['stockManagement'] : ['stockManagement', 'inventory'],
      inventoryTransactions: isRealEstateTenant ? ['inventoryTransactions'] : ['inventoryTransactions', 'inventory'],
      projects: isRealEstateTenant ? ['projects', 'inventory'] : ['projects'],
      properties: isRealEstateTenant ? ['properties', 'inventory'] : ['properties'],
      developers: isRealEstateTenant ? ['developers', 'inventory'] : ['developers'],
      brokers: isRealEstateTenant ? ['brokers', 'inventory'] : ['brokers'],
      requests: isRealEstateTenant ? ['requests', 'inventory'] : ['requests'],
      buyerRequests: isRealEstateTenant ? ['buyerRequests', 'inventory'] : ['buyerRequests'],
      sellerRequests: isRealEstateTenant ? ['sellerRequests', 'inventory'] : ['sellerRequests'],
    }

    const keysToCheck = expandedModulesMap[moduleKey] || [moduleKey]
    const hasAnyModule = keysToCheck.some(k => activeModules.includes(k))
    if (!hasAnyModule) return false
    
    if (requiredPermission) {
      if (isTenantAdmin) return true 
      return permissions.includes(requiredPermission)
    }
    
    return true
  }, [activeModules, permissions, user, company, subscriptionPlan, crmSettings])

  const value = useMemo(() => ({
    user,
    company,
    impersonation,
    subscription,
    subscriptionPlan,
    panelMode,
    activeModules,
    permissions,
    isSubscriptionActive,
    setProfile,
    fetchCompanyInfo,
    login,
    logout,
    canAccess,
    bootstrapped,
    crmSettings,
    setCrmSettings,
    inventoryBadges,
      refreshInventoryBadges,
      saveUiPreference,
    }), [user, company, impersonation, subscription, subscriptionPlan, panelMode, activeModules, permissions, isSubscriptionActive, setProfile, fetchCompanyInfo, login, logout, canAccess, bootstrapped, crmSettings, setCrmSettings, inventoryBadges, refreshInventoryBadges, saveUiPreference])

useEffect(() => {
  if (bootstrapped) return

  const isImpersonationCallback = location.pathname === '/auth/impersonation-callback'

  if (isImpersonationCallback) {
    setBootstrapped(true)
    return
  }

  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  };

  const lsToken = window.localStorage.getItem('token');
  const ssToken = window.sessionStorage.getItem('token');
  const cookieToken = getCookie('token');
  
  // إذا كان التوكن موجوداً في الكوكيز وغير موجود في الـ LocalStorage (حالة انتقال الدومين)
  if (!lsToken && !ssToken && cookieToken) {
    window.sessionStorage.setItem('token', cookieToken);
  }

  const token = lsToken || ssToken || cookieToken;
  if (token) {
    fetchCompanyInfo()
      .catch((err) => {
        // Only clear if 401 Unauthorized
        if (err?.response?.status === 401) {
          window.localStorage.removeItem('token');
          window.sessionStorage.removeItem('token');
        }
      })
      .finally(() => {
        setBootstrapped(true);
      });
  } else {
    setBootstrapped(true);
  }
}, [bootstrapped, fetchCompanyInfo, location.pathname]);

 useEffect(() => {
   if (!bootstrapped || !user) return

   const hashPath = window.location.hash.replace(/^#/, '') || '/'
   const path = hashPath.split('?')[0]
   if (
     path === '/dashboard' &&
     shouldUseAdminPanel(user, impersonation, { permissions, subscriptionPlan, panelMode })
   ) {
     navigate('/system/dashboard', { replace: true })
   }
 }, [bootstrapped, user, impersonation, permissions, subscriptionPlan, panelMode, navigate])

 useEffect(() => {
   if (!userId || isSuperAdminUser) return
   if (isSystemAdminContext(user, { permissions, subscriptionPlan, panelMode })) return
   refreshInventoryBadges()
 }, [userId, isSuperAdminUser, refreshInventoryBadges])

 useEffect(() => {
   if (!crmSettings) return
   syncCrmTimezone(getCrmTimeZone(crmSettings))
 }, [crmSettings, syncCrmTimezone])

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
