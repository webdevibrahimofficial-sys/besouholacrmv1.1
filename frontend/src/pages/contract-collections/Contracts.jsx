import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '@utils/api'
import SearchableSelect from '@components/SearchableSelect'
import { ChevronDown, ChevronUp, Eye, Filter, Paperclip, Printer, Search, Trash2, Upload, X } from 'lucide-react'
import { FaChevronLeft, FaChevronRight, FaFileImport } from 'react-icons/fa'
import CcContractsImportModal from '@components/CcContractsImportModal'
import DateRangePicker from '../../shared/components/DateRangePicker'

const safeStr = (v) => (v === null || v === undefined ? '' : String(v))

const formatCustomerId = (id) => {
  const n = Number(id)
  if (!Number.isFinite(n)) return safeStr(id)
  return `C-${String(n).padStart(4, '0')}`
}

const formatMoney = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function ModalShell({ open, title, onClose, children, widthClass = 'max-w-4xl', textColorClass = '', closeTitle = 'Close' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[20000]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="absolute inset-0" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`card w-full ${widthClass} bg-[var(--content-bg)] rounded-2xl shadow-2xl border border-[var(--panel-border)] overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--panel-border)]">
            <div className="min-w-0">
              <div className={`text-base font-semibold truncate ${textColorClass}`}>{title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              aria-label="Close"
              title={closeTitle}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 max-h-[80vh] overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function ContractCollectionsContracts() {
  const { i18n } = useTranslation()
  const { company } = useAppState()
  const { isLight } = useTheme()

  const isArabic = i18n.language === 'ar'
  const isRTL = i18n.dir(i18n.language || 'en') === 'rtl'
  const companyTypeLower = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyTypeLower.includes('real')

  const title = useMemo(() => (isArabic ? 'العقود' : 'Contracts'), [isArabic])
  const textColorClass = isLight ? 'text-black' : 'text-white'
  const mutedTextClass = textColorClass

  const [q, setQ] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [projectId, setProjectId] = useState('')
  const [salesOwnerId, setSalesOwnerId] = useState('')
  const [status, setStatus] = useState('')
  const [contractDateFrom, setContractDateFrom] = useState('')
  const [contractDateTo, setContractDateTo] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)

  const [projects, setProjects] = useState([])
  const [salesOwners, setSalesOwners] = useState([])
  const [customersOptions, setCustomersOptions] = useState([])
  const [contractNumberOptions, setContractNumberOptions] = useState([])
  const [unitCodeOptions, setUnitCodeOptions] = useState([])
  const [filtersLookupLoading, setFiltersLookupLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [perPage, setPerPage] = useState(25)
  const [importOpen, setImportOpen] = useState(false)

  const statusOptions = useMemo(
    () => [
      { value: '', label: isArabic ? 'الكل' : 'All' },
      { value: 'active', label: isArabic ? 'نشط' : 'Active' },
      { value: 'cancelled', label: isArabic ? 'ملغي' : 'Cancelled' },
    ],
    [isArabic]
  )

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)
  const [attachments, setAttachments] = useState([])

  const loadLookups = useCallback(async () => {
    try {
      const usersReq = api.get('/api/users?all=1').catch(() => api.get('/api/users'))
      const [projRes, usersRes] = await Promise.all([api.get('/api/projects?all=1'), usersReq])
      const proj = Array.isArray(projRes?.data?.data) ? projRes.data.data : (Array.isArray(projRes?.data) ? projRes.data : [])
      const users = Array.isArray(usersRes?.data?.data) ? usersRes.data.data : (Array.isArray(usersRes?.data) ? usersRes.data : [])
      setProjects(
        (Array.isArray(proj) ? proj : [])
          .map((p) => ({ value: String(p.id), label: String(p.name || p.title || `#${p.id}`) }))
          .filter((x) => x.value && x.label)
      )
      setSalesOwners(
        (Array.isArray(users) ? users : [])
          .map((u) => ({ value: String(u.id), label: String(u.name || u.email || `#${u.id}`) }))
          .filter((x) => x.value && x.label)
      )
    } catch {
      setProjects([])
      setSalesOwners([])
    }
  }, [])

  const loadFiltersLookups = useCallback(async () => {
    if (filtersLookupLoading) return
    setFiltersLookupLoading(true)
    try {
      const [contractsRes, customersRes] = await Promise.all([
        api.get('/api/cc/contracts?page=1&per_page=500'),
        api.get('/api/cc/customers?page=1&per_page=500'),
      ])

      const contractsData = contractsRes?.data || {}
      const contracts = Array.isArray(contractsData?.data) ? contractsData.data : []

      const contractNumbers = Array.from(
        new Set(
          contracts
            .map((c) => String(c?.contract_number || '').trim())
            .filter(Boolean)
        )
      )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map((x) => ({ value: x, label: x }))

      const unitCodes = Array.from(
        new Set(
          contracts
            .map((c) => String(c?.property?.unit_code || '').trim())
            .filter(Boolean)
        )
      )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map((x) => ({ value: x, label: x }))

      const customersData = customersRes?.data || {}
      const customers = Array.isArray(customersData?.data) ? customersData.data : []

      const customerOpts = (Array.isArray(customers) ? customers : [])
        .map((c) => {
          const id = c?.id
          const name = safeStr(c?.name || '')
          if (!id) return null
          return { value: String(id), label: `${formatCustomerId(id)} • ${name || safeStr(id)}` }
        })
        .filter(Boolean)

      setContractNumberOptions(contractNumbers)
      setUnitCodeOptions(unitCodes)
      setCustomersOptions(customerOpts)
    } catch {
      setContractNumberOptions([])
      setUnitCodeOptions([])
      setCustomersOptions([])
    } finally {
      setFiltersLookupLoading(false)
    }
  }, [filtersLookupLoading])

  const load = useCallback(
    async (page = 1, perPageOverride) => {
      setLoading(true)
      try {
        const pageSize = Number(perPageOverride || perPage || 25) || 25
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('per_page', String(pageSize))
        if (q.trim()) params.set('q', q.trim())
        if (contractNumber.trim()) params.set('contract_number', contractNumber.trim())
        if (customerId) params.set('customer_id', String(customerId))
        if (unitCode.trim()) params.set('unit_code', unitCode.trim())
        if (projectId) params.set('project_id', String(projectId))
        if (salesOwnerId) params.set('sales_owner_id', String(salesOwnerId))
        if (status) params.set('status', String(status))
        if (contractDateFrom) params.set('contract_date_from', String(contractDateFrom))
        if (contractDateTo) params.set('contract_date_to', String(contractDateTo))

        const res = await api.get(`/api/cc/contracts?${params.toString()}`)
        const data = res?.data || {}
        const serverPerPage = Number(data?.per_page || pageSize) || pageSize
        if (serverPerPage !== pageSize) setPerPage(serverPerPage)
        setItems(Array.isArray(data.data) ? data.data : [])
        setPageMeta({
          current_page: Number(data.current_page || 1),
          last_page: Number(data.last_page || 1),
          total: Number(data.total || 0),
        })
      } catch {
        setItems([])
        setPageMeta({ current_page: 1, last_page: 1, total: 0 })
      } finally {
        setLoading(false)
      }
    },
    [q, contractNumber, customerId, unitCode, projectId, salesOwnerId, status, contractDateFrom, contractDateTo, perPage]
  )

  useEffect(() => {
    if (!isRealEstate) return
    loadLookups()
    load(1)
  }, [isRealEstate, loadLookups, load])

  useEffect(() => {
    if (!isRealEstate) return
    if (!showAllFilters) return
    loadFiltersLookups()
  }, [isRealEstate, showAllFilters, loadFiltersLookups])

  useEffect(() => {
    const t = setTimeout(() => load(1), 350)
    return () => clearTimeout(t)
  }, [q, contractNumber, customerId, unitCode, projectId, salesOwnerId, status, contractDateFrom, contractDateTo, load])

  const resetFilters = () => {
    setQ('')
    setContractNumber('')
    setCustomerId('')
    setUnitCode('')
    setProjectId('')
    setSalesOwnerId('')
    setStatus('')
    setContractDateFrom('')
    setContractDateTo('')
  }

  const parseId = (v) => {
    const raw = String(v ?? '').trim()
    if (!raw) return null
    const cleaned = raw.replace(/[^\d]/g, '')
    const n = Number(cleaned || raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const parseNumber = (v) => {
    const raw = String(v ?? '').replace(/,/g, '').trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  const handleImport = async (rows) => {
    const list = Array.isArray(rows) ? rows : []
    let added = 0
    let failed = 0
    const errors = []

    for (const row of list) {
      const rowNo = row?.__rowNumber ?? ''
      const customer_id = parseId(row?.customer_id)
      const property_id = parseId(row?.property_id)
      if (!customer_id || !property_id) {
        failed += 1
        errors.push(isArabic ? `صف ${rowNo}: كود العميل وكود العقار مطلوبين` : `Row ${rowNo}: Customer ID and Property ID are required`)
        continue
      }

      const payload = {
        customer_id,
        property_id,
        contract_number: String(row?.contract_number ?? '').trim() || undefined,
        contract_date: String(row?.contract_date ?? '').trim() || undefined,
        first_due_date: String(row?.first_due_date ?? '').trim() || undefined,
        total_price: parseNumber(row?.total_price),
      }

      try {
        await api.post('/api/cc/contracts', payload)
        added += 1
      } catch (e) {
        failed += 1
        const msg =
          e?.response?.data?.message ||
          (typeof e?.message === 'string' ? e.message : '') ||
          (isArabic ? 'فشل الاستيراد' : 'Import failed')
        errors.push(isArabic ? `صف ${rowNo}: ${msg}` : `Row ${rowNo}: ${msg}`)
      }
    }

    await load(1)
    return { added, failed, errors }
  }

  const openPreview = async (row) => {
    if (!row?.id) return
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewData(null)
    setAttachments([])
    setAttachmentsLoading(false)
    try {
      const res = await api.get(`/api/cc/contracts/${encodeURIComponent(row.id)}`)
      setPreviewData(res?.data || null)

      setAttachmentsLoading(true)
      try {
        const attRes = await api.get(`/api/cc/contracts/${encodeURIComponent(row.id)}/attachments`)
        setAttachments(Array.isArray(attRes?.data?.data) ? attRes.data.data : [])
      } catch {
        setAttachments([])
      } finally {
        setAttachmentsLoading(false)
      }
    } catch {
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const openContractPrint = async (contractId) => {
    if (!contractId) return
    const rtl = isRTL ? '1' : '0'
    try {
      const res = await api.get(`/api/cc/contracts/${encodeURIComponent(contractId)}/print?autoprint=1&rtl=${rtl}`, {
        responseType: 'blob',
        headers: { Accept: 'text/html' },
      })
      const blobUrl = URL.createObjectURL(res.data)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
    }
  }

  const uploadAttachments = async (contractId, files) => {
    if (!contractId) return
    const list = Array.from(files || [])
    if (list.length === 0) return

    setAttachmentsUploading(true)
    try {
      const fd = new FormData()
      list.forEach((f) => fd.append('files[]', f))
      await api.post(`/api/cc/contracts/${encodeURIComponent(contractId)}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const attRes = await api.get(`/api/cc/contracts/${encodeURIComponent(contractId)}/attachments`)
      setAttachments(Array.isArray(attRes?.data?.data) ? attRes.data.data : [])
    } catch {
    } finally {
      setAttachmentsUploading(false)
    }
  }

  const deleteAttachment = async (contractId, attachmentId) => {
    if (!contractId || !attachmentId) return
    const ok = window.confirm(isArabic ? 'حذف المرفق؟' : 'Delete attachment?')
    if (!ok) return
    try {
      await api.delete(`/api/cc/contracts/${encodeURIComponent(contractId)}/attachments/${encodeURIComponent(attachmentId)}`)
      setAttachments((prev) => prev.filter((x) => x.id !== attachmentId))
    } catch {
    }
  }

  if (!isRealEstate) {
    return (
      <div className="p-6">
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold">{isArabic ? 'غير متاح' : 'Not available'}</h2>
      
        </div>
      </div>
    )
  }

  return (
    <div className={`p-6 space-y-4 ${textColorClass}`}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="btn btn-sm bg-blue-600 hover:bg-blue-700 !text-white border-none flex items-center gap-2"
        >
          <FaFileImport />
          {isArabic ? 'استيراد' : 'Import'}
        </button>
      </div>

      {/* Filters (before list) */}
      <div className="glass-panel p-4 rounded-xl">
        <div className="flex justify-between items-center mb-3">
          <h2 className={`text-sm font-semibold flex items-center gap-2 ${textColorClass}`}>
            <Filter className="text-blue-500" size={16} /> {isArabic ? 'تصفية' : 'Filter'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllFilters(!showAllFilters)}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>{isArabic ? 'عرض الكل' : 'Show All'}</span>
              {showAllFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className={`px-3 py-1.5 text-sm ${textColorClass} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
            >
              {isArabic ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className={`text-xs font-medium ${mutedTextClass} flex items-center gap-1`}>
              <Search className="text-blue-500" size={12} /> {isArabic ? 'بحث' : 'Search'}
            </label>
            <div className="relative">
              <Search className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-gray-400`} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={isArabic ? 'بحث رقم العقد / العميل / Unit Code' : 'Search by contract # / customer / unit code'}
                className={`input w-full bg-[var(--content-bg)] ${isRTL ? 'pr-10' : 'pl-10'}`}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-2' : 'right-2'} p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5`}
                  title={isArabic ? 'مسح' : 'Clear'}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'المشروع' : 'Project'}</label>
            <SearchableSelect
              options={projects}
              value={projectId}
              onChange={(v) => setProjectId(v)}
              placeholder={isArabic ? 'اختر المشروع' : 'Select Project'}
              className="w-full"
              isRTL={isRTL}
              multiple={false}
            />
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'مندوب المبيعات' : 'Sales Person'}</label>
            <SearchableSelect
              options={salesOwners}
              value={salesOwnerId}
              onChange={(v) => setSalesOwnerId(v)}
              placeholder={isArabic ? 'اختر الموظف' : 'Select User'}
              className="w-full"
              isRTL={isRTL}
              multiple={false}
            />
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'الحالة' : 'Status'}</label>
            <SearchableSelect
              options={statusOptions}
              value={status}
              onChange={(v) => setStatus(v)}
              placeholder={isArabic ? 'الكل' : 'All'}
              className="w-full"
              isRTL={isRTL}
              multiple={false}
            />
          </div>
        </div>

        {showAllFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'رقم العقد' : 'Contract No.'}</label>
              <SearchableSelect
                options={contractNumberOptions}
                value={contractNumber}
                onChange={(v) => setContractNumber(String(v || ''))}
                placeholder={filtersLookupLoading ? (isArabic ? 'جاري التحميل...' : 'Loading...') : (isArabic ? 'اختر رقم العقد' : 'Select Contract No.')}
                className="w-full"
                isRTL={isRTL}
                multiple={false}
              />
            </div>

            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'العميل' : 'Customer'}</label>
              <SearchableSelect
                options={customersOptions}
                value={customerId}
                onChange={(v) => setCustomerId(String(v || ''))}
                placeholder={filtersLookupLoading ? (isArabic ? 'جاري التحميل...' : 'Loading...') : (isArabic ? 'اختر العميل' : 'Select Customer')}
                className="w-full"
                isRTL={isRTL}
                multiple={false}
              />
            </div>

            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'كود الوحدة' : 'Unit Code'}</label>
              <SearchableSelect
                options={unitCodeOptions}
                value={unitCode}
                onChange={(v) => setUnitCode(String(v || ''))}
                placeholder={filtersLookupLoading ? (isArabic ? 'جاري التحميل...' : 'Loading...') : (isArabic ? 'اختر كود الوحدة' : 'Select Unit Code')}
                className="w-full"
                isRTL={isRTL}
                multiple={false}
              />
            </div>

            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'تاريخ العقد' : 'Contract Date'}</label>
              <DateRangePicker
                from={contractDateFrom}
                to={contractDateTo}
                isRTL={isRTL}
                className="input w-full bg-[var(--content-bg)]"
                onChange={({ from, to }) => {
                  setContractDateFrom(from || '')
                  setContractDateTo(to || '')
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="glass-panel rounded-2xl p-4">
        <div className={`text-xs ${mutedTextClass} mb-3`}>{isArabic ? 'الإجمالي:' : 'Total:'} {pageMeta.total}</div>

        <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="text-left px-3 py-2">{isArabic ? 'رقم العقد' : 'Contract No.'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'كود العميل' : 'Customer ID'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'العميل' : 'Customer'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'تاريخ العقد' : 'Contract Date'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'كود الوحدة' : 'Unit Code'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'المشروع' : 'Project'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'سيلز' : 'Sales'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'السعر' : 'Total Price'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className={`px-3 py-4 ${mutedTextClass}`}>
                    {isArabic ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`px-3 py-4 ${mutedTextClass}`}>
                    {isArabic ? 'لا توجد عقود' : 'No contracts found'}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--panel-border)] hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="px-3 py-2 font-medium">{safeStr(row.contract_number || row.id)}</td>
                    <td className="px-3 py-2">{formatCustomerId(row.customer_id)}</td>
                    <td className="px-3 py-2">{safeStr(row.customer?.name)}</td>
                    <td className="px-3 py-2" dir="ltr">
                      {safeStr(row.contract_date || '')}
                    </td>
                    <td className="px-3 py-2">{safeStr(row.property?.unit_code)}</td>
                    <td className="px-3 py-2">{safeStr(row.customer?.project?.name)}</td>
                    <td className="px-3 py-2">{safeStr(row.customer?.sales_owner?.name)}</td>
                    <td className="px-3 py-2">{formatMoney(row.total_price)}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title={isArabic ? 'معاينة' : 'Preview'} onClick={() => openPreview(row)}>
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="hidden">
          <div className={`text-xs ${mutedTextClass}`}>
            {isArabic ? 'الصفحة' : 'Page'} {pageMeta.current_page} / {pageMeta.last_page}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-[var(--panel-border)] text-sm disabled:opacity-50 hover:bg-black/5 dark:hover:bg-white/5"
              disabled={loading || pageMeta.current_page <= 1}
              onClick={() => load(pageMeta.current_page - 1)}
            >
              {isArabic ? 'السابق' : 'Prev'}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-[var(--panel-border)] text-sm disabled:opacity-50 hover:bg-black/5 dark:hover:bg-white/5"
              disabled={loading || pageMeta.current_page >= pageMeta.last_page}
              onClick={() => load(pageMeta.current_page + 1)}
            >
              {isArabic ? 'التالي' : 'Next'}
            </button>
          </div>
        </div>

        {pageMeta.total > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between rounded-xl p-2 glass-panel gap-4">
            <div className="text-xs text-[var(--muted-text)]">
              {(() => {
                const cur = Number(pageMeta.current_page || 1)
                const total = Number(pageMeta.total || 0)
                const from = total ? (cur - 1) * perPage + 1 : 0
                const to = total ? Math.min(cur * perPage, total) : 0
                return isArabic ? `عرض ${from}-${to} من ${total}` : `Showing ${from}-${to} of ${total}`
              })()}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => load(Math.max(1, Number(pageMeta.current_page || 1) - 1))}
                  disabled={loading || Number(pageMeta.current_page || 1) <= 1}
                  title={isArabic ? 'السابق' : 'Prev'}
                >
                  <FaChevronLeft className={isRTL ? 'scale-x-[-1]' : ''} />
                </button>
                <span className="text-sm whitespace-nowrap">
                  {isArabic ? `الصفحة ${pageMeta.current_page} من ${pageMeta.last_page}` : `Page ${pageMeta.current_page} of ${pageMeta.last_page}`}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => load(Math.min(Number(pageMeta.last_page || 1), Number(pageMeta.current_page || 1) + 1))}
                  disabled={loading || Number(pageMeta.current_page || 1) >= Number(pageMeta.last_page || 1)}
                  title={isArabic ? 'التالي' : 'Next'}
                >
                  <FaChevronRight className={isRTL ? 'scale-x-[-1]' : ''} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-[var(--muted-text)] whitespace-nowrap">{isArabic ? 'لكل صفحة:' : 'Per page:'}</span>
                <select
                  className="input w-16 text-sm py-0 px-2 h-8"
                  value={perPage}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    setPerPage(next)
                    load(1, next)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <ModalShell
        open={previewOpen}
        title={isArabic ? 'معاينة العقد' : 'Contract Preview'}
        onClose={() => setPreviewOpen(false)}
        textColorClass={textColorClass}
        closeTitle={isArabic ? 'إغلاق' : 'Close'}
      >
        {previewLoading ? (
          <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
        ) : !previewData?.contract ? (
          <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد بيانات' : 'No data'}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm inline-flex items-center gap-2"
                onClick={() => openContractPrint(previewData.contract?.id)}
              >
                <Printer className="w-4 h-4" />
                {isArabic ? 'طباعة' : 'Print'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--panel-border)] p-3">
                <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'رقم العقد' : 'Contract No.'}</div>
                <div className="font-semibold">{safeStr(previewData.contract.contract_number || previewData.contract.id)}</div>
              </div>
              <div className="rounded-xl border border-[var(--panel-border)] p-3">
                <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'العميل' : 'Customer'}</div>
                <div className="font-semibold">{safeStr(previewData.contract.customer?.name)}</div>
                <div className={`text-xs ${mutedTextClass}`}>{formatCustomerId(previewData.contract.customer_id)}</div>
              </div>
              <div className="rounded-xl border border-[var(--panel-border)] p-3">
                <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'كود الوحدة' : 'Unit Code'}</div>
                <div className="font-semibold">{safeStr(previewData.contract.property?.unit_code)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--panel-border)] p-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'تاريخ العقد' : 'Contract Date'}</div>
                  <div dir="ltr">{safeStr(previewData.contract.contract_date || '')}</div>
                </div>
                <div>
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'السعر' : 'Total Price'}</div>
                  <div>{formatMoney(previewData.contract.total_price)}</div>
                </div>
                <div>
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'المدفوع' : 'Total Paid'}</div>
                  <div>{formatMoney(previewData.totals?.total_paid)}</div>
                </div>
                <div>
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'المتبقي' : 'Outstanding'}</div>
                  <div>{formatMoney(previewData.totals?.outstanding_balance)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--panel-border)] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold inline-flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  {isArabic ? 'المرفقات' : 'Attachments'}
                </div>
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--panel-border)] text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${attachmentsUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload className="w-4 h-4" />
                  {attachmentsUploading ? (isArabic ? 'جاري الرفع...' : 'Uploading...') : (isArabic ? 'رفع' : 'Upload')}
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept="application/pdf,image/*"
                    onChange={(e) => uploadAttachments(previewData.contract?.id, e.target.files)}
                  />
                </label>
              </div>

              {attachmentsLoading ? (
                <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
              ) : attachments.length === 0 ? (
                <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد مرفقات' : 'No attachments'}</div>
              ) : (
                <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/5 dark:bg-white/5">
                      <tr>
                        <th className="text-left px-3 py-2">{isArabic ? 'الملف' : 'File'}</th>
                        <th className="text-left px-3 py-2">{isArabic ? 'النوع' : 'Type'}</th>
                        <th className="text-left px-3 py-2">{isArabic ? 'إجراءات' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachments.map((a) => (
                        <tr key={a.id} className="border-t border-[var(--panel-border)]">
                          <td className="px-3 py-2">
                            <a className="text-blue-600 hover:underline" href={a.url || '#'} target="_blank" rel="noreferrer">
                              {safeStr(a.original_name || a.file_path || `#${a.id}`)}
                            </a>
                            {String(a?.mime || a?.file_type || '').startsWith('image/') && a.url ? (
                              <div className="mt-2">
                                <a href={a.url} target="_blank" rel="noreferrer" className="inline-block">
                                  <img src={a.url} alt="attachment" className="h-12 w-auto rounded border border-[var(--panel-border)]" />
                                </a>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{safeStr(a.mime || a.file_type || '')}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-red-500"
                              title={isArabic ? 'حذف' : 'Delete'}
                              onClick={() => deleteAttachment(previewData.contract?.id, a.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalShell>

      {importOpen && (
        <CcContractsImportModal
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
          isRTL={isRTL}
        />
      )}
    </div>
  )
}
