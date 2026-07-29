import ConfigurationManager from '../components/settings/ConfigurationManager'

export default function StagesSetup() {
  return (
    <div className="px-0 py-0 w-full">
      <ConfigurationManager workflowKey="sales" title="Pipeline Stages Setup" />
    </div>
  )
}
