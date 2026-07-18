import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@utils/api'
import { useAppState } from '@shared/context/AppStateProvider'
import { Toggle } from '../../shared/components'
import { COUNTRY_CODES } from '../../hooks/usePhoneValidation'
import { PipelineStagesManager } from './ConfigurationManager'
import { useStages } from '../../hooks/useStages'

const DEFAULTS = {
  requestApprovals: false,
  duplicationSystem: true,
  allowDuplicateProjects: false,
  allowDuplicateProperties: false,
  allowCustomerPaymentPlan: true,
  showBroker: true,
  showDeveloper: true,
  showColdCallsStage: true,
  maskMobileNumber: true,
  showMobileNumber: false,
  startUnitCode: '0001',
  startCustomerCode: '0001',
  startInvoiceCode: '0001',
  startOrderCode: '0001',
  startQuotationCode: '0001',
  allowConvertToCustomers: true,
  enableTwoFactorAuth: false,
  defaultCountryCode: 'EG',
  defaultCurrency: 'EGP',
  timeZone: 'Africa/Cairo',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  numberFormat: '1,234.56',
  animations: true,
  sidebarCollapsible: true,
  allowTimeline: true,
  allowCallLog: true,
  allowChatbot: false,
  reservationHoldHours: '',
  salesEntryStageIdForTransferredLeads: '',
  defaultWorkflowFallback: 'sales',
  leadWorkflowSourceMappings: [],
}

