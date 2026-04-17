import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState } from '@shared/context/AppStateProvider'

export default function ContractCollectionsCustomers() {
  const { i18n } = useTranslation()
  const { company } = useAppState()

  const isArabic = i18n.language === 'ar'
  const companyTypeLower = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyTypeLower.includes('real')

  const title = useMemo(
    () => (isArabic ? 'العملاء (التعاقد والتحصيل)' : 'Customers (Contract & Collections)'),
    [isArabic]
  )

  if (!isRealEstate) {
    return (
      <div className="p-6">
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold">{isArabic ? 'غير متاح' : 'Not available'}</h2>
          <p className="text-sm text-[var(--muted-text)] mt-2">
            {isArabic ? 'هذا الموديول متاح فقط لشركات Real Estate.' : 'This module is available only for Real Estate tenants.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted-text)]">
          {isArabic
            ? 'قريبًا: قائمة العملاء بعد الـ Closing وربطهم بالوحدات وخطط الدفع.'
            : 'Coming soon: post-closing customers list, units linking, and payment plans.'}
        </p>
      </div>
    </div>
  )
}

