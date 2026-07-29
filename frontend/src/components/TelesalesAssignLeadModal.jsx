import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaSearch, FaTimes, FaUser, FaUserTie } from 'react-icons/fa'
import { useTheme } from '@shared/context/ThemeProvider'

export default function TelesalesAssignLeadModal({
  isOpen,
  onClose,
  onAssign,
  isArabic = false,
  assignees = [],
  selectedCount = 0,
  errorMessage = '',
  submitting = false,
  onClearError,
}) {
  const { resolvedTheme, theme } = useTheme()
  const isLight = (resolvedTheme || theme) === 'light'
  const [filterRole, setFilterRole] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setFilterRole('All')
    setSearchQuery('')
    setSelectedUser(null)
    onClearError?.()
  }, [isOpen, onClearError])

  const roles = useMemo(() => ['All', ...Array.from(new Set(
    assignees.map((user) => String(user?.role || user?.job_title || '').trim()).filter(Boolean)
  ))], [assignees])

  const filteredUsers = useMemo(() => {
    return assignees.filter((user) => {
      const role = String(user?.role || user?.job_title || '').trim()
      const matchesRole = filterRole === 'All' || role.toLowerCase() === filterRole.toLowerCase()
      const matchesSearch =
        String(user?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(user?.email || '').toLowerCase().includes(searchQuery.toLowerCase())

      return matchesRole && matchesSearch
    })
  }, [assignees, filterRole, searchQuery])

  const handleAssign = async () => {
    if (!selectedUser) return
    const result = await onAssign?.({
      userId: selectedUser.id,
      userName: selectedUser.name,
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
              <h2 className="text-lg font-semibold">{isArabic ? 'تعيين ليدز التيليسيلز' : 'Assign Telesales Leads'}</h2>
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
                  placeholder={isArabic ? 'ابحث في أعضاء فريق التيليسيلز' : 'Search telesales team members'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full rounded-lg border py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'} ${isArabic ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                />
              </div>
            </div>
          </div>

          <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredUsers.length > 0 ? filteredUsers.map((user) => (
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
                  <FaUser className="text-xs text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{user.name}</p>
                  <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{user.role || user.job_title || 'Team Member'}</p>
                </div>
              </div>
            )) : (
              <div className="py-4 text-center text-sm text-gray-500">{isArabic ? 'لا يوجد أعضاء' : 'No members found'}</div>
            )}
          </div>
        </div>

        <div className={`flex items-center justify-end gap-3 border-t p-4 ${isLight ? 'border-gray-100 bg-gray-50' : 'border-slate-800 bg-slate-800/50'}`}>
          <button
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isLight ? 'border border-gray-200 bg-white text-slate-600 hover:bg-gray-200' : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedUser || submitting}
            className={`rounded-lg px-6 py-2 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all ${selectedUser && !submitting ? 'bg-blue-600 text-white hover:scale-[1.02] hover:bg-blue-700' : 'cursor-not-allowed bg-gray-300 text-gray-500'}`}
          >
            {submitting ? (isArabic ? 'جارٍ الإسناد...' : 'Assigning...') : (isArabic ? 'تعيين' : 'Assign')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
