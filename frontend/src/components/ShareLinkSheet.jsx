import { FaCopy, FaEnvelope, FaExternalLinkAlt, FaFacebookF, FaTelegramPlane, FaTimes, FaTwitter, FaWhatsapp } from 'react-icons/fa'

export default function ShareLinkSheet({ sheet, isRTL, isLight, onClose, onCopied, onCopyError }) {
  if (!sheet) return null

  return (
    <div className="fixed inset-0 z-[10110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-3xl border p-6 shadow-2xl ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700 text-white'
      }`}>
        <button
          type="button"
          className="absolute end-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          onClick={onClose}
        >
          <FaTimes />
        </button>
        <div className="mb-5">
          <div className="text-lg font-bold">{isRTL ? 'مشاركة الرابط' : 'Share link'}</div>
          <div className="mt-2 break-all rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {sheet.url}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sheet.url)
                onCopied?.()
                onClose?.()
              } catch {
                onCopyError?.()
              }
            }}
          >
            <FaCopy /> {isRTL ? 'نسخ الرابط' : 'Copy link'}
          </button>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white dark:bg-slate-700"
            href={sheet.url}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
          >
            <FaExternalLinkAlt /> {isRTL ? 'فتح الرابط' : 'Open link'}
          </a>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white"
            href={`https://wa.me/?text=${encodeURIComponent(`${sheet.title}\n${sheet.url}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            <FaWhatsapp /> WhatsApp
          </a>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white"
            href={`https://t.me/share/url?url=${encodeURIComponent(sheet.url)}&text=${encodeURIComponent(sheet.title)}`}
            target="_blank"
            rel="noreferrer"
          >
            <FaTelegramPlane /> Telegram
          </a>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sheet.url)}`}
            target="_blank"
            rel="noreferrer"
          >
            <FaFacebookF /> Facebook
          </a>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white"
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(sheet.url)}&text=${encodeURIComponent(sheet.title)}`}
            target="_blank"
            rel="noreferrer"
          >
            <FaTwitter /> X / Twitter
          </a>
          <a
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white"
            href={`mailto:?subject=${encodeURIComponent(sheet.title)}&body=${encodeURIComponent(sheet.url)}`}
          >
            <FaEnvelope /> {isRTL ? 'مشاركة بالبريد' : 'Share by email'}
          </a>
        </div>
      </div>
    </div>
  )
}
