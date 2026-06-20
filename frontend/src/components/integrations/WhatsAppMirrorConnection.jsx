import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { whatsappMirrorService } from '../../services/whatsappService'

export default function WhatsAppMirrorConnection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('disconnected')
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const pollingInterval = useRef(null)

  useEffect(() => {
    checkStatus()
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkStatus = async () => {
    try {
      const data = await whatsappMirrorService.getStatus()
      if (!data) return
      setStatus(data.status || 'disconnected')
      if (data.status === 'pending_qr' && data.qr_base64) {
        setQrCode(data.qr_base64)
      } else if (data.status === 'connected') {
        stopPolling()
        setShowModal(false)
      }
    } catch (error) {
      console.error('Error fetching WhatsApp Mirror status:', error)
    }
  }

  const startPolling = () => {
    stopPolling()
    pollingInterval.current = setInterval(() => {
      checkStatus()
    }, 2500)
  }

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }

  const handleConnect = async () => {
    setLoading(true)
    try {
      const data = await whatsappMirrorService.pair()
      setStatus(data.status || 'pending_qr')
      if (data.qr_base64) {
        setQrCode(data.qr_base64)
        setShowModal(true)
        startPolling()
      } else if (data.status === 'connected') {
        setStatus('connected')
      }
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(t('Failed to start pairing. Please ensure the Mirror service is running.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('Are you sure you want to disconnect the Mirror?'))) return
    setLoading(true)
    try {
      await whatsappMirrorService.disconnect()
      setStatus('disconnected')
      setQrCode(null)
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(t('Failed to disconnect'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="flex items-center justify-between border-b pb-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{t('WhatsApp Mirror (Direct Link)')}</h3>
          <p className="text-sm text-gray-500">{t('Link your personal number by scanning a QR — lightweight mirror mode.')}</p>
        </div>

        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
          status === 'connected' ? 'bg-green-100 text-green-800' :
          status === 'pending_qr' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {status === 'connected' ? t('Connected') : status === 'pending_qr' ? t('Awaiting QR') : t('Disconnected')}
        </span>
      </div>

      <div className="mb-6 p-4 bg-amber-50 border-r-4 border-amber-500 rounded-l text-amber-900 text-sm">
        <p className="font-bold mb-1">⚠️ {t('Unofficial Integration')}</p>
        <p>{t('This integration is unofficial. Abuse may result in your number being banned. Use responsibly.')}</p>
      </div>

      <div className="flex items-center gap-3">
        {status !== 'connected' ? (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? t('Preparing...') : t('Pair new number via QR')}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? t('Disconnecting...') : t('Disconnect current number')}
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 relative shadow-xl text-center">
            <h4 className="text-md font-bold text-gray-800 mb-2">{t('Scan the QR to complete pairing')}</h4>
            <p className="text-xs text-gray-500 mb-4">{t('Open WhatsApp on your phone → Linked Devices → Link a device')}</p>

            <div className="bg-gray-50 p-4 rounded-lg inline-block border mb-4">
              {qrCode ? (
                <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">{t('Loading QR...')}</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-indigo-600 animate-pulse font-medium">{t('Waiting for phone to connect...')}</span>
              <button
                onClick={() => { setShowModal(false); stopPolling(); }}
                className="mt-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-medium transition"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
