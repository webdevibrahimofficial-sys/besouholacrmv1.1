import { useTranslation } from 'react-i18next'
import ConfigurationManager from '../components/settings/ConfigurationManager'

export default function TelesalesStagesSetup() {
  const { i18n } = useTranslation()
  const isRtl = String(i18n.language || '').startsWith('ar')

  return (
    <div className="space-y-6">
      <div className="px-0 py-0 w-full">
        <ConfigurationManager workflowKey="telesales" title={isRtl ? 'إعداد مراحل التيلي سيلز' : 'Telesales Pipeline Setup'} />
      </div>
    </div>
  )
}
