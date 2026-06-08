import { useTranslation } from 'react-i18next'
import { FaArrowRight, FaCheckCircle, FaCog } from 'react-icons/fa'
import { useTheme } from '@shared/context/ThemeProvider'

export default function IntegrationCard({ integration, onConnect, onConfigure }) {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme !== 'dark'
  const isArabic = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('ar')
  const { name, description, icon: Icon, bg, status, connected, requiresSetup, disabledReason, ctaLabel, configureLabel } = integration

  return (
    <div
      dir={isArabic ? 'rtl' : 'ltr'}
      className={`rounded-xl p-4 transition-all flex flex-col gap-3 relative overflow-hidden group ${
        isArabic ? 'items-end text-right' : 'items-start text-left'
      } ${
        isLight
          ? 'bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
          : 'bg-slate-950/70 border border-white/10 hover:bg-slate-800/90'
      }`}
    >
      <div className={`flex w-full items-start ${isArabic ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shadow-lg shadow-black/10 shrink-0`}>
          {Icon && <Icon className="text-white w-5 h-5" />}
        </div>
        {status ? (
          <div
            className={`max-w-[55%] shrink-0 rounded-full px-2.5 py-1 text-[10px] leading-none ${
              isLight ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-slate-800/90 text-slate-100'
            }`}
          >
            <span className="block truncate">{t(status)}</span>
          </div>
        ) : null}
      </div>
      
      <div className="flex-1 w-full z-10">
        <h3 className={`text-sm font-bold mb-1.5 flex items-center gap-2 ${isArabic ? 'flex-row-reverse justify-start' : ''} ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          {t(name)}
          {connected && <FaCheckCircle className="text-emerald-400 w-3 h-3" />}
        </h3>
        <p className={`text-xs leading-relaxed mb-3 min-h-[32px] ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
          {t(description)}
        </p>
        
        <div className={`flex items-center gap-3 mt-auto ${isArabic ? 'justify-end' : 'justify-start'}`}>
          {connected ? (
            <button 
              onClick={onConfigure}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
                isLight
                  ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200'
                  : 'bg-slate-800/80 text-slate-100 hover:bg-slate-700/90'
              }`}
            >
              <FaCog size={12} />
              {configureLabel || t('Configure')}
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              <button 
                onClick={requiresSetup ? onConfigure : onConnect}
                className={`${isLight ? 'text-cyan-700 hover:text-cyan-800' : 'text-cyan-500'} text-xs font-bold flex items-center ${isArabic ? 'flex-row-reverse justify-end' : ''} gap-1 hover:gap-2 transition-all`}
                title={disabledReason ? t(disabledReason) : ''}
              >
                {t(ctaLabel || (requiresSetup ? 'Configure Meta App' : 'Connect Now'))}
                <FaArrowRight size={10} className={`transition-transform ${isArabic ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
              </button>
              {disabledReason && (
                <div
                  className={`text-[10px] leading-snug ${
                    isLight
                      ? 'text-slate-800 bg-slate-100/80 border border-slate-200/70 px-2 py-1 rounded-md'
                      : 'text-slate-200 bg-slate-900/40 border border-white/10 px-2 py-1 rounded-md'
                  }`}
                >
                  {t(disabledReason)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
