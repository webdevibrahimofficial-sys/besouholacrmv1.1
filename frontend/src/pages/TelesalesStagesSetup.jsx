import { useTranslation } from 'react-i18next'
import ConfigurationManager from '../components/settings/ConfigurationManager'

export default function TelesalesStagesSetup() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="px-0 py-0 w-full">
        <ConfigurationManager workflowKey="telesales" title="Telesales Pipeline Setup" />
      </div>
    </div>
  )
}
