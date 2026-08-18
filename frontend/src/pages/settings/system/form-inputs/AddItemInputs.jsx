import { useTranslation } from 'react-i18next'
import DynamicFieldsManager from '../../../../components/settings/DynamicFieldsManager'
import ServiceTypesManager from '../../../inventory/ServiceTypesManager'

export default function AddItemInputs() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <DynamicFieldsManager 
          entityKey="items" 
          title={t("Add Item Inputs")}
          description={t("Customize the fields that appear when adding a new item")}
      />
      <ServiceTypesManager />
    </div>
  )
}
