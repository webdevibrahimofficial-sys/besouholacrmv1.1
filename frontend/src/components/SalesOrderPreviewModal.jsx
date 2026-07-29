import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactToPrint } from 'react-to-print'
import { FaDownload, FaTimes, FaFileExcel, FaUser, FaPaperclip, FaFileInvoiceDollar, FaChevronDown, FaPrint, FaFilePdf, FaFileImage } from 'react-icons/fa'
import { useAppState } from '@shared/context/AppStateProvider'
import { api } from '../utils/api'

const SalesOrderPreviewModal = ({ isOpen, onClose, order, onCreateInvoice }) => {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.dir() === 'rtl'
  const { company } = useAppState()
  const printRef = useRef()
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [attachmentsError, setAttachmentsError] = useState('')

  const formatBytes = (bytes) => {
    const n = Number(bytes || 0)
    if (!n) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let v = n
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  const iconForAttachment = (name = '', mime = '') => {
    const n = String(name).toLowerCase()
    const m = String(mime).toLowerCase()
    if (n.endsWith('.pdf') || m.includes('pdf')) return { Icon: FaFilePdf, bg: 'bg-red-100', fg: 'text-red-500' }
    if (m.startsWith('image/') || n.match(/\.(png|jpg|jpeg|gif|webp)$/)) return { Icon: FaFileImage, bg: 'bg-blue-100', fg: 'text-blue-500' }
    if (n.match(/\.(xls|xlsx|csv)$/)) return { Icon: FaFileExcel, bg: 'bg-green-100', fg: 'text-green-600' }
    return { Icon: FaFileInvoiceDollar, bg: 'bg-gray-100', fg: 'text-gray-600' }
  }

  const loadAttachments = async () => {
    if (!order?.id) return
    setAttachmentsLoading(true)
    setAttachmentsError('')
    try {
      const res = await api.get(`/api/sales-orders/${order.id}/attachments`)
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : [])
      setAttachments(list)
    } catch (e) {
      setAttachments([])
      setAttachmentsError(isRTL ? 'فشل تحميل المرفقات' : 'Failed to load attachments')
    } finally {
      setAttachmentsLoading(false)
    }
  }

  useEffect(() => {
    if (!showAttachments) return
    loadAttachments()
  }, [showAttachments, order?.id])

  const companyInfo = useMemo(() => {
    const tenant = company || {}
    const profile = tenant.profile || {}
    const name = String(tenant.name || tenant.company_name || '').trim()
    const description = String(profile.description || '').trim()
    const logoUrl = String(profile.logo_url || tenant.logo_url || '').trim()
    const phone = String(profile.phone || tenant.phone || '').trim()
    const email = String(tenant?.meta_data?.email || tenant.email || '').trim()
    const taxId = String(profile.tax_id || tenant.tax_id || '').trim()

    const address1 = String(tenant.address_line_1 || '').trim()
    const address2 = String(tenant.address_line_2 || '').trim()
    const city = String(tenant.city || '').trim()
    const state = String(tenant.state || '').trim()
    const country = String(tenant.country || '').trim()

    const addrLines = [address1, address2].filter(Boolean)
    const cityLine = [city, state, country].filter(Boolean).join(', ')

    return { name, description, logoUrl, phone, email, taxId, addrLines, cityLine }
  }, [company])

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SalesOrder-${order?.id || 'New'}`,
    onAfterPrint: () => console.log('Printed successfully'),
    onPrintError: (error) => console.error('Print failed:', error),
  })

  if (!isOpen || !order) return null

  const formatDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Helper to handle quantity field inconsistency (qty vs quantity)
  const getItemQuantity = (item) => item.quantity || item.qty || 0

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page { 
            width: 210mm; 
            min-height: 297mm; 
            padding: 15mm; 
            margin: 0 auto; 
            background: white !important; 
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 6px 8px; font-size: 12px; }
          thead th { background-color: #f2f2f2 !important; color: black !important; font-weight: bold; }
          .page-break { page-break-before: always; }
          tr { page-break-inside: avoid; }
          
          /* Reset modal positioning for print */
          .fixed { position: static !important; inset: auto !important; height: auto !important; width: auto !important; background: none !important; }
          .overflow-auto { overflow: visible !important; }
          
          /* Force text color */
          * { color: black !important; text-shadow: none !important; }
          
          /* Hide standard modal chrome */
          .modal-chrome { display: none !important; }
        }
      `}</style>

      {/* Backdrop - Hidden on print */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity no-print" 
        onClick={onClose} 
      />

      {/* Modal Content */}
      <div className="relative z-[110] bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden print:shadow-none print:h-auto print:w-auto print:bg-white print:max-w-none print:rounded-none print:overflow-visible">
        
        {/* Header Actions - Hidden on print */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 no-print modal-chrome">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {isRTL ? 'معاينة طلب البيع' : 'Sales Order Preview'}
          </h2>
          <div className="flex items-center gap-3">
            {/* Create Invoice Dropdown */}
            {onCreateInvoice && (['Confirmed', 'In Progress', 'Completed', 'Partially Invoiced'].includes(order.status)) && (
              <div className="relative">
                <button 
                  onClick={() => setShowInvoiceDropdown(!showInvoiceDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium"
                >
                  <FaFileInvoiceDollar />
                  <span>{isRTL ? 'إنشاء فاتورة' : 'Create Invoice'}</span>
                  <FaChevronDown size={12} />
                </button>
                
                {showInvoiceDropdown && (
                  <div className={`absolute top-full mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden ${isRTL ? 'left-0' : 'right-0'}`}>
                     <button onClick={() => { onCreateInvoice('Full'); setShowInvoiceDropdown(false) }} className="w-full text-start px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-1">
                        <span className="font-bold text-gray-900 dark:text-white">{isRTL ? 'فاتورة كاملة' : 'Full Invoice'}</span>
                        <span className="text-xs text-gray-500">{isRTL ? 'إصدار فاتورة لكامل الكمية' : 'Invoice remaining quantity'}</span>
                     </button>
                     <button onClick={() => { onCreateInvoice('Partial'); setShowInvoiceDropdown(false) }} className="w-full text-start px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-1">
                        <span className="font-bold text-gray-900 dark:text-white">{isRTL ? 'فاتورة جزئية' : 'Partial Invoice'}</span>
                        <span className="text-xs text-gray-500">{isRTL ? 'تحديد كميات محددة' : 'Select specific items/quantities'}</span>
                     </button>
                     <button onClick={() => { onCreateInvoice('Advance'); setShowInvoiceDropdown(false) }} className="w-full text-start px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex flex-col gap-1">
                        <span className="font-bold text-gray-900 dark:text-white">{isRTL ? 'فاتورة دفعة مقدمة' : 'Advance Invoice'}</span>
                        <span className="text-xs text-gray-500">{isRTL ? 'نسبة أو مبلغ ثابت' : 'Fixed amount or percentage'}</span>
                     </button>
                  </div>
                )}
              </div>
            )}
            <button 
              onClick={() => setShowAttachments(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm font-medium"
            >
              <FaPaperclip />
              <span>{isRTL ? 'المرفقات' : 'Attachments'}</span>
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
            >
              <FaPrint />
              <span>{isRTL ? 'طباعة' : 'Print'}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              x
            </button>
          </div>
        </div>
       
        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-3 sm:p-6 print:p-0 print:bg-white print:overflow-visible relative">
          
          {/* Attachments Overlay */}
          {showAttachments && (
            <div className="absolute inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <FaPaperclip className="text-blue-500" />
                      {isRTL ? 'المرفقات' : 'Attachments'}
                    </h3>
                    <button onClick={() => setShowAttachments(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      <FaTimes />
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {attachmentsLoading ? (
                      <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-300">{isRTL ? 'جاري تحميل المرفقات...' : 'Loading attachments...'}</div>
                    ) : attachmentsError ? (
                      <div className="py-6 text-center text-sm text-red-600 dark:text-red-400">{attachmentsError}</div>
                    ) : attachments.length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-300">{isRTL ? 'لا توجد مرفقات' : 'No attachments'}</div>
                    ) : (
                      attachments.map(att => {
                        const name = att?.name || att?.file_name || att?.filename || ''
                        const url = att?.url || att?.download_url || att?.path
                        const { Icon, bg, fg } = iconForAttachment(name, att?.mime)
                        const size = formatBytes(att?.size)
                        const date = att?.created_at ? new Date(att.created_at).toLocaleDateString() : ''
                        const subtitle = [size, date].filter(Boolean).join(' • ')

                        return (
                          <div
                            key={att?.id || name}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
                            onClick={() => {
                              if (url) window.open(url, '_blank')
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 ${bg} ${fg} rounded-lg flex items-center justify-center`}>
                                <Icon size={20} />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">{name || (isRTL ? 'ملف' : 'File')}</p>
                                {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (url) window.open(url, '_blank')
                              }}
                              className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={isRTL ? 'تحميل' : 'Download'}
                            >
                              <FaDownload />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700 text-center">
                    <button 
                      onClick={() => setShowAttachments(false)}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      {isRTL ? 'إغلاق' : 'Close'}
                    </button>
                  </div>
               </div>
            </div>
          )}

          {/* Print Content Container (A4 Visual) */}
          <div ref={printRef} className="print-page bg-white text-black mx-auto shadow-lg max-w-[210mm] min-h-[297mm] p-4 sm:p-8 md:p-12 print:shadow-none print:mx-0 print:w-full print:max-w-none relative flex flex-col">
            
            {/* 1. Header Section */}
            <div className="flex flex-wrap sm:flex-row sm:justify-between gap-6 border-b-2 border-black pb-6 mb-8">
              <div className="flex-1">
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gray-200 border border-black flex items-center justify-center text-xs font-bold text-black overflow-hidden">
                      {companyInfo.logoUrl ? (
                        <img src={companyInfo.logoUrl} alt={companyInfo.name || 'Logo'} className="w-full h-full object-contain" />
                      ) : (
                        'LOGO'
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold uppercase tracking-wide text-black">{companyInfo.name || (isRTL ? 'الشركة' : 'Company')}</h2>
                      {companyInfo.description ? (
                        <p className="text-sm text-gray-800">{companyInfo.description}</p>
                      ) : null}
                    </div>
                 </div>
                 <div className="text-sm space-y-1 text-gray-800">
                   {companyInfo.addrLines.map((line, idx) => (
                     <p key={idx}>{line}</p>
                   ))}
                   {companyInfo.cityLine ? <p>{companyInfo.cityLine}</p> : null}
                   {companyInfo.phone ? <p>{isRTL ? 'هاتف:' : 'Phone:'} {companyInfo.phone}</p> : null}
                   {companyInfo.email ? <p>{isRTL ? 'البريد:' : 'Email:'} {companyInfo.email}</p> : null}
                   {companyInfo.taxId ? <p>{isRTL ? 'الرقم الضريبي:' : 'Tax ID:'} {companyInfo.taxId}</p> : null}
                 </div>
              </div>

              <div className="w-full sm:w-64 sm:shrink-0">
                <div className="border border-black p-4 bg-gray-50 print:bg-transparent">
                  <h3 className="text-lg font-bold border-b border-black mb-2 pb-1 text-center bg-gray-200 print:bg-transparent text-black">
                    {isRTL ? 'طلب بيع' : 'SALES ORDER'}
                  </h3>
                  <div className="space-y-2 text-sm text-black">
                    <div className="flex justify-between">
                      <span className="font-bold">{isRTL ? 'رقم الطلب:' : 'Order #:'}</span>
                      <span>{order.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">{isRTL ? 'التاريخ:' : 'Date:'}</span>
                      <span>{formatDate(order.createdAt)}</span>
                    </div>
                    {order.deliveryDate && (
                      <div className="flex justify-between">
                        <span className="font-bold">{isRTL ? 'التسليم:' : 'Due Date:'}</span>
                        <span>{formatDate(order.deliveryDate)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                       <span className="font-bold">{isRTL ? 'الحالة:' : 'Status:'}</span>
                       <span className="uppercase">{order.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Bill To / Ship To Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-8">
              <div className="border border-black p-4">
                 <h3 className="font-bold border-b border-black mb-3 pb-1 bg-gray-100 print:bg-transparent px-2 text-black">
                   {isRTL ? 'بيانات العميل' : 'Bill To'}
                 </h3>
                 <div className="text-sm px-2 space-y-1 text-black">
                   <p className="font-bold text-lg">{order.customerName}</p>
                   <p>Code: {order.customerCode}</p>
                   <p>Address Line 1</p>
                   <p>City, State, Zip</p>
                   <p>Phone: +1 234 567 890</p>
                 </div>
              </div>
              <div className="border border-black p-4">
                 <h3 className="font-bold border-b border-black mb-3 pb-1 bg-gray-100 print:bg-transparent px-2 text-black">
                   {isRTL ? 'عنوان الشحن' : 'Ship To'}
                 </h3>
                 <div className="text-sm px-2 space-y-1 text-black">
                   <p className="font-bold text-lg">{order.customerName}</p>
                   <p>Shipping Address Line 1</p>
                   <p>City, State, Zip</p>
                   <p>Contact Person</p>
                 </div>
              </div>
            </div>

            {/* 3. Items Table */}
            <div className="mb-8 overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[720px] print:min-w-0 text-xs sm:text-sm border-collapse border border-black">
                <thead>
                  <tr className="bg-gray-100 print:bg-gray-100">
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center w-12 whitespace-nowrap text-black">#</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-left rtl:text-right min-w-[180px] whitespace-nowrap text-black">{isRTL ? 'اسم العنصر' : 'Item Name'}</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center w-24 whitespace-nowrap text-black">{isRTL ? 'النوع' : 'Type'}</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center w-24 whitespace-nowrap text-black">{isRTL ? 'الفئة' : 'Category'}</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center w-16 whitespace-nowrap text-black">{isRTL ? 'الكمية' : 'Qty'}</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-right w-28 whitespace-nowrap text-black">{isRTL ? 'السعر' : 'Price'}</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-right w-24 whitespace-nowrap text-black">{isRTL ? 'الخصم' : 'Discount'}</th>
                    <th className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-right w-28 whitespace-nowrap text-black">{isRTL ? 'الإجمالي' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item, index) => {
                      const qty = getItemQuantity(item)
                      const price = Number(item.price || 0)
                      const discount = Number(item.discount || 0)
                      const total = (qty * price) - discount
                      
                      return (
                        <tr key={index} className="print:bg-transparent">
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center whitespace-nowrap text-black">{index + 1}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-black font-bold">{item.name}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center whitespace-nowrap text-black">{item.type || '-'}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center whitespace-nowrap text-black">{item.category || '-'}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-center whitespace-nowrap text-black">{qty}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-right whitespace-nowrap text-black">{price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-right whitespace-nowrap text-black">{discount > 0 ? discount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                          <td className="border border-black px-2 py-1.5 sm:px-3 sm:py-2 text-right whitespace-nowrap font-bold text-black">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      )
                    })
                  ) : (
                     <tr><td colSpan="8" className="border border-black p-4 text-center italic text-black">No Items</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 4. Totals & Notes Section */}
            <div className="flex flex-col md:flex-row gap-8 mb-12">
               {/* Left: Notes */}
               <div className="flex-1 flex flex-col gap-4">
                  {order.notes && (
                    <div className="border border-black p-3">
                      <h4 className="font-bold text-sm mb-2 underline text-black">{isRTL ? 'ملاحظات' : 'Notes'}:</h4>
                      <p className="text-sm whitespace-pre-line text-black">{order.notes}</p>
                    </div>
                  )}
               </div>

               {/* Right: Totals Box */}
               <div className="w-full md:w-80">
                  <div className="border border-black">
                     <div className="flex justify-between px-4 py-2 border-b border-black text-sm text-black">
                        <span className="font-medium">{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                        <span>{Number(order.subtotal || order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between px-4 py-2 border-b border-black text-sm text-black">
                        <span className="font-medium">{isRTL ? 'قيمة الخصم' : 'Discount Value'}</span>
                        <span>{Number(order.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between px-4 py-2 border-b border-black text-sm text-black">
                        <span className="font-medium">{isRTL ? 'الضريبة' : 'Tax'}</span>
                        <span>{Number(order.tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between px-4 py-2 bg-gray-200 print:bg-gray-200 text-base font-bold text-black">
                        <span>{isRTL ? 'إجمالي قيمة الطلب' : 'Total Order Value'}</span>
                        <span>{Number(order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                  </div>
               </div>
            </div>

            {/* 5. Footer (Signatures) */}
            <div className="mt-auto pt-8">
               <div className="grid grid-cols-3 gap-8 text-center text-sm text-black">
                  <div>
                     <div className="h-16 border-b border-black mb-2"></div>
                     <p className="font-bold">{isRTL ? 'إعداد' : 'Prepared By'}</p>
                  </div>
                  <div>
                     <div className="h-16 border-b border-black mb-2"></div>
                     <p className="font-bold">{isRTL ? 'اعتماد' : 'Approved By'}</p>
                  </div>
                  <div>
                     <div className="h-16 border-b border-black mb-2"></div>
                     <p className="font-bold">{isRTL ? 'التاريخ' : 'Date'}</p>
                  </div>
               </div>
               
               <div className="text-center mt-12 text-xs text-gray-500 print:text-black">
                  <p>Thank you for your business!</p>
                  <p>Page 1 of 1</p>
               </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

export default SalesOrderPreviewModal
