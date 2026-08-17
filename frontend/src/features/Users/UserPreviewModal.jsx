import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../shared/context/ThemeProvider'
import { PERM_LABELS_AR, getPermissionDisplayLabel } from './constants'
import { api } from '@utils/api'
import { usesCompanyTarget } from '../../utils/targetRevenueReport'
import ListHoverPopover from '@components/ListHoverPopover'
import { Percent } from 'lucide-react'
import { FaTimes, FaIdCard, FaUser, FaTag, FaPhone, FaEnvelope, FaBuilding, FaLayerGroup, FaMapMarkerAlt, FaChartLine, FaBell, FaShieldAlt } from 'react-icons/fa';

const UserPreviewModal = ({ isOpen, onClose, user }) => {
  const { i18n } = useTranslation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const isRTL = i18n.language === 'ar'
  const [targetHistory, setTargetHistory] = useState([])
  const [targetsLoading, setTargetsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchTargets = async () => {
      if (!isOpen || !user?.id) {
        setTargetHistory([])
        return
      }

      setTargetsLoading(true)
      try {
        const res = await api.get(`/api/user-targets?user_id=${user.id}`)
        if (cancelled) return
        const rows = Array.isArray(res?.data?.data) ? res.data.data : []
        setTargetHistory(rows)
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch user target preview', error)
          setTargetHistory([])
        }
      } finally {
        if (!cancelled) setTargetsLoading(false)
      }
    }

    fetchTargets()

    return () => {
      cancelled = true
    }
  }, [isOpen, user?.id])

  const currentYear = new Date().getFullYear()
  const currentTarget = useMemo(() => {
    if (usesCompanyTarget(user)) {
      return {
        year: currentYear,
        monthly_target: user?.company_monthly_target ?? user?.total_monthly_target ?? 0,
        quarterly_target: user?.company_quarterly_target ?? 0,
        semi_annual_target: user?.company_semi_annual_target ?? 0,
        yearly_target: user?.company_yearly_target ?? user?.total_yearly_target ?? 0,
        commission_tiers: user?.commission_tiers || [],
        commissionTiers: user?.commissionTiers || [],
      }
    }

    const current = targetHistory.find(row => Number(row.year) === currentYear)
    if (current) return current

    return {
      year: currentYear,
      monthly_target: user?.monthly_target || 0,
      quarterly_target: user?.quarterly_target || 0,
      semi_annual_target: user?.semi_annual_target || 0,
      yearly_target: user?.yearly_target || 0,
      commission_tiers: user?.commission_tiers || [],
      commissionTiers: user?.commissionTiers || [],
    }
  }, [currentYear, targetHistory, user])

  const currentCommissionTiers = useMemo(() => {
    const tiers = currentTarget?.commission_tiers || currentTarget?.commissionTiers || []
    if (Array.isArray(tiers) && tiers.length) return tiers
    if (user?.commission_percentage) {
      return [{
        from_percentage: 0,
        to_percentage: null,
        commission_percentage: user.commission_percentage,
      }]
    }
    return []
  }, [currentTarget, user?.commission_percentage])

  if (!isOpen || !user) return null

  const inputClass = `w-full px-3 py-1.5 md:px-4 md:py-2.5 rounded-lg md:rounded-xl border outline-none transition-all cursor-default text-xs md:text-sm font-medium ${isDark
      ? 'bg-gray-800/50 border-gray-700/50 text-gray-100'
      : 'bg-gray-50/50 border-gray-200/60 text-gray-800'
    }`

  const labelClass = `block text-[10px] md:text-xs font-semibold mb-1 md:mb-1.5 text-theme-text opacity-60 uppercase tracking-wider`
  const sectionTitleClass = `text-sm md:text-lg font-bold flex items-center gap-2 text-theme-text mb-2 md:mb-4 pb-1.5 md:pb-2 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`

  const modulePermissions = (user.meta_data && user.meta_data.module_permissions) || {}
  const hasPermissions = Object.values(modulePermissions || {}).some(
    (perms) => Array.isArray(perms) && perms.length > 0
  )

  const notificationSettings = user.notification_settings || {}

  const notificationItems = [
    {
      key: 'email',
      label: isRTL ? 'البريد الإلكتروني' : 'Email',
      description: isRTL ? 'استقبال التنبيهات عبر البريد' : 'Receive alerts by email',
    },
    {
      key: 'app',
      label: isRTL ? 'داخل النظام' : 'In-App',
      description: isRTL ? 'إشعارات داخل لوحة التحكم' : 'Notifications inside the app',
    },
    {
      key: 'sms',
      label: isRTL ? 'رسائل SMS' : 'SMS',
      description: isRTL ? 'تنبيهات عبر الرسائل النصية' : 'Alerts by SMS',
    },
  ]

  const getGroupLabel = (group) => {
    if (isRTL && PERM_LABELS_AR.groups && PERM_LABELS_AR.groups[group]) {
      return PERM_LABELS_AR.groups[group]
    }
    return group
  }

  const formatPermissionLabel = (group, key) => {
    if (!key) return ''
    return getPermissionDisplayLabel(group, key, isRTL)
  }

  const getInitials = () => {
    const name = (user.fullName || user.name || '').trim()
    if (!name) return (isRTL ? 'م' : 'U')
    const parts = name.split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0)
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`
  }

  const formatAmount = (value) => {
    const numeric = Number(value || 0)
    return numeric.toLocaleString(isRTL ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const formatPercent = (value) => {
    const numeric = Number(value || 0)
    return numeric.toLocaleString(isRTL ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const targetMetricClass = `rounded-lg md:rounded-xl border p-3 ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}`

  return (
    <div className="fixed inset-0 z-[2050] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className={`card relative w-full max-w-3xl max-h-[95vh] md:max-h-[85vh] overflow-hidden rounded-xl md:rounded-3xl shadow-2xl flex flex-col transform transition-all ${isDark ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white ring-1 ring-black/5'}`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-3 md:px-8 md:py-5 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'} bg-opacity-50`}>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative">
              {user.avatar_url ? (
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-full overflow-hidden border-2 border-blue-500 shadow-sm">
                  <img
                    src={user.avatar_url}
                    alt={user.fullName || user.name || ''}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'} font-bold text-base md:text-lg`}>
                  {getInitials()}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-base md:text-xl font-bold text-theme-text">
                {user.fullName || user.name || (isRTL ? 'مستخدم' : 'User')}
              </h2>
              <p className="text-[10px] md:text-sm opacity-70 text-theme-text">
                {user.role || '-'}
              </p>
              <p className="text-[9px] md:text-xs opacity-60 text-theme-text mt-0.5">
                {user.email}
                {user.department ? ` • ${user.department}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-xs md:btn-sm btn-circle btn-ghost text-theme-text opacity-70 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
          >
            <FaTimes size={16} className="md:w-5 md:h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 md:p-8 space-y-4 md:space-y-8 custom-scrollbar">

          {/* Section 1: Personal Information */}
          <section>
            <h3 className={sectionTitleClass}>
              <span className="text-blue-500"><FaIdCard /></span>
              {isRTL ? 'المعلومات الشخصية' : 'Personal Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
              <div>
                <label className={labelClass}>{isRTL ? 'الاسم بالكامل' : 'Full Name'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaUser className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.fullName || user.name || ''} readOnly className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'المدير المباشر' : 'Direct Manager'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaUser className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input
                    type="text"
                    value={
                      user.manager?.name ||
                      user.manager?.fullName ||
                      user.manager_name ||
                      user.directManager ||
                      (user.manager_id ? `#${user.manager_id}` : '-') ||
                      '-'
                    }
                    readOnly
                    className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'اسم المستخدم' : 'Username'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaTag className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.username || ''} readOnly className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'رقم الهاتف' : 'Phone Number'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaPhone className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.phone || ''} readOnly dir="ltr" className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'البريد الإلكتروني' : 'Email'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaEnvelope className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.email || ''} readOnly className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Work Details */}
          <section>
            <h3 className={sectionTitleClass}>
              <span className="text-purple-500"><FaBuilding /></span>
              {isRTL ? 'بيانات العمل' : 'Work Details'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
              <div className="md:col-span-1">
                <label className={labelClass}>{isRTL ? 'القسم' : 'Department'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaLayerGroup className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.department || '-'} readOnly className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'الفرع' : 'Branch'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaBuilding className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.branch || '-'} readOnly className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'المنطقة' : 'Region'}</label>
                <div className="relative group">
                  <div className={`absolute ${isRTL ? 'right-2 md:right-3' : 'left-2 md:left-3'} top-2 md:top-3 text-theme-text opacity-40 group-hover:opacity-70 transition-opacity`}>
                    <FaMapMarkerAlt className="w-3 h-3 md:w-4 md:h-4" />
                  </div>
                  <input type="text" value={user.region || '-'} readOnly className={`${inputClass} ${isRTL ? 'pr-8 md:pr-10' : 'pl-8 md:pl-10'}`} />
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'الحالة' : 'Status'}</label>
                <div className={`w-full px-3 py-1.5 md:px-4 md:py-2.5 rounded-lg md:rounded-xl border flex items-center gap-2 md:gap-3 ${user.status === 'Active'
                    ? (isDark ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-green-50 border-green-200 text-green-700')
                    : (isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-700')
                  }`}>
                  <span className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></span>
                  <span className="text-xs md:text-sm font-medium">{user.status || 'Inactive'}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section: User Targets */}
          <section>
            <h3 className={sectionTitleClass}>
              <span className="text-red-500"><FaChartLine /></span>
              {isRTL ? 'أهداف المستخدم' : 'User Targets'}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs md:text-sm text-theme-text opacity-70">
                  {isRTL ? `تارجت السنة الحالية ${currentYear}` : `Current year target ${currentYear}`}
                </span>
                {targetsLoading && (
                  <span className="text-[10px] md:text-xs text-blue-500">
                    {isRTL ? 'جاري التحميل...' : 'Loading...'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={targetMetricClass}>
                  <span className="text-[10px] md:text-xs opacity-60">{isRTL ? 'شهري' : 'Monthly'}</span>
                  <div className="mt-1 text-base md:text-lg font-bold text-theme-text" dir="ltr">
                    {formatAmount(currentTarget.monthly_target)} EGP
                  </div>
                </div>
                <div className={targetMetricClass}>
                  <span className="text-[10px] md:text-xs opacity-60">{isRTL ? 'ربع سنوي' : 'Quarterly'}</span>
                  <div className="mt-1 text-base md:text-lg font-bold text-theme-text" dir="ltr">
                    {formatAmount(currentTarget.quarterly_target)} EGP
                  </div>
                </div>
                <div className={targetMetricClass}>
                  <span className="text-[10px] md:text-xs opacity-60">{isRTL ? 'نصف سنوي' : 'Semi Annual'}</span>
                  <div className="mt-1 text-base md:text-lg font-bold text-theme-text" dir="ltr">
                    {formatAmount(currentTarget.semi_annual_target)} EGP
                  </div>
                </div>
                <div className={targetMetricClass}>
                  <span className="text-[10px] md:text-xs opacity-60">{isRTL ? 'سنوي' : 'Yearly'}</span>
                  <div className={`mt-1 text-base md:text-lg font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`} dir="ltr">
                    {formatAmount(currentTarget.yearly_target)} EGP
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                <div>
                  <label className={labelClass}>{usesCompanyTarget(user) ? (isRTL ? 'تارجت الشركة' : 'Company Target') : (isRTL ? 'التارجت الموروث (الفريق)' : 'Inherited Target (Team)')}</label>
                  <div className={`w-full px-3 py-2 rounded-lg border flex flex-col gap-1 ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] md:text-xs opacity-70">{isRTL ? 'شهري' : 'Monthly'}</span>
                      <span className="font-bold text-xs md:text-sm" dir="ltr">{formatAmount(user.inherited_monthly_target)} EGP</span>
                    </div>
                    <div className="w-full h-[1px] bg-gray-200 dark:bg-gray-700 opacity-50 my-0.5"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] md:text-xs opacity-70">{isRTL ? 'سنوي' : 'Yearly'}</span>
                      <span className="font-bold text-xs md:text-sm" dir="ltr">{formatAmount(user.inherited_yearly_target)} EGP</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>{isRTL ? 'التارجت الكلي' : 'Total Target'}</label>
                  <div className={`w-full px-3 py-2 rounded-lg border flex flex-col gap-1 ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] md:text-xs opacity-70">{isRTL ? 'شهري' : 'Monthly'}</span>
                      <span className={`font-bold text-xs md:text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`} dir="ltr">{formatAmount(user.total_monthly_target)} EGP</span>
                    </div>
                    <div className="w-full h-[1px] bg-gray-200 dark:bg-gray-700 opacity-50 my-0.5"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] md:text-xs opacity-70">{isRTL ? 'سنوي' : 'Yearly'}</span>
                      <span className={`font-bold text-xs md:text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`} dir="ltr">{formatAmount(user.total_yearly_target)} EGP</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'شرائح العمولة حسب تحقيق التارجت' : 'Commission tiers by achievement'}</label>
                {currentCommissionTiers.length > 0 ? (
                  <div className="space-y-2">
                    {currentCommissionTiers.map((tier, index) => (
                      <div
                        key={`${tier.id || index}-${tier.from_percentage}-${tier.to_percentage}`}
                        className={`grid grid-cols-3 gap-2 rounded-lg border px-3 py-2 text-xs md:text-sm ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div>
                          <span className="block text-[9px] md:text-[10px] opacity-60">{isRTL ? 'من' : 'From'}</span>
                          <strong dir="ltr">{formatPercent(tier.from_percentage)}%</strong>
                        </div>
                        <div>
                          <span className="block text-[9px] md:text-[10px] opacity-60">{isRTL ? 'إلى' : 'To'}</span>
                          <strong dir="ltr">{tier.to_percentage === null || tier.to_percentage === undefined || tier.to_percentage === '' ? (isRTL ? 'بدون حد' : 'No cap') : `${formatPercent(tier.to_percentage)}%`}</strong>
                        </div>
                        <div>
                          <span className="block text-[9px] md:text-[10px] opacity-60">{isRTL ? 'العمولة' : 'Commission'}</span>
                          <strong className={isDark ? 'text-green-400' : 'text-green-600'} dir="ltr">{formatPercent(tier.commission_percentage)}%</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`px-3 py-2.5 rounded-lg border border-dashed text-xs md:text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    {isRTL ? 'لا توجد شرائح عمولة للسنة الحالية.' : 'No commission tiers for the current year.'}
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass}>{isRTL ? 'تاريخ التارجت' : 'Target history'}</label>
                {targetHistory.length > 0 ? (
                  <div className={`overflow-x-auto rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <table className="w-full min-w-[720px] text-xs md:text-sm">
                      <thead className={isDark ? 'bg-gray-800/70 text-gray-400' : 'bg-gray-50 text-gray-500'}>
                        <tr>
                          <th className="px-3 py-2.5 text-start whitespace-nowrap">{isRTL ? 'السنة' : 'Year'}</th>
                          <th className="px-3 py-2.5 text-end whitespace-nowrap">{isRTL ? 'شهري' : 'Monthly'}</th>
                          <th className="px-3 py-2.5 text-end whitespace-nowrap">{isRTL ? 'ربع سنوي' : 'Quarterly'}</th>
                          <th className="px-3 py-2.5 text-end whitespace-nowrap">{isRTL ? 'نصف سنوي' : 'Semi Annual'}</th>
                          <th className="px-3 py-2.5 text-end whitespace-nowrap">{isRTL ? 'سنوي' : 'Yearly'}</th>
                          <th className="px-3 py-2.5 text-center whitespace-nowrap">{isRTL ? 'العمولة' : 'Commission'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...targetHistory]
                          .sort((a, b) => Number(b.year) - Number(a.year))
                          .map((row) => {
                            const isCurrent = Number(row.year) === currentYear
                            const tiers = Array.isArray(row.commission_tiers)
                              ? row.commission_tiers
                              : (Array.isArray(row.commissionTiers) ? row.commissionTiers : [])
                            const tierItems = tiers.map((tier) => {
                              const from = Number(tier.from_percentage ?? 0)
                              const to = tier.to_percentage === null || tier.to_percentage === undefined || tier.to_percentage === ''
                                ? (isRTL ? 'بدون حد' : 'No cap')
                                : `${Number(tier.to_percentage)}%`
                              return {
                                label: `${from}% → ${to}`,
                                value: Number(tier.commission_percentage ?? 0) || 0,
                              }
                            })
                            return (
                              <tr
                                key={`${row.user_id}-${row.year}`}
                                className={`${isDark ? 'border-t border-gray-700' : 'border-t border-gray-100'} ${isCurrent ? (isDark ? 'bg-blue-500/10' : 'bg-blue-50') : ''}`}
                              >
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{row.year}</span>
                                    {isCurrent && (
                                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-300">
                                        {isRTL ? 'الحالية' : 'Current'}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-end font-mono whitespace-nowrap" dir="ltr">{formatAmount(row.monthly_target)}</td>
                                <td className="px-3 py-2.5 text-end font-mono whitespace-nowrap" dir="ltr">{formatAmount(row.quarterly_target)}</td>
                                <td className="px-3 py-2.5 text-end font-mono whitespace-nowrap" dir="ltr">{formatAmount(row.semi_annual_target)}</td>
                                <td className="px-3 py-2.5 text-end font-mono font-semibold whitespace-nowrap" dir="ltr">{formatAmount(row.yearly_target)}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex justify-center">
                                    <ListHoverPopover
                                      icon={Percent}
                                      items={tierItems}
                                      title={isRTL ? 'شرائح العمولة' : 'Commission tiers'}
                                      isRTL={isRTL}
                                      formatValue={(value) => `${value}%`}
                                      emptyTitle={isRTL ? 'لا توجد شرائح' : 'No tiers'}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={`px-3 py-2.5 rounded-lg border border-dashed text-xs md:text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    {targetsLoading
                      ? (isRTL ? 'جاري تحميل تاريخ التارجت...' : 'Loading target history...')
                      : (isRTL ? 'لا يوجد تاريخ تارجت محفوظ.' : 'No saved target history.')}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className={sectionTitleClass}>
              <span className="text-amber-500"><FaBell /></span>
              {isRTL ? 'إعدادات الإشعارات' : 'Notification Settings'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
              {notificationItems.map((item) => {
                const enabled = notificationSettings[item.key] !== false
                return (
                  <div key={item.key}>
                    <label className={labelClass}>{item.label}</label>
                    <div className={`w-full px-3 py-1.5 md:px-4 md:py-2.5 rounded-lg md:rounded-xl border flex flex-col gap-1 ${enabled
                        ? isDark
                          ? 'bg-green-500/5 border-green-500/30 text-green-300'
                          : 'bg-green-50 border-green-200 text-green-700'
                        : isDark
                          ? 'bg-gray-900 border-gray-700 text-gray-400'
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}>
                      <span className="text-xs md:text-sm font-semibold">
                        {enabled
                          ? (isRTL ? 'مفعّل' : 'Enabled')
                          : (isRTL ? 'معطّل' : 'Disabled')}
                      </span>
                      <span className="text-[9px] md:text-xs opacity-80">
                        {item.description}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className={sectionTitleClass}>
              <span className="text-green-500"><FaShieldAlt /></span>
              {isRTL ? 'الصلاحيات' : 'Permissions'}
            </h3>
            <div className="space-y-3 md:space-y-4">
              {hasPermissions ? (
                Object.entries(modulePermissions).map(([group, perms]) => {
                  const list = Array.isArray(perms) ? perms : []
                  if (!list.length) return null
                  return (
                    <div key={group} className="border border-dashed rounded-lg md:rounded-xl px-3 py-2.5 md:px-4 md:py-3 bg-gradient-to-br from-transparent to-gray-50/60 dark:to-gray-900/40">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs md:text-sm font-semibold text-theme-text">
                          {getGroupLabel(group)}
                        </span>
                        <span className="text-[9px] md:text-[11px] text-[var(--muted-text)]">
                          {list.length} {isRTL ? 'صلاحية' : 'permissions'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {list.map((perm) => (
                          <span
                            key={perm}
                            className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[11px] font-medium border ${isDark
                                ? 'bg-gray-900 border-gray-700 text-blue-200'
                                : 'bg-blue-50 border-blue-100 text-blue-700'
                              }`}
                          >
                            {formatPermissionLabel(group, perm)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className={`px-3 py-2.5 md:px-4 md:py-3 rounded-lg md:rounded-xl border border-dashed text-center ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
                  }`}>
                  <span className="text-xs md:text-sm">
                    {isRTL ? 'لا توجد صلاحيات مخصصة لهذا المستخدم.' : 'No custom permissions assigned for this user.'}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className={`flex justify-end gap-3 px-3 py-3 md:px-8 md:py-5 border-t ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-gray-50/50'}`}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm md:btn-md px-4 md:px-6 bg-blue dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-theme-text border-none rounded-lg md:rounded-xl font-medium transition-colors text-xs md:text-base"
          >
            {isRTL ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default UserPreviewModal
