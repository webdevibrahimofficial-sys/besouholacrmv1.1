import { useEffect, useRef, useState } from 'react'
import { FaTimes, FaPaperclip, FaBuilding, FaRegIdCard, FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaFileAlt, FaUserTie, FaClock } from 'react-icons/fa'
import BrokerCheckInButton from './BrokerCheckInButton'
import { api } from '../../utils/api'
import { useTheme } from '../../shared/context/ThemeProvider'

export default function BrokerPreviewModal({ isOpen = true, onClose = () => {}, broker = null, onCheckInSuccess = () => {}, onEdit = null, onBrokerUpdated = null }) {
  const { resolvedTheme } = useTheme()
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(false)
  const [localBroker, setLocalBroker] = useState(broker)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachmentUploadError, setAttachmentUploadError] = useState('')
  const attachmentInputRef = useRef(null)
  const locale =
    (typeof document !== 'undefined' && document.documentElement?.lang) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'en-US'
  const isLight = resolvedTheme === 'light'

  useEffect(() => {
    if (!isOpen || !broker) return
    setLocalBroker(broker)
    setAttachmentUploadError('')
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await api.get(`/api/brokers/${broker.id}/visits`)
        const rows = Array.isArray(res.data?.data) ? res.data.data : []
        if (mounted) setVisits(rows)
      } catch (e) {
        console.error('Failed to load broker visits in preview', e)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [isOpen, broker])

  if (!isOpen || !broker) return null

  const formatDateTime = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  const formatDuration = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    const totalMinutes = Math.max(0, Math.round(Number(value)))
    if (!Number.isFinite(totalMinutes)) return '-'
    if (totalMinutes < 60) return `${totalMinutes} min`
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
  }

  const contactPhones = Array.isArray(broker.phones)
    ? broker.phones.filter(Boolean)
    : broker.phone ? [broker.phone] : []

  const isContracted = broker.contracted || broker.contracted === true
  const customFields = broker.custom_fields || broker.customFields || {}
  const additionalFieldEntries = Object.entries(customFields || {}).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== ''
  )

  const attachmentSources = Array.isArray(localBroker?.attachments)
    ? localBroker.attachments
    : Array.isArray(localBroker?.documents)
      ? localBroker.documents
      : Array.isArray(localBroker?.meta_data?.attachments)
        ? localBroker.meta_data.attachments
        : Array.isArray(localBroker?.metaData?.attachments)
          ? localBroker.metaData.attachments
          : []

  const latestVisit = visits[0] || null
  const brokerTypeLabel = !broker?.brokerType
    ? 'Broker'
    : String(broker.brokerType).toLowerCase() === 'company'
      ? 'Company Broker'
      : String(broker.brokerType).toLowerCase() === 'individual'
        ? 'Individual Broker'
        : broker.brokerType

  const statusToneClass = String(broker?.status || '').toLowerCase() === 'active'
    ? isLight
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
      : 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
    : isLight
      ? 'bg-slate-100 text-slate-700 ring-slate-200'
      : 'bg-slate-500/15 text-slate-300 ring-slate-400/30'

  const overlayClass = isLight ? 'bg-slate-900/20 backdrop-blur-sm' : 'bg-black/80 backdrop-blur-sm'
  const modalClass = isLight
    ? 'card w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 backdrop-blur-xl'
    : 'card w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0f1b46]/95 text-white shadow-2xl ring-1 ring-blue-400/30 backdrop-blur-xl'
  const headerClass = isLight
    ? 'sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-5 sm:px-8'
    : 'sticky top-0 z-10 border-b border-white/10 bg-[#0f1b46]/95 px-5 py-5 sm:px-8'
  const statCardClass = isLight
    ? 'rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200'
    : 'rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10'
  const sectionCardClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm'
    : 'rounded-3xl border border-white/15 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
  const sectionCardAltClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-slate-50 p-5'
    : 'rounded-3xl border border-white/15 bg-white/5 p-5'
  const panelTextClass = isLight ? 'text-slate-700' : 'text-slate-300'
  const panelSubTextClass = isLight ? 'text-slate-500' : 'text-slate-400'
  const panelValueClass = isLight ? 'text-slate-900' : 'text-slate-100'
  const phoneLinkClass = isLight
    ? 'flex items-start gap-3 text-slate-900 transition-colors hover:text-sky-700'
    : 'flex items-start gap-3 text-slate-100 transition-colors hover:text-sky-300'
  const chipClass = isLight
    ? 'inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white ring-1 ring-slate-900/20'
    : 'inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 ring-1 ring-slate-700'
  const editButtonClass = isLight
    ? 'rounded-full border border-slate-200 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800'
    : 'rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50'
  const closeButtonClass = isLight
    ? 'flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-red-600 shadow-md transition hover:bg-red-50'
    : 'flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-600 shadow-md transition hover:bg-red-50'
  const labelPillClass = isLight
    ? 'inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 ring-1 ring-sky-200'
    : 'inline-flex rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200 ring-1 ring-sky-400/25'
  const contractedPillClass = isLight
    ? 'inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200'
    : 'inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/20'

  const taxAttachmentUrl =
    localBroker?.taxAttachment?.dataUrl ||
    localBroker?.taxAttachment?.url ||
    localBroker?.taxAttachment?.link ||
    localBroker?.taxAttachment?.path ||
    localBroker?.taxAttachment?.downloadUrl ||
    localBroker?.taxAttachment?.fileUrl ||
    localBroker?.taxAttachment?.publicUrl ||
    (typeof localBroker?.taxAttachment === 'string' ? localBroker.taxAttachment : null)

  const nationalAttachmentUrl =
    localBroker?.nationalAttachment?.dataUrl ||
    localBroker?.nationalAttachment?.url ||
    localBroker?.nationalAttachment?.link ||
    localBroker?.nationalAttachment?.path ||
    localBroker?.nationalAttachment?.downloadUrl ||
    localBroker?.nationalAttachment?.fileUrl ||
    localBroker?.nationalAttachment?.publicUrl ||
    (typeof localBroker?.nationalAttachment === 'string' ? localBroker.nationalAttachment : null)

  const infoCards = [
    {
      key: 'contact',
      title: 'Contact Info',
      icon: FaPhoneAlt,
      content: (
        <div className="space-y-3 text-sm">
          {broker.email && (
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 ${isLight ? 'text-sky-600' : 'text-sky-300'}`}><FaEnvelope /></span>
              <span className={`break-all ${panelValueClass}`}>{broker.email}</span>
            </div>
          )}
          {contactPhones.length > 0 && (
            <div className="space-y-2">
              {contactPhones.map((phone, idx) => (
                <a
                  key={idx}
                  href={`tel:${phone}`}
                  className={phoneLinkClass}
                >
                  <span className={`mt-0.5 ${isLight ? 'text-sky-600' : 'text-sky-300'}`}><FaPhoneAlt /></span>
                  <span dir="ltr">{phone}</span>
                </a>
              ))}
            </div>
          )}
          {broker.address && (
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 ${isLight ? 'text-sky-600' : 'text-sky-300'}`}><FaMapMarkerAlt /></span>
              <span className={panelTextClass}>{broker.address}</span>
            </div>
          )}
          {!broker.email && contactPhones.length === 0 && !broker.address && (
            <div className={`text-sm ${panelSubTextClass}`}>No contact info available.</div>
          )}
        </div>
      )
    },
    {
      key: 'business',
      title: 'Business Details',
      icon: FaBuilding,
      content: (
        <div className="space-y-3 text-sm">
          {broker.agencyName && (
            <div>
              <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Agency</div>
              <div className={`mt-1 font-medium ${panelValueClass}`}>{broker.agencyName}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Status</div>
              <div className={`mt-1 ${panelValueClass}`}>{broker.status || '-'}</div>
            </div>
            <div>
              <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Contract</div>
              <div className={`mt-1 ${panelValueClass}`}>{isContracted ? 'Contracted' : 'Not Contracted'}</div>
            </div>
          </div>
          {broker.commissionRate != null && broker.commissionRate !== '' && (
            <div>
              <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Commission</div>
              <div className={`mt-1 font-medium ${panelValueClass}`}>{broker.commissionRate}%</div>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'sales',
      title: 'Assigned Sales',
      icon: FaUserTie,
      content: Array.isArray(broker.salesPersons) && broker.salesPersons.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {broker.salesPersons.map((sp, idx) => (
            <span key={idx} className={chipClass}>
              {sp}
            </span>
          ))}
        </div>
      ) : (
        <div className={`text-sm ${panelSubTextClass}`}>Unassigned</div>
      )
    },
    {
      key: 'docs',
      title: 'Documents',
      icon: FaRegIdCard,
      content: (
        <div className="space-y-3 text-sm">
          <div>
            <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Tax ID</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={panelValueClass}>{String(broker.taxId || broker.tax_id || '').trim() || '-'}</span>
              {taxAttachmentUrl && (
                <a href={taxAttachmentUrl} download={broker.taxAttachment?.name || 'tax'} className={`text-xs font-medium transition-colors ${isLight ? 'text-sky-700 hover:text-sky-900' : 'text-sky-300 hover:text-sky-200'}`}>
                  Download
                </a>
              )}
            </div>
          </div>
          <div>
            <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>National ID</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={panelValueClass}>{String(broker.nationalId || broker.national_id || '').trim() || '-'}</span>
              {nationalAttachmentUrl && (
                <a href={nationalAttachmentUrl} download={broker.nationalAttachment?.name || 'national'} className={`text-xs font-medium transition-colors ${isLight ? 'text-sky-700 hover:text-sky-900' : 'text-sky-300 hover:text-sky-200'}`}>
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      )
    }
  ]

  const normalizedAttachments = []
  const pushAttachment = (label, attachment) => {
    if (!attachment) return
    const href =
      (typeof attachment === 'string' ? attachment : null) ||
      attachment?.dataUrl ||
      attachment?.url ||
      attachment?.link ||
      attachment?.path ||
      attachment?.downloadUrl ||
      attachment?.fileUrl ||
      attachment?.publicUrl
    if (!href) return

    const name =
      attachment?.name ||
      attachment?.filename ||
      attachment?.fileName ||
      attachment?.title ||
      (typeof attachment === 'string' ? attachment.split('/').pop() : label)

    normalizedAttachments.push({ label, name, href })
  }

  pushAttachment('Tax Attachment', broker.taxAttachment)
  pushAttachment('National ID Attachment', broker.nationalAttachment)

  attachmentSources.forEach((item, index) => {
    if (!item) return
    if (typeof item === 'string') {
      normalizedAttachments.push({
        label: `Attachment ${index + 1}`,
        name: item.split('/').pop(),
        href: item
      })
      return
    }

    const href =
      item.dataUrl ||
      item.url ||
      item.link ||
      item.path ||
      item.downloadUrl ||
      item.fileUrl ||
      item.publicUrl
    if (!href) return

    const name = item.name || item.filename || item.fileName || item.title || `Attachment ${index + 1}`
    normalizedAttachments.push({ label: item.label || `Attachment ${index + 1}`, name, href })
  })

  const handleAttachmentUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    setAttachmentUploadError('')
    setUploadingAttachment(true)

    try {
      const formData = new FormData()
      files.forEach((file) => formData.append('attachments[]', file))
      const res = await api.post(`/api/brokers/${broker.id}/attachments`, formData)
      const attachments = Array.isArray(res.data?.attachments) ? res.data.attachments : []
      setLocalBroker(prev => ({ ...prev, attachments }))
      if (typeof onBrokerUpdated === 'function') {
        onBrokerUpdated()
      }
    } catch (e) {
      console.error('Failed to upload broker attachment', e)
      setAttachmentUploadError('Failed to upload attachment')
    } finally {
      setUploadingAttachment(false)
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[300]">
      <div className={`absolute inset-0 ${overlayClass}`} onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={modalClass}>
          <div className={headerClass}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={labelPillClass}>
                    {brokerTypeLabel}
                  </span>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusToneClass}`}>
                    {broker.status || 'Unknown'}
                  </span>
                  {isContracted && (
                    <span className={contractedPillClass}>
                      Contracted
                    </span>
                  )}
                </div>
                <h2 className={`truncate text-3xl font-bold tracking-tight ${panelValueClass}`}>{broker.name}</h2>
                <p className={`mt-2 text-sm ${panelTextClass}`}>
                  Review broker details, documents, visits, and recent activity in one place.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {typeof onEdit === 'function' && (
                  <button
                    type="button"
                    onClick={() => onEdit(broker)}
                    className={editButtonClass}
                  >
                    Edit
                  </button>
                )}
                <button onClick={onClose} className={closeButtonClass}>
                  <FaTimes />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className={statCardClass}>
                <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Latest Visit</div>
                <div className={`mt-1 text-sm font-medium ${panelValueClass}`}>
                  {latestVisit?.checkInDate ? formatDateTime(latestVisit.checkInDate) : 'No visits yet'}
                </div>
              </div>
              <div className={statCardClass}>
                <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Visit Duration</div>
                <div className={`mt-1 text-sm font-medium ${panelValueClass}`}>
                  {latestVisit?.durationMinutes != null ? formatDuration(latestVisit.durationMinutes) : '-'}
                </div>
              </div>
              <div className={statCardClass}>
                <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>Recent Activity</div>
                <div className={`mt-1 text-sm font-medium ${panelValueClass}`}>
                  {latestVisit?.status ? latestVisit.status : 'No recent activity'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-5 py-5 sm:px-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {infoCards.map(({ key, title, icon: Icon, content }) => (
                <div key={key} className={sectionCardClass}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isLight ? 'bg-sky-100 text-sky-600 ring-1 ring-sky-200' : 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/20'}`}>
                      <Icon />
                    </div>
                    <h4 className={`text-sm font-semibold uppercase tracking-[0.2em] ${panelSubTextClass}`}>{title}</h4>
                  </div>
                  {content}
                </div>
              ))}
            </div>

            <div className={sectionCardAltClass}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className={`text-xs font-semibold uppercase tracking-[0.2em] ${panelSubTextClass}`}>Attachments</h4>
                  <p className={`text-sm ${panelSubTextClass}`}>Upload one or more files directly from this preview.</p>
                </div>
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${isLight ? 'border border-slate-200 bg-slate-900 text-white hover:bg-slate-800' : 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    onChange={handleAttachmentUpload}
                    className="hidden"
                  />
                  Upload File
                </label>
              </div>
              {uploadingAttachment && (
                <div className={`mb-2 text-xs ${panelTextClass}`}>Uploading...</div>
              )}
              {attachmentUploadError && (
                <div className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{attachmentUploadError}</div>
              )}
              {normalizedAttachments.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {normalizedAttachments.map((item, idx) => (
                    <div key={`${item.href}-${idx}`} className={`flex items-center justify-between gap-3 rounded-2xl p-4 ${isLight ? 'bg-white ring-1 ring-slate-200' : 'bg-slate-50'}`}>
                      <div>
                        <div className={`text-sm font-semibold ${panelValueClass}`}>{item.label}</div>
                        <div className={`text-xs ${panelSubTextClass}`}>{item.name}</div>
                      </div>
                      <a
                        href={item.href}
                        download={item.name}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition ${isLight ? 'bg-slate-900 text-white ring-1 ring-slate-300 hover:bg-slate-800' : 'bg-white text-blue-600 ring-1 ring-slate-200 hover:text-blue-800'}`}
                      >
                        <FaPaperclip className="w-4 h-4" />
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-200 bg-white/5 text-slate-400'}`}>
                  No attachments uploaded yet.
                </div>
              )}
            </div>

            {additionalFieldEntries.length > 0 && (
              <div className={sectionCardClass}>
                <div className="mb-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isLight ? 'bg-sky-100 text-sky-600 ring-1 ring-sky-200' : 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/20'}`}>
                    <FaFileAlt />
                  </div>
                  <h4 className={`text-sm font-semibold uppercase tracking-[0.2em] ${panelSubTextClass}`}>Additional Info</h4>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {additionalFieldEntries.map(([key, value]) => (
                    <div key={key} className={`rounded-2xl px-4 py-3 ${isLight ? 'bg-slate-50 ring-1 ring-slate-200' : 'bg-slate-900/30 ring-1 ring-white/5'}`}>
                      <div className={`text-xs uppercase tracking-wide ${panelSubTextClass}`}>{key}</div>
                      <div className={`mt-1 break-words ${panelValueClass}`}>{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={`border-t px-5 py-5 sm:px-8 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h4 className={`text-sm font-semibold uppercase tracking-[0.2em] ${panelSubTextClass}`}>Recent Visits</h4>
                <p className={`mt-1 text-sm ${panelSubTextClass}`}>Track latest broker check-ins and check-outs.</p>
              </div>
              <BrokerCheckInButton brokerId={broker.id} brokerName={broker.name} onCheckInSuccess={() => { onCheckInSuccess(); }} />
            </div>
            {loading ? (
              <div className={`text-sm ${panelSubTextClass}`}>Loading...</div>
            ) : visits.length === 0 ? (
              <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-white/15 bg-white/5 text-slate-400'}`}>
                No visits found
              </div>
            ) : (
              <div className="space-y-3">
                {visits.map(v => (
                  <div key={v.id} className={`rounded-2xl border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className={`text-sm font-semibold ${panelValueClass}`}>{v.salesPerson || v.salesPersonName || 'Unknown'}</div>
                        <div className={chipClass}>
                          {v.status || 'pending'}
                        </div>
                      </div>
                      <div className={`grid gap-2 text-xs ${panelTextClass} sm:text-right`}>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <FaClock className={isLight ? 'text-sky-600' : 'text-sky-300'} />
                          <span>{v.durationMinutes != null ? formatDuration(v.durationMinutes) : 'In progress'}</span>
                        </div>
                        <div>Check-In: {v.checkInDate ? formatDateTime(v.checkInDate) : '-'}</div>
                        <div>Check-Out: {v.checkOutDate ? formatDateTime(v.checkOutDate) : '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
