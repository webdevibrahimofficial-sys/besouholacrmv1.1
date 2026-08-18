import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../utils/api'
import { FaPlus, FaTrash } from 'react-icons/fa'

export default function ServiceTypesManager() {
  const { i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'
  const [types, setTypes] = useState([])
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTypes = async () => {
    try {
      const response = await api.get('/api/inventory-lookups/service-types')
      const payload = response.data
      setTypes(Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []))
    } catch (error) {
      console.error('Failed to load service types', error)
    }
  }

  useEffect(() => {
    fetchTypes()
  }, [])

  const addType = async (event) => {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName) return
    setSaving(true)
    try {
      await api.post('/api/inventory-lookups/service-types', { name: nextName })
      setName('')
      await fetchTypes()
    } catch (error) {
      alert(error?.response?.data?.message || (isArabic ? 'تعذر إضافة نوع الخدمة' : 'Could not add service type'))
    } finally {
      setSaving(false)
    }
  }

  const removeType = async (id) => {
    if (!window.confirm(isArabic ? 'حذف نوع الخدمة؟' : 'Delete this service type?')) return
    await api.delete(`/api/inventory-lookups/service-types/${id}`)
    await fetchTypes()
  }

  return (
    <div className="card p-6 rounded-xl border border-gray-200 dark:border-white/10 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{isArabic ? 'أنواع الخدمات' : 'Service Types'}</h2>
        <p className="text-sm text-gray-500">
          {isArabic
            ? 'هذه القائمة تظهر في فورم الخدمة ويمكن تخصيصها من الأدمن.'
            : 'This list appears in the service item form and can be customized by admin.'}
        </p>
      </div>

      <form onSubmit={addType} className="flex gap-2">
        <input
          className="input input-bordered flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isArabic ? 'نوع خدمة جديد' : 'New service type'}
        />
        <button type="submit" className="btn bg-blue-600 text-white border-none" disabled={saving}>
          <FaPlus /> {isArabic ? 'إضافة' : 'Add'}
        </button>
      </form>

      <div className="divide-y divide-gray-100 dark:divide-white/10">
        {types.map((type) => (
          <div key={type.id} className="flex items-center justify-between py-2">
            <span>{type.name}</span>
            <button type="button" className="btn btn-ghost btn-sm text-red-500" onClick={() => removeType(type.id)}>
              <FaTrash />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
