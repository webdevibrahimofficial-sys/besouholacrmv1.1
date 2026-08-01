import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactToPrint } from 'react-to-print'
import { FaChevronDown, FaDownload, FaFileExcel, FaFileImage, FaFileInvoiceDollar, FaPaperclip, FaPrint, FaTimes } from 'react-icons/fa'
import { useAppState } from '@shared/context/AppStateProvider'
import { extractTenantCompanyProfile } from '@shared/utils/tenantCompanyProfile'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../utils/api'

function SalesOrderPreviewModal({ isOpen, onClose, order, onCreateInvoice }) {
  const { i18n } = useTranslation()
  const isRTL = i18n.dir() === 'rtl'
  const { company, crmSettings } = useAppState()
  const { resolvedTheme } = useTheme()
  const printRef = useRef()
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [attachmentsError, setAttachmentsError] = useState('')
  const currencyCode = crmSettings?.defaultCurrency || crmSettings?.default_currency || 'EGP'
  const isDark = resolvedTheme === 'dark'

  const companyInfo = useMemo(() => extractTenantCompanyProfile(company), [company])

  const normalizedOrder = useMemo(() => {
    if (!order) return null

    const items = Array.isArray(order.items) ? order.items : []
    const subtotal = Number(order.subtotal || order.total || 0)
    const discount = Number(order.discount || 0)
    const tax = Number(order.tax || 0)
    const total = Number(order.total || subtotal || 0)

    return {
      ...order,
      items,
      subtotal,
      discount,
      tax,
      total,
      orderNumber: order.orderNumber || order.order_number || order.id || 'SO-NEW',
      issueDate: order.createdAt || order.created_at || order.date || null,
      deliveryDate: order.deliveryDate || order.delivery_date || null,
      customerName: order.customerName || order.customer_name || (isRTL ? 'عميل غير محدد' : 'Unnamed customer'),
      customerAddress: order.customerAddress || order.customer_address || order.address || order.customer?.address || '',
      paymentTerms: order.paymentTerms || order.payment_terms || '',
      status: order.status || 'Draft',
      currency: currencyCode,
      notes: order.notes || '',
    }
  }, [currencyCode, isRTL, order])

  const formatBytes = (bytes) => {
    const n = Number(bytes || 0)
    if (!n) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let value = n
    let index = 0
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024
      index += 1
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
  }

  const iconForAttachment = (name = '', mime = '') => {
    const lowerName = String(name).toLowerCase()
    const lowerMime = String(mime).toLowerCase()
    if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) return { Icon: FaFileInvoiceDollar, tone: 'bg-red-100 text-red-600' }
    if (lowerMime.startsWith('image/') || lowerName.match(/\.(png|jpg|jpeg|gif|webp)$/)) return { Icon: FaFileImage, tone: 'bg-blue-100 text-blue-600' }
    if (lowerName.match(/\.(xls|xlsx|csv)$/)) return { Icon: FaFileExcel, tone: 'bg-emerald-100 text-emerald-600' }
    return { Icon: FaPaperclip, tone: 'bg-slate-100 text-slate-600' }
  }

  useEffect(() => {
    if (!showAttachments || !order?.id) return

    const loadAttachments = async () => {
      setAttachmentsLoading(true)
      setAttachmentsError('')
      try {
        const res = await api.get(`/api/sales-orders/${order.id}/attachments`)
        const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : [])
        setAttachments(list)
      } catch {
        setAttachments([])
        setAttachmentsError(isRTL ? 'فشل تحميل المرفقات' : 'Failed to load attachments')
      } finally {
        setAttachmentsLoading(false)
      }
    }

    loadAttachments()
  }, [isRTL, order?.id, showAttachments])

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SalesOrder-${normalizedOrder?.orderNumber || 'New'}`,
  })

  const formatDate = (dateString) => {
    if (!dateString) return isRTL ? 'غير محدد' : 'Not set'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return dateString
    return date.toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatMoney = (value, currency = normalizedOrder?.currency || currencyCode) => {
    const amount = Number(value || 0)
    const locale = isRTL ? 'ar-EG' : 'en-US'
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
  }

  const getItemQuantity = (item) => Number(item.quantity || item.qty || 0)

  const getItemDescription = (item) => {
    const parts = [
      String(item.name || item.title || item.description || '').trim(),
      String(item.type || '').trim(),
      String(item.category || '').trim(),
    ].filter(Boolean)

    if (!parts.length) return isRTL ? 'بند بدون وصف' : 'Unlabeled item'
    return parts[0]
  }

  const formatItemMeta = (item) => {
    const meta = [String(item.type || '').trim(), String(item.category || '').trim()].filter(Boolean)
    return meta.length ? `(${meta.join(', ')})` : ''
  }

  if (!isOpen || !normalizedOrder) return null

  const canCreateInvoice = onCreateInvoice && ['Confirmed', 'In Progress', 'Completed', 'Partially Invoiced'].includes(normalizedOrder.status)
  const modalShellClass = isDark
    ? 'relative z-[110] flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-slate-950 shadow-2xl print:h-auto print:max-w-none print:rounded-none print:border-0 print:shadow-none'
    : 'relative z-[110] flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl print:h-auto print:max-w-none print:rounded-none print:border-0 print:shadow-none'
  const modalHeaderClass = isDark
    ? 'modal-chrome no-print flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-6 py-4 backdrop-blur'
    : 'modal-chrome no-print flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur'
  const previewBackgroundClass = isDark
    ? 'print-scroll-reset flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_#1e293b,_#0f172a_42%,_#020617_100%)] p-4 sm:p-6'
    : 'print-scroll-reset flex-1 overflow-auto bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_38%,_#e2e8f0_100%)] p-4 sm:p-6'
  const pageClass = isDark
    ? 'preview-print-page relative overflow-hidden rounded-[32px] border border-slate-800 bg-slate-900 shadow-[0_28px_80px_rgba(2,6,23,0.55)]'
    : 'preview-print-page relative overflow-hidden rounded-[32px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]'
  const topSectionClass = isDark
    ? 'relative overflow-hidden border-b border-slate-800 px-8 pb-0 pt-5 text-slate-100 avoid-page-break'
    : 'relative overflow-hidden border-b border-slate-200 px-8 pb-0 pt-5 text-slate-900 avoid-page-break'
  const titleTextClass = isDark ? 'text-slate-100' : 'text-slate-900'
  const mainTextClass = isDark ? 'text-slate-200' : 'text-slate-800'
  const subtleTextClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const borderStrongClass = isDark ? 'border-slate-700' : 'border-slate-300'
  const borderSoftClass = isDark ? 'border-slate-800' : 'border-slate-200'
  const tableCardClass = isDark
    ? 'overflow-hidden rounded-[24px] border-2 border-slate-700 bg-slate-950/40'
    : 'overflow-hidden rounded-[24px] border-2 border-slate-300 bg-slate-50/55'
  const tableHeadRowClass = isDark
    ? 'border-b-2 border-slate-700 bg-slate-900 text-slate-300'
    : 'border-b-2 border-slate-300 bg-white text-slate-700'
  const itemRowClass = isDark
    ? 'border-t border-slate-700 align-top'
    : 'border-t border-slate-300 align-top'
  const summaryStrongRowClass = isDark
    ? 'border-t-2 border-slate-700 bg-slate-900/70'
    : 'border-t-2 border-slate-300 bg-white'
  const summaryRowClass = isDark
    ? 'border-t border-slate-700 bg-slate-900/45'
    : 'border-t border-slate-300 bg-white'
  const balanceRowClass = isDark
    ? 'border-t-2 border-slate-500 bg-slate-950'
    : 'border-t-2 border-slate-900 bg-slate-50'
  const footerClass = isDark
    ? 'print-footer border-t border-slate-800 px-8 py-4'
    : 'print-footer border-t border-slate-200 px-8 py-4'

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .preview-print-shell {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 0;
            box-shadow: none !important;
            background: white !important;
          }
          .preview-print-page {
            min-height: 297mm;
            padding: 14mm 14mm 28mm;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: 0 !important;
            background: white !important;
            color: #0f172a !important;
          }
          .preview-print-page,
          .preview-print-page * {
            color-scheme: light !important;
          }
          .print-light-page,
          .print-light-surface,
          .print-light-card,
          .print-light-row,
          .print-light-balance {
            background: white !important;
            background-image: none !important;
          }
          .print-light-text,
          .print-light-text * {
            color: #0f172a !important;
          }
          .print-light-muted,
          .print-light-muted * {
            color: #475569 !important;
          }
          .print-light-border {
            border-color: #cbd5e1 !important;
          }
          .print-footer {
            position: fixed;
            left: 14mm;
            right: 14mm;
            bottom: 10mm;
            background: white !important;
          }
          .fixed { position: static !important; inset: auto !important; background: transparent !important; }
          .modal-chrome { display: none !important; }
          .print-scroll-reset { overflow: visible !important; padding: 0 !important; background: white !important; }
          .preview-print-page .overflow-x-auto { overflow: visible !important; }
          .preview-print-page table {
            min-width: 0 !important;
            width: 100% !important;
            table-layout: fixed;
          }
          .preview-print-page th,
          .preview-print-page td {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          .avoid-page-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className={`absolute inset-0 no-print ${isDark ? 'bg-black/80' : 'bg-slate-950/70'} backdrop-blur-sm`} onClick={onClose} />

      {showAttachments ? (
        <div className="absolute inset-0 z-[2100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FaPaperclip className="text-sky-600" />
                <span>{isRTL ? 'المرفقات' : 'Attachments'}</span>
              </div>
              <button onClick={() => setShowAttachments(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <FaTimes />
              </button>
            </div>
            <div className="p-5">
              {attachmentsLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">{isRTL ? 'جاري تحميل المرفقات...' : 'Loading attachments...'}</div>
              ) : attachmentsError ? (
                <div className="py-8 text-center text-sm text-rose-600">{attachmentsError}</div>
              ) : attachments.length ? (
                <div className="space-y-3">
                  {attachments.map((attachment) => {
                    const name = attachment?.name || attachment?.file_name || attachment?.filename || (isRTL ? 'ملف' : 'File')
                    const url = attachment?.url || attachment?.download_url || attachment?.path
                    const meta = [formatBytes(attachment?.size), attachment?.created_at ? new Date(attachment.created_at).toLocaleDateString() : ''].filter(Boolean).join(' • ')
                    const { Icon, tone } = iconForAttachment(name, attachment?.mime)

                    return (
                      <button
                        key={attachment?.id || name}
                        type="button"
                        onClick={() => url && window.open(url, '_blank')}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                            <Icon />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{name}</div>
                            {meta ? <div className="text-xs text-slate-500">{meta}</div> : null}
                          </div>
                        </div>
                        <FaDownload className="text-slate-400" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">{isRTL ? 'لا توجد مرفقات' : 'No attachments'}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className={modalShellClass}>
        <div className={modalHeaderClass}>
          <div>
            <h2 className={`text-lg font-semibold ${titleTextClass}`}>{isRTL ? 'معاينة طلب البيع' : 'Sales Order Preview'}</h2>
            <p className={`text-sm ${subtleTextClass}`}>
              {normalizedOrder.orderNumber} • {normalizedOrder.customerName}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canCreateInvoice ? (
              <div className="relative">
                <button
                  onClick={() => setShowInvoiceDropdown((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <FaFileInvoiceDollar />
                  <span>{isRTL ? 'إنشاء فاتورة' : 'Create Invoice'}</span>
                  <FaChevronDown className="text-[10px]" />
                </button>
                {showInvoiceDropdown ? (
                  <div className={`absolute top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${isRTL ? 'left-0' : 'right-0'}`}>
                    {[
                      { key: 'Full', label: isRTL ? 'فاتورة كاملة' : 'Full Invoice' },
                      { key: 'Partial', label: isRTL ? 'فاتورة جزئية' : 'Partial Invoice' },
                      { key: 'Advance', label: isRTL ? 'فاتورة دفعة مقدمة' : 'Advance Invoice' },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          onCreateInvoice(option.key)
                          setShowInvoiceDropdown(false)
                        }}
                        className={`block w-full border-b px-4 py-3 text-left text-sm font-medium transition last:border-b-0 ${isDark ? 'border-slate-800 text-slate-200 hover:bg-slate-800' : 'border-slate-100 text-slate-700 hover:bg-slate-50'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              onClick={() => setShowAttachments(true)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              <FaPaperclip />
              <span>{isRTL ? 'المرفقات' : 'Attachments'}</span>
            </button>
            <button
              onClick={handlePrint}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-900 hover:bg-slate-700'}`}
            >
              <FaPrint />
              <span>{isRTL ? 'طباعة / PDF' : 'Print / PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <div className={previewBackgroundClass}>
          <div ref={printRef} className="preview-print-shell mx-auto max-w-[210mm]">
            <div className={`${pageClass} print-light-page print-light-text`}>
              <div className={`${topSectionClass} print-light-surface print-light-text print-light-border`}>
                <div className="relative">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex flex-col items-start gap-3 print-light-text">
                      <div className="flex h-[72px] w-[96px] items-center justify-start overflow-hidden">
                        {companyInfo.logoUrl ? (
                          <img src={companyInfo.logoUrl} alt={companyInfo.name || 'Logo'} className="max-h-[68px] w-auto max-w-full object-contain object-left" />
                        ) : (
                          <div className={`text-xs font-semibold uppercase tracking-[0.3em] ${subtleTextClass}`}>
                            {companyInfo.name?.slice(0, 3) || 'CRM'}
                          </div>
                        )}
                      </div>
                      <div>
                        <h1 className={`text-[34px] font-semibold leading-none tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                          {companyInfo.name || (isRTL ? 'اسم الشركة' : 'Company Name')}
                        </h1>
                        {companyInfo.description ? (
                          <p className={`mt-0.5 max-w-xl text-xs ${isDark ? 'text-slate-400' : 'text-slate-700/90'}`}>{companyInfo.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className={`min-w-[260px] space-y-1 text-right text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'} print-light-text`}>
                      <div className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>{normalizedOrder.orderNumber}</div>
                      {companyInfo.phone ? <div className={`text-[13px] font-semibold ${mainTextClass}`}>{isRTL ? `${companyInfo.phone} :الهاتف` : `Phone: ${companyInfo.phone}`}</div> : null}
                      {companyInfo.taxId ? <div className={`text-[13px] font-semibold ${mainTextClass}`}>{isRTL ? `${companyInfo.taxId} :الرقم الضريبي` : `Tax ID: ${companyInfo.taxId}`}</div> : null}
                      {(companyInfo.addressLine1 || companyInfo.country || companyInfo.city) ? (
                        <div className={`text-[12px] font-medium ${subtleTextClass}`}>
                          {[companyInfo.addressLine1, companyInfo.country, companyInfo.city].filter(Boolean).join(', ')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className={`mt-5 border-t ${borderSoftClass} print-light-border`} />
                </div>
              </div>

              <div className="px-8 pb-4 pt-5 avoid-page-break">
                <div className={`border-y-2 px-3 py-4 ${borderStrongClass} print-light-surface print-light-border`}>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#d68a3c]">{isRTL ? 'العميل' : 'Customer'}</div>
                      <div className={`mt-1 text-[17px] font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {normalizedOrder.customerName}
                      </div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-[11px] font-semibold text-[#d68a3c]">{isRTL ? 'العنوان' : 'Address'}</div>
                      <div className={`mt-1 text-[16px] leading-7 ${mainTextClass}`}>
                        {normalizedOrder.customerAddress || (isRTL ? 'غير محدد' : 'Not specified')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-8 pb-7 avoid-page-break">
                <div className={`${tableCardClass} print-light-card print-light-border`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse">
                      <thead>
                        <tr className={`${tableHeadRowClass} print-light-row print-light-text print-light-border`}>
                          <th className="px-4 py-4 text-start text-xs font-semibold uppercase tracking-[0.24em]">#</th>
                          <th className="px-4 py-4 text-start text-xs font-semibold uppercase tracking-[0.24em]">
                            {isRTL ? 'الوصف' : 'Description'}
                          </th>
                          <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.24em]">
                            {isRTL ? 'الكمية' : 'Qty'}
                          </th>
                          <th className="px-4 py-4 text-end text-xs font-semibold uppercase tracking-[0.24em]">
                            {isRTL ? 'سعر الوحدة' : 'Unit Price'}
                          </th>
                          <th className="px-4 py-4 text-end text-xs font-semibold uppercase tracking-[0.24em]">
                            {isRTL ? 'الخصم' : 'Discount'}
                          </th>
                          <th className="px-4 py-4 text-end text-xs font-semibold uppercase tracking-[0.24em]">
                            {isRTL ? 'الإجمالي' : 'Line Total'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {normalizedOrder.items.length ? (
                          normalizedOrder.items.map((item, index) => {
                            const quantity = getItemQuantity(item)
                            const unitPrice = Number(item.price || item.unit_price || item.unitPrice || 0)
                            const discount = Number(item.discount || 0)
                            const lineTotal = (quantity * unitPrice) - discount

                            return (
                              <tr key={`${item.id || item.name || 'item'}-${index}`} className={`${itemRowClass} print-light-row print-light-text print-light-border`}>
                                <td className={`px-4 py-4 text-sm font-medium ${subtleTextClass}`}>{String(index + 1).padStart(2, '0')}</td>
                                <td className="px-4 py-4">
                                  <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{getItemDescription(item)}</div>
                                  {formatItemMeta(item) ? <div className={`mt-1 text-xs font-medium ${subtleTextClass}`}>{formatItemMeta(item)}</div> : null}
                                </td>
                                <td className={`px-4 py-4 text-center text-sm font-medium ${mainTextClass}`}>{quantity}</td>
                                <td className={`px-4 py-4 text-end text-sm font-medium ${mainTextClass}`}>{formatMoney(unitPrice)}</td>
                                <td className={`px-4 py-4 text-end text-sm font-medium ${mainTextClass}`}>{formatMoney(discount)}</td>
                                <td className={`px-4 py-4 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>{formatMoney(lineTotal)}</td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" className={`px-4 py-10 text-center text-sm ${subtleTextClass}`}>
                              {isRTL ? 'لا توجد بنود في طلب البيع' : 'No sales order items found'}
                            </td>
                          </tr>
                        )}
                        <tr className={`${summaryStrongRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'المجموع الفرعي' : 'Subtotal'}
                          </td>
                          <td colSpan="2" className={`px-4 py-3 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedOrder.subtotal)}
                          </td>
                        </tr>
                        <tr className={`${summaryRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'الخصم' : 'Discount'}
                          </td>
                          <td colSpan="2" className={`px-4 py-3 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedOrder.discount)}
                          </td>
                        </tr>
                        <tr className={`${summaryRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'الضريبة' : 'Tax'}
                          </td>
                          <td colSpan="2" className={`px-4 py-3 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedOrder.tax)}
                          </td>
                        </tr>
                        <tr className={`${balanceRowClass} print-light-balance print-light-text print-light-border`}>
                          <td colSpan="4" className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                            {isRTL ? 'الإجمالي' : 'Grand Total'}
                          </td>
                          <td colSpan="2" className={`px-4 py-4 text-end text-[17px] font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedOrder.total)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className={`${footerClass} print-light-surface print-light-border`}>
                <div className="flex flex-nowrap items-center justify-between gap-3 overflow-x-auto whitespace-nowrap text-[10px] text-slate-400 print-light-muted">
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{companyInfo.name || 'CRM'}</span>
                  <span>{new Date().getFullYear()} {isRTL ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</span>
                  <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {companyInfo.websiteUrl || (typeof window !== 'undefined' ? window.location.host : 'crm.local')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SalesOrderPreviewModal
