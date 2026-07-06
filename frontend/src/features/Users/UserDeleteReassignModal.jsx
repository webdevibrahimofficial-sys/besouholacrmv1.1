import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaSearch, FaTimes, FaUser, FaUserTie, FaUsers } from 'react-icons/fa'
import SearchableSelect from '@components/SearchableSelect'
import { useTheme } from '@shared/context/ThemeProvider'

const ROLE_RANKS = {
  Owner: 0,
  'Super Admin': 1,
  Admin: 2,
  Director: 2,
  'Sales Director': 2,
  'Operations Manager': 2,
  'Branch Manager': 3,
  'Sales Manager': 3,
  'Team Leader': 4,
  'Sales Person': 5,
  'Sales Agent': 5,
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
  if (!role) return false
  const lower = String(role).toLowerCase()
  return (
    lower.includes('manager') ||
    lower.includes('leader') ||
    lower.includes('director') ||
    lower.includes('admin') ||
    lower.includes('owner') ||
    lower.includes('operation manager') ||
    lower.includes('operations manager')
  )
}

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
    'Branch Manager': 'مدير الفرع',
    'Sales Manager': 'مدير المبيعات',
    'Team Leader': 'قائد الفريق',
    'Sales Person': 'سيلز',
    'Sales Agent': 'مندوب مبيعات',
    'Team Member': 'عضو فريق',
  }

  return roleMap[normalized] || normalized
}

