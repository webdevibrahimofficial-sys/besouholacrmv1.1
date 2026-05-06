import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTheme } from '@shared/context/ThemeProvider'
import { formatUiDateTime } from '@shared/utils/crmDateTime'
import { api } from '@utils/api'
import SearchableSelect from '@components/SearchableSelect'
import { ChevronDown, ChevronUp, Eye, FilePlus2, Filter, Paperclip, Printer, Search, Trash2, Upload, X } from 'lucide-react'
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

const normalizeInstallmentType = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return ''
  if (v === 'half_yearly' || v === 'halfyearly') return 'half-yearly'
  if (v === 'annual' || v === 'annually') return 'yearly'
  return v
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
  const { company, crmSettings } = useAppState()
  const { isLight } = useTheme()

  const isArabic = i18n.language === 'ar'
  const isRTL = i18n.dir(i18n.language || 'en') === 'rtl'
  const companyTypeLower = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyTypeLower.includes('real')

  const title = useMemo(() => (isArabic ? 'العقود' : 'Contracts'), [isArabic])
  const textColorClass = isLight ? 'text-black' : 'text-white'
  const mutedTextClass = textColorClass
  const formatDateTime = useCallback((value) => formatUiDateTime(value, { crmSettings, language: i18n.language }), [crmSettings, i18n.language])

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
  const [propertiesIndex, setPropertiesIndex] = useState({})

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
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false)
  const [attachmentPreview, setAttachmentPreview] = useState({ url: '', mime: '', name: '' })
  const [editPlanOpen, setEditPlanOpen] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const planCalcLastEditedRef = useRef('count')
  const [planForm, setPlanForm] = useState({
    reservation_amount: '',
    down_payment: '',
    delivery_payment: '',
    installment_type: 'monthly',
    installment_count: '',
    installment_value: '',
    first_due_date: '',
  })
  const [rowActionLoadingId, setRowActionLoadingId] = useState(null)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templatePickerLoading, setTemplatePickerLoading] = useState(false)
  const [templatePickerContract, setTemplatePickerContract] = useState(null)
  const [templatePickerOptions, setTemplatePickerOptions] = useState([])
  const [templatePickerValue, setTemplatePickerValue] = useState('')

  const loadLookups = useCallback(async () => {
    try {
      const usersReq = api.get('/api/users?all=1').catch(() => api.get('/api/users'))
      const propsReq = api.get('/api/properties?all=1').catch(() => api.get('/api/properties'))
      const [projRes, usersRes, propsRes] = await Promise.all([api.get('/api/projects?all=1'), usersReq, propsReq])
      const proj = Array.isArray(projRes?.data?.data) ? projRes.data.data : (Array.isArray(projRes?.data) ? projRes.data : [])
      const users = Array.isArray(usersRes?.data?.data) ? usersRes.data.data : (Array.isArray(usersRes?.data) ? usersRes.data : [])
      const props = Array.isArray(propsRes?.data?.data) ? propsRes.data.data : (Array.isArray(propsRes?.data) ? propsRes.data : [])
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

      const idx = {}
      ;(Array.isArray(props) ? props : []).forEach((p) => {
        const id = p?.id
        if (!id) return
        idx[String(id)] = p
      })
      setPropertiesIndex(idx)
    } catch {
      setProjects([])
      setSalesOwners([])
      setPropertiesIndex({})
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

  const getAttachmentUrl = useCallback((att) => {
    const explicit = safeStr(att?.url || att?.download_url || att?.preview_url || '')
    if (explicit) return explicit

    const filePath = safeStr(att?.file_path || att?.path || '')
    if (!filePath) return ''

    const base = String(api?.defaults?.baseURL || '').replace(/\/+$/, '')
    const root = base.replace(/\/api\/?$/i, '') || (typeof window !== 'undefined' ? window.location.origin : '')
    if (!root) return ''

    return `${root}/storage/${filePath.replace(/^\/+/, '')}`
  }, [])

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
        const list = Array.isArray(attRes?.data?.data) ? attRes.data.data : []
        setAttachments((Array.isArray(list) ? list : []).map((a) => ({ ...a, url: getAttachmentUrl(a) || a?.url })))
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
      // Fetch via authenticated client then open as a blob URL (avoid popup blockers + auth issues).
      const res = await api.get(`/api/cc/contracts/${encodeURIComponent(contractId)}/print?autoprint=1&rtl=${rtl}`, {
        responseType: 'blob',
        headers: { Accept: 'text/html' },
      })
      const blobUrl = URL.createObjectURL(res.data)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'تعذر فتح الطباعة حالياً' : 'Unable to open print preview right now' } }))
    }
  }

  const exportContractSnapshot = () => {
    if (!previewData?.contract?.id) return
    try {
      const blob = new Blob([JSON.stringify({
        contract: previewData.contract,
        totals: previewData.totals,
        attachments,
        exported_at: new Date().toISOString(),
      }, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cc_contract_${previewData.contract.id}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
    }
  }

  const toNum0 = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  // Auto-calculate installment value/count in "Edit Payment Plan" as user types.
  useEffect(() => {
    if (!editPlanOpen) return

    const contract = previewData?.contract
    const totalPrice = toNum0(contract?.total_price ?? contract?.property?.total_price ?? previewData?.totals?.total_price)
    if (!totalPrice) return

    const reservation = toNum0(planForm.reservation_amount)
    const down = toNum0(planForm.down_payment)
    const delivery = toNum0(planForm.delivery_payment)
    const remaining = Math.max(0, totalPrice - reservation - down - delivery)

    const count = toNum0(planForm.installment_count)
    const value = toNum0(planForm.installment_value)

    const last = planCalcLastEditedRef.current
    if (last === 'value') {
      if (value > 0) {
        const nextCount = Math.max(1, Math.round(remaining / value))
        if (String(nextCount) !== String(planForm.installment_count || '')) {
          setPlanForm((p) => ({ ...p, installment_count: String(nextCount) }))
        }
      }
      return
    }

    if (count > 0) {
      const nextValue = Math.round((remaining / count) * 100) / 100
      if (String(nextValue) !== String(planForm.installment_value || '')) {
        setPlanForm((p) => ({ ...p, installment_value: String(nextValue) }))
      }
    }
  }, [
    editPlanOpen,
    previewData?.contract?.id,
    previewData?.totals?.total_price,
    previewData?.contract?.total_price,
    previewData?.contract?.property?.total_price,
    planForm.reservation_amount,
    planForm.down_payment,
    planForm.delivery_payment,
    planForm.installment_count,
    planForm.installment_value,
  ])

  const openEditPlan = () => {
    const snapshot = previewData?.contract?.payment_plan_snapshot || {}
    setPlanForm({
      reservation_amount: snapshot?.reservation_amount ?? '',
      down_payment: snapshot?.down_payment ?? '',
      delivery_payment: snapshot?.delivery_payment ?? '',
      installment_type: normalizeInstallmentType(snapshot?.installment_type) || 'monthly',
      installment_count: snapshot?.installment_count ?? '',
      installment_value: snapshot?.installment_value ?? '',
      first_due_date: safeStr(previewData?.contract?.first_due_date || '').slice(0, 10),
    })
    setEditPlanOpen(true)
  }

  const savePaymentPlan = async () => {
    if (!previewData?.contract?.id) return
    setSavingPlan(true)
    try {
      await api.post(`/api/cc/contracts/${encodeURIComponent(previewData.contract.id)}/payment-plan`, {
        reservation_amount: Number(planForm.reservation_amount || 0),
        down_payment: Number(planForm.down_payment || 0),
        delivery_payment: Number(planForm.delivery_payment || 0),
        installment_type: planForm.installment_type || 'monthly',
        installment_count: Number(planForm.installment_count || 0),
        installment_value: Number(planForm.installment_value || 0),
        first_due_date: planForm.first_due_date || null,
      })
      setEditPlanOpen(false)
      await openPreview(previewData.contract)
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم تحديث خطة الدفع' : 'Payment plan updated' } }))
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'تعذر تحديث خطة الدفع' : 'Failed to update payment plan' } }))
    } finally {
      setSavingPlan(false)
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
      const next = Array.isArray(attRes?.data?.data) ? attRes.data.data : []
      setAttachments((Array.isArray(next) ? next : []).map((a) => ({ ...a, url: getAttachmentUrl(a) || a?.url })))
    } catch {
    } finally {
      setAttachmentsUploading(false)
    }
  }

  const openAttachmentPreview = useCallback((att) => {
    const url = safeStr(getAttachmentUrl(att) || att?.url || '')
    if (!url) return
    setAttachmentPreview({
      url,
      mime: safeStr(att?.mime || att?.file_type || att?.meta_data?.mime || ''),
      name: safeStr(att?.original_name || att?.meta_data?.original_name || att?.file_path || att?.file_name || att?.name || ''),
    })
    setAttachmentPreviewOpen(true)
  }, [getAttachmentUrl])

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

  const addContractFromTemplate = async (row) => {
    if (!row?.id) return
    setTemplatePickerContract(row)
    setTemplatePickerOpen(true)
    setTemplatePickerLoading(true)
    setTemplatePickerValue('')

    try {
      const res = await api.get('/api/contract-templates')
      const list = Array.isArray(res?.data?.data) ? res.data.data : (Array.isArray(res?.data) ? res.data : [])
      setTemplatePickerOptions(Array.isArray(list) ? list : [])
    } catch (e) {
      setTemplatePickerOptions([])
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'تعذر تحميل القوالب' : 'Unable to load templates' } }))
    } finally {
      setTemplatePickerLoading(false)
    }
  }

  const confirmTemplatePicker = async () => {
    const row = templatePickerContract
    const templateId = Number(templatePickerValue || 0)
    if (!row?.id || !Number.isFinite(templateId) || templateId <= 0) return

    setRowActionLoadingId(row.id)
    try {
      await api.put(`/api/cc/contracts/${encodeURIComponent(row.id)}/template`, { template_id: templateId })
      setTemplatePickerOpen(false)
      setTemplatePickerContract(null)
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم ربط القالب' : 'Template linked' } }))
      await openContractPrint(row.id)
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (typeof e?.message === 'string' ? e.message : '') ||
        (isArabic ? 'تعذر ربط القالب' : 'Unable to link template')
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: msg } }))
    } finally {
      setRowActionLoadingId(null)
    }
  }

  const deleteOrCancelContract = async (row) => {
    if (!row?.id) return
    const ok = window.confirm(isArabic ? 'حذف العقد؟' : 'Delete contract?')
    if (!ok) return

    setRowActionLoadingId(row.id)
    try {
      await api.delete(`/api/cc/contracts/${encodeURIComponent(row.id)}`, { params: { action: 'delete' } })
      await load(pageMeta.current_page || 1)
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم حذف العقد' : 'Contract deleted' } }))
    } catch (e) {
      const statusCode = Number(e?.response?.status || 0)
      if (statusCode === 422) {
        const fallback = window.confirm(
          isArabic
            ? 'لا يمكن حذف العقد لوجود مدفوعات. هل تريد إلغاء العقد بدلاً من حذفه؟'
            : 'Contract has payments and cannot be deleted. Cancel it instead?'
        )
        if (!fallback) return
        await api.delete(`/api/cc/contracts/${encodeURIComponent(row.id)}`, { params: { action: 'cancel' } })
        await load(pageMeta.current_page || 1)
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم إلغاء العقد' : 'Contract cancelled' } }))
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'تعذر تنفيذ العملية' : 'Unable to complete action' } }))
      }
    } finally {
      setRowActionLoadingId(null)
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
      <ModalShell
        open={templatePickerOpen}
        title={isArabic ? 'اختيار قالب العقد' : 'Select Contract Template'}
        onClose={() => {
          if (rowActionLoadingId) return
          setTemplatePickerOpen(false)
          setTemplatePickerContract(null)
        }}
        widthClass="max-w-2xl"
        textColorClass={textColorClass}
        closeTitle={isArabic ? 'إغلاق' : 'Close'}
      >
        {(() => {
          const row = templatePickerContract || {}
          const projId = String(row?.customer?.project?.id ?? row?.customer?.project_id ?? '').trim()
          const filtered = (Array.isArray(templatePickerOptions) ? templatePickerOptions : [])
            .filter((t) => String(t?.status || '').toLowerCase() === 'active')
            .filter((t) => String(t?.content_type || 'html').toLowerCase() === 'html')
            .filter((t) => {
              const tProj = t?.project_id == null ? '' : String(t.project_id)
              if (!projId) return tProj === '' // no project on contract → only global
              return tProj === '' || tProj === projId
            })

          const selectOptions = [
            { value: '', label: isArabic ? 'اختر قالب...' : 'Select template...' },
            ...filtered.map((t) => ({
              value: String(t.id),
              label: `${safeStr(t.name)}${t?.project?.name ? ` — ${safeStr(t.project.name)}` : isArabic ? ' — كل المشاريع' : ' — All Projects'}`,
            })),
          ]

          return (
            <div className="space-y-4">
              <div className={`text-sm ${mutedTextClass}`}>
                {isArabic ? 'سيتم حفظ القالب على العقد ثم فتح الطباعة.' : 'This will save the template on the contract and then open print.'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--panel-border)] p-3">
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'رقم العقد' : 'Contract No.'}</div>
                  <div className="font-semibold">{safeStr(row.contract_number || row.id)}</div>
                </div>
                <div className="rounded-xl border border-[var(--panel-border)] p-3">
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'المشروع' : 'Project'}</div>
                  <div className="font-semibold">{safeStr(row?.customer?.project?.name || (projId ? `#${projId}` : '')) || '-'}</div>
                </div>
              </div>

              {templatePickerLoading ? (
                <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'جاري تحميل القوالب...' : 'Loading templates...'}</div>
              ) : (
                <div>
                  <div className={`text-sm font-semibold mb-2 ${textColorClass}`}>{isArabic ? 'القالب' : 'Template'}</div>
                  <SearchableSelect
                    value={templatePickerValue}
                    onChange={setTemplatePickerValue}
                    options={selectOptions}
                    placeholder={isArabic ? 'اختر قالب' : 'Select template'}
                    className="w-full"
                  />
                  {!filtered.length ? (
                    <div className={`text-xs mt-2 ${mutedTextClass}`}>
                      {isArabic ? 'لا توجد قوالب HTML نشطة لهذا المشروع أو كقالب عام.' : 'No active HTML templates available for this project or global.'}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => {
                    if (rowActionLoadingId) return
                    setTemplatePickerOpen(false)
                    setTemplatePickerContract(null)
                  }}
                  disabled={Boolean(rowActionLoadingId)}
                >
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm disabled:opacity-50"
                  onClick={confirmTemplatePicker}
                  disabled={templatePickerLoading || !templatePickerValue || Boolean(rowActionLoadingId)}
                >
                  {isArabic ? 'حفظ و طباعة' : 'Save & Print'}
                </button>
              </div>
            </div>
          )
        })()}
      </ModalShell>

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
                <th className="text-left px-3 py-2">{isArabic ? 'رقم الوحدة' : 'Unit No.'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'المشروع' : 'Project'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'سيلز' : 'Sales'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'السعر' : 'Total Price'}</th>
                <th className="text-left px-3 py-2">{isArabic ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className={`px-3 py-4 ${mutedTextClass}`}>
                    {isArabic ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`px-3 py-4 ${mutedTextClass}`}>
                    {isArabic ? 'لا توجد عقود' : 'No contracts found'}
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const propId = String(row?.property_id ?? row?.property?.id ?? '').trim()
                  const prop = row?.property || (propId ? propertiesIndex[propId] : null) || {}
                  const unitNo = safeStr(prop?.unit_no || prop?.unit_number || prop?.unitNumber || prop?.unitNo || prop?.unit || prop?.number)
                  return (
                  <tr key={row.id} className="border-t border-[var(--panel-border)] hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="px-3 py-2 font-medium">{safeStr(row.contract_number || row.id)}</td>
                    <td className="px-3 py-2">{formatCustomerId(row.customer_id)}</td>
                    <td className="px-3 py-2">{safeStr(row.customer?.name)}</td>
                    <td className="px-3 py-2" dir="ltr">
                      {formatDateTime(row.contract_date)}
                    </td>
                    <td className="px-3 py-2">{safeStr(prop?.unit_code)}</td>
                    <td className="px-3 py-2">{unitNo || '-'}</td>
                    <td className="px-3 py-2">{safeStr(row.customer?.project?.name)}</td>
                    <td className="px-3 py-2">{safeStr(row.customer?.sales_owner?.name)}</td>
                    <td className="px-3 py-2">{formatMoney(row.total_price)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                          title={isArabic ? 'معاينة' : 'Preview'}
                          onClick={() => openPreview(row)}
                          disabled={rowActionLoadingId === row.id}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-blue-600 dark:text-blue-400 disabled:opacity-50"
                          title={isArabic ? 'إنشاء/طباعة من القالب' : 'Add Contract (Template)'}
                          onClick={() => addContractFromTemplate(row)}
                          disabled={rowActionLoadingId === row.id}
                        >
                          <FilePlus2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-red-500 disabled:opacity-50"
                          title={isArabic ? 'حذف أو إلغاء العقد' : 'Delete/Cancel Contract'}
                          onClick={() => deleteOrCancelContract(row)}
                          disabled={rowActionLoadingId === row.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })
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
                className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
                onClick={openEditPlan}
                disabled={!previewData?.contract?.id}
              >
                {isArabic ? 'تعديل خطة الدفع' : 'Edit Payment Plan'}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
                onClick={exportContractSnapshot}
                disabled={!previewData?.contract?.id}
              >
                {isArabic ? 'تصدير العقد' : 'Export Contract'}
              </button>
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
                {(() => {
                  const propId = String(previewData?.contract?.property_id ?? previewData?.contract?.property?.id ?? '').trim()
                  const prop = previewData?.contract?.property || (propId ? propertiesIndex[propId] : null) || {}
                  const unitNo = safeStr(prop?.unit_no || prop?.unit_number || prop?.unitNumber || prop?.unitNo || prop?.unit || prop?.number)
                  return (
                    <>
                      <div className="font-semibold">{safeStr(prop?.unit_code)}</div>
                      <div className={`text-xs ${mutedTextClass} mt-1`}>
                        {isArabic ? 'رقم الوحدة' : 'Unit No.'}: {unitNo || '-'}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--panel-border)] p-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className={`text-xs ${mutedTextClass}`}>{isArabic ? 'تاريخ العقد' : 'Contract Date'}</div>
                  <div dir="ltr">{formatDateTime(previewData.contract.contract_date)}</div>
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
                            <a className="text-blue-600 hover:underline" href={getAttachmentUrl(a) || '#'} target="_blank" rel="noreferrer">
                              {safeStr(a.original_name || a?.meta_data?.original_name || a.file_path || `#${a.id}`)}
                            </a>
                            {String(a?.mime || a?.file_type || a?.meta_data?.mime || '').startsWith('image/') && getAttachmentUrl(a) ? (
                              <div className="mt-2">
                                <a href={getAttachmentUrl(a)} target="_blank" rel="noreferrer" className="inline-block">
                                  <img src={getAttachmentUrl(a)} alt="attachment" className="h-12 w-auto rounded border border-[var(--panel-border)]" />
                                </a>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{safeStr(a.mime || a.file_type || a?.meta_data?.mime || '')}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <a
                                href={getAttachmentUrl(a) || '#'}
                                onClick={(e) => {
                                  if (!getAttachmentUrl(a)) return
                                  e.preventDefault()
                                  openAttachmentPreview({ ...a, url: getAttachmentUrl(a) })
                                }}
                                className={`p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${getAttachmentUrl(a) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 pointer-events-none'}`}
                                title={isArabic ? 'معاينة' : 'Preview'}
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                              <button
                                type="button"
                                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-red-500"
                                title={isArabic ? 'حذف' : 'Delete'}
                                onClick={() => deleteAttachment(previewData.contract?.id, a.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
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

      <ModalShell
        open={attachmentPreviewOpen}
        title={attachmentPreview?.name ? (isArabic ? `معاينة: ${attachmentPreview.name}` : `Preview: ${attachmentPreview.name}`) : (isArabic ? 'معاينة المرفق' : 'Attachment Preview')}
        onClose={() => setAttachmentPreviewOpen(false)}
        textColorClass={textColorClass}
        closeTitle={isArabic ? 'إغلاق' : 'Close'}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <a
              href={attachmentPreview?.url || '#'}
              target="_blank"
              rel="noreferrer"
              className={`px-3 py-2 rounded-xl border border-[var(--panel-border)] text-sm ${attachmentPreview?.url ? '' : 'pointer-events-none opacity-50'}`}
            >
              {isArabic ? 'فتح في تبويب جديد' : 'Open in new tab'}
            </a>
          </div>

          {String(attachmentPreview?.mime || '').startsWith('image/') && attachmentPreview?.url ? (
            <div className="flex justify-center">
              <img
                src={attachmentPreview.url}
                alt={attachmentPreview.name || 'attachment'}
                className="max-h-[70vh] w-auto rounded-xl border border-[var(--panel-border)]"
              />
            </div>
          ) : String(attachmentPreview?.mime || '').includes('pdf') && attachmentPreview?.url ? (
            <iframe
              title="attachment-preview"
              src={attachmentPreview.url}
              className="w-full h-[70vh] rounded-xl border border-[var(--panel-border)]"
            />
          ) : attachmentPreview?.url ? (
            <div className={`text-sm ${mutedTextClass}`}>
              {isArabic ? 'لا يمكن عرض هذا النوع داخل الصفحة. استخدم زر \"فتح في تبويب جديد\".' : 'This file type cannot be previewed inline. Use “Open in new tab”.'}
            </div>
          ) : (
            <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا يوجد رابط للملف' : 'No file URL available'}</div>
          )}
        </div>
      </ModalShell>

      <ModalShell
        open={editPlanOpen}
        title={isArabic ? 'تعديل خطة الدفع' : 'Edit Payment Plan'}
        onClose={() => { if (!savingPlan) setEditPlanOpen(false) }}
        textColorClass={textColorClass}
        closeTitle={isArabic ? 'إغلاق' : 'Close'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'الحجز' : 'Reservation'}</label>
              <input className="input w-full" value={planForm.reservation_amount} onChange={(e) => setPlanForm((p) => ({ ...p, reservation_amount: e.target.value }))} />
            </div>
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'الدفعة المقدمة' : 'Down Payment'}</label>
              <input className="input w-full" value={planForm.down_payment} onChange={(e) => setPlanForm((p) => ({ ...p, down_payment: e.target.value }))} />
            </div>
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'دفعة الاستلام' : 'Delivery Payment'}</label>
              <input className="input w-full" value={planForm.delivery_payment} onChange={(e) => setPlanForm((p) => ({ ...p, delivery_payment: e.target.value }))} />
            </div>
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'نوع القسط' : 'Installment Type'}</label>
              <select className="input w-full" value={planForm.installment_type} onChange={(e) => setPlanForm((p) => ({ ...p, installment_type: e.target.value }))}>
                <option value="monthly">{isArabic ? 'شهري' : 'Monthly'}</option>
                <option value="quarterly">{isArabic ? 'ربع سنوي' : 'Quarterly'}</option>
                <option value="half-yearly">{isArabic ? 'نصف سنوي' : 'Half-yearly'}</option>
                <option value="yearly">{isArabic ? 'سنوي' : 'Yearly'}</option>
              </select>
            </div>
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'عدد الأقساط' : 'Installment Count'}</label>
              <input
                className="input w-full"
                value={planForm.installment_count}
                onChange={(e) => {
                  planCalcLastEditedRef.current = 'count'
                  setPlanForm((p) => ({ ...p, installment_count: e.target.value }))
                }}
              />
            </div>
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'قيمة القسط' : 'Installment Value'}</label>
              <input
                className="input w-full"
                value={planForm.installment_value}
                onChange={(e) => {
                  planCalcLastEditedRef.current = 'value'
                  setPlanForm((p) => ({ ...p, installment_value: e.target.value }))
                }}
              />
            </div>
            <div>
              <label className={`text-xs ${mutedTextClass}`}>{isArabic ? 'أول تاريخ استحقاق' : 'First Due Date'}</label>
              <input type="date" className="input w-full" value={planForm.first_due_date} onChange={(e) => setPlanForm((p) => ({ ...p, first_due_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-[var(--panel-border)] text-sm"
              onClick={() => setEditPlanOpen(false)}
              disabled={savingPlan}
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-60"
              onClick={savePaymentPlan}
              disabled={savingPlan}
            >
              {savingPlan ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ' : 'Save')}
            </button>
          </div>
        </div>
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
