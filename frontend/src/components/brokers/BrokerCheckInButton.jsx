import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, LogIn, LogOut, Loader2, Clock3 } from 'lucide-react'
import { api } from '../../utils/api'

export default function BrokerCheckInButton({ brokerId, brokerName, onCheckInSuccess }) {
  const { i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const aDate = a?.checkInDate ? new Date(a.checkInDate).getTime() : 0
      const bDate = b?.checkInDate ? new Date(b.checkInDate).getTime() : 0
      return bDate - aDate
    })
  }, [history])

  const pendingVisit = useMemo(
    () => sortedHistory.find((item) => item?.status === 'pending'),
    [sortedHistory]
  )
  const latestVisit = sortedHistory[0] || null
  const isCheckedIn = Boolean(pendingVisit)

  const lastLabel = useMemo(() => {
    if (!latestVisit?.checkInDate) return null
    try {
      return new Date(latestVisit.checkInDate).toLocaleString(isArabic ? 'ar-EG' : 'en-US')
    } catch {
      return latestVisit.checkInDate
    }
  }, [latestVisit, isArabic])

  useEffect(() => {
    if (!brokerId) return
    let mounted = true
    ;(async () => {
      try {
        const res = await api.get(`/api/brokers/${brokerId}/visits`)
        const rows = Array.isArray(res.data?.data) ? res.data.data : []
        if (mounted) setHistory(rows)
      } catch (error) {
        console.error('Failed to load broker visits', error)
      }
    })()
    return () => {
      mounted = false
    }
  }, [brokerId])

  const emitToast = (type, message) => {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message } }))
  }

  const withGeo = (onSuccess) => {
    if (!navigator.geolocation) {
      emitToast('error', isArabic ? 'المتصفح لا يدعم تحديد الموقع' : 'Geolocation is not supported by your browser')
      return
    }

    emitToast('info', isArabic ? 'جاري تحديد الموقع...' : 'Getting location...')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onSuccess({
          lat: coords.latitude,
          lng: coords.longitude,
          address: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
        })
      },
      (error) => {
        console.error('Broker check-in geolocation error', error)
        emitToast('error', isArabic ? 'فشل تحديد الموقع' : 'Failed to get location')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const handleAction = () => {
    if (!brokerId || loading) return

    withGeo(async (payload) => {
      setLoading(true)
      try {
        if (pendingVisit) {
          const res = await api.post(`/api/brokers/${brokerId}/check-out`, {
            check_out_date: new Date().toISOString(),
            ...payload,
          })
          const updated = res.data?.data || res.data
          setHistory((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
          emitToast('success', isArabic ? 'تم تسجيل الانصراف بنجاح' : 'Check-out recorded successfully')
        } else {
          const res = await api.post(`/api/brokers/${brokerId}/check-in`, {
            check_in_date: new Date().toISOString(),
            ...payload,
          })
          const created = res.data?.data || res.data
          setHistory((prev) => [created, ...prev.filter((row) => row.id !== created.id)])
          emitToast('success', isArabic ? 'تم تسجيل الحضور بنجاح' : 'Check-in recorded successfully')
        }

        onCheckInSuccess?.()
      } catch (error) {
        console.error('Broker check-in action failed', error)
        emitToast('error', isArabic ? 'فشل تسجيل الحضور/الانصراف' : 'Failed to record check-in/check-out')
      } finally {
        setLoading(false)
      }
    })
  }

  return (
    <div className="rounded-xl border border-[var(--panel-border)]/60 bg-white/30 dark:bg-slate-900/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--content-text)]">
            <MapPin size={16} className="text-blue-500" />
            <span>{isArabic ? 'تسجيل الموقع' : 'Location Check-In'}</span>
          </div>
          <div className="text-xs text-[var(--muted-text)]">
            {brokerName
              ? (isArabic ? `الوسيط: ${brokerName}` : `Broker: ${brokerName}`)
              : (isArabic ? 'تسجيل زيارة الوسيط' : 'Record broker visit')}
          </div>
          {lastLabel && (
            <div className="flex items-center gap-1 text-xs text-[var(--muted-text)]">
              <Clock3 size={12} />
              <span>
                {isArabic ? 'آخر تسجيل:' : 'Last visit:'} {lastLabel}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleAction}
          disabled={loading}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
            isCheckedIn ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
          } disabled:cursor-not-allowed disabled:opacity-70`}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isCheckedIn ? (
            <LogOut size={16} />
          ) : (
            <LogIn size={16} />
          )}
          <span>
            {loading
              ? (isArabic ? 'جاري الحفظ...' : 'Saving...')
              : isCheckedIn
                ? (isArabic ? 'Check-Out الوسيط' : 'Broker Check-Out')
                : (isArabic ? 'Check-In الوسيط' : 'Broker Check-In')}
          </span>
        </button>
      </div>
    </div>
  )
}