const sortUsersForAssign = (users) => {
  return [...users].sort((a, b) => {
    const roleA = getUserRole(a)
    const roleB = getUserRole(b)
    const rankA = ROLE_RANKS[roleA] ?? 99
    const rankB = ROLE_RANKS[roleB] ?? 99

    if (rankA !== rankB) return rankA - rankB
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

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

  const [roles, setRoles] = useState(['All'])
  const [filterRole, setFilterRole] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [assignRole, setAssignRole] = useState('sales')
  const [assignMethod, setAssignMethod] = useState('fresh')
  const [options, setOptions] = useState({
    duplicate: false,
    sameStage: false,
    clearHistory: false,
  })
  const [brokerTargetUserId, setBrokerTargetUserId] = useState('')
  const [activeTab, setActiveTab] = useState('leads')

  const dependencySummary = summary?.dependencies || {}
  const leadCount = Number(dependencySummary?.leads?.count || 0)
  const brokerCount = Number(dependencySummary?.brokers?.count || 0)
  const soleBrokerCount = Number(dependencySummary?.brokers?.sole_assigned_count || 0)
  const sharedBrokerCount = Number(dependencySummary?.brokers?.shared_assigned_count || 0)

  const availableUsers = useMemo(() => {
    const list = (Array.isArray(users) ? users : [])
      .filter((user) => Number(user?.id) !== Number(targetUser?.id))
      .map((user) => ({ ...user, role: normalizeRole(getUserRole(user)) }))

    return sortUsersForAssign(list)
  }, [users, targetUser?.id])

  const brokerUserOptions = useMemo(() => (
    availableUsers.map((user) => ({
      value: String(user.id),
      label: `${user.name || user.email || user.id}${user.role ? ` (${translateRoleLabel(user.role, isArabic)})` : ''}`,
    }))
  ), [availableUsers, isArabic])

  const filteredUsers = useMemo(() => {
    return availableUsers.filter((user) => {
      const matchesRole = filterRole === 'All' || String(user.role || '').toLowerCase() === String(filterRole).toLowerCase()
      const term = searchQuery.trim().toLowerCase()
      const matchesSearch = !term ||
        String(user.name || '').toLowerCase().includes(term) ||
        String(user.email || '').toLowerCase().includes(term)
      return matchesRole && matchesSearch
    })
  }, [availableUsers, filterRole, searchQuery])

  useEffect(() => {
    if (!isOpen) return

    const roleValues = ['All', ...Array.from(new Set(availableUsers.map((user) => normalizeRole(user.role))))]
    setRoles(roleValues)
    setFilterRole('All')
    setSearchQuery('')
    setSelectedUser(null)
    setAssignRole('sales')
    setAssignMethod('fresh')
    setOptions({
      duplicate: false,
      sameStage: false,
      clearHistory: false,
    })
    setBrokerTargetUserId('')
    setActiveTab(leadCount > 0 ? 'leads' : 'brokers')
  }, [isOpen, availableUsers, targetUser?.id, leadCount])

  useEffect(() => {
    if (!selectedUser) return
    const role = getUserRole(selectedUser)
    setAssignRole(isLeadershipRole(role) ? 'manager' : 'sales')
    if (soleBrokerCount > 0) {
      setBrokerTargetUserId(String(selectedUser.id))
    }
  }, [selectedUser, soleBrokerCount])

  if (!isOpen) return null

  const leadStage = options.sameStage
    ? 'same_stage'
    : assignMethod === 'cold_call'
      ? 'cold_calls'
      : 'new_lead'

  const leadHistoryOption = options.clearHistory ? 'assign_as_new' : 'keep_history'
  const needsBrokerStep = brokerCount > 0 && activeTab !== 'brokers'
  const canSubmitLeadStep = leadCount === 0 || !!selectedUser
  const canSubmitBrokerStep = soleBrokerCount === 0 || !!brokerTargetUserId

  const handleSubmit = async () => {
    if (needsBrokerStep) {
      setActiveTab('brokers')
      return
    }

    const payload = {
      lead_target_user_id: leadCount > 0 && selectedUser ? Number(selectedUser.id) : null,
      assign_role: assignRole,
      lead_stage: leadStage,
      lead_history_option: leadHistoryOption,
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
              <h2 className="text-lg font-semibold">
                {isArabic ? 'إعادة توزيع قبل حذف المستخدم' : 'Reassign Before Deleting User'}
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {leadCount > 0 && selectedUser ? '1' : '0'} {isArabic ? 'محدد' : 'Selected'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`rounded-full p-2 transition-colors hover:bg-black/5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {errorMessage ? (
            <div className={`rounded-2xl border px-4 py-3 shadow-sm ${isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-500/30 bg-red-500/10 text-red-100'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isLight ? 'bg-red-100 text-red-600' : 'bg-red-500/20 text-red-300'}`}>
                  <FaTimes className="text-xs" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {isArabic ? 'تعذر إكمال إعادة التوزيع قبل الحذف' : 'Unable to complete the reassignment before deletion'}
                  </p>
                  <p className={`mt-1 text-sm leading-6 ${isLight ? 'text-red-700' : 'text-red-100/90'}`}>
                    {errorMessage}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <FaUserTie className="text-blue-500" />
                {isArabic ? 'الليدز' : 'Leads'}
              </div>
              <div className="mt-4 text-3xl font-bold">{leadCount}</div>
              <div className={`mt-2 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {isArabic ? 'هذا العدد خاص بالليدز المسندة كسيلز فقط' : 'This count includes sales-owned leads only'}
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <FaUsers className="text-emerald-500" />
                {isArabic ? 'البروكرز' : 'Brokers'}
              </div>
              <div className="mt-4 text-3xl font-bold">{brokerCount}</div>
            </div>

            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="text-sm font-medium">{isArabic ? 'البروكرز المشتركون' : 'Shared Brokers'}</div>
              <div className="mt-4 text-3xl font-bold">{sharedBrokerCount}</div>
              <div className={`mt-3 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {isArabic ? 'سيتم إزالة المستخدم منها تلقائيًا' : 'The user will be removed from these assignments automatically'}
              </div>
            </div>
          </div>

          {(leadCount > 0 || brokerCount > 0) ? (
            <div className={`inline-flex rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
              {leadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('leads')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === 'leads'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white')
                  }`}
                >
                  {isArabic ? 'الليدز' : 'Leads'}
                </button>
              ) : null}
              {brokerCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('brokers')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === 'brokers'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white')
                  }`}
                >
                  {isArabic ? 'البروكرز' : 'Brokers'}
                </button>
              ) : null}
            </div>
          ) : null}

          {leadCount > 0 && activeTab === 'leads' ? (
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/20'}`}>
              <div className="mb-4 flex gap-2">
                <div className="w-1/3">
                  <label className={`mb-1 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isArabic ? 'تصفية حسب الدور' : 'Filter By Role'}
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
                    {isArabic ? 'تعيين إلى' : 'Assign To'}
                  </label>
                  <div className="relative">
                    <FaSearch className={`absolute top-1/2 -translate-y-1/2 text-xs text-gray-400 ${isArabic ? 'right-3' : 'left-3'}`} />
                    <input
                      type="text"
                      placeholder={isArabic ? 'بحث في أعضاء الفريق' : 'Search in team members'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'} ${isArabic ? 'pl-3 pr-9' : ''}`}
                    />
                  </div>
                </div>
              </div>

              <div className="custom-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
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
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                        ) : (
                          <FaUser className="text-xs text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{user.name}</p>
                        <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{translateRoleLabel(user.role || 'Team Member', isArabic)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-sm text-gray-500">
                    {isArabic ? 'لا يوجد أعضاء' : 'No members found'}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isArabic ? 'طريقة إعادة إسناد الليدز كسيلز' : 'Reassign sales-owned leads as'}
                </label>
                <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                  <button
                    onClick={() => setAssignMethod('fresh')}
                    className={`rounded-lg py-1.5 text-sm transition-all ${
                      assignMethod === 'fresh'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {isArabic ? 'كنيو ليد' : 'Fresh'}
                  </button>
                  <button
                    onClick={() => setAssignMethod('cold_call')}
                    className={`rounded-lg py-1.5 text-sm transition-all ${
                      assignMethod === 'cold_call'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {isArabic ? 'ككولد كول' : 'As cold call'}
                  </button>
                </div>
              </div>

              {selectedUser ? (
                <div className="mt-4">
                  <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isArabic ? 'نوع الإسناد' : 'Assignment Role'}
                  </label>
                  {isLeadershipRole(getUserRole(selectedUser)) ? (
                    <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                      <button
                        onClick={() => setAssignRole('sales')}
                        className={`rounded-lg py-1.5 text-sm transition-all ${
                          assignRole === 'sales'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {isArabic ? 'كسيلز' : 'As Sales Person'}
                      </button>
                      <button
                        onClick={() => setAssignRole('manager')}
                        className={`rounded-lg py-1.5 text-sm transition-all ${
                          assignRole === 'manager'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {isArabic ? 'كمدير' : 'As Manager'}
                      </button>
                    </div>
                  ) : (
                    <div className={`rounded-xl border px-3 py-2 text-sm ${isLight ? 'border-gray-200 bg-gray-50 text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-200'}`}>
                      {isArabic ? 'هذا المستخدم يمكن الإسناد له كسيلز فقط.' : 'This user can only receive the leads as a sales person.'}
                    </div>
                  )}
                </div>
              ) : null}

              <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${isLight ? 'border-gray-200 bg-gray-50 text-slate-700' : 'border-slate-700 bg-slate-800 text-slate-200'}`}>
                {isArabic
                  ? 'سيتم فقط التعامل هنا مع الليدز المسندة للمستخدم المحذوف كسيلز. يمكنك إعادة إسنادها للمستخدم الجديد كسيلز أو كمدير حسب نفس منطق شاشة التعيين.'
                  : 'Only leads assigned to the deleted user as sales owner are handled here. You can reassign them to the replacement user as sales or manager using the same assignment logic as lead management.'}
              </div>

              <div className="space-y-3 pt-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.duplicate}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setOptions((prev) => ({
                        ...prev,
                        duplicate: checked,
                        sameStage: checked ? false : prev.sameStage,
                      }))
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isArabic ? 'تكرار الليد وإسنادها كنيو ليد' : 'Duplicate and assign as fresh'}
                  </span>
                </label>

                <div className="flex items-center gap-6">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={options.sameStage}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setOptions((prev) => ({
                          ...prev,
                          sameStage: checked,
                          duplicate: checked ? false : prev.duplicate,
                        }))
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      {isArabic ? 'نفس المرحلة' : 'Same stage'}
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={options.clearHistory}
                      onChange={(e) => setOptions((prev) => ({ ...prev, clearHistory: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      {isArabic ? 'مسح الهيستوري' : 'Clear History'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {brokerCount > 0 && activeTab === 'brokers' ? (
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-800 bg-slate-950/20'}`}>
              <div className="mb-4">
                <h3 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {isArabic ? 'إعادة توزيع البروكرز' : 'Broker Reassignment'}
                </h3>
                <p className={`mt-1 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {soleBrokerCount > 0
                    ? (isArabic
                        ? `يوجد ${soleBrokerCount} بروكر مسند فقط لهذا المستخدم، لذلك يجب اختيار مستخدم بديل.`
                        : `${soleBrokerCount} broker(s) are assigned only to this user, so a replacement user is required.`)
                    : (isArabic
                        ? 'كل البروكرز هنا مشتركون مع مستخدمين آخرين، لذلك سيتم فقط إزالة هذا المستخدم من الإسناد.'
                        : 'All brokers are shared with other users, so this user will simply be removed from those assignments.')}
                </p>
              </div>

              {soleBrokerCount > 0 ? (
                <div>
                  <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isArabic ? 'المستخدم البديل للبروكرز المنفردة' : 'Replacement User for Sole Brokers'}
                  </label>
                  <SearchableSelect
                    options={brokerUserOptions}
                    value={brokerTargetUserId}
                    onChange={setBrokerTargetUserId}
                    placeholder={isArabic ? 'اختر مستخدمًا' : 'Select user'}
                    isRTL={isArabic}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={`flex items-center justify-end gap-3 border-t p-4 ${isLight ? 'border-gray-100 bg-gray-50' : 'border-slate-800 bg-slate-800/50'}`}>
          <button
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isLight
                ? 'border border-gray-200 bg-white text-slate-600 hover:bg-gray-200'
                : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmitLeadStep || (!needsBrokerStep && !canSubmitBrokerStep) || submitting}
            className={`rounded-lg px-6 py-2 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all ${
              (canSubmitLeadStep && (needsBrokerStep || canSubmitBrokerStep) && !submitting)
                ? 'bg-blue-600 text-white hover:scale-[1.02] hover:bg-blue-700'
                : 'cursor-not-allowed bg-gray-300 text-gray-500'
            }`}
          >
            {submitting
              ? (isArabic ? 'جارٍ التنفيذ...' : 'Processing...')
              : needsBrokerStep
                ? (isArabic ? 'التالي: البروكرز' : 'Next: Brokers')
                : (isArabic ? 'إعادة التوزيع ثم الحذف' : 'Reassign and Delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
