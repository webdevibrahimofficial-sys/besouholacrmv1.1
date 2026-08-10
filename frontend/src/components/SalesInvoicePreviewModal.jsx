import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactToPrint } from 'react-to-print'
import { FaPrint, FaTimes } from 'react-icons/fa'
import { useAppState } from '@shared/context/AppStateProvider'
import { extractTenantCompanyProfile } from '@shared/utils/tenantCompanyProfile'
import { useTheme } from '@shared/context/ThemeProvider'

const statusToneMap = {
  Draft: 'bg-sky-100 text-sky-800 border-sky-200',
  Posted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
}

const paymentToneMap = {
  Unpaid: 'bg-slate-100 text-slate-700 border-slate-200',
  Partial: 'bg-sky-100 text-sky-800 border-sky-200',
  Paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

function SalesInvoicePreviewModal({ isOpen, onClose, invoice }) {
  const { i18n } = useTranslation()
  const isRTL = i18n.dir() === 'rtl'
  const { company, crmSettings } = useAppState()
  const { resolvedTheme } = useTheme()
  const printRef = useRef()
  const currencyCode = crmSettings?.defaultCurrency || crmSettings?.default_currency || 'EGP'
  const isDark = resolvedTheme === 'dark'

  const companyInfo = useMemo(() => extractTenantCompanyProfile(company), [company])

  const normalizedInvoice = useMemo(() => {
    if (!invoice) return null

    const items = Array.isArray(invoice.items) ? invoice.items : []
    const total = Number(invoice.total || 0)
    const subtotal = Number(invoice.subtotal ?? total)
    const discount = Number(invoice.discountAmount ?? invoice.discount ?? 0)
    const tax = Number(invoice.tax ?? 0)
    const paidAmount = Number(invoice.paidAmount ?? invoice.paid_amount ?? 0)
    const advanceAppliedAmount = Number(invoice.advanceAppliedAmount ?? invoice.advance_applied_amount ?? 0)
    const balanceDue = Number(
      invoice.balanceDue ?? invoice.balance_due ?? Math.max(0, total - paidAmount - advanceAppliedAmount)
    )

    return {
      ...invoice,
      items,
      total,
      subtotal,
      discount,
      tax,
      paidAmount,
      advanceAppliedAmount,
      balanceDue: Math.max(0, balanceDue),
      invoiceNumber: invoice.invoiceNumber || invoice.invoice_number || `INV-${invoice.id ?? 'NEW'}`,
      issueDate: invoice.issueDate || invoice.issue_date || invoice.date || null,
      dueDate: invoice.dueDate || invoice.due_date || null,
      customerName: invoice.customerName || invoice.customer_name || (isRTL ? 'عميل غير محدد' : 'Unnamed customer'),
      customerAddress: invoice.customerAddress || invoice.customer_address || '',
      salesPerson: invoice.salesPerson || invoice.sales_person || '',
      status: invoice.status || 'Draft',
      paymentStatus: invoice.paymentStatus || invoice.payment_status || 'Unpaid',
      invoiceType: invoice.invoiceType || invoice.invoice_type || 'Full',
      paymentMethod: invoice.paymentMethod || invoice.payment_method || '',
      paymentTerms: invoice.paymentTerms || invoice.payment_terms || '',
      currency: currencyCode,
      notes: invoice.notes || '',
      orderReference: invoice.orderUuid || invoice.order?.uuid || invoice.orderId || invoice.order_id || '',
    }
  }, [currencyCode, invoice, isRTL])

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Invoice-${normalizedInvoice?.invoiceNumber || normalizedInvoice?.id || 'New'}`,
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

  const formatMoney = (value, currency = normalizedInvoice?.currency || currencyCode) => {
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
      return `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
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

  const getItemMeta = (item) => {
    return [String(item.type || '').trim(), String(item.category || '').trim()].filter(Boolean).join(' • ')
  }

  const formatItemMeta = (item) => {
    const meta = [String(item.type || '').trim(), String(item.category || '').trim()].filter(Boolean)
    return meta.length ? `(${meta.join(', ')})` : ''
  }

  if (!isOpen || !normalizedInvoice) return null

  const statusTone = statusToneMap[normalizedInvoice.status] || 'bg-slate-100 text-slate-700 border-slate-200'
  const paymentTone = paymentToneMap[normalizedInvoice.paymentStatus] || 'bg-slate-100 text-slate-700 border-slate-200'
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
    ? 'invoice-print-page relative overflow-hidden rounded-[32px] border border-slate-800 bg-slate-900 shadow-[0_28px_80px_rgba(2,6,23,0.55)]'
    : 'invoice-print-page relative overflow-hidden rounded-[32px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]'
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
          .invoice-print-shell {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 0;
            box-shadow: none !important;
            background: white !important;
          }
          .invoice-print-page {
            min-height: 297mm;
            padding: 14mm 14mm 28mm;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: 0 !important;
            background: white !important;
            color: #0f172a !important;
          }
          .invoice-print-page,
          .invoice-print-page * {
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
          .print-light-balance {
            border-top-color: #0f172a !important;
          }
          .invoice-print-page .bg-slate-950,
          .invoice-print-page .bg-slate-950\\/40,
          .invoice-print-page .bg-slate-900,
          .invoice-print-page .bg-slate-900\\/45,
          .invoice-print-page .bg-slate-900\\/70,
          .invoice-print-page .bg-slate-50,
          .invoice-print-page .bg-slate-50\\/55,
          .invoice-print-page .bg-slate-950\\/95,
          .invoice-print-page [class*="bg-slate-9"],
          .invoice-print-page [class*="bg-slate-8"] {
            background: white !important;
            background-image: none !important;
          }
          .invoice-print-page [class*="text-white"],
          .invoice-print-page [class*="text-slate-1"],
          .invoice-print-page [class*="text-slate-2"],
          .invoice-print-page [class*="text-slate-3"],
          .invoice-print-page [class*="text-slate-4"],
          .invoice-print-page [class*="text-slate-5"] {
            color: #0f172a !important;
          }
          .invoice-print-page [class*="border-slate-7"],
          .invoice-print-page [class*="border-slate-8"],
          .invoice-print-page [class*="border-slate-9"] {
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
          .invoice-print-page .overflow-x-auto {
            overflow: visible !important;
          }
          .invoice-print-page table {
            min-width: 0 !important;
            width: 100% !important;
            table-layout: fixed;
          }
          .invoice-print-page th,
          .invoice-print-page td {
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

      <div className={modalShellClass}>
        <div className={modalHeaderClass}>
          <div>
            <h2 className={`text-lg font-semibold ${titleTextClass}`}>{isRTL ? 'معاينة الفاتورة' : 'Invoice Preview'}</h2>
            <p className={`text-sm ${subtleTextClass}`}>
              {normalizedInvoice.invoiceNumber} • {normalizedInvoice.customerName}
            </p>
          </div>

          <div className="flex items-center gap-3">
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
          <div ref={printRef} className="invoice-print-shell mx-auto max-w-[210mm]">
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
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold">
                          <div>
                            <span className="hidden uppercase tracking-[0.24em] text-slate-700/70">
                              {isRTL ? 'فاتورة' : 'Invoice'}
                            </span>
                          </div>
                          <div>
                            <span className="hidden uppercase tracking-[0.24em] text-slate-700/70">
                              {isRTL ? 'تاريخ الإصدار' : 'Issue Date'}
                            </span>
                            <span className={isDark ? 'text-slate-300' : 'text-slate-800/90'}>{formatDate(normalizedInvoice.issueDate)}</span>
                          </div>
                        </div>
                        {companyInfo.description ? (
                          <p className={`mt-0.5 max-w-xl text-xs ${isDark ? 'text-slate-400' : 'text-slate-700/90'}`}>{companyInfo.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className={`min-w-[260px] space-y-1 text-right text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'} print-light-text`}>
                      <div className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>{normalizedInvoice.invoiceNumber}</div>
                      {companyInfo.addressLine1 ? <div className={`hidden font-medium ${mainTextClass}`}>{companyInfo.addressLine1}</div> : null}
                      {(companyInfo.country || companyInfo.city) ? (
                        <div className={`hidden text-[12px] font-medium ${subtleTextClass}`}>
                          {[companyInfo.country, companyInfo.city].filter(Boolean).join(', ')}
                        </div>
                      ) : null}
                      {companyInfo.phone ? <div className={`text-[13px] font-semibold ${mainTextClass}`}>{isRTL ? `${companyInfo.phone} :الهاتف` : `Phone: ${companyInfo.phone}`}</div> : null}
                      {companyInfo.taxId ? <div className={`text-[13px] font-semibold ${mainTextClass}`}>{isRTL ? `${companyInfo.taxId} :الرقم الضريبي` : `Tax ID: ${companyInfo.taxId}`}</div> : null}
                      {(companyInfo.addressLine1 || companyInfo.country || companyInfo.city) ? (
                        <div className={`text-[12px] font-medium ${subtleTextClass}`}>
                          {[companyInfo.addressLine1, companyInfo.country, companyInfo.city].filter(Boolean).join(', ')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="hidden mt-2 rounded-[20px] border border-white/55 bg-white/92 px-4 py-3 text-slate-950 shadow-[0_10px_25px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                    <div className="grid grid-cols-[minmax(110px,1.1fr)_minmax(95px,1fr)_minmax(95px,1fr)_minmax(80px,0.8fr)_minmax(85px,0.85fr)_auto] items-end gap-x-4 text-sm">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                          {isRTL ? 'فاتورة' : 'Invoice'}
                        </div>
                        <div className="mt-0.5 text-base font-semibold leading-none text-slate-950">{normalizedInvoice.invoiceNumber}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</div>
                        <div className="mt-0.5 font-semibold text-slate-950">{formatDate(normalizedInvoice.issueDate)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</div>
                        <div className="mt-0.5 font-semibold text-slate-950">{formatDate(normalizedInvoice.dueDate)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">{isRTL ? 'نوع الفاتورة' : 'Invoice Type'}</div>
                        <div className="mt-0.5 font-semibold text-slate-950">{normalizedInvoice.invoiceType}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">{isRTL ? 'طريقة الدفع' : 'Payment Method'}</div>
                        <div className="mt-0.5 font-semibold text-slate-950">{normalizedInvoice.paymentMethod || '-'}</div>
                      </div>
                      <div className="flex min-w-fit items-center justify-end self-center ps-2">
                        <div className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${paymentTone}`}>
                          {normalizedInvoice.paymentStatus}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={`mt-5 border-t ${borderSoftClass} print-light-border`} />
                </div>
              </div>

              <div className="hidden border-b border-slate-200/80 px-8 py-3 avoid-page-break">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-5 py-3">
                  <div className="flex items-center gap-8 text-sm">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {isRTL ? 'فاتورة' : 'Invoice'}
                      </div>
                      <div className="mt-0.5 text-base font-semibold leading-none text-slate-950">{normalizedInvoice.invoiceNumber}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {isRTL ? 'تاريخ الإصدار' : 'Issue Date'}
                      </div>
                      <div className="mt-0.5 font-semibold text-slate-950">{formatDate(normalizedInvoice.issueDate)}</div>
                    </div>
                  </div>
                  <div className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${paymentTone}`}>
                    {normalizedInvoice.paymentStatus}
                  </div>
                </div>
              </div>

              <div className="px-8 pb-4 pt-5 avoid-page-break">
                <div className="hidden rounded-[20px] border border-slate-200 bg-slate-50/70 px-5 py-3">
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-3 text-sm">
                    <div className="min-w-[220px] flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        {isRTL ? 'بيانات العميل' : 'Bill To'}
                      </div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{normalizedInvoice.customerName}</div>
                    </div>
                    <div className="min-w-[120px]">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{isRTL ? 'كود العميل' : 'Customer Code'}</div>
                      <div className="mt-1 font-medium text-slate-800">{normalizedInvoice.customerCode || '-'}</div>
                    </div>
                    <div className="min-w-[150px]">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{isRTL ? 'شروط السداد' : 'Payment Terms'}</div>
                      <div className="mt-1 font-medium text-slate-800">{normalizedInvoice.paymentTerms || (isRTL ? 'غير محددة' : 'Not specified')}</div>
                    </div>
                  </div>
                </div>
                <div className={`border-y-2 px-3 py-4 ${borderStrongClass} print-light-surface print-light-border`}>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#d68a3c]">
                        {isRTL ? 'العميل' : 'Customer'}
                      </div>
                      <div className={`mt-1 text-[17px] font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {normalizedInvoice.customerName}
                      </div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-[11px] font-semibold text-[#d68a3c]">
                        {isRTL ? 'العنوان' : 'Address'}
                      </div>
                      <div className={`mt-1 text-[16px] leading-7 ${mainTextClass}`}>
                        {normalizedInvoice.customerAddress || (isRTL ? 'غير محدد' : 'Not specified')}
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
                        {normalizedInvoice.items.length ? (
                          normalizedInvoice.items.map((item, index) => {
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
                              {isRTL ? 'لا توجد بنود في هذه الفاتورة' : 'No invoice items found'}
                            </td>
                          </tr>
                        )}
                        <tr className={`${summaryStrongRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'المجموع الفرعي' : 'Subtotal'}
                          </td>
                          <td colSpan="2" className={`px-4 py-3 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedInvoice.subtotal)}
                          </td>
                        </tr>
                        <tr className={`${summaryRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'الخصم' : 'Discount'}
                          </td>
                          <td colSpan="2" className={`px-4 py-3 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedInvoice.discount)}
                          </td>
                        </tr>
                        <tr className={`${summaryRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'الضريبة' : 'Tax'}
                          </td>
                          <td colSpan="2" className={`px-4 py-3 text-end text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedInvoice.tax)}
                          </td>
                        </tr>
                        <tr className={`${summaryRowClass} print-light-row print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                            {isRTL ? 'المدفوع' : 'Paid'}
                          </td>
                          <td colSpan="2" className="px-4 py-3 text-end text-sm font-semibold text-emerald-700">
                            {formatMoney(normalizedInvoice.paidAmount)}
                          </td>
                        </tr>
                        {normalizedInvoice.advanceAppliedAmount > 0 ? (
                          <tr className={`${summaryRowClass} print-light-row print-light-text print-light-border`}>
                            <td colSpan="4" className={`px-4 py-3 text-sm font-medium ${mainTextClass}`}>
                              {isRTL ? 'مقدم' : 'Advance'}
                            </td>
                            <td colSpan="2" className="px-4 py-3 text-end text-sm font-semibold text-sky-700">
                              {formatMoney(normalizedInvoice.advanceAppliedAmount)}
                            </td>
                          </tr>
                        ) : null}
                        <tr className={`${balanceRowClass} print-light-balance print-light-text print-light-border`}>
                          <td colSpan="4" className={`px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {isRTL ? 'المستحق الآن' : 'Balance Due'}
                          </td>
                          <td colSpan="2" className={`px-4 py-4 text-end text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {formatMoney(normalizedInvoice.balanceDue)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 px-8 pb-8">
                <div className="hidden avoid-page-break">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      {isRTL ? 'ملاحظات' : 'Notes'}
                    </div>
                    <div className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">
                      {normalizedInvoice.notes || (isRTL ? 'لا توجد ملاحظات مضافة على هذه الفاتورة.' : 'No notes were added to this invoice.')}
                    </div>
                  </div>
                </div>

                <div className="hidden avoid-page-break rounded-[22px] border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[180px] flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        {isRTL ? 'الملخص المالي' : 'Financial Summary'}
                      </div>
                    </div>
                    <div className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                      {normalizedInvoice.currency}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
                        <span className="text-white/60">{isRTL ? 'المجموع' : 'Subtotal'}</span>
                        <span className="ms-2 font-semibold">{formatMoney(normalizedInvoice.subtotal)}</span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
                        <span className="text-white/60">{isRTL ? 'الخصم' : 'Discount'}</span>
                        <span className="ms-2 font-semibold">{formatMoney(normalizedInvoice.discount)}</span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
                        <span className="text-white/60">{isRTL ? 'الضريبة' : 'Tax'}</span>
                        <span className="ms-2 font-semibold">{formatMoney(normalizedInvoice.tax)}</span>
                      </div>
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5">
                        <span className="text-emerald-200/80">{isRTL ? 'المدفوع' : 'Paid'}</span>
                        <span className="ms-2 font-semibold text-emerald-300">{formatMoney(normalizedInvoice.paidAmount)}</span>
                      </div>
                      {normalizedInvoice.advanceAppliedAmount > 0 ? (
                        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-3 py-1.5">
                          <span className="text-sky-200/80">{isRTL ? 'مقدم' : 'Advance'}</span>
                          <span className="ms-2 font-semibold text-sky-200">{formatMoney(normalizedInvoice.advanceAppliedAmount)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2.5 rounded-[16px] bg-white px-4 py-2 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {isRTL ? 'المستحق الآن' : 'Balance Due'}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3">
                      <div className="text-lg font-semibold tracking-tight">{formatMoney(normalizedInvoice.balanceDue)}</div>
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">
                        {normalizedInvoice.currency}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${footerClass} print-light-surface print-light-border`}>
                <div className={`flex flex-nowrap items-center justify-between gap-3 overflow-x-auto whitespace-nowrap text-[10px] ${subtleTextClass} print-light-muted`}>
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{companyInfo.name || 'CRM'}</span>
                  <span>{new Date().getFullYear()} {isRTL ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</span>
                  <span className={`font-semibold ${mainTextClass}`}>
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

export default SalesInvoicePreviewModal
