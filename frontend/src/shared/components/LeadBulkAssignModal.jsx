import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../context/ThemeProvider'
import { api } from '../../utils/api'
import { FaSearch, FaTimes, FaUser, FaUserTie } from 'react-icons/fa'

const getUserRole = (user) => {
  if (!user) return ''
  if (user.role) return user.role
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles[0].name
  return ''
}

export default function LeadBulkAssignModal({
  isOpen,
  onClose,
  onAssign,
  isArabic = false,
  currentUser,
  selectedCount = 0,
  errorMessage = '',
  submitting = false,
  onClearError,
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
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

  const isSalesRole = (role) => {
    if (!role) return false
    const lower = String(role).toLowerCase()
    return (
      lower.includes('sales person') ||
      lower.includes('salesperson') ||
      lower.includes('sales agent') ||
      lower.includes('agent') ||
      lower.includes('broker')
    )
  }

  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const [rolesRes, usersRes] = await Promise.all([
          api.get('/api/roles').catch(() => null),
          api.get('/api/users').catch(() => null),
        ])

        const roleList = Array.isArray(rolesRes?.data)
          ? rolesRes.data
          : (Array.isArray(rolesRes?.data?.data) ? rolesRes.data.data : Object.values(rolesRes?.data || {}))

        const userList = Array.isArray(usersRes?.data)
          ? usersRes.data
          : (Array.isArray(usersRes?.data?.data) ? usersRes.data.data : [])

        setRoles(['All', ...roleList.filter(Boolean)])
        setUsers(userList.map((user) => ({ ...user, role: getUserRole(user) })))
      } catch (error) {
        console.error('Failed to load assignment modal data:', error)
      } finally {
        setLoading(false)
      }
    }

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
    onClearError?.()
    fetchData()
  }, [isOpen, currentUser, onClearError])

  useEffect(() => {
    if (!selectedUser) return
    const role = getUserRole(selectedUser)
    setAssignRole(isLeadershipRole(role) ? 'manager' : 'sales')
  }, [selectedUser])

  useEffect(() => {
    if (!selectedUser) return
    const role = getUserRole(selectedUser)
    if (isSalesRole(role) && assignRole === 'manager') {
      setAssignRole('sales')
    }
  }, [selectedUser, assignRole])

  const filteredUsers = users.filter((user) => {
    const matchesRole = filterRole === 'All' || (user.role && user.role.toLowerCase() === filterRole.toLowerCase())
    const matchesSearch =
      (user.name && user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesRole && matchesSearch
  })

  const assignMethodButtonClass = (method) => {
    const active = assignMethod === method

    if (active) {
      return isLight
        ? 'bg-white text-slate-900 shadow-sm border border-blue-200'
        : 'bg-slate-700 text-white shadow-sm border border-blue-500/60'
    }

    return isLight
      ? 'text-gray-500 hover:text-gray-700 border border-transparent'
      : 'text-slate-400 hover:text-slate-200 border border-transparent'
  }

  const renderAssignMethodOption = (method, label) => {
    const active = assignMethod === method

    return (
      <button
        onClick={() => {
          setAssignMethod(method)
          setOptions((prev) => ({
            ...prev,
            duplicate: false,
            sameStage: false,
          }))
        }}
        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm transition-all ${assignMethodButtonClass(method)}`}
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
          ✓
        </span>
      </button>
    )
  }

  const restorePrimaryAssignMethodIfNeeded = (nextDuplicate, nextSameStage) => {
    if (!nextDuplicate && !nextSameStage && !assignMethod) {
      setAssignMethod('fresh')
    }
  }

  const handleAssign = async () => {
    if (!selectedUser) return

    const normalizedMethod = options.sameStage || options.duplicate ? 'fresh' : assignMethod

    const result = await onAssign?.({
      userId: selectedUser.id,
      userName: selectedUser.name,
      assignRole,
      method: normalizedMethod,
      options,
    })

    if (result !== false) onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`${isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-white'} flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-2xl`}>
        <div className={`flex items-center justify-between border-b p-4 ${isLight ? 'border-gray-100' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <div className={`rounded-lg p-2 ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/30 text-blue-400'}`}>
              <FaUserTie />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{isArabic ? 'تعيين العميل' : 'Assign Lead'}</h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {selectedCount} {isArabic ? 'محدد' : 'Selected'}
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
                    {isArabic ? 'تعذر إسناد الليد للمستخدم المختار' : 'Unable to assign this lead to the selected user'}
                  </p>
                  <p className={`mt-1 text-sm leading-6 ${isLight ? 'text-red-700' : 'text-red-100/90'}`}>{errorMessage}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <div className="w-1/3">
              <label className={`mb-1 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{isArabic ? 'تصفية حسب الدور' : 'Filter By Role'}</label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className={`w-full rounded-lg border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'}`}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <div className="w-2/3">
              <label className={`mb-1 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{isArabic ? 'تعيين إلى' : 'Assign To'}</label>
              <div className="relative">
                <FaSearch className={`absolute top-1/2 -translate-y-1/2 text-xs text-gray-400 ${isArabic ? 'right-3' : 'left-3'}`} />
                <input
                  type="text"
                  placeholder={isArabic ? 'بحث في أعضاء الفريق' : 'Search in team members'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full rounded-lg border py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'} ${isArabic ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                />
              </div>
            </div>
          </div>

          <div className="custom-scrollbar max-h-48 space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-4 text-center text-sm text-gray-500">{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</div>
            ) : filteredUsers.length > 0 ? filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => {
                  onClearError?.()
                  setSelectedUser(user)
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-all ${selectedUser?.id === user.id
                  ? (isLight ? 'border-blue-500 bg-blue-50' : 'border-blue-500 bg-blue-900/20')
                  : (isLight ? 'border-transparent hover:bg-gray-50' : 'border-transparent hover:bg-slate-800')}`}
              >
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${selectedUser?.id === user.id ? 'border-blue-500' : 'border-gray-300'}`}>
                  {selectedUser?.id === user.id && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                </div>
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                  {user.avatar ? <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" /> : <FaUser className="text-xs text-gray-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{user.name}</p>
                  <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{user.role || 'Team Member'}</p>
                </div>
              </div>
            )) : (
              <div className="py-4 text-center text-sm text-gray-500">{isArabic ? 'لا يوجد أعضاء' : 'No members found'}</div>
            )}
          </div>

          <div>
            <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{isArabic ? 'طريقة التعيين' : 'Assign With'}</label>
            <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
              {renderAssignMethodOption('fresh', isArabic ? 'جديد' : 'New')}
              {renderAssignMethodOption('cold_call', isArabic ? 'عميل محتمل' : 'As cold call')}
            </div>
          </div>

          {selectedUser && (
            <div>
              <label className={`mb-2 block text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{isArabic ? 'الدور في التعيين' : 'Assignment Role'}</label>
              {(() => {
                const role = getUserRole(selectedUser)
                const canAssignAsManager = isLeadershipRole(role) && !isSalesRole(role)

                if (!canAssignAsManager) {
                  return (
                    <div className={`grid grid-cols-1 rounded-xl border p-1 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
                      <button onClick={() => setAssignRole('sales')} className="rounded-lg bg-white py-1.5 text-sm text-slate-900 shadow-sm">
                        {isArabic ? 'كمسؤول مبيعات' : 'As Sales Person'}
                      </button>
                    </div>
                  )
                }

                return (
                  <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
                    <button
                      onClick={() => setAssignRole('sales')}
                      className={`rounded-lg py-1.5 text-sm transition-all ${assignRole === 'sales' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {isArabic ? 'كمسؤول مبيعات' : 'As Sales Person'}
                    </button>
                    <button
                      onClick={() => setAssignRole('manager')}
                      className={`rounded-lg py-1.5 text-sm transition-all ${assignRole === 'manager' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {isArabic ? 'كمدير' : 'As Manager'}
                    </button>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options.duplicate}
                onChange={(e) => {
                  const checked = e.target.checked
                  const nextOptions = {
                    ...options,
                    duplicate: checked,
                    sameStage: checked ? false : options.sameStage,
                  }
                  setOptions((prev) => ({
                    ...prev,
                    duplicate: checked,
                    sameStage: checked ? false : prev.sameStage,
                  }))
                  if (checked) {
                    setAssignMethod(null)
                  } else {
                    restorePrimaryAssignMethodIfNeeded(nextOptions.duplicate, nextOptions.sameStage)
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{isArabic ? 'نسخ وتعيين كجديد' : 'Duplicate and assign as new'}</span>
            </label>

            <div className="flex items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.sameStage}
                onChange={(e) => {
                  const checked = e.target.checked
                  const nextOptions = {
                    ...options,
                    sameStage: checked,
                    duplicate: checked ? false : options.duplicate,
                  }
                  setOptions((prev) => ({
                    ...prev,
                    sameStage: checked,
                    duplicate: checked ? false : prev.duplicate,
                  }))
                  if (checked) {
                    setAssignMethod(null)
                  } else {
                    restorePrimaryAssignMethodIfNeeded(nextOptions.duplicate, nextOptions.sameStage)
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
                <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{isArabic ? 'نفس المرحلة' : 'Same stage'}</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.clearHistory}
                  onChange={(e) => setOptions((prev) => ({ ...prev, clearHistory: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{isArabic ? 'مسح السجل' : 'Clear History'}</span>
              </label>
            </div>
          </div>
        </div>

        <div className={`flex items-center justify-end gap-3 border-t p-4 ${isLight ? 'bg-gray-50 border-gray-100' : 'bg-slate-800/50 border-slate-800'}`}>
          <button
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isLight ? 'bg-white text-slate-600 border border-gray-200 hover:bg-gray-200' : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'}`}
          >
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedUser || submitting}
            className={`rounded-lg px-6 py-2 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all ${selectedUser && !submitting ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02]' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            {submitting ? (isArabic ? 'جارٍ الإسناد...' : 'Assigning...') : (isArabic ? 'تعيين' : 'Assign')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
