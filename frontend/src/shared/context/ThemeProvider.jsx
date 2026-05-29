import { createContext, useContext, useEffect, useState } from 'react'
import { palette, fonts } from '../../theme.js'

const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, resolvedTheme: 'light' })

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

// ─── helper: حساب الوضع الفعلي من إعداد "auto" ────────────────────────────────
// يستخدم prefers-color-scheme أولاً، ثم يعود للنظام القائم على الساعة كـ fallback
function resolveAutoMode() {
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {}
  return 'light'
}

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => readSavedTheme())
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const saved = readSavedTheme()
    if (saved === 'auto') return resolveAutoMode()
    return saved === 'dark' ? 'dark' : 'light'
  })

  // ─── الدالة العامة لتغيير الثيم (الوحيدة المُصرَّح بها) ───────────────────
  const setTheme = (val) => {
    const normalized = String(val).toLowerCase()
    if (normalized !== 'light' && normalized !== 'dark' && normalized !== 'auto') return
    setThemeState(normalized)
  }

  // ─── تطبيق الثيم على DOM وحفظه في localStorage ──────────────────────────────
  useEffect(() => {
    const compute = () => {
      const mode = theme === 'auto' ? resolveAutoMode() : theme
      setResolvedTheme(mode)
      applyMode(mode)
    }

    compute()

    // في وضع auto: استمع لتغيير تفضيل النظام بدلاً من الـ interval
    let mediaQuery = null
    let interval = null

    if (theme === 'auto') {
      try {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        mediaQuery.addEventListener('change', compute)
      } catch {
        // fallback للمتصفحات القديمة
        interval = setInterval(compute, 60000)
      }
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
      if (mediaQuery) mediaQuery.removeEventListener('change', compute)
      if (interval) clearInterval(interval)
    }
  }, [theme])

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
  // (يُستدعى من AppStateProvider بعد login عبر syncThemeFromUser)
  const syncThemeFromUser = (userThemeMode) => {
    if (!userThemeMode) return
    const normalized = String(userThemeMode).toLowerCase()
    if (normalized === 'light' || normalized === 'dark' || normalized === 'auto') {
      setThemeState(normalized)
    }
  }

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      resolvedTheme,
      syncThemeFromUser,
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
