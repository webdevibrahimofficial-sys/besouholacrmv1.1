import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useIntegrations } from '../hooks/useIntegrations'
import IntegrationCard from '../components/IntegrationCard'
import MetaSettings from '../components/integrations/MetaSettings'
import GoogleAdsSettings from '../components/integrations/GoogleAdsSettings'
import TikTokSettings from '../components/integrations/TikTokSettings'
import TelegramSettings from '../components/integrations/TelegramSettings'
import WebChatSettings from '../components/integrations/WebChatSettings'
import WebsiteSettings from '../components/integrations/WebsiteSettings'

export default function MetaIntegration() {
  const { t, i18n } = useTranslation()
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')
  const { 
    integrationsList, 
    activeIntegration, 
    connect, 
    configure, 
    closeSettings 
  } = useIntegrations()

  // Check for callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      const pendingProvider = localStorage.getItem('pending_integration_provider')
      if (pendingProvider === 'google-ads') {
        connect('google-ads')
        localStorage.removeItem('pending_integration_provider')
      } else if (pendingProvider === 'meta') {
        connect('meta')
        localStorage.removeItem('pending_integration_provider')
      } else {
        // Legacy fallback: default to meta if no provider found (or assume user clicked card)
        // Or do nothing to avoid errors
        connect('meta') 
      }
    }
  }, [connect])

  useEffect(() => {
    if (activeIntegration !== 'website') return

    const originalOverflow = document.body.style.overflow
    document.body.classList.add('website-integration-open')
    document.body.style.overflow = 'hidden'

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeSettings()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.classList.remove('website-integration-open')
      window.removeEventListener('keydown', handleEscape)
    }
  }, [activeIntegration, closeSettings])

  // Routing to specific settings pages
  if (activeIntegration === 'meta') return <MetaSettings onClose={closeSettings} />
  if (activeIntegration === 'google-ads') return <GoogleAdsSettings onClose={closeSettings} />
  if (activeIntegration === 'tiktok') return <TikTokSettings onClose={closeSettings} />
  if (activeIntegration === 'telegram') return <TelegramSettings onClose={closeSettings} />
  if (activeIntegration === 'webchat') return <WebChatSettings onClose={closeSettings} />

  // Otherwise, show the main dashboard (The Manager)
  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className={`space-y-6 bg-transparent text-[var(--content-text)] ${isArabic ? 'text-right' : 'text-left'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('Integrations')}</h1>
          <p className="text-sm text-[var(--muted-text)] mt-1">
            {t('Manage all your external connections in one place.')}
          </p>
        </div>
      </div>

      <div className="py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {integrationsList.map((integration) => (
            <IntegrationCard 
              key={integration.id} 
              integration={integration} 
              onConnect={() => connect(integration.id)} 
              onConfigure={() => configure(integration.id)} 
            />
          ))}
        </div>
      </div>
      
      {/* General Tips Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="card glass-card p-4 md:col-span-3">
            <h3 className="text-base font-semibold mb-2">{t('Integration Tips')}</h3>
            <ul className={`text-sm space-y-2 list-disc ${isArabic ? 'pr-5' : 'pl-5'}`}>
              <li>{t('Meta integration is managed centrally. Contact support if integration is not enabled for your account.')}</li>
              <li>{t('Webhooks are configured by your system administrator — no manual setup is required on your end.')}</li>
              <li>{t('Then connect a Facebook account to sync businesses, ad accounts, pages, and Lead Ads.')}</li>
              <li>{t('Enable CAPI for better ad optimization and tracking accuracy.')}</li>
              <li>{t('Connect Google Ads to view campaign performance alongside sales data.')}</li>
            </ul>
          </div>
      </div>

      {activeIntegration === 'website' ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#0b1020] px-4 py-3 sm:py-4">
          <div
            className="absolute inset-0 bg-[#0b1020]"
            onClick={closeSettings}
            aria-hidden="true"
          />
          <div className="relative z-[101] w-full max-w-7xl overflow-visible">
            <WebsiteSettings onClose={closeSettings} />
          </div>
        </div>
      ) : null}

    </div>
  )
}
