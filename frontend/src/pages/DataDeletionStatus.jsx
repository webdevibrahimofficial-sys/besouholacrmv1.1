import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'

const labels = {
  en: {
    title: 'Data Deletion Status',
    loading: 'Loading deletion status...',
    notFound: 'Deletion request not found.',
    error: 'Unable to load deletion status.',
    status: 'Status',
    code: 'Confirmation code',
    user: 'Facebook user',
    connections: 'Connections removed',
    pages: 'Pages removed',
    completed: 'Completed at',
    back: 'Back to Privacy Policy',
    completedStatus: 'completed',
    pendingStatus: 'pending',
  },
  ar: {
    title: 'حالة حذف البيانات',
    loading: 'جاري تحميل حالة الحذف...',
    notFound: 'طلب الحذف غير موجود.',
    error: 'تعذر تحميل حالة الحذف.',
    status: 'الحالة',
    code: 'رمز التأكيد',
    user: 'مستخدم فيسبوك',
    connections: 'الاتصالات المحذوفة',
    pages: 'الصفحات المحذوفة',
    completed: 'اكتمل في',
    back: 'العودة إلى سياسة الخصوصية',
    completedStatus: 'مكتمل',
    pendingStatus: 'قيد الانتظار',
  },
}

export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code') || ''
  const lang = (searchParams.get('lang') || navigator.language || 'en').startsWith('ar') ? 'ar' : 'en'
  const t = labels[lang]

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!code) {
      setError(t.notFound)
      setLoading(false)
      return
    }

    api.get('/api/facebook/data-deletion/status', { params: { code } })
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError(t.notFound)
        } else {
          setError(t.error)
        }
      })
      .finally(() => setLoading(false))
  }, [code, t.error, t.notFound])

  const statusLabel = data?.status === 'completed' ? t.completedStatus : t.pendingStatus

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">{t.title}</h1>

        {loading && <p className="text-gray-600 dark:text-gray-300">{t.loading}</p>}
        {!loading && error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        {!loading && data && (
          <dl className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <div className="flex justify-between gap-4">
              <dt className="font-medium">{t.status}</dt>
              <dd className="capitalize">{statusLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">{t.code}</dt>
              <dd className="font-mono text-xs">{data.confirmation_code}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">{t.user}</dt>
              <dd>{data.fb_user_id_masked}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">{t.connections}</dt>
              <dd>{data.connections_deleted ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">{t.pages}</dt>
              <dd>{data.pages_deleted ?? 0}</dd>
            </div>
            {data.completed_at && (
              <div className="flex justify-between gap-4">
                <dt className="font-medium">{t.completed}</dt>
                <dd>{new Date(data.completed_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-6">
          <Link to="/privacy" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
            {t.back}
          </Link>
        </div>
      </div>
    </div>
  )
}
