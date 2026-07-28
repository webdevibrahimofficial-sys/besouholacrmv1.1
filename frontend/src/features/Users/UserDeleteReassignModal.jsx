import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaSearch, FaTimes, FaUser, FaUserTie, FaUsers } from 'react-icons/fa'
import SearchableSelect from '@components/SearchableSelect'
import AvatarImage from '@components/AvatarImage'
import { useTheme } from '@shared/context/ThemeProvider'

const ROLE_RANKS = {
  Owner: 0,
  'Super Admin': 1,
  Admin: 2,
  Director: 2,
  'Sales Director': 2,
  'Operations Manager': 2,
  'Telesales Manager': 2,
  'Branch Manager': 3,
  'Sales Manager': 3,
  'Telesales Team Leader': 4,
  'Team Leader': 4,
  'Sales Person': 5,
  'Sales Agent': 5,
  'Telesales Agent': 5,
}

const getUserRole = (user) => {
  if (!user) return ''
  if (user.role) return user.role
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles[0].name
  return ''
}

const normalizeRole = (role) => {
  const value = String(role || '').trim()
  return value || 'Team Member'
}

const isLeadershipRole = (role) => {
  const lower = String(role || '').toLowerCase()
  return (
    lower.includes('manager')
    || lower.includes('leader')
    || lower.includes('director')
    || lower.includes('admin')
    || lower.includes('owner')
    || lower.includes('operation manager')
    || lower.includes('operations manager')
  )
}

const isSalesOnlyRole = (role) => {
  const lower = String(role || '').toLowerCase()
  return (
    lower.includes('sales person')
    || lower.includes('salesperson')
    || lower.includes('sales agent')
    || lower.includes('broker')
  )
}

const isTelesalesOnlyRole = (role) => {
  const lower = String(role || '').toLowerCase()
  return (
    lower.includes('telesales')
    || lower.includes('call center')
  )
}

const canReceiveSalesLeads = (role) => (
  isLeadershipRole(role) || isSalesOnlyRole(role)
)

const canReceiveTelesalesLeads = (role) => (
  isLeadershipRole(role) || isTelesalesOnlyRole(role)
)

const translateRoleLabel = (role, isArabic) => {
  const normalized = normalizeRole(role)
  if (!isArabic) return normalized

  const roleMap = {
    All: 'الكل',
    Owner: 'المالك',
    'Super Admin': 'سوبر أدمن',
    Admin: 'أدمن',
    Director: 'مدير',
    'Sales Director': 'مدير المبيعات',
    'Operations Manager': 'مدير العمليات',
    'Telesales Manager': 'مدير التيليسيلز',
    'Branch Manager': 'مدير الفرع',
    'Sales Manager': 'مدير المبيعات',
    'Telesales Team Leader': 'تيم ليدر تيليسيلز',
    'Team Leader': 'قائد الفريق',
    'Sales Person': 'سيلز',
    'Sales Agent': 'مندوب مبيعات',
    'Telesales Agent': 'تيليسيلز',
    'Team Member': 'عضو فريق',
  }

  return roleMap[normalized] || normalized
}

