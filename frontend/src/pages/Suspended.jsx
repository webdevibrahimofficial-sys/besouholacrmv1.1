import { useTranslation } from 'react-i18next'

export default function Suspended() {
  const { t } = useTranslation()

  const hash = typeof window !== 'undefined' ? String(window.location.hash || '') : ''
  const queryStr = hash.includes('?') ? hash.split('?')[1] : ''
  const params = new URLSearchParams(queryStr)
  const reason = params.get('reason')

  const isSubscriptionExpired = reason === 'subscription_expired'
  const isCancelled = reason === 'cancelled'
  const isSuspended = reason === 'suspended' || (!isSubscriptionExpired && !isCancelled)
  const isAr = (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl') || false

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {isSubscriptionExpired
              ? (isAr ? 'انتهى الاشتراك' : 'Subscription Expired')
              : isCancelled
                ? (isAr ? 'تم إلغاء مساحة العمل' : 'Workspace Cancelled')
                : (isAr ? 'تم تعليق مساحة العمل' : 'Workspace Suspended')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isSubscriptionExpired
              ? (isAr ? 'انتهى الاشتراك. لو سمحت توجه لخدمة العملاء لتجديد الاشتراك.' : 'Your subscription has expired. Please contact customer service to renew your subscription.')
              : isCancelled
                ? (isAr ? 'تم إلغاء مساحة العمل الحالية. برجاء التواصل مع خدمة العملاء للمساعدة.' : 'This workspace has been cancelled. Please contact customer service for assistance.')
                : (isAr ? 'تم تعليق مساحة العمل الحالية. برجاء التواصل مع خدمة العملاء للمساعدة.' : 'This workspace has been suspended. Please contact customer service for assistance.')}
          </p>
        </div>
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                {isSubscriptionExpired
                  ? (isAr ? 'تم انتهاء الاشتراك' : 'Subscription Ended')
                  : isCancelled
                    ? (isAr ? 'تم إلغاء الوصول' : 'Access Cancelled')
                    : (isAr ? 'تم رفض الوصول' : 'Access Suspended')}
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  {isSubscriptionExpired
                    ? (isAr ? 'تم إيقاف تسجيل الدخول إلى مساحة العمل الحالية حتى يتم تجديد الاشتراك من خلال خدمة العملاء.' : 'Login to this workspace is blocked until the subscription is renewed through customer service.')
                    : isCancelled
                      ? (isAr ? 'تم منع الوصول إلى مساحة العمل الملغاة. برجاء مراجعة خدمة العملاء لأي إجراءات لاحقة.' : 'Access to this cancelled workspace is blocked. Please contact customer service for next steps.')
                      : (isAr ? 'تم منع الوصول إلى مساحة العمل المعلقة حتى تقوم خدمة العملاء بإعادة تفعيلها.' : 'Access to this suspended workspace is blocked until customer service reactivates it.')}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div>
          <button
            onClick={() => window.location.reload()}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {t('Refresh Status')}
          </button>
        </div>
      </div>
    </div>
  )
}
