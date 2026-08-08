import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Plus, Clock, UserCog, Loader2 } from 'lucide-react'
import { api } from '@utils/api'
import SearchableSelect from '@components/SearchableSelect'
import { createRotationRule } from '@services/rotationRulesService'
import { useTheme } from '@shared/context/ThemeProvider'

const normalizeSource = (s) => {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const toBool = (v) => {
  if (v === true) return true
  if (v === false) return false
  if (v === 1) return true
  if (v === 0) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true
    if (s === '0' || s === 'false' || s === 'no' || s === 'off' || s === '') return false
  }
  return !!v
}

export default function RotationRuleModal({ open, onClose, user, type, onSaved }) {
  const { i18n } = useTranslation()
  const { theme, resolvedTheme } = useTheme()
  const isArabic = i18n.language === 'ar'
  const isDark = (resolvedTheme || theme) === 'dark'
  const isAssign = type === 'assign'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState([])
  const [items, setItems] = useState([])
  const [sources, setSources] = useState([])
  const [regions, setRegions] = useState([])
  const [companyType, setCompanyType] = useState('')

  const [projectIds, setProjectIds] = useState([])
  const [itemIds, setItemIds] = useState([])
  const [sourceValues, setSourceValues] = useState([])
  const [regionValues, setRegionValues] = useState([])
  const [position, setPosition] = useState(1)
  const [isActive, setIsActive] = useState(true)

  const title = useMemo(() => {
    if (isAssign) return isArabic ? 'تعيين الروتيشن' : 'Assign Rotation'
    return isArabic ? 'تأخير الروتيشن' : 'Delay Rotation'
  }, [isArabic, isAssign])

  const subtitle = useMemo(() => {
    return user?.name || user?.fullName || user?.email || ''
  }, [user])

  const accentClass = isAssign
    ? (isDark ? 'bg-purple-500/15 text-purple-300' : 'bg-purple-50 text-purple-600')
    : (isDark ? 'bg-orange-500/15 text-orange-300' : 'bg-orange-50 text-orange-600')

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const res = await api.get('/api/rotation-options')
      setCompanyType(res?.data?.company_type || '')
      setProjects(res?.data?.projects || [])
      setItems(res?.data?.items || [])
      setSources(res?.data?.sources || [])
      setRegions(res?.data?.regions || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (!open) return
    fetchData()
  }, [open, fetchData])

  useEffect(() => {
    if (!open) return
    setProjectIds([])
    setItemIds([])
    setSourceValues([])
    setRegionValues([])
    setPosition(1)
    setIsActive(true)
  }, [open, type])

  const isGeneralTenant = useMemo(() => {
    return String(companyType || '').toLowerCase().trim() === 'general'
  }, [companyType])

  const projectOptions = useMemo(() => {
    return (projects || []).map(p => ({ value: String(p.id), label: p.name || `#${p.id}` }))
  }, [projects])

  const itemOptions = useMemo(() => {
    return (items || []).map(it => ({ value: String(it.id), label: it.name || `#${it.id}` }))
  }, [items])

  const sourceOptions = useMemo(() => {
    const raw = (sources || []).map(s => {
      const name = s?.name || s?.title || s?.value || ''
      const normalized = normalizeSource(name)
      return normalized ? { value: normalized, label: name } : null
    }).filter(Boolean)

    const seen = new Set()
    return raw.filter(o => {
      if (seen.has(o.value)) return false
      seen.add(o.value)
      return true
    })
  }, [sources])

  const regionOptions = useMemo(() => {
    return (regions || []).map(r => {
      const label = isArabic ? (r.name_ar || r.name_en || r.name || `#${r.id}`) : (r.name_en || r.name || `#${r.id}`)
      const value = String(r.name_en || r.name_ar || r.name || r.id)
      return { value, label }
    })
  }, [regions, isArabic])

  const allRegionValues = useMemo(() => {
    return regionOptions.map((option) => String(option.value))
  }, [regionOptions])

  const normalizedRegionValues = useMemo(() => {
    if (!Array.isArray(regionValues) || regionValues.length === 0) return null

    const uniqueSelected = Array.from(new Set(regionValues.map((value) => String(value))))
    if (allRegionValues.length > 0 && allRegionValues.every((value) => uniqueSelected.includes(value))) {
      return null
    }

    return uniqueSelected
  }, [allRegionValues, regionValues])

  const saveRule = useCallback(async () => {
    if (!user?.id) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { type: 'error', message: isArabic ? 'المستخدم غير محدد' : 'User not selected' },
      }))
      return
    }
    setSaving(true)
    try {
      const useItem = String(companyType || '').toLowerCase().trim() === 'general'

      const settingsRes = await api.get('/api/rotation-settings')
      const settings = (settingsRes?.data && typeof settingsRes.data === 'object') ? settingsRes.data : {}
      const allowAssignEnabled = toBool(settings?.allow_assign_rotation)
      const delayAssignEnabled = toBool(settings?.delay_assign_rotation)

      if (type === 'assign' && !allowAssignEnabled) {
        const ok = window.confirm(isArabic
          ? 'الروتيشن غير مُفعّل (Assign Rotation). هل تريد تفعيله الآن؟'
          : 'Rotation is disabled (Assign Rotation). Enable it now?')
        if (!ok) {
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { type: 'error', message: isArabic ? 'يرجى تفعيل Assign Rotation من الإعدادات أولاً' : 'Please enable Assign Rotation in settings first' },
          }))
          return
        }
        await api.put('/api/rotation-settings', { allow_assign_rotation: true })
      }

      if (type === 'delay' && !delayAssignEnabled) {
        const ok = window.confirm(isArabic
          ? 'الروتيشن غير مُفعّل (Delay Rotation). هل تريد تفعيله الآن؟'
          : 'Rotation is disabled (Delay Rotation). Enable it now?')
        if (!ok) {
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { type: 'error', message: isArabic ? 'يرجى تفعيل Delay Rotation من الإعدادات أولاً' : 'Please enable Delay Rotation in settings first' },
          }))
          return
        }
        await api.put('/api/rotation-settings', { delay_assign_rotation: true })
      }

      const primaryIds = useItem ? (Array.isArray(itemIds) ? itemIds : []) : (Array.isArray(projectIds) ? projectIds : [])
      const sourcesList = Array.isArray(sourceValues) ? sourceValues : []

      const primaryValues = primaryIds.length ? primaryIds : [null]
      const sourceVals = sourcesList.length ? sourcesList : [null]

      const totalCombos = primaryValues.length * sourceVals.length
      if (totalCombos > 50) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { type: 'error', message: isArabic ? 'عدد الاختيارات كبير جدًا. قلّل المشاريع/المنتجات أو المصادر.' : 'Too many selections. Reduce projects/items or sources.' },
        }))
        return
      }

      let okCount = 0
      let failCount = 0
      let lastErrorMessage = ''

      for (const pid of primaryValues) {
        for (const src of sourceVals) {
          try {
            const payload = {
              user_id: user.id,
              type,
              project_id: useItem ? null : (pid ? Number(pid) : null),
              item_id: useItem ? (pid ? Number(pid) : null) : null,
              source: src ? String(src) : null,
              regions: normalizedRegionValues,
              position: isAssign ? Number(position || 1) : null,
              is_active: !!isActive,
            }
            await createRotationRule(payload)
            okCount += 1
          } catch (err) {
            failCount += 1
            lastErrorMessage =
              err?.response?.data?.message ||
              lastErrorMessage
          }
        }
      }

      await fetchData()

      if (okCount > 0) {
        try {
          if (typeof onSaved === 'function') onSaved()
        } catch {}
      }

      if (okCount > 0 && failCount === 0) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { type: 'success', message: isArabic ? `تمت الإضافة بنجاح (${okCount})` : `Added successfully (${okCount})` },
        }))
      } else if (okCount > 0 && failCount > 0) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { type: 'error', message: isArabic ? `تمت إضافة (${okCount}) وفشل (${failCount})` : `Added (${okCount}) and failed (${failCount})` },
        }))
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: {
            type: 'error',
            message: lastErrorMessage || (isArabic ? 'فشل الإضافة' : 'Add failed'),
          },
        }))
      }

      try {
        if (typeof onClose === 'function') onClose()
      } catch {}
    } catch (e) {
      const message =
        e?.response?.data?.message ||
        (isArabic ? 'فشل الإضافة' : 'Add failed')
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { type: 'error', message },
      }))
      try {
        if (typeof onClose === 'function') onClose()
      } catch {}
    } finally {
      setSaving(false)
    }
  }, [companyType, fetchData, isActive, isArabic, isAssign, itemIds, normalizedRegionValues, onClose, onSaved, position, projectIds, sourceValues, type, user?.id])

  if (!open) return null

  const fieldShell = 'space-y-1.5'
  const positionInputClass = `w-full px-3.5 py-2.5 rounded-xl border outline-none transition-all text-sm ${
    isDark
      ? 'bg-gray-800/60 border-gray-700/60 text-gray-100 focus:border-blue-500/50'
      : 'bg-gray-50 border-gray-200 text-gray-800 focus:border-blue-500'
  }`

  return createPortal(
    <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`relative w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl flex flex-col transform transition-all ${
          isDark ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white ring-1 ring-black/5'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotation-rule-modal-title"
      >
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accentClass}`}>
              {isAssign ? <UserCog size={20} /> : <Clock size={20} />}
            </div>
            <div className="min-w-0">
              <h2 id="rotation-rule-modal-title" className="text-base sm:text-lg font-bold text-theme-text truncate">
                {title}
              </h2>
              {subtitle ? (
                <p className="text-xs sm:text-sm opacity-60 text-theme-text truncate">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-theme-text opacity-70 hover:opacity-100 shrink-0"
            aria-label={isArabic ? 'إغلاق' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm opacity-70 text-theme-text">
              <Loader2 size={18} className="animate-spin" />
              {isArabic ? 'جاري التحميل...' : 'Loading...'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {!isGeneralTenant ? (
                  <div className={fieldShell}>
                    <SearchableSelect
                      options={[{ value: '', label: isArabic ? 'الكل' : 'All' }, ...projectOptions]}
                      value={projectIds}
                      onChange={(v) => setProjectIds(v)}
                      placeholder={isArabic ? 'اختر المشروع' : 'Select Project'}
                      label={isArabic ? 'المشروع' : 'Project'}
                      isRTL={isArabic}
                      multiple
                      showAllOption={false}
                    />
                  </div>
                ) : (
                  <div className={fieldShell}>
                    <SearchableSelect
                      options={[{ value: '', label: isArabic ? 'الكل' : 'All' }, ...itemOptions]}
                      value={itemIds}
                      onChange={(v) => setItemIds(v)}
                      placeholder={isArabic ? 'اختر منتج' : 'Select Item'}
                      label={isArabic ? 'المنتج' : 'Item'}
                      isRTL={isArabic}
                      multiple
                      showAllOption={false}
                    />
                  </div>
                )}

                <div className={fieldShell}>
                  <SearchableSelect
                    options={[{ value: '', label: isArabic ? 'الكل' : 'All' }, ...sourceOptions]}
                    value={sourceValues}
                    onChange={(v) => setSourceValues(v)}
                    placeholder={isArabic ? 'اختر المصدر' : 'Select Source'}
                    label={isArabic ? 'المصدر' : 'Source'}
                    isRTL={isArabic}
                    multiple
                    showAllOption={false}
                  />
                </div>

                <div className={fieldShell}>
                  <SearchableSelect
                    options={regionOptions}
                    value={regionValues}
                    onChange={(v) => setRegionValues(v)}
                    placeholder={isArabic ? 'اختر المناطق' : 'Select Regions'}
                    label={isArabic ? 'المناطق' : 'Regions'}
                    isRTL={isArabic}
                    multiple
                    showAllOption={true}
                  />
                </div>
              </div>

              {isAssign ? (
                <div className="max-w-[220px]">
                  <label className="block text-xs font-semibold mb-1.5 text-theme-text opacity-70 uppercase tracking-wider">
                    {isArabic ? 'الترتيب في الروتيشن' : 'Position in Rotation'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={position}
                    onChange={(e) => setPosition(Number(e.target.value || 1))}
                    className={positionInputClass}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className={`flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t ${isDark ? 'border-gray-800 bg-gray-900/80' : 'border-gray-100 bg-gray-50/70'}`}>
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-success"
              checked={!!isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="text-sm font-medium text-theme-text">
              {isArabic ? 'نشط' : 'Active'}
            </span>
          </label>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isDark
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              disabled={saving}
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={saveRule}
              disabled={saving || loading}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-blue-600/20"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving
                ? (isArabic ? 'جاري الإضافة...' : 'Adding...')
                : (isArabic ? 'إضافة' : 'Add')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
