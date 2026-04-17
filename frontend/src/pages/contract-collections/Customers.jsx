import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Pencil, Trash2, Search, X, MessageSquareText, Paperclip } from 'lucide-react'
import { api } from '@utils/api'
import { useAppState } from '@shared/context/AppStateProvider'
import { useTheme } from '@shared/context/ThemeProvider'

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
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [selectedIds, setSelectedIds] = useState([])
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [activeTab, setActiveTab] = useState('details') // details | comments | attachments

  // Comments
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const commentsAbortRef = useRef(null)

  const canEdit = true
  const canDelete = (String(user?.role || '').toLowerCase().includes('admin') || !!user?.is_super_admin)

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (q.trim()) params.set('q', q.trim())

      const res = await api.get(`/api/cc/customers?${params.toString()}`)
      const data = res?.data || {}
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
  }, [q])

  const loadDetails = useCallback(async (customerId) => {
    try {
      const res = await api.get(`/api/cc/customers/${encodeURIComponent(customerId)}`)
      const payload = res?.data || {}
      setActiveCustomer(payload?.customer || null)
    } catch {
      setActiveCustomer(null)
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
    load(1)
  }, [isRealEstate, load])

  useEffect(() => {
    const t = setTimeout(() => load(1), 350)
    return () => clearTimeout(t)
  }, [q, load])

  useEffect(() => {
    if (!activeCustomer?.id) return
    if (activeTab === 'comments') loadComments(activeCustomer.id)
  }, [activeCustomer?.id, activeTab, loadComments])

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
    await loadDetails(row.id)
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

  const units = useMemo(() => {
    const list = activeCustomer?.units
    return Array.isArray(list) ? list : []
  }, [activeCustomer])

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
    <div className="p-6 space-y-4 text-theme-text dark:text-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-theme-text dark:text-gray-100">{title}</h1>
          <span className={`text-sm ${mutedTextClass}`}>
            {loading ? (isArabic ? 'جاري التحميل...' : 'Loading...') : `${pageMeta.total || 0}`}
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-[420px]">
          <div className="flex-1 relative">
            <Search className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-gray-400`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isArabic ? 'بحث بالاسم / الموبايل / الإيميل' : 'Search by name / phone / email'}
              className={`w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-[var(--content-bg)] px-10 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
                isRTL ? 'pr-10' : 'pl-10'
              }`}
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-4">
        {/* List */}
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-auto">
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
                  <th className="p-3 text-left">{isArabic ? 'مندوب المبيعات' : 'Sales Person'}</th>
                  <th className="p-3 text-left">{isArabic ? 'آخر تعليق' : 'Last Comment'}</th>
                  <th className="p-3 text-right w-32">{isArabic ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className={`p-6 text-center ${mutedTextClass}`}>
                      {isArabic ? 'لا يوجد بيانات' : 'No data'}
                    </td>
                  </tr>
                )}
                {items.map((row) => {
                  const selected = selectedIds.includes(row.id)
                  const isActive = activeCustomer?.id === row.id
                  const projectName = row?.project?.name || row?.project_name || safeStr(row.project_id || '')
                  const salesOwnerName = row?.sales_owner?.name || row?.salesOwner?.name || row?.sales_owner_name || safeStr(row.sales_owner_id || '')
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-black/5 dark:hover:bg-white/5 ${isActive ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''}`}
                      onClick={() => onPreview(row)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => toggleOne(row.id)} />
                      </td>
                      <td className="p-3 font-medium">{formatCustomerId(row.id)}</td>
                      <td className="p-3">{safeStr(row.name)}</td>
                      <td className="p-3">{safeStr(row.phone)}</td>
                      <td className="p-3">{safeStr(row.source)}</td>
                      <td className="p-3">{safeStr(projectName)}</td>
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
                            <Pencil className="w-4 h-4" />
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

          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-800">
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
        </div>

        {/* Details */}
        <div className="glass-panel rounded-2xl p-4">
          {!activeCustomer ? (
            <div className={`text-sm ${mutedTextClass}`}>
              {isArabic ? 'اختر عميل لعرض التفاصيل.' : 'Select a customer to view details.'}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-xs ${mutedTextClass}`}>{formatCustomerId(activeCustomer.id)}</div>
                  <div className="text-lg font-semibold truncate">{safeStr(activeCustomer.name)}</div>
                  <div className={`text-sm ${mutedTextClass}`}>{safeStr(activeCustomer.phone)}</div>
                </div>
                <div className={`text-right text-xs ${mutedTextClass}`}>
                  {safeStr(activeCustomer.source)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
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
                    {units.length === 0 ? (
                      <div className={`text-sm ${mutedTextClass}`}>{isArabic ? 'لا توجد وحدات مرتبطة' : 'No linked units'}</div>
                    ) : (
                      <div className="space-y-3">
                        {units.map((u) => {
                          const prop = u.property || {}
                          const plan = u.active_payment_plan || u.activePaymentPlan || null
                          const unitTitle = prop.unit_code || prop.name || prop.title || `#${prop.id}`
                          return (
                            <div key={u.id} className="rounded-xl bg-black/5 dark:bg-white/5 p-3">
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
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="text-xs font-semibold mb-2">{isArabic ? 'Attachments' : 'Attachments'}</div>
                  <div className={`text-sm ${mutedTextClass}`}>
                    {isArabic ? 'قريبًا: رفع وعرض المرفقات.' : 'Coming soon: upload and view attachments.'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
