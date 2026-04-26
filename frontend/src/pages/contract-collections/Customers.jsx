import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Pencil, Trash2, Search, X, MessageSquareText, Paperclip, Filter, ChevronDown, ChevronUp, Printer, FileDown, FileText } from 'lucide-react'
import { FaChevronLeft, FaChevronRight, FaFileImport, FaPlus } from 'react-icons/fa'
import { api } from '@utils/api'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTheme } from '@shared/context/ThemeProvider'
import SearchableSelect from '@components/SearchableSelect'
import CcCustomersImportModal from '@components/CcCustomersImportModal'

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

const titleFromProperty = (prop) => safeStr(prop?.unit_code || prop?.name || prop?.title || (prop?.id ? `#${prop.id}` : ''))

const normalizeInstallmentType = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return ''
  if (v === 'half_yearly' || v === 'halfyearly') return 'half-yearly'
  if (v === 'annual' || v === 'annually') return 'yearly'
  return v
}

function openPrintWindow({ title, blocks, dir = 'ltr' }) {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return
  const htmlBlocks = (Array.isArray(blocks) ? blocks : [])
    .map(
      (b) => `
        <section class="block">
          <h2>${b?.title || ''}</h2>
          <table>
            <tbody>
              ${(Array.isArray(b?.rows) ? b.rows : [])
                .map((r) => `<tr><td class="k">${r?.label || ''}</td><td class="v">${r?.value ?? ''}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        </section>
      `
    )
    .join('')

  win.document.open()
  win.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title || 'Print'}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; direction: ${dir}; }
          h1 { font-size: 18px; margin: 0 0 16px; }
          .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
          .block { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
          .block h2 { font-size: 13px; margin: 0 0 8px; color: #111827; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td { padding: 6px 0; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
          td.k { width: 40%; color: #6b7280; }
          td.v { color: #111827; }
          @media print { body { margin: 0; } .block { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>${title || ''}</h1>
        <div class="grid">${htmlBlocks}</div>
        <script>setTimeout(() => window.print(), 250);</script>
      </body>
    </html>`)
  win.document.close()
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm rounded-lg border transition ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-transparent border-gray-200 dark:border-gray-800 hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

export default function ContractCollectionsCustomers() {
  const { i18n } = useTranslation()
  const { company, user } = useAppState()
  const { isLight } = useTheme()

  const isArabic = i18n.language === 'ar'
  const isRTL = i18n.dir(i18n.language || 'en') === 'rtl'
  const companyTypeLower = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyTypeLower.includes('real')

  const title = useMemo(() => (isArabic ? 'إدارة العملاء' : 'Customers Management'), [isArabic])
  const mutedTextClass = isLight ? 'text-gray-600' : 'text-gray-400'

  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const [salesOwnerId, setSalesOwnerId] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [projects, setProjects] = useState([])
  const [units, setUnits] = useState([])
  const [salesOwners, setSalesOwners] = useState([])

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [perPage, setPerPage] = useState(25)
  const [selectedIds, setSelectedIds] = useState([])
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [activeTotals, setActiveTotals] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('details') // details | comments | attachments
  const [selectedUnitId, setSelectedUnitId] = useState(null)
  const [selectedContractId, setSelectedContractId] = useState(null)
  const [contractAttachments, setContractAttachments] = useState([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)

  // Comments
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const commentsAbortRef = useRef(null)
  const attachmentsAbortRef = useRef(null)

  // Convert to Contract
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertLoading, setConvertLoading] = useState(false)
  const [convertForm, setConvertForm] = useState({
    contract_number: '',
    contract_date: '',
    first_due_date: '',
    total_price: '',
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [editId, setEditId] = useState(null)
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    email: '',
    source: '',
    project_id: '',
    property_id: '',
    sales_owner_id: '',
    last_comments: '',
  })

  const [importOpen, setImportOpen] = useState(false)

  const canEdit = true
  const canDelete = (String(user?.role || '').toLowerCase().includes('admin') || !!user?.is_super_admin)

  const load = useCallback(async (page = 1, perPageOverride) => {
    setLoading(true)
    try {
      const pageSize = Number(perPageOverride || perPage || 25) || 25
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('per_page', String(pageSize))
      if (q.trim()) params.set('q', q.trim())
      if (projectId) params.set('project_id', String(projectId))
      if (salesOwnerId) params.set('sales_owner_id', String(salesOwnerId))

      const res = await api.get(`/api/cc/customers?${params.toString()}`)
      const data = res?.data || {}
      const serverPerPage = Number(data?.per_page || pageSize) || pageSize
      if (serverPerPage !== pageSize) setPerPage(serverPerPage)
      setItems(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
      setPageMeta({
        current_page: data?.current_page || page,
        last_page: data?.last_page || 1,
        total: data?.total || (Array.isArray(data?.data) ? data.data.length : 0),
      })
    } catch {
      setItems([])
      setPageMeta({ current_page: 1, last_page: 1, total: 0 })
    } finally {
      setLoading(false)
    }
  }, [q, projectId, salesOwnerId, perPage])

  const loadDetails = useCallback(async (customerId) => {
    try {
      const res = await api.get(`/api/cc/customers/${encodeURIComponent(customerId)}`)
      const payload = res?.data || {}
      setActiveCustomer(payload?.customer || null)
      setActiveTotals(payload?.totals || null)
    } catch {
      setActiveCustomer(null)
      setActiveTotals(null)
    }
  }, [])

  const loadFilterData = useCallback(async () => {
    try {
      const [projRes, usersRes, propsRes] = await Promise.all([api.get('/api/projects'), api.get('/api/users'), api.get('/api/properties')])
      const projData = Array.isArray(projRes?.data) ? projRes.data : projRes?.data?.data || []
      const userData = Array.isArray(usersRes?.data) ? usersRes.data : usersRes?.data?.data || []
      const propsData = Array.isArray(propsRes?.data) ? propsRes.data : propsRes?.data?.data || []

      const projOptions = (Array.isArray(projData) ? projData : [])
        .map((p) => ({ value: String(p.id), label: String(p.name || p.title || `#${p.id}`) }))
        .filter((x) => x.value && x.label)
      setProjects(projOptions)

      const userOptions = (Array.isArray(userData) ? userData : [])
        .map((u) => ({ value: String(u.id), label: String(u.name || u.email || `#${u.id}`) }))
        .filter((x) => x.value && x.label)
      setSalesOwners(userOptions)

      const unitOptions = (Array.isArray(propsData) ? propsData : [])
        .map((p) => ({
          value: String(p.id),
          label: String(p.unit_code || p.name || p.title || `#${p.id}`),
          project_id: p.project_id != null ? String(p.project_id) : '',
        }))
        .filter((x) => x.value && x.label)
      setUnits(unitOptions)
    } catch {
      setProjects([])
      setSalesOwners([])
      setUnits([])
    }
  }, [])

  const loadComments = useCallback(async (customerId) => {
    if (!customerId) return
    try {
      setCommentsLoading(true)
      if (commentsAbortRef.current) {
        try {
          commentsAbortRef.current.abort()
        } catch {}
      }
      const controller = new AbortController()
      commentsAbortRef.current = controller
      const res = await api.get(`/api/cc/customers/${encodeURIComponent(customerId)}/comments`, { signal: controller.signal })
      const data = res?.data?.data || []
      setComments(Array.isArray(data) ? data : [])
    } catch {
      setComments([])
    } finally {
      setCommentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isRealEstate) return
    loadFilterData()
    load(1)
  }, [isRealEstate, load, loadFilterData])

  useEffect(() => {
    const t = setTimeout(() => load(1), 350)
    return () => clearTimeout(t)
  }, [q, projectId, salesOwnerId, load])

  useEffect(() => {
    if (!previewOpen || !activeCustomer?.id) return
    if (activeTab === 'comments') loadComments(activeCustomer.id)
  }, [previewOpen, activeCustomer?.id, activeTab, loadComments])

  const loadContractAttachments = useCallback(async (contractId) => {
    if (!contractId) return
    try {
      setAttachmentsLoading(true)
      if (attachmentsAbortRef.current) {
        try {
          attachmentsAbortRef.current.abort()
        } catch {}
      }
      const controller = new AbortController()
      attachmentsAbortRef.current = controller
      const res = await api.get(`/api/cc/contracts/${encodeURIComponent(contractId)}/attachments`, { signal: controller.signal })
      setContractAttachments(Array.isArray(res?.data?.data) ? res.data.data : [])
    } catch {
      setContractAttachments([])
    } finally {
      setAttachmentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!previewOpen || !activeCustomer?.id) return
    if (activeTab !== 'attachments') return
    if (!selectedContractId) return
    loadContractAttachments(selectedContractId)
  }, [previewOpen, activeCustomer?.id, activeTab, selectedContractId, loadContractAttachments])

  const allChecked = items.length > 0 && selectedIds.length === items.length
  const toggleAll = () => {
    if (allChecked) setSelectedIds([])
    else setSelectedIds(items.map((x) => x.id))
  }

  const toggleOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onPreview = async (row) => {
    setActiveTab('details')
    setActiveCustomer(null)
    setActiveTotals(null)
    setPreviewOpen(true)
    setSelectedUnitId(null)
    setSelectedContractId(null)
    setContractAttachments([])
    await loadDetails(row.id)
  }

  const resetFilters = () => {
    setQ('')
    setProjectId('')
    setSalesOwnerId('')
  }

  const filteredUnitOptions = useMemo(() => {
    const pid = String(createForm.project_id || '').trim()
    if (!pid) return []
    return (Array.isArray(units) ? units : []).filter((u) => String(u?.project_id || '') === pid)
  }, [units, createForm.project_id])

  const getUnitLabelForRow = (row) => {
    const meta = row?.meta_data || {}
    const primaryUnitId = meta?.primary_customer_unit_id
    const list = Array.isArray(row?.units) ? row.units : []
    const unitRow = (primaryUnitId ? list.find((u) => Number(u?.id) === Number(primaryUnitId)) : null) || list[0]
    const prop = unitRow?.property
    return safeStr(prop?.unit_code || prop?.name || prop?.title || '')
  }

  const resolveOptionValue = (options, input) => {
    const raw = String(input ?? '').trim()
    if (!raw) return ''
    const rawLower = raw.toLowerCase()
    const list = Array.isArray(options) ? options : []

    const byValue = list.find((o) => String(o?.value ?? '').trim() === raw)
    if (byValue?.value) return String(byValue.value)

    const byLabel = list.find((o) => String(o?.label ?? '').trim().toLowerCase() === rawLower)
    if (byLabel?.value) return String(byLabel.value)

    return ''
  }

  const normalizeUnitKey = (v) => String(v ?? '').trim().toLowerCase().replace(/[\s\-_]+/g, '')

  const resolveUnitPropertyId = (unitInput, projectIdValue) => {
    const raw = String(unitInput ?? '').trim()
    if (!raw) return { propertyId: null, error: '' }

    const list = Array.isArray(units) ? units : []
    const pid = String(projectIdValue ?? '').trim()
    const unitKey = normalizeUnitKey(raw)

    const pool = pid ? list.filter((u) => String(u?.project_id || '') === pid) : list

    const matchIn = (arr) => {
      const byId = arr.find((u) => String(u?.value ?? '').trim() === raw)
      if (byId?.value) return [byId]
      return arr.filter((u) => normalizeUnitKey(u?.label) === unitKey)
    }

    const matches = matchIn(pool)
    if (matches.length === 1) return { propertyId: Number(matches[0].value), error: '' }
    if (matches.length > 1) {
      return {
        propertyId: null,
        error: isArabic
          ? `اليونيت "${raw}" موجودة أكتر من مرة. برجاء تحديد المشروع/تأكيد رقم اليونيت.`
          : `Unit "${raw}" matches multiple units. Please specify Project / confirm the unit.`,
      }
    }

    if (pid) {
      return {
        propertyId: null,
        error: isArabic ? `لم يتم العثور على اليونيت "${raw}" داخل المشروع المحدد.` : `Unit "${raw}" was not found in the selected project.`,
      }
    }

    const globalMatches = matchIn(list)
    if (globalMatches.length === 1) return { propertyId: Number(globalMatches[0].value), error: '' }
    if (globalMatches.length > 1) {
      return {
        propertyId: null,
        error: isArabic ? `اليونيت "${raw}" موجودة في أكتر من مشروع. برجاء إدخال اسم المشروع.` : `Unit "${raw}" exists in multiple projects. Please provide Project.`,
      }
    }

    return { propertyId: null, error: isArabic ? `لم يتم العثور على اليونيت "${raw}".` : `Unit "${raw}" was not found.` }
  }

  const extractApiErrorMessage = (e) => {
    const data = e?.response?.data
    const msg = typeof data?.message === 'string' ? data.message : ''
    const errorsObj = data?.errors && typeof data.errors === 'object' ? data.errors : null

    if (errorsObj) {
      const firstKey = Object.keys(errorsObj)[0]
      const firstVal = firstKey ? errorsObj[firstKey] : null
      if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0])
      if (typeof firstVal === 'string' && firstVal.trim()) return firstVal.trim()
    }

    if (msg && msg !== 'The given data was invalid.') return msg
    if (typeof e?.message === 'string' && e.message.trim()) return e.message.trim()
    return isArabic ? 'فشل الاستيراد' : 'Import failed'
  }

  const handleImport = async (rows) => {
    const list = Array.isArray(rows) ? rows : []
    let added = 0
    let failed = 0
    const errors = []

    for (const row of list) {
      const rowNo = row?.__rowNumber ?? ''
      const name = String(row?.name ?? '').trim()
      const phone = String(row?.phone ?? '').trim()
      if (!name || !phone) {
        failed += 1
        errors.push(isArabic ? `صف ${rowNo}: الاسم والهاتف مطلوبين` : `Row ${rowNo}: name and phone are required`)
        continue
      }

      const project_id = resolveOptionValue(projects, row?.project)
      const sales_owner_id = resolveOptionValue(salesOwners, row?.sales_person)
      const unitInput = String(row?.unit ?? '').trim()

      let property_id = null
      if (unitInput) {
        const resolved = resolveUnitPropertyId(unitInput, project_id)
        if (resolved?.error) {
          failed += 1
          errors.push(isArabic ? `صف ${rowNo}: ${resolved.error}` : `Row ${rowNo}: ${resolved.error}`)
          continue
        }
        property_id = resolved?.propertyId ?? null
      }

      const payload = {
        name,
        phone,
        email: String(row?.email ?? '').trim(),
        source: String(row?.source ?? '').trim(),
        project_id: project_id ? Number(project_id) : null,
        property_id: property_id != null ? Number(property_id) : null,
        sales_owner_id: sales_owner_id ? Number(sales_owner_id) : null,
        last_comments: String(row?.last_comments ?? '').trim(),
      }

      try {
        await api.post('/api/cc/customers', payload)
        added += 1
      } catch (e) {
        failed += 1
        const msg = extractApiErrorMessage(e)
        errors.push(isArabic ? `صف ${rowNo}: ${msg}` : `Row ${rowNo}: ${msg}`)
      }
    }

    await load(1)
    return { added, failed, errors }
  }

  const openCreate = () => {
    setEditId(null)
    setCreateForm({
      name: '',
      phone: '',
      email: '',
      source: '',
      project_id: projectId || '',
      property_id: '',
      sales_owner_id: salesOwnerId || '',
      last_comments: '',
    })
    setCreateOpen(true)
  }

  const openEdit = (row) => {
    if (!row?.id) return
    const meta = row?.meta_data || {}
    const primaryUnitId = meta?.primary_customer_unit_id
    const unitRow =
      (primaryUnitId && Array.isArray(row?.units) ? row.units.find((u) => Number(u?.id) === Number(primaryUnitId)) : null) ||
      (Array.isArray(row?.units) ? row.units[0] : null)

    setEditId(row.id)
    setCreateForm({
      name: safeStr(row?.name),
      phone: safeStr(row?.phone),
      email: safeStr(row?.email),
      source: safeStr(row?.source),
      project_id: safeStr(row?.project_id),
      property_id: safeStr(unitRow?.property_id || unitRow?.property?.id),
      sales_owner_id: safeStr(row?.sales_owner_id),
      last_comments: safeStr(row?.last_comments),
    })
    setCreateOpen(true)
  }

  const setCreateField = (key, value) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }))
  }

  const submitCreate = async () => {
    const payload = {
      ...createForm,
      project_id: createForm.project_id ? Number(createForm.project_id) : null,
      property_id: createForm.property_id ? Number(createForm.property_id) : null,
      sales_owner_id: createForm.sales_owner_id ? Number(createForm.sales_owner_id) : null,
    }
    if (!String(payload.name || '').trim()) return
    setCreateLoading(true)
    try {
      if (editId) {
        await api.put(`/api/cc/customers/${encodeURIComponent(editId)}`, payload)
      } else {
        await api.post('/api/cc/customers', payload)
      }
      setCreateOpen(false)
      await load(1)
    } catch {
    } finally {
      setCreateLoading(false)
    }
  }

  const onDelete = async (row) => {
    if (!canDelete) return
    const ok = window.confirm(isArabic ? 'تأكيد حذف العميل؟' : 'Delete this customer?')
    if (!ok) return
    try {
      await api.delete(`/api/cc/customers/${encodeURIComponent(row.id)}`)
      if (activeCustomer?.id === row.id) setActiveCustomer(null)
      await load(pageMeta.current_page || 1)
    } catch {}
  }

  const submitComment = async () => {
    const customerId = activeCustomer?.id
    const text = commentText.trim()
    if (!customerId || !text) return
    try {
      await api.post(`/api/cc/customers/${encodeURIComponent(customerId)}/comments`, { comment: text })
      setCommentText('')
      await loadComments(customerId)
    } catch {}
  }

  const downloadJson = (fileName, data) => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {}
  }

  const exportCustomerSnapshot = () => {
    if (!activeCustomer?.id) return
    const fileName = `cc_customer_${activeCustomer.id}.json`
    downloadJson(fileName, {
      customer: activeCustomer,
      totals: activeTotals,
      selected_unit_id: selectedUnitId,
      exported_at: new Date().toISOString(),
    })
  }

  const printCustomerView = () => {
    if (!activeCustomer?.id) return
    const prop = selectedUnitProp
    const plan = selectedPlan
    const planMeta = plan?.meta_data || {}

    const blocks = [
      {
        title: isArabic ? 'تفاصيل' : 'Details',
        rows: [
          { label: isArabic ? 'اسم العميل' : 'Client Name', value: safeStr(activeCustomer.name) },
          { label: isArabic ? 'الموبايل' : 'Phone', value: safeStr(activeCustomer.phone) },
          { label: isArabic ? 'المشروع' : 'Project', value: safeStr(activeCustomer.project?.name || activeCustomer.project_id) },
          { label: isArabic ? 'الوحدة' : 'Unit', value: titleFromProperty(prop) },
          { label: isArabic ? 'تاريخ الصفقة' : 'Deal Date', value: safeStr(activeCustomer.contracts?.[0]?.contract_date || '') },
        ],
      },
      {
        title: isArabic ? 'خطة الدفع' : 'Payment Plan',
        rows: [
          { label: isArabic ? 'الحجز' : 'Reservation Amount', value: formatMoney(plan?.reservation_amount) },
          { label: isArabic ? 'المقدم' : 'Down Payment', value: formatMoney(plan?.down_payment) },
          { label: isArabic ? 'التسليم' : 'Delivery Payment', value: formatMoney(plan?.delivery_payment) },
          { label: isArabic ? 'نوع القسط' : 'Installment Type', value: safeStr(normalizeInstallmentType(plan?.installment_type)) },
          { label: isArabic ? 'عدد الأقساط' : 'Installment Count', value: safeStr(plan?.installment_count) },
          { label: isArabic ? 'قيمة القسط' : 'Installment Value', value: formatMoney(plan?.installment_value) },
          { label: isArabic ? 'سنوات' : 'Years', value: safeStr(planMeta?.years ?? '') },
          { label: isArabic ? 'مصروفات صيانة' : 'Maintenance', value: planMeta?.maintenance != null ? formatMoney(planMeta.maintenance) : safeStr(planMeta?.maintenance ?? '') },
          { label: isArabic ? 'مدفوعات إضافية' : 'Additional Payments', value: planMeta?.additional_payments != null ? formatMoney(planMeta.additional_payments) : safeStr(planMeta?.additional_payments ?? '') },
        ].filter((r) => String(r.value ?? '').trim() !== ''),
      },
    ]

    openPrintWindow({
      title: `${formatCustomerId(activeCustomer.id)} • ${safeStr(activeCustomer.name)}`,
      blocks,
      dir: isRTL ? 'rtl' : 'ltr',
    })
  }

  const openConvert = () => {
    if (!activeCustomer?.id) return
    if (!selectedUnit?.id || !selectedUnitProp?.id) return
    if (!selectedPlan) {
      alert(isArabic ? 'لا يمكن التحويل بدون خطة دفع نشطة' : 'Cannot convert without an active payment plan')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    setConvertForm({ contract_number: '', contract_date: today, first_due_date: today, total_price: '' })
    setConvertOpen(true)
  }

  const submitConvert = async () => {
    if (!activeCustomer?.id) return
    if (!selectedUnitProp?.id) return
    if (!selectedPlan) return

    const raw = String(convertForm.total_price || '').replace(/,/g, '').trim()
    const total_price = raw ? Number(raw) : undefined

    const payload = {
      customer_id: Number(activeCustomer.id),
      property_id: Number(selectedUnitProp.id),
      contract_number: String(convertForm.contract_number || '').trim() || undefined,
      contract_date: String(convertForm.contract_date || '').trim() || undefined,
      first_due_date: String(convertForm.first_due_date || '').trim() || undefined,
      total_price: Number.isFinite(total_price) ? total_price : undefined,
    }

    setConvertLoading(true)
    try {
      await api.post('/api/cc/contracts', payload)
      setConvertOpen(false)
      await loadDetails(activeCustomer.id)
      setActiveTab('details')
    } catch (e) {
      const msg = e?.response?.data?.message || (isArabic ? 'فشل التحويل' : 'Convert failed')
      alert(msg)
    } finally {
      setConvertLoading(false)
    }
  }

  const activeUnits = useMemo(() => {
    const list = activeCustomer?.units
    return Array.isArray(list) ? list : []
  }, [activeCustomer])

  const primaryUnitId = useMemo(() => {
    const meta = activeCustomer?.meta_data
    const id = meta?.primary_customer_unit_id
    const n = Number(id)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [activeCustomer?.meta_data])

  useEffect(() => {
    if (!previewOpen) return
    if (!activeCustomer?.id) return
    const list = Array.isArray(activeCustomer?.units) ? activeCustomer.units : []
    const fallbackId = list[0]?.id ? Number(list[0].id) : null
    const nextUnitId = Number(selectedUnitId) > 0 ? Number(selectedUnitId) : (primaryUnitId || fallbackId || null)
    if (nextUnitId && nextUnitId !== selectedUnitId) setSelectedUnitId(nextUnitId)

    const contracts = Array.isArray(activeCustomer?.contracts) ? activeCustomer.contracts : []
    const nextContractId = contracts[0]?.id ? Number(contracts[0].id) : null
    if (!selectedContractId && nextContractId) setSelectedContractId(nextContractId)
  }, [previewOpen, activeCustomer?.id, activeCustomer?.units, activeCustomer?.contracts, primaryUnitId, selectedUnitId, selectedContractId])

  const selectedUnit = useMemo(() => {
    const id = Number(selectedUnitId)
    if (!Number.isFinite(id) || id <= 0) return null
    return activeUnits.find((u) => Number(u?.id) === id) || null
  }, [activeUnits, selectedUnitId])

  const selectedUnitProp = selectedUnit?.property || null
  const selectedPlan = selectedUnit?.active_payment_plan || selectedUnit?.activePaymentPlan || null

  if (!isRealEstate) {
    return (
      <div className="p-6">
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-theme-text dark:text-gray-100">{isArabic ? 'غير متاح' : 'Not available'}</h2>
          <p className={`text-sm mt-2 ${mutedTextClass}`}>
            {isArabic ? 'هذا الموديول متاح فقط لشركات Real Estate.' : 'This module is available only for Real Estate tenants.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 text-theme-text dark:text-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header (System UX) */}
      <div className="rounded-xl p-4 md:p-6 relative">
        <div className="flex flex-wrap lg:flex-row lg:items-center justify-between gap-4">
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-start gap-3">
            <div className="relative flex flex-col items-start gap-1">
              <h1 className={`text-xl md:text-2xl font-bold text-start ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
                {title}
                <span className={`text-sm font-normal ${isLight ? 'text-black' : 'text-white'} bg-[var(--muted-bg)] px-2 py-1 rounded-full flex items-center justify-center`}>
                  {loading ? (isArabic ? '...' : '...') : pageMeta.total || 0}
                </span>
              </h1>
              <span aria-hidden="true" className="inline-block h-[2px] w-full rounded bg-gradient-to-r from-blue-500 to-purple-600" />
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-wrap lg:flex-row items-stretch lg:items-center gap-2 lg:gap-3">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="btn btn-sm w-full lg:w-auto bg-blue-600 hover:bg-blue-700 !text-white border-none flex items-center justify-center gap-2"
            >
              <FaFileImport />
              {isArabic ? 'استيراد' : 'Import'}
            </button>

            <button
              type="button"
              onClick={openCreate}
              className="btn btn-sm w-full lg:w-auto bg-green-600 hover:bg-green-700 !text-white border-none flex items-center justify-center gap-2"
            >
              <FaPlus />
              {isArabic ? 'إضافة عميل' : 'Add Customer'}
            </button>
          </div>
        </div>
      </div>

      {/* Filter (System UX) */}
      <div className="glass-panel p-4 rounded-xl">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-theme-text">
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
              className="px-3 py-1.5 text-sm text-theme-text hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
                placeholder={isArabic ? 'بحث بالاسم / الموبايل / الإيميل' : 'Search by name / phone / email'}
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
              isRTL={isArabic}
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
              isRTL={isArabic}
              multiple={false}
            />
          </div>

          {showAllFilters ? (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'المصدر' : 'Source'}</label>
              <input value="" readOnly placeholder={isArabic ? 'قريبًا' : 'Coming soon'} className="input w-full opacity-70 cursor-not-allowed" />
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* List */}
        <div className="glass-panel rounded-2xl overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden p-4 space-y-3">
            {items.length === 0 && !loading ? (
              <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا يوجد بيانات' : 'No data'}</div>
            ) : (
              items.map((row) => {
                const selected = selectedIds.includes(row.id)
                const projectName = row?.project?.name || row?.project_name || safeStr(row.project_id || '')
                const salesOwnerName = row?.sales_owner?.name || row?.salesOwner?.name || row?.sales_owner_name || safeStr(row.sales_owner_id || '')
                return (
                  <div key={row.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-[var(--content-bg)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-xs ${mutedTextClass}`}>{formatCustomerId(row.id)}</div>
                        <div className="text-base font-semibold truncate">{safeStr(row.name)}</div>
                        <div className={`text-sm ${mutedTextClass}`} dir="ltr">{safeStr(row.phone)}</div>
                      </div>
                      <input type="checkbox" checked={selected} onChange={() => toggleOne(row.id)} />
                    </div>

                    <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${mutedTextClass}`}>
                      <div className="truncate">{isArabic ? 'المصدر' : 'Source'}: {safeStr(row.source)}</div>
                      <div className="truncate">{isArabic ? 'المشروع' : 'Project'}: {safeStr(projectName)}</div>
                      <div className="truncate">{isArabic ? 'رقم الوحدة' : 'Unit'}: {getUnitLabelForRow(row) || '-'}</div>
                      <div className="truncate">{isArabic ? 'المبيعات' : 'Sales'}: {safeStr(salesOwnerName)}</div>
                      <div className="truncate">{isArabic ? 'آخر تعليق' : 'Last'}: {safeStr(row.last_comments)}</div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button type="button" onClick={() => onPreview(row)} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title={isArabic ? 'عرض' : 'Preview'}>
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" disabled={!canEdit} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50" title={isArabic ? 'تعديل' : 'Edit'}>
                        <Pencil className="w-4 h-4" onClick={() => openEdit(row)} />
                      </button>
                      <button type="button" onClick={() => onDelete(row)} disabled={!canDelete} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 disabled:opacity-50" title={isArabic ? 'حذف' : 'Delete'}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="sticky top-0 bg-[var(--content-bg)] border-b border-gray-200 dark:border-gray-800">
                <tr className={`text-xs uppercase tracking-wide ${mutedTextClass}`}>
                  <th className="p-3 text-left w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th className="p-3 text-left">{isArabic ? 'كود العميل' : 'Customer ID'}</th>
                  <th className="p-3 text-left">{isArabic ? 'اسم العميل' : 'Customer Name'}</th>
                  <th className="p-3 text-left">{isArabic ? 'الموبايل' : 'Phone'}</th>
                  <th className="p-3 text-left">{isArabic ? 'المصدر' : 'Source'}</th>
                  <th className="p-3 text-left">{isArabic ? 'المشروع' : 'Project'}</th>
                  <th className="p-3 text-left">{isArabic ? 'رقم الوحدة' : 'Unit'}</th>
                  <th className="p-3 text-left">{isArabic ? 'مندوب المبيعات' : 'Sales Person'}</th>
                  <th className="p-3 text-left">{isArabic ? 'آخر تعليق' : 'Last Comment'}</th>
                  <th className="p-3 text-right w-32">{isArabic ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className={`p-6 text-center ${mutedTextClass}`}>
                      {isArabic ? 'لا يوجد بيانات' : 'No data'}
                    </td>
                  </tr>
                )}
                {items.map((row) => {
                  const selected = selectedIds.includes(row.id)
                  const projectName = row?.project?.name || row?.project_name || safeStr(row.project_id || '')
                  const salesOwnerName = row?.sales_owner?.name || row?.salesOwner?.name || row?.sales_owner_name || safeStr(row.sales_owner_id || '')
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                      onClick={() => onPreview(row)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => toggleOne(row.id)} />
                      </td>
                      <td className="p-3 font-medium">{formatCustomerId(row.id)}</td>
                      <td className="p-3">{safeStr(row.name)}</td>
                      <td className="p-3" dir="ltr">{safeStr(row.phone)}</td>
                      <td className="p-3">{safeStr(row.source)}</td>
                      <td className="p-3">{safeStr(projectName)}</td>
                      <td className="p-3">{getUnitLabelForRow(row) || '-'}</td>
                      <td className="p-3">{safeStr(salesOwnerName)}</td>
                      <td className="p-3 max-w-[220px] truncate">{safeStr(row.last_comments)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onPreview(row)}
                            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                            title={isArabic ? 'عرض' : 'Preview'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                            title={isArabic ? 'تعديل' : 'Edit'}
                          >
                            <Pencil className="w-4 h-4" onClick={() => openEdit(row)} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(row)}
                            disabled={!canDelete}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 disabled:opacity-50"
                            title={isArabic ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination (legacy) */}
          <div className="hidden">
            <div className={`text-xs ${mutedTextClass}`}>
              {isArabic ? 'الصفحة' : 'Page'} {pageMeta.current_page} / {pageMeta.last_page}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => load(Math.max(1, (pageMeta.current_page || 1) - 1))}
                disabled={(pageMeta.current_page || 1) <= 1 || loading}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-800 disabled:opacity-50"
              >
                {isArabic ? 'السابق' : 'Prev'}
              </button>
              <button
                type="button"
                onClick={() => load(Math.min(pageMeta.last_page || 1, (pageMeta.current_page || 1) + 1))}
                disabled={(pageMeta.current_page || 1) >= (pageMeta.last_page || 1) || loading}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-800 disabled:opacity-50"
              >
                {isArabic ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>

          {/* Pagination Footer */}
          {pageMeta.total > 0 && (
            <div className="p-2 border-t border-gray-200 dark:border-gray-800">
              <div className="flex flex-wrap items-center justify-between rounded-xl p-2 glass-panel gap-4">
                <div className="text-xs text-[var(--muted-text)]">
                  {(() => {
                    const cur = Number(pageMeta.current_page || 1)
                    const total = Number(pageMeta.total || 0)
                    const from = total ? (cur - 1) * perPage + 1 : 0
                    const to = total ? Math.min(cur * perPage, total) : 0
                    return isArabic ? `Ø¹Ø±Ø¶ ${from}-${to} Ù…Ù† ${total}` : `Showing ${from}-${to} of ${total}`
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => load(Math.max(1, Number(pageMeta.current_page || 1) - 1))}
                      disabled={loading || Number(pageMeta.current_page || 1) <= 1}
                      title={isArabic ? 'Ø§Ù„Ø³Ø§Ø¨Ù‚' : 'Prev'}
                    >
                      <FaChevronLeft className={isRTL ? 'scale-x-[-1]' : ''} />
                    </button>
                    <span className="text-sm whitespace-nowrap">
                      {isArabic
                        ? `Ø§Ù„ØµÙØ­Ø© ${pageMeta.current_page} Ù…Ù† ${pageMeta.last_page}`
                        : `Page ${pageMeta.current_page} of ${pageMeta.last_page}`}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => load(Math.min(Number(pageMeta.last_page || 1), Number(pageMeta.current_page || 1) + 1))}
                      disabled={loading || Number(pageMeta.current_page || 1) >= Number(pageMeta.last_page || 1)}
                      title={isArabic ? 'Ø§Ù„ØªØ§Ù„ÙŠ' : 'Next'}
                    >
                      <FaChevronRight className={isRTL ? 'scale-x-[-1]' : ''} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--muted-text)] whitespace-nowrap">{isArabic ? 'Ù„ÙƒÙ„ ØµÙØ­Ø©:' : 'Per page:'}</span>
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
            </div>
          )}
        </div>

        {/* Preview modal */}
        <ModalShell
          open={previewOpen}
          title={activeCustomer ? `${formatCustomerId(activeCustomer.id)} • ${safeStr(activeCustomer.name)}` : isArabic ? 'عرض العميل' : 'Customer Preview'}
          onClose={() => {
            setPreviewOpen(false)
            setActiveCustomer(null)
            setActiveTotals(null)
            setActiveTab('details')
            setComments([])
            setCommentText('')
            setSelectedUnitId(null)
            setSelectedContractId(null)
            setContractAttachments([])
            setConvertOpen(false)
          }}
          widthClass="max-w-6xl"
        >
          {!activeCustomer ? (
            <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
              <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-xs ${mutedTextClass}`}>{formatCustomerId(activeCustomer.id)}</div>
                  <div className="text-lg font-semibold truncate">{safeStr(activeCustomer.name)}</div>
                  <div className={`text-sm ${mutedTextClass}`} dir="ltr">{safeStr(activeCustomer.phone)}</div>
                </div>
                <div className={`text-right text-xs ${mutedTextClass}`}>
                  {safeStr(activeCustomer.source)}
                </div>
              </div>

              <div className="hidden">
                <TabButton active={activeTab === 'details'} onClick={() => setActiveTab('details')}>
                  {isArabic ? 'تفاصيل' : 'Details'}
                </TabButton>
                <TabButton active={activeTab === 'comments'} onClick={() => setActiveTab('comments')}>
                  <span className="inline-flex items-center gap-2">
                    <MessageSquareText className="w-4 h-4" />
                    {isArabic ? 'تعليقات' : 'Comments'}
                  </span>
                </TabButton>
                <TabButton active={activeTab === 'attachments'} onClick={() => setActiveTab('attachments')}>
                  <span className="inline-flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    {isArabic ? 'مرفقات' : 'Attachments'}
                  </span>
                </TabButton>
              </div>

              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <div className="text-xs font-semibold mb-2">{isArabic ? 'Customer Info' : 'Customer Info'}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className={mutedTextClass}>{isArabic ? 'البريد' : 'Email'}</div>
                      <div className="truncate">{safeStr(activeCustomer.email)}</div>
                      <div className={mutedTextClass}>{isArabic ? 'المشروع' : 'Project'}</div>
                      <div className="truncate">{safeStr(activeCustomer.project?.name || activeCustomer.project_id)}</div>
                      <div className={mutedTextClass}>{isArabic ? 'مندوب المبيعات' : 'Sales Person'}</div>
                      <div className="truncate">{safeStr(activeCustomer.sales_owner?.name || activeCustomer.salesOwner?.name || activeCustomer.sales_owner_id)}</div>
                      <div className={mutedTextClass}>{isArabic ? 'تاريخ الصفقة' : 'Deal Date'}</div>
                      <div className="truncate" dir="ltr">{safeStr(activeCustomer.contracts?.[0]?.contract_date || '')}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <div className="text-xs font-semibold mb-2">{isArabic ? 'Units' : 'Units'}</div>
                    {activeUnits.length === 0 ? (
                      <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد وحدات مرتبطة' : 'No linked units'}</div>
                    ) : (
                      <div className="space-y-3">
                        {activeUnits.map((u) => {
                          const prop = u.property || {}
                          const plan = u.active_payment_plan || u.activePaymentPlan || null
                          const unitTitle = prop.unit_code || prop.name || prop.title || `#${prop.id}`
                          return (
                            <div
                              key={u.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedUnitId(Number(u.id))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setSelectedUnitId(Number(u.id))
                                }
                              }}
                              className={`rounded-xl p-3 border transition ${
                                Number(u?.id) === Number(selectedUnitId)
                                  ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                                  : 'border-transparent bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium truncate">{safeStr(unitTitle)}</div>
                                <span className="text-xs px-2 py-1 rounded-full bg-gray-200/60 dark:bg-gray-800">
                                  {safeStr(u.status)}
                                </span>
                              </div>
                              <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${mutedTextClass}`}>
                                <div>{isArabic ? 'المشروع' : 'Project'}: {safeStr(activeCustomer.project?.name || prop.project_id || activeCustomer.project_id || '')}</div>
                                <div>{isArabic ? 'السعر' : 'Price'}: {formatMoney(prop.price)}</div>
                              </div>
                              <div className="mt-2 text-xs">
                                <div className="font-semibold mb-1">{isArabic ? 'Payment Plan' : 'Payment Plan'}</div>
                                {plan ? (
                                  <div className={`grid grid-cols-2 gap-2 ${mutedTextClass}`}>
                                    <div>{isArabic ? 'الحجز' : 'Reservation'}: {formatMoney(plan.reservation_amount)}</div>
                                    <div>{isArabic ? 'المقدم' : 'Down Payment'}: {formatMoney(plan.down_payment)}</div>
                                    <div>{isArabic ? 'التسليم' : 'Delivery'}: {formatMoney(plan.delivery_payment)}</div>
                                    <div>
                                      {isArabic ? 'الأقساط' : 'Installments'}: {safeStr(plan.installment_type)} × {safeStr(plan.installment_count)}
                                    </div>
                                  </div>
                                ) : (
                                  <div className={mutedTextClass}>{isArabic ? 'لا يوجد خطة دفع نشطة' : 'No active payment plan'}</div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <div className="text-xs font-semibold mb-2">{isArabic ? 'Add Comment' : 'Add Comment'}</div>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-[var(--content-bg)] p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={isArabic ? 'ملاحظة داخلية...' : 'Internal note...'}
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={submitComment}
                        disabled={!commentText.trim()}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm disabled:opacity-50"
                      >
                        {isArabic ? 'إضافة' : 'Add'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <div className="text-xs font-semibold mb-2">{isArabic ? 'Comments' : 'Comments'}</div>
                    {commentsLoading ? (
                      <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
                    ) : comments.length === 0 ? (
                      <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد تعليقات' : 'No comments'}</div>
                    ) : (
                      <div className="space-y-2">
                        {comments.map((c) => (
                          <div key={c.id} className="rounded-xl bg-black/5 dark:bg-white/5 p-3">
                            <div className={`text-xs ${mutedTextClass} flex items-center justify-between gap-2`}>
                              <span className="truncate">{safeStr(c.creator?.name || '')}</span>
                              <span dir="ltr">{safeStr(c.created_at || '')}</span>
                            </div>
                            <div className="text-sm mt-1 whitespace-pre-wrap">{safeStr(c.comment)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'attachments' && (
                <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--content-bg)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold">{isArabic ? 'المرفقات (العقود)' : 'Attachments (Contracts)'}</div>
                    <div className="flex items-center gap-2">
                      <select
                        className="input h-9 text-sm"
                        value={selectedContractId || ''}
                        onChange={(e) => setSelectedContractId(Number(e.target.value) || null)}
                      >
                        <option value="">{isArabic ? 'اختر عقد' : 'Select contract'}</option>
                        {(Array.isArray(activeCustomer.contracts) ? activeCustomer.contracts : []).map((c) => {
                          const label = c.contract_number ? `${c.contract_number}` : `#${c.id}`
                          const date = safeStr(c.contract_date || '')
                          return (
                            <option key={c.id} value={c.id}>
                              {label}{date ? ` • ${date}` : ''}
                            </option>
                          )
                        })}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => selectedContractId && loadContractAttachments(selectedContractId)}
                        disabled={!selectedContractId || attachmentsLoading}
                        title={isArabic ? 'تحديث' : 'Refresh'}
                      >
                        {attachmentsLoading ? '...' : '↻'}
                      </button>
                    </div>
                  </div>

                  {!selectedContractId ? (
                    <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا يوجد عقد محدد' : 'No contract selected'}</div>
                  ) : attachmentsLoading ? (
                    <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'جاري التحميل...' : 'Loading...'}</div>
                  ) : contractAttachments.length === 0 ? (
                    <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد مرفقات' : 'No attachments'}</div>
                  ) : (
                    <div className="space-y-2">
                      {contractAttachments.map((att) => {
                        const originalName = safeStr(att?.meta_data?.original_name || '')
                        const name = originalName || (att?.file_path ? String(att.file_path).split('/').pop() : `#${att.id}`)
                        const href = att?.file_path ? `/storage/${att.file_path}` : '#'
                        return (
                          <a
                            key={att.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:bg-black/5 dark:hover:bg-white/5"
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            title={name}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="truncate text-sm">{name}</span>
                            </span>
                            <span className={`text-xs ${mutedTextClass}`} dir="ltr">{safeStr(att?.created_at || '')}</span>
                          </a>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--content-bg)] p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`w-full px-3 py-2 rounded-xl text-sm border flex items-center justify-between gap-2 ${
                    activeTab === 'details'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-800 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    {isArabic ? 'تفاصيل' : 'Details'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('comments')}
                  className={`w-full px-3 py-2 rounded-xl text-sm border flex items-center justify-between gap-2 ${
                    activeTab === 'comments'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-800 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageSquareText className="w-4 h-4" />
                    {isArabic ? 'تعليقات' : 'Comments'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('attachments')}
                  className={`w-full px-3 py-2 rounded-xl text-sm border flex items-center justify-between gap-2 ${
                    activeTab === 'attachments'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-800 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    {isArabic ? 'مرفقات' : 'Attachments'}
                  </span>
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--content-bg)] p-3 space-y-2">
                <button
                  type="button"
                  onClick={openConvert}
                  disabled={
                    !activeCustomer?.id ||
                    !selectedUnitProp?.id ||
                    !selectedPlan ||
                    String(selectedUnit?.status || '').toLowerCase() === 'contracted'
                  }
                  className="w-full px-3 py-2 rounded-xl text-sm bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:hover:bg-green-600 flex items-center justify-between gap-2"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {isArabic ? 'تحويل لعقد' : 'Convert to Contract'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={exportCustomerSnapshot}
                  className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-800 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between gap-2"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileDown className="w-4 h-4" />
                    {isArabic ? 'تصدير' : 'Export'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={printCustomerView}
                  className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-800 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between gap-2"
                >
                  <span className="inline-flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    {isArabic ? 'طباعة' : 'Print'}
                  </span>
                </button>
              </div>

              {!selectedPlan ? (
                <div className={`text-xs ${mutedTextClass}`}>
                  {isArabic ? 'ملاحظة: التحويل لعقد يتطلب خطة دفع نشطة' : 'Note: conversion requires an active payment plan'}
                </div>
              ) : null}
            </div>
          </div>
          )}
        </ModalShell>

        {/* Convert to Contract */}
        <ModalShell
          open={convertOpen}
          title={isArabic ? 'تحويل إلى عقد' : 'Convert to Contract'}
          onClose={() => {
            if (convertLoading) return
            setConvertOpen(false)
          }}
          widthClass="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--content-bg)] p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'رقم العقد' : 'Contract Number'}</label>
                  <input
                    className="input w-full bg-[var(--content-bg)]"
                    value={convertForm.contract_number}
                    onChange={(e) => setConvertForm((p) => ({ ...p, contract_number: e.target.value }))}
                    placeholder={isArabic ? 'اختياري' : 'Optional'}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'إجمالي السعر' : 'Total Price'}</label>
                  <input
                    className="input w-full bg-[var(--content-bg)]"
                    value={convertForm.total_price}
                    onChange={(e) => setConvertForm((p) => ({ ...p, total_price: e.target.value }))}
                    placeholder={isArabic ? 'اختياري' : 'Optional'}
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'تاريخ العقد' : 'Contract Date'}</label>
                  <input
                    type="date"
                    className="input w-full bg-[var(--content-bg)]"
                    value={convertForm.contract_date}
                    onChange={(e) => setConvertForm((p) => ({ ...p, contract_date: e.target.value }))}
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'أول ميعاد قسط' : 'First Due Date'}</label>
                  <input
                    type="date"
                    className="input w-full bg-[var(--content-bg)]"
                    value={convertForm.first_due_date}
                    onChange={(e) => setConvertForm((p) => ({ ...p, first_due_date: e.target.value }))}
                    dir="ltr"
                  />
                </div>
              </div>

              <div className={`text-xs mt-3 ${mutedTextClass}`}>
                {isArabic ? 'سيتم إنشاء عقد للوحدة المحددة (ويتطلب وجود خطة دفع نشطة).' : 'This will create a contract for the selected unit (requires an active payment plan).'}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConvertOpen(false)}
                disabled={convertLoading}
              >
                {isArabic ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                className="btn bg-green-600 hover:bg-green-700 !text-white border-none"
                onClick={submitConvert}
                disabled={convertLoading}
              >
                {convertLoading ? (isArabic ? '...' : '...') : (isArabic ? 'تحويل' : 'Convert')}
              </button>
            </div>
          </div>
        </ModalShell>

        {/* Create */}
        <ModalShell
          open={createOpen}
          title={isArabic ? 'إضافة عميل' : 'Add Customer'}
          onClose={() => {
            if (createLoading) return
            setCreateOpen(false)
          }}
          widthClass="max-w-3xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'اسم العميل' : 'Customer Name'}</label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateField('name', e.target.value)}
                  className="input w-full bg-[var(--content-bg)]"
                  placeholder={isArabic ? 'اكتب اسم العميل' : 'Enter customer name'}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'الموبايل' : 'Phone'}</label>
                <input
                  value={createForm.phone}
                  onChange={(e) => setCreateField('phone', e.target.value)}
                  className="input w-full bg-[var(--content-bg)]"
                  placeholder={isArabic ? 'رقم الموبايل' : 'Phone number'}
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'البريد' : 'Email'}</label>
                <input
                  value={createForm.email}
                  onChange={(e) => setCreateField('email', e.target.value)}
                  className="input w-full bg-[var(--content-bg)]"
                  placeholder={isArabic ? 'البريد الإلكتروني' : 'Email'}
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'المصدر' : 'Source'}</label>
                <input
                  value={createForm.source}
                  onChange={(e) => setCreateField('source', e.target.value)}
                  className="input w-full bg-[var(--content-bg)]"
                  placeholder={isArabic ? 'مثال: Cold-Call' : 'e.g. Cold-Call'}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'المشروع' : 'Project'}</label>
                <SearchableSelect
                  options={projects}
                  value={createForm.project_id}
                  onChange={(v) => setCreateForm((prev) => ({ ...prev, project_id: v, property_id: '' }))}
                  placeholder={isArabic ? 'اختر المشروع' : 'Select Project'}
                  className="w-full"
                  isRTL={isArabic}
                  multiple={false}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'رقم الوحدة' : 'Unit Number'}</label>
                <SearchableSelect
                  options={filteredUnitOptions}
                  value={createForm.property_id}
                  onChange={(v) => setCreateField('property_id', v)}
                  placeholder={
                    createForm.project_id
                      ? (isArabic ? 'اختر الوحدة' : 'Select Unit')
                      : (isArabic ? 'اختر المشروع أولاً' : 'Select project first')
                  }
                  className="w-full"
                  isRTL={isArabic}
                  multiple={false}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'مندوب المبيعات' : 'Sales Person'}</label>
                <SearchableSelect
                  options={salesOwners}
                  value={createForm.sales_owner_id}
                  onChange={(v) => setCreateField('sales_owner_id', v)}
                  placeholder={isArabic ? 'اختر الموظف' : 'Select User'}
                  className="w-full"
                  isRTL={isArabic}
                  multiple={false}
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className={`text-xs font-medium ${mutedTextClass}`}>{isArabic ? 'آخر تعليق' : 'Last Comment'}</label>
                <textarea
                  value={createForm.last_comments}
                  onChange={(e) => setCreateField('last_comments', e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-[var(--content-bg)] p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={isArabic ? 'اكتب تعليق/ملاحظة' : 'Write a comment / note'}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={createLoading}
                className="btn btn-sm bg-[var(--muted-bg)] hover:bg-black/5 dark:hover:bg-white/5 border border-[var(--panel-border)] text-theme-text"
              >
                {isArabic ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={createLoading || !String(createForm.name || '').trim()}
                className="btn btn-sm bg-green-600 hover:bg-green-700 !text-white border-none disabled:opacity-50"
              >
                {createLoading ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : isArabic ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </ModalShell>

        {importOpen && (
          <CcCustomersImportModal
            onClose={() => setImportOpen(false)}
            onImport={handleImport}
            isRTL={isRTL}
          />
        )}
      </div>
    </div>
  )
}
