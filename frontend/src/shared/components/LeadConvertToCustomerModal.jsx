import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaTimes, FaUserCheck } from 'react-icons/fa'

import { api } from '../../utils/api'

const safeStr = (value) => String(value ?? '').trim()
const normalizeUnitKey = (value) => safeStr(value).toLowerCase()
const isSelectableUnit = (unit) => {
  const status = normalizeUnitKey(unit?.status)
  return !status || status === 'available'
}

export default function LeadConvertToCustomerModal({
  isOpen,
  lead,
  isArabic = false,
  theme = 'light',
  onClose,
  onConverted,
}) {
  const isLight = theme === 'light'
  const [projects, setProjects] = useState([])
  const [units, setUnits] = useState([])
  const [projectId, setProjectId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    const loadMeta = async () => {
      setLoadingMeta(true)
      setError('')
      try {
        const [projectsRes, propertiesRes] = await Promise.all([
          api.get('/api/projects'),
          api.get('/api/properties', { params: { fields: 'dropdown' } }),
        ])
        if (cancelled) return

        const projectsData = Array.isArray(projectsRes.data) ? projectsRes.data : (projectsRes.data?.data || [])
        const propertiesData = Array.isArray(propertiesRes.data) ? propertiesRes.data : (propertiesRes.data?.data || [])
        setProjects(projectsData)
        setUnits(propertiesData)

        const leadProjectId = safeStr(lead?.project_id || lead?.projectId)
        const leadUnitId = safeStr(lead?.unit_id || lead?.unitId)
        const leadUnitText = normalizeUnitKey(lead?.unit || lead?.unit_code || lead?.unitCode)
        const matchedUnit = propertiesData.find((unit) => {
          if (!isSelectableUnit(unit)) return false
          if (leadUnitId && safeStr(unit.id) === leadUnitId) return true
          const keys = [unit.unit_code, unit.unit_number, unit.name, unit.title].map(normalizeUnitKey)
          return leadUnitText && keys.includes(leadUnitText)
        })

        setProjectId(leadProjectId || safeStr(matchedUnit?.project_id))
        setPropertyId(safeStr(matchedUnit?.id))
      } catch (e) {
        setError(e?.response?.data?.message || (isArabic ? 'فشل تحميل الوحدات' : 'Failed to load units'))
      } finally {
        if (!cancelled) setLoadingMeta(false)
      }
    }

    loadMeta()
    return () => {
      cancelled = true
    }
  }, [isOpen, lead, isArabic])

  const selectedUnit = useMemo(
    () => units.find((unit) => safeStr(unit.id) === safeStr(propertyId)) || null,
    [units, propertyId]
  )

  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      if (projectId && safeStr(unit.project_id) !== safeStr(projectId)) return false
      return isSelectableUnit(unit)
    })
  }, [units, projectId])

  useEffect(() => {
    if (propertyId && selectedUnit && !isSelectableUnit(selectedUnit)) {
      setPropertyId('')
    }
  }, [propertyId, selectedUnit])

  if (!isOpen) return null

  const labels = {
    title: isArabic ? 'تحويل الليد إلى عميل' : 'Convert Lead to Customer',
    subtitle: isArabic ? 'اختار المشروع والوحدة لربط العميل بحجز.' : 'Choose the project and unit to reserve for this customer.',
    customer: isArabic ? 'العميل' : 'Customer',
    project: isArabic ? 'المشروع' : 'Project',
    unit: isArabic ? 'الوحدة' : 'Unit',
    select: isArabic ? 'اختر' : 'Select',
    cancel: isArabic ? 'إلغاء' : 'Cancel',
    convert: isArabic ? 'تحويل' : 'Convert',
    converting: isArabic ? 'جارٍ التحويل...' : 'Converting...',
    unitRequired: isArabic ? 'اختيار الوحدة مطلوب للتحويل.' : 'Unit selection is required for conversion.',
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!lead?.id || submitting) return
    if (!propertyId) {
      setError(labels.unitRequired)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await api.post(`/api/cc/leads/${encodeURIComponent(lead.id)}/convert-to-customer`, {
        property_id: Number(propertyId),
      })
      await onConverted?.(res?.data)
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || (isArabic ? 'فشل التحويل' : 'Convert failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000]" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
        <form
          onSubmit={handleSubmit}
          className={`mt-6 w-full max-w-3xl rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-gray-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
          }`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-slate-700 p-5">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FaUserCheck className="text-emerald-500" />
                {labels.title}
              </h2>
              <p className="mt-1 text-sm opacity-70">{labels.subtitle}</p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} disabled={submitting}>
              <FaTimes />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {error ? (
              <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            ) : null}

            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <div className="text-xs opacity-60">{labels.customer}</div>
              <div className="font-semibold">{safeStr(lead?.name || lead?.company) || '-'}</div>
              <div className="text-sm opacity-70" dir="ltr">{safeStr(lead?.phone) || '-'}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium">{labels.project}</span>
                <select
                  className="input w-full"
                  value={projectId}
                  disabled={loadingMeta || submitting}
                  onChange={(e) => {
                    setProjectId(e.target.value)
                    setPropertyId('')
                  }}
                >
                  <option value="">{labels.select}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name || project.name_ar || project.title || `#${project.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium">{labels.unit}</span>
                <select
                  className="input w-full"
                  value={propertyId}
                  disabled={loadingMeta || submitting}
                  onChange={(e) => setPropertyId(e.target.value)}
                  required
                >
                  <option value="">{loadingMeta ? '...' : labels.select}</option>
                  {filteredUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_code || unit.unit_number || unit.name || unit.title || `#${unit.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-slate-700 p-5">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              {labels.cancel}
            </button>
            <button type="submit" className="btn bg-emerald-600 hover:bg-emerald-700 !text-white border-none" disabled={submitting || loadingMeta}>
              {submitting ? labels.converting : labels.convert}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