const sortUsersForAssign = (users) => (
  [...users].sort((a, b) => {
    const rankA = ROLE_RANKS[getUserRole(a)] ?? 99
    const rankB = ROLE_RANKS[getUserRole(b)] ?? 99
    if (rankA !== rankB) return rankA - rankB
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
)

const CHECK_ICON = '\u2713'

export default function UserDeleteReassignModal({
  isOpen,
  onClose,
  onSubmit,
  submitting = false,
  errorMessage = '',
  summary = null,
  targetUser = null,
  users = [],
  isArabic = false,
}) {
  const { theme, resolvedTheme } = useTheme()
  const isLight = (resolvedTheme || theme) === 'light'

  const t = (en, ar) => (isArabic ? ar : en)

  const [roles, setRoles] = useState(['All'])
  const [filterRole, setFilterRole] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedTelesalesUser, setSelectedTelesalesUser] = useState(null)
  const [selectedSalesUser, setSelectedSalesUser] = useState(null)
  const [brokerTargetUserId, setBrokerTargetUserId] = useState('')

  const [telesalesAssignRole, setTelesalesAssignRole] = useState('sales')
  const [salesAssignRole, setSalesAssignRole] = useState('sales')

  const [telesalesAssignMethod, setTelesalesAssignMethod] = useState('fresh')
  const [salesAssignMethod, setSalesAssignMethod] = useState('fresh')

  const [telesalesOptions, setTelesalesOptions] = useState({
    sameStage: false,
    clearHistory: false,
  })

  const [salesOptions, setSalesOptions] = useState({
    duplicate: false,
    sameStage: false,
    clearHistory: false,
  })

  const [activeStep, setActiveStep] = useState('sales')

  const dependencySummary = summary?.dependencies || {}
  const salesLeadCount = Number(dependencySummary?.leads?.count || 0)
  const telesalesLeadCount = Number(dependencySummary?.telesales_leads?.count || 0)
  const brokerCount = Number(dependencySummary?.brokers?.count || 0)
  const soleBrokerCount = Number(dependencySummary?.brokers?.sole_assigned_count || 0)
  const sharedBrokerCount = Number(dependencySummary?.brokers?.shared_assigned_count || 0)

  const steps = useMemo(() => {
    const next = []
    if (telesalesLeadCount > 0) next.push('telesales')
    if (salesLeadCount > 0) next.push('sales')
    if (brokerCount > 0) next.push('brokers')
    return next
  }, [brokerCount, salesLeadCount, telesalesLeadCount])

  const availableUsers = useMemo(() => {
    const list = (Array.isArray(users) ? users : [])
      .filter((user) => Number(user?.id) !== Number(targetUser?.id))
      .map((user) => ({ ...user, role: normalizeRole(getUserRole(user)) }))

    return sortUsersForAssign(list)
  }, [targetUser?.id, users])

  const stepUsers = useMemo(() => {
    if (activeStep === 'telesales') {
      return availableUsers.filter((user) => canReceiveTelesalesLeads(getUserRole(user)))
    }

    if (activeStep === 'sales') {
      return availableUsers.filter((user) => canReceiveSalesLeads(getUserRole(user)))
    }

    return availableUsers
  }, [activeStep, availableUsers])

  const filteredUsers = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    return stepUsers.filter((user) => {
      const matchesRole = filterRole === 'All' || String(user.role || '').toLowerCase() === String(filterRole).toLowerCase()
      const matchesSearch = !term
        || String(user.name || '').toLowerCase().includes(term)
        || String(user.email || '').toLowerCase().includes(term)
      return matchesRole && matchesSearch
    })
  }, [filterRole, searchQuery, stepUsers])

  const brokerUserOptions = useMemo(() => (
    availableUsers.map((user) => ({
      value: String(user.id),
      label: `${user.name || user.email || user.id}${user.role ? ` (${translateRoleLabel(user.role, isArabic)})` : ''}`,
    }))
  ), [availableUsers, isArabic])

  useEffect(() => {
    if (!isOpen) return

    setBrokerTargetUserId('')
    setActiveStep(steps[0] || 'sales')
    setSelectedTelesalesUser(null)
    setSelectedSalesUser(null)
    setTelesalesAssignRole('sales')
    setSalesAssignRole('sales')
    setTelesalesAssignMethod('fresh')
    setSalesAssignMethod('fresh')
    setTelesalesOptions({ sameStage: false, clearHistory: false })
    setSalesOptions({ duplicate: false, sameStage: false, clearHistory: false })
  }, [isOpen, steps])

  useEffect(() => {
    if (!isOpen) return
    const roleValues = ['All', ...Array.from(new Set(stepUsers.map((user) => normalizeRole(user.role))))]
    setRoles(roleValues)
    setFilterRole('All')
    setSearchQuery('')
  }, [activeStep, isOpen, stepUsers])

  useEffect(() => {
    if (!selectedTelesalesUser) return
    setTelesalesAssignRole(isLeadershipRole(getUserRole(selectedTelesalesUser)) ? 'manager' : 'sales')
  }, [selectedTelesalesUser])

  useEffect(() => {
    if (!selectedSalesUser) return
    setSalesAssignRole(isLeadershipRole(getUserRole(selectedSalesUser)) ? 'manager' : 'sales')
    if (soleBrokerCount > 0) {
      setBrokerTargetUserId(String(selectedSalesUser.id))
    }
  }, [selectedSalesUser, soleBrokerCount])

  const setTelesalesMode = (mode) => {
    if (mode === 'same_stage') {
      setTelesalesAssignMethod('fresh')
      setTelesalesOptions((prev) => ({ ...prev, sameStage: true }))
      return
    }

    setTelesalesAssignMethod(mode)
    setTelesalesOptions((prev) => ({ ...prev, sameStage: false }))
  }

  const setSalesMode = (mode) => {
    if (mode === 'same_stage') {
      setSalesAssignMethod('fresh')
      setSalesOptions((prev) => ({ ...prev, duplicate: false, sameStage: true }))
      return
    }

    if (mode === 'duplicate') {
      setSalesAssignMethod('fresh')
      setSalesOptions((prev) => ({ ...prev, duplicate: true, sameStage: false }))
      return
    }

    setSalesAssignMethod(mode)
    setSalesOptions((prev) => ({ ...prev, duplicate: false, sameStage: false }))
  }

  const assignMethodButtonClass = (active) => {
    if (active) {
      return isLight
        ? 'bg-white text-slate-900 shadow-sm border border-blue-200'
        : 'bg-slate-700 text-white shadow-sm border border-blue-500/60'
    }

    return isLight
      ? 'text-gray-500 hover:text-gray-700 border border-transparent'
      : 'text-slate-400 hover:text-slate-200 border border-transparent'
  }

  const renderAssignMethodOption = (active, onClick, label) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-all ${assignMethodButtonClass(active)}`}
    >
      <span>{label}</span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold transition-all ${
          active
            ? 'border-blue-500 bg-blue-500 text-white'
            : (isLight ? 'border-gray-300 bg-white text-transparent' : 'border-slate-500 bg-slate-900 text-transparent')
        }`}
        aria-hidden="true"
      >
        {CHECK_ICON}
      </span>
    </button>
  )

  const renderUserPicker = (selectedUser, setSelectedUser, roleLabel, searchLabel) => (
    <>
      <div className="mb-4 flex gap-2">
        <div className="w-1/3">
          <label className={`mb-1 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {roleLabel}
          </label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className={`w-full rounded-lg border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'}`}
          >
            {roles.map((role) => (
              <option key={role} value={role}>{translateRoleLabel(role, isArabic)}</option>
            ))}
          </select>
        </div>

        <div className="w-2/3">
          <label className={`mb-1 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {searchLabel}
          </label>
          <div className="relative">
            <FaSearch className={`absolute top-1/2 -translate-y-1/2 text-xs text-gray-400 ${isArabic ? 'right-3' : 'left-3'}`} />
            <input
              type="text"
              placeholder={t('Search in team members', 'ابحث في أعضاء الفريق')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full rounded-lg border py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'} ${isArabic ? 'pl-3 pr-9' : 'pl-9 pr-3'}`}
            />
          </div>
        </div>
      </div>

      <div className="custom-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
        {filteredUsers.length > 0 ? filteredUsers.map((user) => (
          <div
            key={user.id}
            onClick={() => setSelectedUser(user)}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-all ${
              selectedUser?.id === user.id
                ? (isLight ? 'border-blue-500 bg-blue-50' : 'border-blue-500 bg-blue-900/20')
                : (isLight ? 'border-transparent hover:bg-gray-50' : 'border-transparent hover:bg-slate-800')
            }`}
          >
            <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedUser?.id === user.id ? 'border-blue-500' : 'border-gray-300'}`}>
              {selectedUser?.id === user.id ? <div className="h-2 w-2 rounded-full bg-blue-500" /> : null}
            </div>

            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-200">
              {(user.avatar || user.avatar_url) ? (
                <AvatarImage user={user} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <FaUser className="text-xs text-gray-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{user.name}</p>
              <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {translateRoleLabel(user.role || 'Team Member', isArabic)}
              </p>
            </div>
          </div>
        )) : (
          <div className="py-4 text-center text-sm text-gray-500">
            {t('No members found', 'لا يوجد أعضاء')}
          </div>
        )}
      </div>
    </>
  )

  if (!isOpen) return null

  const currentStepIndex = Math.max(steps.indexOf(activeStep), 0)
  const isLastStep = currentStepIndex === steps.length - 1
  const nextStep = !isLastStep ? steps[currentStepIndex + 1] : null

  const canSubmitTelesalesStep = telesalesLeadCount === 0 || !!selectedTelesalesUser
  const canSubmitSalesStep = salesLeadCount === 0 || !!selectedSalesUser
  const canSubmitBrokerStep = soleBrokerCount === 0 || !!brokerTargetUserId

  const canProceed = activeStep === 'telesales'
    ? canSubmitTelesalesStep
    : activeStep === 'sales'
      ? canSubmitSalesStep
      : canSubmitBrokerStep

  const handleSubmit = async () => {
    if (!isLastStep && nextStep) {
      setActiveStep(nextStep)
      return
    }

    const payload = {
      telesales_target_user_id: telesalesLeadCount > 0 && selectedTelesalesUser ? Number(selectedTelesalesUser.id) : null,
      telesales_assign_role: telesalesAssignRole,
      telesales_method: telesalesAssignMethod,
      telesales_options: telesalesOptions,
      lead_target_user_id: salesLeadCount > 0 && selectedSalesUser ? Number(selectedSalesUser.id) : null,
      assign_role: salesAssignRole,
      lead_stage: salesOptions.sameStage ? 'same_stage' : (salesAssignMethod === 'cold_call' ? 'cold_calls' : 'new_lead'),
      lead_history_option: salesOptions.clearHistory ? 'assign_as_new' : 'keep_history',
      broker_target_user_id: soleBrokerCount > 0 && brokerTargetUserId ? Number(brokerTargetUserId) : null,
    }

    await onSubmit?.(payload)
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`${isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-white'} flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl`}>
        <div className={`flex items-center justify-between border-b p-4 ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <div className={`rounded-lg p-2 ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/30 text-blue-400'}`}>
              <FaUserTie />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t('Reassign Before Deleting User', 'إعادة التوزيع قبل حذف المستخدم')}</h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {steps.length > 0 ? `${currentStepIndex + 1}/${steps.length}` : '0/0'} {t('Step', 'خطوة')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-2 transition-colors hover:bg-black/5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {errorMessage ? (
            <div className={`rounded-2xl border px-4 py-3 shadow-sm ${isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-500/30 bg-red-500/10 text-red-100'}`}>
              <p className="text-sm font-semibold">{t('Unable to complete the reassignment before deletion', 'تعذر إكمال إعادة التوزيع قبل الحذف')}</p>
              <p className={`mt-1 text-sm leading-6 ${isLight ? 'text-red-700' : 'text-red-100/90'}`}>{errorMessage}</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <FaUserTie className="text-cyan-500" />
                {t('Telesales Leads', 'ليدز التيليسيلز')}
              </div>
              <div className="mt-4 text-3xl font-bold">{telesalesLeadCount}</div>
            </div>

            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <FaUserTie className="text-blue-500" />
                {t('Sales Leads', 'ليدز السيلز')}
              </div>
              <div className="mt-4 text-3xl font-bold">{salesLeadCount}</div>
            </div>

            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <FaUsers className="text-emerald-500" />
                {t('Brokers', 'البروكرز')}
              </div>
              <div className="mt-4 text-3xl font-bold">{brokerCount}</div>
            </div>
          </div>

          {steps.length > 0 ? (
            <div className={`inline-flex rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
              {steps.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveStep(step)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    activeStep === step
                      ? 'bg-white text-slate-900 shadow-sm'
                      : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white')
                  }`}
                >
                  {step === 'telesales'
                    ? t('Telesales', 'التيليسيلز')
                    : step === 'sales'
                      ? t('Sales', 'السيلز')
                      : t('Brokers', 'البروكرز')}
                </button>
              ))}
            </div>
          ) : null}

          {activeStep === 'telesales' ? (
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/20'}`}>
              {renderUserPicker(
                selectedTelesalesUser,
                setSelectedTelesalesUser,
                t('Filter By Telesales Role', 'تصفية حسب دور التيليسيلز'),
                t('Assign To', 'تعيين إلى')
              )}

              <div className="mt-4">
                <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('Reassign telesales leads as', 'إعادة إسناد ليدز التيليسيلز كـ')}
                </label>
                <div className={`grid grid-cols-3 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                  {renderAssignMethodOption(
                    telesalesAssignMethod === 'fresh' && !telesalesOptions.sameStage,
                    () => setTelesalesMode('fresh'),
                    t('Fresh', 'كجديد')
                  )}
                  {renderAssignMethodOption(
                    telesalesAssignMethod === 'cold_call' && !telesalesOptions.sameStage,
                    () => setTelesalesMode('cold_call'),
                    t('As cold call', 'ككولد كول')
                  )}
                  {renderAssignMethodOption(
                    telesalesOptions.sameStage,
                    () => setTelesalesMode('same_stage'),
                    t('Same stage', 'نفس المرحلة')
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('Assignment Role', 'نوع الإسناد')}
                </label>

                {selectedTelesalesUser && isLeadershipRole(getUserRole(selectedTelesalesUser)) ? (
                  <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                    <button
                      type="button"
                      onClick={() => setTelesalesAssignRole('sales')}
                      className={`rounded-lg py-2 text-sm transition-all ${telesalesAssignRole === 'sales' ? 'bg-white text-slate-900 shadow-sm' : (isLight ? 'text-gray-500 hover:text-gray-700' : 'text-slate-300 hover:text-white')}`}
                    >
                      {t('As Telesales Agent', 'كوكيل تيليسيلز')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelesalesAssignRole('manager')}
                      className={`rounded-lg py-2 text-sm transition-all ${telesalesAssignRole === 'manager' ? 'bg-white text-slate-900 shadow-sm' : (isLight ? 'text-gray-500 hover:text-gray-700' : 'text-slate-300 hover:text-white')}`}
                    >
                      {t('As Telesales Manager', 'كمدير تيليسيلز')}
                    </button>
                  </div>
                ) : (
                  <div className={`rounded-xl border px-3 py-2 text-sm ${isLight ? 'border-gray-200 bg-gray-50 text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-200'}`}>
                    {t('This user can only receive the leads as a telesales agent.', 'هذا المستخدم يمكن الإسناد له كوكيل تيليسيلز فقط.')}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={telesalesOptions.clearHistory}
                    onChange={(e) => setTelesalesOptions((prev) => ({ ...prev, clearHistory: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {t('Clear History', 'مسح السجل')}
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          {activeStep === 'sales' ? (
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/20'}`}>
              {renderUserPicker(
                selectedSalesUser,
                setSelectedSalesUser,
                t('Filter By Role', 'تصفية حسب الدور'),
                t('Assign To', 'تعيين إلى')
              )}

              <div className="mt-4">
                <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('Reassign sales leads as', 'إعادة إسناد ليدز السيلز كـ')}
                </label>
                <div className={`grid grid-cols-3 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                  {renderAssignMethodOption(
                    salesAssignMethod === 'fresh' && !salesOptions.sameStage && !salesOptions.duplicate,
                    () => setSalesMode('fresh'),
                    t('Fresh', 'كنيو ليد')
                  )}
                  {renderAssignMethodOption(
                    salesAssignMethod === 'cold_call' && !salesOptions.sameStage && !salesOptions.duplicate,
                    () => setSalesMode('cold_call'),
                    t('As cold call', 'ككولد كول')
                  )}
                  {renderAssignMethodOption(
                    salesOptions.sameStage,
                    () => setSalesMode('same_stage'),
                    t('Same stage', 'نفس المرحلة')
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('Assignment Role', 'نوع الإسناد')}
                </label>

                {selectedSalesUser && isLeadershipRole(getUserRole(selectedSalesUser)) ? (
                  <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                    <button
                      type="button"
                      onClick={() => setSalesAssignRole('sales')}
                      className={`rounded-lg py-2 text-sm transition-all ${salesAssignRole === 'sales' ? 'bg-white text-slate-900 shadow-sm' : (isLight ? 'text-gray-500 hover:text-gray-700' : 'text-slate-300 hover:text-white')}`}
                    >
                      {t('As Sales Person', 'كسيلز')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalesAssignRole('manager')}
                      className={`rounded-lg py-2 text-sm transition-all ${salesAssignRole === 'manager' ? 'bg-white text-slate-900 shadow-sm' : (isLight ? 'text-gray-500 hover:text-gray-700' : 'text-slate-300 hover:text-white')}`}
                    >
                      {t('As Manager', 'كمدير')}
                    </button>
                  </div>
                ) : (
                  <div className={`rounded-xl border px-3 py-2 text-sm ${isLight ? 'border-gray-200 bg-gray-50 text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-200'}`}>
                    {t('This user can only receive the leads as a sales person.', 'هذا المستخدم يمكن الإسناد له كسيلز فقط.')}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={salesOptions.duplicate}
                    onChange={(e) => setSalesMode(e.target.checked ? 'duplicate' : 'fresh')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {t('Duplicate and assign as fresh', 'تكرار الليد وإسنادها كنيو ليد')}
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={salesOptions.clearHistory}
                    onChange={(e) => setSalesOptions((prev) => ({ ...prev, clearHistory: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {t('Clear History', 'مسح السجل')}
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          {activeStep === 'brokers' ? (
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/20'}`}>
              <div className={`rounded-xl border px-3 py-2 text-sm ${isLight ? 'border-gray-200 bg-gray-50 text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-200'}`}>
                {t(
                  `${soleBrokerCount} broker assignment(s) depend only on this user and must be moved before deletion. Shared broker assignments (${sharedBrokerCount}) will be detached automatically.`,
                  `يوجد ${soleBrokerCount} بروكر/بروكرز يعتمدون فقط على هذا المستخدم ويجب نقلهم قبل الحذف. أما ${sharedBrokerCount} المشتركين فسيتم فصل المستخدم منهم تلقائيًا.`
                )}
              </div>

              {soleBrokerCount > 0 ? (
                <div className="mt-4">
                  <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t('Move sole brokers to', 'نقل البروكرز إلى')}
                  </label>
                  <SearchableSelect
                    options={brokerUserOptions}
                    value={brokerTargetUserId}
                    onChange={setBrokerTargetUserId}
                    placeholder={t('Select a user', 'اختر مستخدمًا')}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={`flex items-center justify-end gap-3 border-t p-4 ${isLight ? 'border-gray-100 bg-gray-50' : 'border-slate-800 bg-slate-800/50'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isLight ? 'border border-gray-200 bg-white text-slate-600 hover:bg-gray-200' : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {t('Cancel', 'إلغاء')}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canProceed}
            className={`rounded-lg px-6 py-2 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all ${!submitting && canProceed ? 'bg-blue-600 text-white hover:scale-[1.02] hover:bg-blue-700' : 'cursor-not-allowed bg-gray-300 text-gray-500'}`}
          >
            {submitting
              ? t('Processing...', 'جارٍ التنفيذ...')
              : isLastStep
                ? t('Reassign and Delete', 'إعادة التوزيع ثم الحذف')
                : t('Next', 'التالي')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