function Section({ id, title, children }) {
  return (
    <div id={id} className="glass-panel rounded-2xl p-4 md:p-6 overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full" />
        <h3 className="text-lg font-semibold text-theme-text">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function CRMSettings() {
  const { t, i18n } = useTranslation()
  const { setCrmSettings } = useAppState()
  const isRTL = String(i18n.language || '').startsWith('ar')
  const { stages: salesStages } = useStages({ workflowKey: 'sales', activeOnly: true })
  const [settings, setSettings] = useState(DEFAULTS)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/api/crm-settings')
        const s = res?.data?.settings
        if (s && typeof s === 'object') {
          const patched = {
            ...s,
            reservationHoldHours: s.reservationHoldHours ?? '',
            salesEntryStageIdForTransferredLeads: s.salesEntryStageIdForTransferredLeads ?? '',
            defaultWorkflowFallback: s.defaultWorkflowFallback || 'sales',
            leadWorkflowSourceMappings: Array.isArray(s.leadWorkflowSourceMappings) ? s.leadWorkflowSourceMappings : [],
          }
          if (typeof patched.maskMobileNumber !== 'boolean' && typeof patched.showMobileNumber === 'boolean') {
            patched.maskMobileNumber = !patched.showMobileNumber
          }
          setSettings((prev) => ({ ...prev, ...patched }))
        }
      } catch {
      }
    }
    fetchSettings()
  }, [])

  const countries = useMemo(() => COUNTRY_CODES.map((country) => ({
    code: country.iso2,
    name: isRTL ? country.nameAr : country.nameEn,
    dialCode: country.dialCode,
    flag: country.flag,
  })), [isRTL])

  const currencies = ['AED', 'EGP', 'EUR', 'GBP', 'QAR', 'SAR', 'USD']
  const timeZones = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'UTC']
  const dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']
  const timeFormats = ['24h', '12h']
  const numberFormats = ['1,234.56', '1.234,56']

  const setField = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))
  const save = async () => {
    try {
      const payload = {
        ...settings,
        showMobileNumber: !settings.maskMobileNumber,
        reservationHoldHours: String(settings.reservationHoldHours ?? '').trim() ? Number(settings.reservationHoldHours) : null,
        salesEntryStageIdForTransferredLeads: settings.salesEntryStageIdForTransferredLeads ? Number(settings.salesEntryStageIdForTransferredLeads) : null,
        defaultWorkflowFallback: 'sales',
        leadWorkflowSourceMappings: (settings.leadWorkflowSourceMappings || [])
          .map((item) => ({
            source: String(item?.source || '').trim(),
            workflow_key: String(item?.workflow_key || 'sales').trim() || 'sales',
          }))
          .filter((item) => item.source),
      }

      const res = await api.put('/api/crm-settings', { settings: payload })
      const nextSettings = res?.data?.settings || payload
      setCrmSettings(nextSettings)
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { type: 'success', message: isRTL ? 'تم تنفيذ التغييرات' : 'Changes applied' },
      }))
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { type: 'error', message: isRTL ? 'فشل حفظ الإعدادات' : 'Failed to save settings' },
      }))
    }
  }

  const reset = async () => {
    setSettings(DEFAULTS)
    try {
      await api.put('/api/crm-settings', { settings: DEFAULTS })
    } catch {
    }
  }

  return (
    <div className="space-y-6">
      <Section title={t('Requests & Duplication')}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Toggle label={t('Requests Approvals')} value={settings.requestApprovals} onChange={(v) => setField('requestApprovals', v)} />
          <Toggle label={t('Enable Duplication System')} value={settings.duplicationSystem} onChange={(v) => setField('duplicationSystem', v)} />
          <Toggle label={t('Allow Duplicate Projects')} value={settings.allowDuplicateProjects} onChange={(v) => setField('allowDuplicateProjects', v)} />
          <Toggle label={t('Allow Duplicate Properties')} value={settings.allowDuplicateProperties} onChange={(v) => setField('allowDuplicateProperties', v)} />
          <Toggle label={t('Allow Add Payment Plan (Customer)')} value={settings.allowCustomerPaymentPlan} onChange={(v) => setField('allowCustomerPaymentPlan', v)} />
        </div>
      </Section>

      <Section title={t('Visibility & Pipeline')}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Toggle label={t('Show Broker')} value={settings.showBroker} onChange={(v) => setField('showBroker', v)} />
          <Toggle label={t('Show Developer')} value={settings.showDeveloper} onChange={(v) => setField('showDeveloper', v)} />
          <Toggle label={t('Show Cold Calls Stage (Pipeline)')} value={settings.showColdCallsStage} onChange={(v) => setField('showColdCallsStage', v)} />
          <Toggle label={t('Mask Mobile Number')} value={settings.maskMobileNumber} onChange={(v) => setField('maskMobileNumber', v)} />
        </div>
      </Section>

      <Section title={t('Defaults')}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text">{t('Default Country Code')}</label>
            <select value={settings.defaultCountryCode} onChange={(e) => setField('defaultCountryCode', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text">
              {countries.map((country) => <option key={country.code} value={country.code}>{`${country.flag} ${country.name} (${country.dialCode})`}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text">{t('Default Currency')}</label>
            <select value={settings.defaultCurrency} onChange={(e) => setField('defaultCurrency', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text">
              {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text">{t('Time Zone')}</label>
            <select value={settings.timeZone} onChange={(e) => setField('timeZone', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text">
              {timeZones.map((timeZone) => <option key={timeZone} value={timeZone}>{timeZone}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text">{t('Date Format')}</label>
            <select value={settings.dateFormat} onChange={(e) => setField('dateFormat', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text">
              {dateFormats.map((dateFormat) => <option key={dateFormat} value={dateFormat}>{dateFormat}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text">{t('Time Format')}</label>
            <select value={settings.timeFormat} onChange={(e) => setField('timeFormat', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text">
              {timeFormats.map((timeFormat) => <option key={timeFormat} value={timeFormat}>{timeFormat}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text">{t('Number Format')}</label>
            <select value={settings.numberFormat} onChange={(e) => setField('numberFormat', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text">
              {numberFormats.map((numberFormat) => <option key={numberFormat} value={numberFormat}>{numberFormat}</option>)}
            </select>
          </div>
          <Toggle label={t('Enable Animations')} value={settings.animations} onChange={(v) => setField('animations', v)} />
          <Toggle label={t('Sidebar Collapsed')} value={settings.sidebarCollapsible} onChange={(v) => setField('sidebarCollapsible', v)} />
          <Toggle label={t('Enable Two-Factor Authentications')} value={settings.enableTwoFactorAuth} onChange={(v) => setField('enableTwoFactorAuth', v)} />
        </div>
      </Section>

      <Section id="sales-pipeline-setup" title={t('Sales Pipeline Setup')}>
        <div className="space-y-4">
          <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700">
            <label className="block text-sm font-medium text-theme-text mb-2">{t('Default entry stage for transferred leads')}</label>
            <select
              value={settings.salesEntryStageIdForTransferredLeads}
              onChange={(e) => setField('salesEntryStageIdForTransferredLeads', e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-theme-text"
            >
              <option value="">{t('Select Stage')}</option>
              {salesStages.map((stage) => (
                <option key={stage.id || `${stage.name}-${stage.order}`} value={stage.id || ''}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>
          <PipelineStagesManager workflowKey="sales" title="Sales Pipeline Setup" />
        </div>
      </Section>

      <div className="flex flex-wrap justify-between items-center gap-3">
        <button className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-black rounded-xl transition-all font-medium" onClick={reset}>
          {t('Reset to Default')}
        </button>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all font-medium" onClick={save}>
          {t('Save Changes')}
        </button>
      </div>
    </div>
  )
}
