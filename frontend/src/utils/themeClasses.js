/**
 * themeClasses.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for theme-aware Tailwind classes.
 *
 * Usage:
 *   import { useThemeClasses } from '@utils/themeClasses'
 *
 *   const th = useThemeClasses()
 *   <div className={th.page}>...</div>
 *   <div className={th.card}>...</div>
 *
 * Why explicit isLight/isDark branches instead of Tailwind dark: variants?
 *   – The codebase has thousands of hardcoded dark classes with no dark: prefix.
 *   – Mixing both patterns in the same component creates "theme islands".
 *   – Explicit branches are easier to audit, test, and predict.
 *   – resolvedTheme is the single source of truth → no CSS specificity fights.
 *
 * Rules:
 *   – Every surface defines: background, text, border, muted text, input.
 *   – Never use a class that is "always dark" (e.g. bg-gray-800 with no condition).
 *   – Never hardcode hex colors here — use Tailwind tokens only.
 *   – Do not import this file outside of React components (needs useTheme hook).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useTheme } from '../shared/context/ThemeProvider'

/**
 * Returns a flat object of className strings keyed by surface name.
 * All strings are safe to use directly in className="..." props.
 */
export function useThemeClasses() {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  const isDark   = resolvedTheme === 'dark'

  return buildThemeClasses(isLight, isDark)
}

/**
 * Pure builder — can be called outside React if you already have isLight/isDark.
 * Prefer useThemeClasses() inside components.
 */
export function buildThemeClasses(isLight, isDark) {
  return {
    /* ── meta flags (re-exported for convenience) ────────────────────────── */
    isLight,
    isDark,

    /* ── page / layout ───────────────────────────────────────────────────── */
    // Full-page wrapper background + base text
    page: isLight
      ? 'bg-gray-50 text-gray-900'
      : 'bg-[#0f172a] text-gray-100',

    /* ── cards ───────────────────────────────────────────────────────────── */
    // Standard raised card
    card: isLight
      ? 'bg-white border border-gray-200 text-gray-900'
      : 'bg-gray-900 border border-gray-700 text-gray-100',

    // Softer / secondary card (slightly tinted background)
    cardSoft: isLight
      ? 'bg-gray-50 border border-gray-200 text-gray-800'
      : 'bg-gray-800 border border-gray-700 text-gray-200',

    // Glass panel (used by filter sections etc.)
    cardGlass: isLight
      ? 'bg-white/60 backdrop-blur border border-gray-200 text-gray-900'
      : 'bg-gray-900/60 backdrop-blur border border-gray-700 text-gray-100',

    /* ── text ────────────────────────────────────────────────────────────── */
    // Primary heading / strong text
    title: isLight ? 'text-gray-900' : 'text-gray-100',

    // Body / regular text
    text: isLight ? 'text-gray-800' : 'text-gray-200',

    // Muted / secondary text (labels, timestamps, hints)
    muted: isLight ? 'text-gray-500' : 'text-gray-400',

    // Link / accent text
    link: 'text-blue-600',

    /* ── borders / dividers ──────────────────────────────────────────────── */
    border: isLight ? 'border-gray-200' : 'border-gray-700',
    divider: isLight ? 'divide-gray-200' : 'divide-gray-700',

    /* ── form controls ───────────────────────────────────────────────────── */
    // input / select / textarea
    input: isLight
      ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500'
      : 'bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:ring-blue-400',

    // label above inputs
    label: isLight ? 'text-gray-700' : 'text-gray-300',

    /* ── table ───────────────────────────────────────────────────────────── */
    tableHeader: isLight
      ? 'bg-gray-100 text-gray-600 border-b border-gray-200'
      : 'bg-gray-800 text-gray-300 border-b border-gray-700',

    tableRow: isLight
      ? 'bg-white text-gray-800 hover:bg-gray-50 border-b border-gray-100'
      : 'bg-gray-900 text-gray-200 hover:bg-gray-800/60 border-b border-gray-800',

    // Alternating / zebra row (optional)
    tableRowAlt: isLight
      ? 'bg-gray-50 text-gray-800 hover:bg-gray-100 border-b border-gray-100'
      : 'bg-gray-850 text-gray-200 hover:bg-gray-800/60 border-b border-gray-800',

    /* ── badges / status chips ───────────────────────────────────────────── */
    // Neutral badge (counts, quantities)
    badgeNeutral: isLight
      ? 'bg-gray-100 text-gray-700 border border-gray-200'
      : 'bg-gray-700 text-gray-300 border border-gray-600',

    /* ── action buttons (non-semantic) ───────────────────────────────────── */
    // Ghost / subtle — toolbar actions
    btnGhost: isLight
      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700',

    // More-actions ellipsis button
    btnMore: isLight
      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600',

    /* ── dropdown / popover menus ────────────────────────────────────────── */
    dropdown: isLight
      ? 'bg-white border border-gray-200 shadow-xl text-gray-800'
      : 'bg-gray-800 border border-gray-700 shadow-xl text-gray-200',

    dropdownItem: isLight
      ? 'hover:bg-gray-50 text-gray-700'
      : 'hover:bg-gray-700 text-gray-300',

    /* ── modal / dialog ──────────────────────────────────────────────────── */
    modal: isLight
      ? 'bg-white border border-gray-200 text-gray-900'
      : 'bg-gray-900 border border-gray-700 text-gray-100',

    modalHeader: isLight
      ? 'border-b border-gray-200 bg-white'
      : 'border-b border-gray-700 bg-gray-900',

    modalFooter: isLight
      ? 'border-t border-gray-100 bg-white'
      : 'border-t border-gray-700 bg-gray-900',

    /* ── pagination / toolbar containers ────────────────────────────────── */
    toolbar: isLight
      ? 'bg-white border border-gray-100 text-gray-700'
      : 'bg-gray-900 border border-gray-700 text-gray-300',

    /* ── info / notice panels ────────────────────────────────────────────── */
    infoPanel: isLight
      ? 'bg-gray-50 border border-gray-200 text-gray-600'
      : 'bg-gray-800/60 border border-gray-700 text-gray-400',
  }
}
