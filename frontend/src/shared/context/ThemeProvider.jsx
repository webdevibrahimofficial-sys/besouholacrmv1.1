import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { palette, fonts } from '../../theme.js'
import { api } from '@utils/api'
import {
  DEFAULT_CRM_TIMEZONE,
  getStoredCrmTimeZone,
  persistCrmTimeZone,
  resolveAutoModeByTime,
} from '@shared/utils/themeAutoMode'

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  resolvedTheme: 'light',
  syncThemeFromUser: () => {},
  syncCrmTimezone: () => {},
  crmTimeZone: DEFAULT_CRM_TIMEZONE,
})

// ─── helper: قراءة الثيم المحفوظ من localStorage ─────────────────────────────
function readSavedTheme() {
  try {
    const prefsRaw = localStorage.getItem('systemPrefs')
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw)
      if (prefs?.theme === 'light' || prefs?.theme === 'dark' || prefs?.theme === 'auto') {
        return prefs.theme
      }
    }
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved
  } catch {}
  return 'light'
}

// ─── helper: تطبيق الوضع الفعلي على <html> ────────────────────────────────────
function applyMode(mode) {
  const root = document.documentElement
  if (mode === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.remove('dark')
    root.classList.add('light')
  }
}

// ─── helper: حفظ اختيار المستخدم في الـ DB (fire-and-forget) ─────────────────
// من غير الحفظ ده، الـ heartbeat اللي بيزامن theme_mode من البروفايل
// هيرجّع الثيم القديم أول ما النافذة تاخد فوكس تاني.
function persistThemeToBackend(mode) {
  try {
    const hasToken =
      window.localStorage.getItem('token') || window.sessionStorage.getItem('token')
    if (!hasToken) return
    api.post('/api/profile/theme', { theme_mode: mode }, {
      skipAuthRedirect: true,
      suppressErrorLog: true,
    }).catch(() => {})
  } catch {}
}

export const ThemeProvider = ({ children }) => {
  const [crmTimeZone, setCrmTimeZone] = useState(
    () => getStoredCrmTimeZone() || DEFAULT_CRM_TIMEZONE,
  )
  const [theme, setThemeState] = useState(() => readSavedTheme())
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const saved = readSavedTheme()
    if (saved === 'auto') {
      return resolveAutoModeByTime(getStoredCrmTimeZone() || DEFAULT_CRM_TIMEZONE)
    }
    return saved === 'dark' ? 'dark' : 'light'
  })

  // ─── الدالة العامة لتغيير الثيم (الوحيدة المُصرَّح بها) ───────────────────
  // بتحفظ الاختيار في الـ DB كمان، عشان الـ heartbeat (اللي بيقرا theme_mode
  // من البروفايل عند رجوع الفوكس) ميرجعش الثيم القديم بعد ما المستخدم بدّله.
  const setTheme = useCallback((val) => {
    const normalized = String(val).toLowerCase()
    if (normalized !== 'light' && normalized !== 'dark' && normalized !== 'auto') return
    setThemeState(normalized)
    persistThemeToBackend(normalized)
  }, [])

  // ─── تطبيق الثيم على DOM وحفظه في localStorage ──────────────────────────────
  useEffect(() => {
    const compute = () => {
      const mode = theme === 'auto' ? resolveAutoModeByTime(crmTimeZone) : theme
      setResolvedTheme(mode)
      applyMode(mode)
    }

    compute()

    // في وضع auto: أعد الحساب كل دقيقة وعند رجوع التاب (حسب وقت CRM timezone)
    let interval = null
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') compute()
    }

    if (theme === 'auto') {
      interval = setInterval(compute, 60000)
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    // حفظ الثيم في localStorage بشكل موحّد في مكان واحد
    try {
      localStorage.setItem('theme', theme)
      const prefsRaw = localStorage.getItem('systemPrefs')
      const prefs = prefsRaw ? JSON.parse(prefsRaw) : {}
      prefs.theme = theme
      localStorage.setItem('systemPrefs', JSON.stringify(prefs))
    } catch {}

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [theme, crmTimeZone])

  // ─── تطبيق density وdirection عند التحميل الأول ─────────────────────────────
  useEffect(() => {
    try {
      const prefsRaw = localStorage.getItem('systemPrefs')
      if (!prefsRaw) return
      const prefs = JSON.parse(prefsRaw)
      const root = document.documentElement
      if (prefs?.density) {
        root.classList.remove('density-compact', 'density-comfortable', 'density-default')
        root.classList.add(`density-${prefs.density}`)
      }
      if (prefs?.direction) {
        document.dir = prefs.direction === 'rtl' ? 'rtl' : 'ltr'
      }
    } catch {}
  }, [])

  // ─── مزامنة theme_mode من بيانات المستخدم عند تغيير الـ user ─────────────────
  // (يُستدعى من AppStateProvider بعد login/heartbeat عبر syncThemeFromUser)
  // مستقرة بـ useCallback عشان تنفع dependency في useCallback/useEffect عند المستهلكين
  const syncThemeFromUser = useCallback((userThemeMode) => {
    if (!userThemeMode) return
    const normalized = String(userThemeMode).toLowerCase()
    if (normalized === 'light' || normalized === 'dark' || normalized === 'auto') {
      setThemeState(normalized)
    }
  }, [])

  // ─── مزامنة timezone من CRM Settings (يُستدعى من AppStateProvider) ─────────
  const syncCrmTimezone = useCallback((timezone) => {
    if (!timezone) return
    persistCrmTimeZone(timezone)
    setCrmTimeZone(timezone)
  }, [])

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      resolvedTheme,
      syncThemeFromUser,
      syncCrmTimezone,
      crmTimeZone,
      palette,
      fonts,
      isLight: resolvedTheme === 'light',
      isDark: resolvedTheme === 'dark',
      isDarkMode: resolvedTheme === 'dark',
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
