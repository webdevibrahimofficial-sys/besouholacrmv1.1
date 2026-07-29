import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BadgeCheck,
  Building2,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../../../utils/api'

const emptyForm = { name: '', key: '', is_active: true }

function StatCard({ icon: Icon, tone, label, value, hint }) {
  return (
    <div className="glass-panel rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</div>
          <div className="text-3xl font-bold text-[var(--content-text)]">{value}</div>
          {hint ? <div className="text-xs text-gray-400 dark:text-gray-500">{hint}</div> : null}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function EmptyState({ isArabic, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
        <Building2 size={28} />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-[var(--content-text)]">
        {isArabic ? 'لا توجد وكالات بعد' : 'No agencies yet'}
      </h3>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {isArabic
          ? 'ابدأ بإضافة الوكالات التي سيتربط بها مستخدمو الماركتنج والحملات والليدز.'
          : 'Start by creating the agencies that will scope your marketing users, campaigns, and leads.'}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700"
      >
        <Plus size={16} />
        <span>{isArabic ? 'إضافة وكالة' : 'Add Agency'}</span>
      </button>
    </div>
  )
}

function AgencyModal({
  open,
  onClose,
  onSave,
  formData,
  setFormData,
  loading,
  isEdit,
  isLight,
  t,
  isArabic,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full card max-w-xl overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <Building2 size={22} />
              </div>
              <div>
                <h3 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                  {isEdit ? (isArabic ? 'تعديل الوكالة' : 'Edit Agency') : (isArabic ? 'إضافة وكالة جديدة' : 'Add New Agency')}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {isArabic
                    ? 'المفتاح الثابت يُستخدم داخليًا لربط المستخدمين والليدز والحملات.'
                    : 'The stable key is used internally to link users, leads, and campaigns.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {isArabic ? 'اسم الوكالة' : 'Agency Name'}
              </label>
              <input
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isArabic ? 'مثال: Agency A' : 'Example: Agency A'}
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                {isArabic ? 'المفتاح الثابت' : 'Stable Key'}
              </label>
              <input
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
                value={formData.key}
                onChange={(e) => setFormData((prev) => ({ ...prev, key: e.target.value }))}
                disabled={isEdit}
                placeholder={isArabic ? 'يُنشأ تلقائيًا عند تركه فارغًا' : 'Auto-generated when left empty'}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200  p-4 dark:border-gray-700 dark:bg-gray-800/60">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={!!formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-semibold text-[var(--content-text)]">
                  {isArabic ? 'الوكالة نشطة' : 'Agency is active'}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {isArabic
                    ? 'الوكالات النشطة فقط هي التي تظهر في اختيار المستخدمين المربوطين بالماركتنج.'
                    : 'Only active agencies appear in marketing user assignment dropdowns.'}
                </div>
              </div>
            </label>
          </div>

          {isEdit ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              {isArabic
                ? 'المفتاح ثابت بعد الإنشاء حتى لا ينكسر الربط الحالي بين الوكالة والليدز والحملات.'
                : 'The key is locked after creation so current lead and campaign links remain safe.'}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-5 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ShieldCheck size={16} />
            <span>
              {loading ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : isEdit ? t('Save') : (isArabic ? 'إضافة الوكالة' : 'Create Agency')}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Agencies() {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const isArabic = i18n.language === 'ar'

  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [currentAgency, setCurrentAgency] = useState(null)
  const [formData, setFormData] = useState(emptyForm)

  const fetchAgencies = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/agencies')
      setAgencies(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Failed to fetch agencies', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgencies()
  }, [])

  const totalLinkedUsers = useMemo(
    () => agencies.reduce((sum, item) => sum + Number(item?.linked_users_count || 0), 0),
    [agencies]
  )

  const activeAgencies = useMemo(
    () => agencies.filter((item) => item?.is_active !== false).length,
    [agencies]
  )

  const openCreate = () => {
    setCurrentAgency(null)
    setFormData(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (agency) => {
    setCurrentAgency(agency)
    setFormData({
      name: agency?.name || '',
      key: agency?.key || '',
      is_active: agency?.is_active !== false,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!String(formData.name || '').trim()) return

    try {
      setSaving(true)
      if (currentAgency?.id) {
        await api.put(`/api/agencies/${currentAgency.id}`, formData)
      } else {
        await api.post('/api/agencies', formData)
      }
      setModalOpen(false)
      await fetchAgencies()
    } catch (error) {
      console.error('Failed to save agency', error)
      const message = error?.response?.data?.message || (isArabic ? 'تعذر حفظ الوكالة' : 'Failed to save agency')
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message } }))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (agency) => {
    try {
      await api.put(`/api/agencies/${agency.id}`, { is_active: !agency.is_active })
      await fetchAgencies()
    } catch (error) {
      console.error('Failed to toggle agency', error)
    }
  }

  const handleDelete = async (agency) => {
    const confirmMessage = isArabic ? `هل تريد حذف وكالة "${agency.name}"؟` : `Delete agency "${agency.name}"?`
    if (!window.confirm(confirmMessage)) return

    try {
      await api.delete(`/api/agencies/${agency.id}`)
      await fetchAgencies()
    } catch (error) {
      console.error('Failed to delete agency', error)
      const message =
        error?.response?.data?.message ||
        (isArabic ? 'لا يمكن حذف هذه الوكالة حاليًا' : 'Unable to delete this agency right now')
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message } }))
    }
  }

  return (
    <>
      <div className="p-3 sm:p-4 md:p-6 bg-[var(--content-bg)] text-[var(--content-text)] space-y-4 sm:space-y-6">
        <div className="flex  gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-1 h-14 sm:h-16 rounded-full bg-gradient-to-b from-blue-500 to-purple-600"></div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                <ShieldCheck size={14} />
                <span>{isArabic ? 'إدارة عزل الوكالات' : 'Agency Scope Management'}</span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                {t('System Settings')} <span className="font-light">/</span> {isArabic ? 'الوكالات' : 'Agencies'}
              </h1>
              <p className="max-w-3xl text-sm sm:text-base text-gray-500 dark:text-gray-400">
                {isArabic
                  ? 'أنشئ الوكالات واربط بها مستخدمي الماركتنج حتى يتم عزل الليدز والحملات والصفحات التابعة لكل وكالة بشكل منظم وآمن.'
                  : 'Create agencies and assign marketing users to them so leads, campaigns, and pages stay isolated in a clean, safe way.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 self-start rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] xl:self-auto"
          >
            <Plus size={16} />
            <span>{isArabic ? 'إضافة وكالة' : 'Add Agency'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            icon={Building2}
            tone="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
            label={isArabic ? 'إجمالي الوكالات' : 'Total Agencies'}
            value={agencies.length}
            hint={isArabic ? 'كل الوكالات المسجلة في هذا التينانت' : 'All agencies registered in this tenant'}
          />
          <StatCard
            icon={BadgeCheck}
            tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
            label={isArabic ? 'وكالات نشطة' : 'Active Agencies'}
            value={activeAgencies}
            hint={isArabic ? 'تظهر في شاشة إنشاء وتعديل المستخدمين' : 'Visible in marketing user assignment'}
          />
          <StatCard
            icon={Users}
            tone="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300"
            label={isArabic ? 'مستخدمون مرتبطون' : 'Linked Users'}
            value={totalLinkedUsers}
            hint={isArabic ? 'عدد المستخدمين المربوطين بوكالات' : 'Users currently linked to agencies'}
          />
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="border-b border-gray-200/80 px-5 py-5 dark:border-gray-800">
            <div className="flex  gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                  {isArabic ? 'قائمة الوكالات' : 'Agencies List'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isArabic
                    ? 'عطّل الوكالة بدل حذفها عندما تكون مرتبطة بمستخدمين أو بيانات حالية.'
                    : 'Disable an agency instead of deleting it when it is already linked to users or existing data.'}
                </p>
              </div>
              <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {isArabic ? `${agencies.length} وكالة` : `${agencies.length} agencies`}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-14">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
            </div>
          ) : agencies.length === 0 ? (
            <EmptyState isArabic={isArabic} onAdd={openCreate} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-4">{isArabic ? 'الوكالة' : 'Agency'}</th>
                    <th className="px-5 py-4">{isArabic ? 'المفتاح' : 'Key'}</th>
                    <th className="px-5 py-4">{isArabic ? 'الحالة' : 'Status'}</th>
                    <th className="px-5 py-4">{isArabic ? 'المستخدمون' : 'Users Count'}</th>
                    <th className="px-5 py-4">{isArabic ? 'ملاحظات' : 'Notes'}</th>
                    <th className={`px-5 py-4 ${isArabic ? 'text-left' : 'text-right'}`}>{isArabic ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {agencies.map((agency) => (
                    <tr key={agency.id} className="transition hover:bg-blue-50/40 dark:hover:bg-blue-900/10">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <div className="font-semibold text-[var(--content-text)]">{agency.name}</div>
                            <div className="text-xs text-gray-400">
                              {isArabic ? `معرف داخلي #${agency.id}` : `Internal ID #${agency.id}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <code className="inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          {agency.key}
                        </code>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                            agency.is_active
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {agency.is_active ? (isArabic ? 'نشطة' : 'Active') : (isArabic ? 'معطلة' : 'Disabled')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[var(--content-text)]">{agency.linked_users_count || 0}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {agency.linked_users_count > 0
                            ? isArabic
                              ? 'يُفضّل التعطيل بدل الحذف لحماية الربط الحالي.'
                              : 'Disable instead of delete to protect current links.'
                            : isArabic
                              ? 'يمكن حذفها إذا لم تعد مستخدمة.'
                              : 'Can be deleted if no longer used.'}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className={`flex items-center gap-2 ${isArabic ? 'justify-start' : 'justify-end'}`}>
                          <button
                            type="button"
                            onClick={() => openEdit(agency)}
                            className="rounded-xl p-2 text-blue-600 transition hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            title={isArabic ? 'تعديل' : 'Edit'}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggle(agency)}
                            className="rounded-xl p-2 text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            title={agency.is_active ? (isArabic ? 'تعطيل' : 'Disable') : (isArabic ? 'تفعيل' : 'Enable')}
                          >
                            <Power size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(agency)}
                            className="rounded-xl p-2 text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            title={isArabic ? 'حذف' : 'Delete'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AgencyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        formData={formData}
        setFormData={setFormData}
        loading={saving}
        isEdit={!!currentAgency}
        isLight={isLight}
        t={t}
        isArabic={isArabic}
      />
    </>
  )
}
