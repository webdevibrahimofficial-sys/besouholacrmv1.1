import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FaPhone, FaEnvelope, FaTrash, FaTrashRestore, FaUndo } from 'react-icons/fa'
import { Filter, ChevronDown, Search, Calendar } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { api } from '../utils/api'
import { canAccessCustomerRecycle, canForceDeleteCustomer } from '../services/customerPermissions'
import { useTheme } from '../shared/context/ThemeProvider'
import { useAppState } from '../shared/context/AppStateProvider'
import SearchableSelect from '../shared/components/SearchableSelect'
import { getSourceCanonicalName, getSourceDisplayName } from '../shared/utils/sourceDisplay'
import { useDynamicFields } from '../hooks/useDynamicFields'

const emptyFilters = {
  type: '',
  source: '',
  country: '',
  city: '',
  assignedSalesRep: [],
  createdBy: '',
  dateFrom: '',
  dateTo: '',
  datePeriod: '',
}

const CustomersRecycle = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { user } = useAppState()
  const isRTL = String(i18n.language || '').startsWith('ar')
  const { fields: dynamicFields } = useDynamicFields('customers')
  const canAccessRecycle = canAccessCustomerRecycle(user)
  const canForceDelete = canForceDeleteCustomer(user)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [usersList, setUsersList] = useState([])
  const [sourcesCatalog, setSourcesCatalog] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [lastPage, setLastPage] = useState(1)
  const [selectedItems, setSelectedItems] = useState([])
  const [successMessage, setSuccessMessage] = useState('')

  const showSuccess = (message) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 2500)
  }

  const load = async () => {
    if (!canAccessRecycle) return
    try {
      setLoading(true)
      const params = {
        q,
        per_page: itemsPerPage,
        page: currentPage,
      }
      if (filters.type) params.type = filters.type
      if (filters.source) params.source = filters.source
      if (filters.country) params.country = filters.country
      if (filters.city) params.city = filters.city
      if (filters.createdBy) params.created_by = filters.createdBy
      if (Array.isArray(filters.assignedSalesRep) && filters.assignedSalesRep.length > 0) {
        params.assigned_sales_rep = filters.assignedSalesRep[0]
      }
      if (filters.dateFrom) params.date_from = filters.dateFrom
      if (filters.dateTo) params.date_to = filters.dateTo

      const { data } = await api.get('/api/customers/recycle', { params })
      const mappedItems = (data?.data || []).map((item) => {
        const customFields = { ...(item.custom_fields || {}) }
        const relationValues = item.custom_field_values || []
        relationValues.forEach((value) => {
          const key = value?.field?.key
          if (key && customFields[key] == null) {
            customFields[key] = value.value
          }
        })
        return {
          ...item,
          customerCode: item.customer_code,
          companyName: item.company_name,
          taxNumber: item.tax_number,
          assignedSalesRep: item.assignee?.name || item.assigned_to,
          createdBy: item.created_by,
          createdAt: item.created_at,
          custom_fields: customFields,
        }
      })
      setItems(mappedItems)
      setTotal(data?.total || 0)
      setLastPage(data?.last_page || 1)
      setSelectedItems([])
    } catch (e) {
      if (e?.response?.status === 403) {
        navigate('/customers')
        return
      }
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canAccessRecycle) {
      navigate('/customers')
    }
  }, [canAccessRecycle, navigate])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/api/users', { params: { page: 1 } })
        const raw = res.data?.data || res.data || []
        setUsersList(Array.isArray(raw) ? raw : [])
      } catch {
        try {
          const res2 = await api.get('/api/users?all=1')
          const raw2 = res2.data?.data || res2.data || []
          setUsersList(Array.isArray(raw2) ? raw2 : [])
        } catch {
          setUsersList([])
        }
      }
    }
    fetchUsers()
  }, [])

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await api.get('/api/sources?active=1').catch(() => api.get('/api/sources'))
        const raw = res.data?.data || res.data || []
        setSourcesCatalog(Array.isArray(raw) ? raw : [])
      } catch {
        setSourcesCatalog([])
      }
    }
    fetchSources()
  }, [])

  useEffect(() => {
    load()
  }, [q, filters, currentPage, itemsPerPage, canAccessRecycle])

  const sourceLabelMap = useMemo(() => {
    const map = new Map()
    ;(sourcesCatalog || []).forEach((source) => {
      const key = getSourceCanonicalName(source)
      const label = getSourceDisplayName(source, isRTL)
      if (key && label) map.set(key, label)
    })
    return map
  }, [isRTL, sourcesCatalog])

  const localizeSourceLabel = (value) => {
    const key = String(value || '').trim()
    if (!key) return ''
    return sourceLabelMap.get(key) || key
  }

  const typeOptions = useMemo(() => [...new Set(items.map((i) => i.type).filter(Boolean))], [items])
  const sourceOptions = useMemo(() => Array.from(new Set([
    ...(sourcesCatalog || []).map((source) => getSourceCanonicalName(source)).filter(Boolean),
    ...items.map((item) => String(item?.source || '').trim()).filter(Boolean),
  ])), [items, sourcesCatalog])
  const countryOptions = useMemo(() => [...new Set(items.map((i) => i.country).filter(Boolean))], [items])
  const repOptions = useMemo(() => [...new Set(usersList.map((u) => u.name).filter(Boolean))], [usersList])
  const createdByOptions = useMemo(() => [...new Set(usersList.map((u) => u.name).filter(Boolean))], [usersList])

  const clearFilters = () => {
    setQ('')
    setFilters({ ...emptyFilters })
    setCurrentPage(1)
  }

  const handleDatePeriodChange = (period) => {
    const now = new Date()
    let from = ''
    let to = ''

    if (period === 'today') {
      from = now.toISOString().split('T')[0]
      to = now.toISOString().split('T')[0]
    } else if (period === 'week') {
      const first = new Date(now.setDate(now.getDate() - now.getDay()))
      const last = new Date(now.setDate(now.getDate() - now.getDay() + 6))
      from = first.toISOString().split('T')[0]
      to = last.toISOString().split('T')[0]
    } else if (period === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      from = first.toISOString().split('T')[0]
      to = last.toISOString().split('T')[0]
    }

    setCurrentPage(1)
    setFilters((prev) => ({
      ...prev,
      datePeriod: period,
      dateFrom: from,
      dateTo: to,
    }))
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(items.map((i) => i.id))
    } else {
      setSelectedItems([])
    }
  }

  const handleSelectRow = (id) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const restoreOne = async (id) => {
    if (!window.confirm(isRTL ? 'هل تريد استعادة هذا العميل؟' : 'Restore this customer?')) return
    try {
      await api.post(`/api/customers/recycle/${id}/restore`)
      showSuccess(isRTL ? 'تمت استعادة العميل' : 'Customer restored')
      load()
    } catch (e) {
      alert(e?.response?.data?.message || (isRTL ? 'فشل الاستعادة' : 'Restore failed'))
    }
  }

  const forceDeleteOne = async (id) => {
    if (!canForceDelete) return
    if (!window.confirm(isRTL ? 'حذف نهائي؟ لا يمكن التراجع عن هذا الإجراء.' : 'Permanently delete this customer? This cannot be undone.')) return
    try {
      await api.delete(`/api/customers/recycle/${id}`)
      showSuccess(isRTL ? 'تم الحذف النهائي' : 'Customer permanently deleted')
      load()
    } catch (e) {
      alert(e?.response?.data?.message || (isRTL ? 'فشل الحذف النهائي' : 'Permanent delete failed'))
    }
  }

  const bulkRestore = async () => {
    if (selectedItems.length === 0) return
    if (!window.confirm(isRTL ? `استعادة ${selectedItems.length} عميل؟` : `Restore ${selectedItems.length} customers?`)) return
    try {
      await api.post('/api/customers/bulk-restore', { ids: selectedItems })
      showSuccess(isRTL ? 'تمت الاستعادة' : 'Customers restored')
      load()
    } catch (e) {
      alert(e?.response?.data?.message || (isRTL ? 'فشل الاستعادة' : 'Restore failed'))
    }
  }

  const bulkForceDelete = async () => {
    if (!canForceDelete || selectedItems.length === 0) return
    if (!window.confirm(isRTL ? `حذف نهائي لـ ${selectedItems.length} عميل؟ لا يمكن التراجع.` : `Permanently delete ${selectedItems.length} customers? This cannot be undone.`)) return
    try {
      await api.post('/api/customers/bulk-force-delete', { ids: selectedItems })
      showSuccess(isRTL ? 'تم الحذف النهائي' : 'Customers permanently deleted')
      load()
    } catch (e) {
      alert(e?.response?.data?.message || (isRTL ? 'فشل الحذف النهائي' : 'Permanent delete failed'))
    }
  }

  const textClass = isLight ? 'text-black' : 'text-white'

  if (!canAccessRecycle) return null

  return (
    <div className="p-4 md:p-6 space-y-6">
      {successMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-green-600 text-white shadow-lg">
          {successMessage}
        </div>
      )}

      <div className="rounded-xl p-4 md:p-6 relative mb-6">
        <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className={`text-xl md:text-2xl font-bold ${textClass} flex items-center gap-2`}>
              {t('Customer Recycle')}
              <span className="text-sm font-normal text-[var(--muted-text)] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                {total}
              </span>
            </h1>
            <span aria-hidden="true" className="inline-block h-[2px] w-full rounded bg-gradient-to-r from-blue-500 to-purple-600" />
            <p className="text-sm text-[var(--muted-text)] mt-1">
              {isRTL ? 'العملاء المحذوفون يمكن استعادتهم من هنا' : 'Deleted customers can be restored from here'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="btn btn-sm bg-blue-600 hover:bg-blue-700 !text-white border-none"
          >
            {isRTL ? 'العودة للعملاء' : 'Back to Customers'}
          </button>
        </div>
      </div>

      <div className="glass-panel p-4 rounded-xl mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className={`text-sm font-semibold flex items-center gap-2 ${textClass}`}>
            <Filter className="text-blue-500" size={16} /> {isRTL ? 'تصفية' : 'Filter'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllFilters((prev) => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'عرض الكل' : 'Show All')}
              <ChevronDown size={14} className={`transform transition-transform ${showAllFilters ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className={`px-3 py-1.5 text-sm ${textClass} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isRTL ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Search className="text-blue-500" size={10} /> {isRTL ? 'بحث عام' : 'Search All Data'}
            </label>
            <input
              className="input w-full"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setCurrentPage(1)
              }}
              placeholder={isRTL ? 'بحث في كل البيانات...' : 'Search in all data...'}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'النوع' : 'Type'}
            </label>
            <SearchableSelect
              options={typeOptions.map((o) => ({ value: o, label: o }))}
              value={filters.type}
              onChange={(v) => {
                setCurrentPage(1)
                setFilters((prev) => ({ ...prev, type: v }))
              }}
              placeholder={isRTL ? 'اختر النوع' : 'Select Type'}
              className="w-full"
              isRTL={isRTL}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'مسؤول المبيعات' : 'Sales Persons'}
            </label>
            <SearchableSelect
              options={repOptions.map((o) => ({ value: o, label: o }))}
              value={filters.assignedSalesRep}
              onChange={(v) => {
                setCurrentPage(1)
                setFilters((prev) => ({ ...prev, assignedSalesRep: v }))
              }}
              placeholder={isRTL ? 'اختر المسؤولين' : 'Select Sales Person'}
              className="w-full"
              isRTL={isRTL}
              multiple={true}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'تم الإنشاء بواسطة' : 'Created By'}
            </label>
            <SearchableSelect
              options={createdByOptions.map((o) => ({ value: o, label: o }))}
              value={filters.createdBy}
              onChange={(v) => {
                setCurrentPage(1)
                setFilters((prev) => ({ ...prev, createdBy: v }))
              }}
              placeholder={isRTL ? 'منشئ السجل' : 'Record Creator'}
              className="w-full"
              isRTL={isRTL}
            />
          </div>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 transition-all duration-300 overflow-hidden ${showAllFilters ? 'max-h-[500px] opacity-100 pt-3' : 'max-h-0 opacity-0'}`}>
          <div className="col-span-1 md:col-span-2 space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)] flex items-center gap-1">
              <Calendar className="text-blue-500" size={10} /> {isRTL ? 'تاريخ الإنشاء' : 'Created Date'}
            </label>
            <div className="w-full">
              <DatePicker
                popperContainer={({ children }) => createPortal(children, document.body)}
                selectsRange={true}
                startDate={filters.dateFrom ? new Date(filters.dateFrom) : null}
                endDate={filters.dateTo ? new Date(filters.dateTo) : null}
                onChange={(update) => {
                  const [start, end] = update
                  const formatDate = (date) => {
                    if (!date) return ''
                    const offset = date.getTimezoneOffset()
                    const localDate = new Date(date.getTime() - (offset * 60 * 1000))
                    return localDate.toISOString().split('T')[0]
                  }
                  setCurrentPage(1)
                  setFilters((prev) => ({
                    ...prev,
                    dateFrom: formatDate(start),
                    dateTo: formatDate(end),
                    datePeriod: '',
                  }))
                }}
                isClearable={true}
                placeholderText={isRTL ? 'من - إلى' : 'From - To'}
                className="input w-full"
                wrapperClassName="w-full"
                dateFormat="yyyy-MM-dd"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleDatePeriodChange('today')}
                  className={`text-[10px] px-2 py-1 rounded-full transition-colors ${filters.datePeriod === 'today' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : `bg-theme-bg ${textClass} hover:bg-gray-700/50 dark:hover:bg-gray-700`}`}
                >
                  {isRTL ? 'اليوم' : 'Today'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDatePeriodChange('week')}
                  className={`text-[10px] px-2 py-1 rounded-full transition-colors ${filters.datePeriod === 'week' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : `bg-theme-bg ${textClass} hover:bg-gray-700/50 dark:hover:bg-gray-700`}`}
                >
                  {isRTL ? 'أسبوع' : 'Week'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDatePeriodChange('month')}
                  className={`text-[10px] px-2 py-1 rounded-full transition-colors ${filters.datePeriod === 'month' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : `bg-theme-bg ${textClass} hover:bg-gray-700/50 dark:hover:bg-gray-700`}`}
                >
                  {isRTL ? 'شهر' : 'Month'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'المصدر' : 'Source'}
            </label>
            <SearchableSelect
              options={sourceOptions.map((o) => ({ value: o, label: localizeSourceLabel(o) }))}
              value={filters.source}
              onChange={(v) => {
                setCurrentPage(1)
                setFilters((prev) => ({ ...prev, source: v }))
              }}
              placeholder={isRTL ? 'المصدر' : 'Source'}
              className="w-full"
              isRTL={isRTL}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">
              {isRTL ? 'الدولة' : 'Country'}
            </label>
            <SearchableSelect
              options={countryOptions.map((o) => ({ value: o, label: o }))}
              value={filters.country}
              onChange={(v) => {
                setCurrentPage(1)
                setFilters((prev) => ({ ...prev, country: v }))
              }}
              placeholder={isRTL ? 'الدولة' : 'Country'}
              className="w-full"
              isRTL={isRTL}
            />
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-visible relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 z-10 flex items-center justify-center">
            <div className="loading loading-spinner loading-lg text-blue-600"></div>
          </div>
        )}

        <div className="relative z-[20] flex md:flex-row justify-between items-center p-4 gap-4 border-b border-theme-border dark:border-gray-700 bg-transparent backdrop-blur-md">
          {selectedItems.length > 0 ? (
            <div className="flex items-center gap-3 flex-wrap w-full">
              <div className={`flex items-center px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 text-sm font-semibold ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
                {isRTL ? `المحدد: ${selectedItems.length}` : `Selected: ${selectedItems.length}`}
              </div>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-1 hidden md:block"></div>
              <button
                type="button"
                onClick={bulkRestore}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium shadow-lg shadow-green-500/20 transition-all duration-200 active:scale-95"
              >
                <FaTrashRestore className="text-xs" />
                {isRTL ? 'استعادة' : 'Restore'}
              </button>
              {canForceDelete && (
                <button
                  type="button"
                  onClick={bulkForceDelete}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium shadow-lg shadow-red-500/20 transition-all duration-200 active:scale-95"
                >
                  <FaTrash className="text-xs" />
                  {isRTL ? 'حذف نهائي' : 'Delete forever'}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <span className="text-sm font-medium">
                {isRTL ? 'لم يتم تحديد عملاء لإجراءات جماعية' : 'No customers selected for bulk actions'}
              </span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className={`text-xs uppercase ${textClass} font-semibold`}>
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={items.length > 0 && selectedItems.length === items.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'كود العميل' : 'Customer Code'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'اسم العميل' : 'Customer Name'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'جهة الاتصال' : 'Contact Info'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'النوع' : 'Type'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'المصدر' : 'Source'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'اسم الشركة' : 'Company Name'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'الرقم الضريبي' : 'Tax Number'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'الدولة' : 'Country'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'المدينة' : 'City'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'مسؤول المبيعات' : 'Sales Rep'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'تم الإنشاء بواسطة' : 'Created By'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'تاريخ الإنشاء' : 'Creation Date'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'الملاحظات' : 'Notes'}</th>
                {dynamicFields.map((field) => (
                  <th key={field.key} className={`p-4 whitespace-nowrap ${textClass}`} style={{ minWidth: '150px' }}>
                    {i18n.language === 'ar' ? field.label_ar : field.label_en}
                  </th>
                ))}
                <th className="p-4 whitespace-nowrap">{isRTL ? 'حُذف بواسطة' : 'Deleted by'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'تاريخ الحذف' : 'Deleted at'}</th>
                <th className="p-4 whitespace-nowrap">{isRTL ? 'خيارات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={17 + dynamicFields.length} className={`p-8 text-center ${textClass}`}>
                    {isRTL ? 'سلة المهملات فارغة' : 'Recycle bin is empty'}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-theme-border dark:border-gray-700 hover:bg-blue-900/10">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectRow(item.id)}
                      />
                    </td>
                    <td className="p-4 font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {item.customerCode || item.id}
                    </td>
                    <td className={`p-4 font-semibold ${textClass} whitespace-nowrap`}>
                      {item.name}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        {item.phone && (
                          <div className={`flex items-center gap-2 text-xs ${textClass}`}>
                            <div className="w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                              <FaPhone size={10} />
                            </div>
                            <span dir="ltr" className="font-mono">{item.phone}</span>
                          </div>
                        )}
                        {item.email && (
                          <div className={`flex items-center gap-2 text-xs ${textClass}`}>
                            <div className="w-5 h-5 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                              <FaEnvelope size={10} />
                            </div>
                            <span>{item.email}</span>
                          </div>
                        )}
                        {!item.phone && !item.email && <span className={textClass}>—</span>}
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {item.type ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          {item.type}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {item.source ? (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          String(item.source || '').trim() === 'Lead'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                          {localizeSourceLabel(item.source)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>{item.companyName || '—'}</td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>{item.taxNumber || '—'}</td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>{item.country || '—'}</td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>{item.city || '—'}</td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>
                      {item.assignedSalesRep ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 flex items-center justify-center text-xs font-bold">
                            {String(item.assignedSalesRep).charAt(0)}
                          </div>
                          {item.assignedSalesRep}
                        </div>
                      ) : '—'}
                    </td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>{item.createdBy || '—'}</td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`} dir="ltr">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className={`p-4 whitespace-nowrap max-w-[200px] truncate ${textClass}`} title={item.notes}>
                      {item.notes || '—'}
                    </td>
                    {dynamicFields.map((field) => (
                      <td key={field.key} className={`p-4 whitespace-nowrap text-sm ${textClass}`}>
                        {item.custom_fields?.[field.key] ? String(item.custom_fields[field.key]) : '-'}
                      </td>
                    ))}
                    <td className={`p-4 whitespace-nowrap ${textClass}`}>{item.deleted_by_user?.name || '—'}</td>
                    <td className={`p-4 whitespace-nowrap ${textClass}`} dir="ltr">
                      {item.deleted_at ? new Date(item.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td className="p-4 whitespace-nowrap sticky ltr:right-0 rtl:left-0 bg-theme-bg">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"
                          onClick={() => restoreOne(item.id)}
                        >
                          <FaUndo size={12} />
                          {isRTL ? 'استعادة' : 'Restore'}
                        </button>
                        {canForceDelete && (
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                            onClick={() => forceDeleteOne(item.id)}
                          >
                            <FaTrash size={12} />
                            {isRTL ? 'حذف نهائي' : 'Delete forever'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <nav className="flex justify-between items-center gap-3 p-3 lg:p-4 border-t border-theme-border dark:border-gray-700">
          <div className={`flex items-center gap-2 text-sm ${textClass}`}>
            <span>{t('Show')}</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className={`px-2 py-1 border border-theme-border dark:border-gray-600 rounded-md dark:bg-transparent ${textClass} text-xs`}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className={`text-sm ${textClass}`}>
            {isRTL ? `صفحة ${currentPage} من ${lastPage}` : `Page ${currentPage} of ${lastPage}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="btn btn-sm"
            >
              {isRTL ? 'السابق' : 'Prev'}
            </button>
            <button
              type="button"
              disabled={currentPage >= lastPage}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="btn btn-sm"
            >
              {isRTL ? 'التالي' : 'Next'}
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}

export default CustomersRecycle
