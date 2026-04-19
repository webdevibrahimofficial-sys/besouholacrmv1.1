import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '@utils/api'
import SearchableSelect from '@components/SearchableSelect'
import { ChevronDown, ChevronUp, Eye, Filter, Paperclip, Printer, Search, Trash2, Upload, X } from 'lucide-react'

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

function ModalShell({ open, title, onClose, children, widthClass = 'max-w-4xl' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[20000]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`card w-full ${widthClass} bg-[var(--content-bg)] rounded-2xl shadow-2xl border border-[var(--panel-border)] overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--panel-border)]">
            <div className="min-w-0">
              <div className="text-base font-semibold text-theme-text dark:text-gray-100 truncate">{title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              aria-label="Close"
              title="Close"
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
  const mutedTextClass = isLight ? 'text-gray-600' : 'text-gray-400'

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

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, total: 0 })

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)
  const [attachments, setAttachments] = useState([])

  const loadLookups = useCallback(async () => {
    try {
      const [projRes, usersRes] = await Promise.all([api.get('/api/projects?all=1'), api.get('/api/users')])
      const proj = Array.isArray(projRes?.data?.data) ? projRes.data.data : (Array.isArray(projRes?.data) ? projRes.data : [])
      const users = Array.isArray(usersRes?.data?.data) ? usersRes.data.data : (Array.isArray(usersRes?.data) ? usersRes.data : [])
      setProjects(proj)
      setSalesOwners(users.map((u) => ({ value: u.id, label: u.name || u.email || String(u.id) })))
    } catch {
      setProjects([])
      setSalesOwners([])
    }
  }, [])

  const load = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
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
    [q, contractNumber, customerId, unitCode, projectId, salesOwnerId, status, contractDateFrom, contractDateTo]
  )

  useEffect(() => {
    if (!isRealEstate) return
    loadLookups()
    load(1)
  }, [isRealEstate, loadLookups, load])

  const clearFilters = () => {
    setQ('')
    setContractNumber('')
    setCustomerId('')
    setUnitCode('')
    setProjectId('')
    setSalesOwnerId('')
    setStatus('')
    setContractDateFrom('')
    setContractDateTo('')
    setShowAllFilters(false)
    load(1)
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

  const openContractPrint = (contractId) => {
    if (!contractId) return
    const rtl = isRTL ? '1' : '0'
    window.open(`/api/cc/contracts/${encodeURIComponent(contractId)}/print?autoprint=1&rtl=${rtl}`, '_blank')
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
    const ok = window.confirm('Delete attachment?')
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

      {/* Filters (before list) */}
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 ${isRTL ? 'right-3' : 'left-3'} ${mutedTextClass}`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`w-full px-9 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] outline-none focus:ring-2 focus:ring-blue-500 text-sm ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
              placeholder={isArabic ? 'بحث (رقم العقد / العميل / Unit Code)...' : 'Search (contract # / customer / unit code)...'}
            />
          </div>

          <button type="button" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm inline-flex items-center gap-2" onClick={() => load(1)}>
            <Filter className="w-4 h-4" />
            {isArabic ? 'فلتر' : 'Filter'}
          </button>

          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
            onClick={clearFilters}
          >
            <X className="w-4 h-4" />
            {isArabic ? 'مسح' : 'Clear'}
          </button>

          <button
            type="button"
            className="ml-auto px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => setShowAllFilters((v) => !v)}
          >
            {showAllFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {isArabic ? 'مزيد' : 'More'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>{isArabic ? 'رقم العقد' : 'Contract No.'}</label>
            <input
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="CN-..."
            />
          </div>

          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>Customer ID</label>
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123"
            />
          </div>

          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>Unit Code</label>
            <input
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="U-..."
            />
          </div>

          <div>
            <label className={`text-xs font-semibold ${mutedTextClass}`}>{isArabic ? 'الحالة' : 'Status'}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{isArabic ? 'الكل' : 'All'}</option>
              {['active', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showAllFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Project</label>
              <div className="mt-1">
                <SearchableSelect
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder={isArabic ? 'الكل' : 'All'}
                  isRTL={isRTL}
                />
              </div>
            </div>

            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Sales Person</label>
              <div className="mt-1">
                <SearchableSelect options={salesOwners} value={salesOwnerId} onChange={setSalesOwnerId} placeholder={isArabic ? 'الكل' : 'All'} isRTL={isRTL} />
              </div>
            </div>

            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Contract Date (From)</label>
              <input
                type="date"
                value={contractDateFrom}
                onChange={(e) => setContractDateFrom(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className={`text-xs font-semibold ${mutedTextClass}`}>Contract Date (To)</label>
              <input
                type="date"
                value={contractDateTo}
                onChange={(e) => setContractDateTo(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--panel-border)] bg-[var(--content-bg)] text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="glass-panel rounded-2xl p-4">
        <div className={`text-xs ${mutedTextClass} mb-3`}>Total: {pageMeta.total}</div>

        <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="text-left px-3 py-2">{isArabic ? 'رقم العقد' : 'Contract No.'}</th>
                <th className="text-left px-3 py-2">Customer ID</th>
                <th className="text-left px-3 py-2">{isArabic ? 'العميل' : 'Customer'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'تاريخ العقد' : 'Contract Date'}</th>
                <th className="text-left px-3 py-2">Unit Code</th>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-left px-3 py-2">Sales</th>
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
                      <button type="button" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title="Preview" onClick={() => openPreview(row)}>
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className={`text-xs ${mutedTextClass}`}>
            Page {pageMeta.current_page} / {pageMeta.last_page}
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
      </div>

      <ModalShell open={previewOpen} title={isArabic ? 'معاينة العقد' : 'Contract Preview'} onClose={() => setPreviewOpen(false)}>
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
                {isArabic ? 'Print' : 'Print'}
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
                <div className={`text-xs ${mutedTextClass}`}>Unit Code</div>
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
                  Attachments
                </div>
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--panel-border)] text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${attachmentsUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload className="w-4 h-4" />
                  {attachmentsUploading ? 'Uploading...' : 'Upload'}
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
                <div className={`text-sm ${mutedTextClass}`}>Loading...</div>
              ) : attachments.length === 0 ? (
                <div className={`text-sm ${mutedTextClass}`}>No attachments</div>
              ) : (
                <div className="overflow-auto rounded-xl border border-[var(--panel-border)]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/5 dark:bg-white/5">
                      <tr>
                        <th className="text-left px-3 py-2">File</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-left px-3 py-2">Actions</th>
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
                              title="Delete"
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
    </div>
  )
}
