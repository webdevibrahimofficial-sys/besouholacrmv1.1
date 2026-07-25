import TelesalesBulkAssignModal from './TelesalesBulkAssignModal'

export default function TransferToTelesalesModal(props) {
  const { isArabic = false } = props

  return (
    <TelesalesBulkAssignModal
      {...props}
      title={isArabic ? 'تحويل إلى التيليسيلز' : 'Transfer To Telesales'}
      assignButtonLabel={isArabic ? 'تحويل' : 'Transfer'}
      assigningButtonLabel={isArabic ? 'جارٍ التحويل...' : 'Transferring...'}
      filterByRoleLabel={isArabic ? 'تصفية حسب دور التيليسيلز' : 'Filter By Telesales Role'}
      assignToLabel={isArabic ? 'التعيين إلى' : 'Assign To'}
      searchPlaceholder={isArabic ? 'ابحث في أعضاء فريق التيليسيلز' : 'Search telesales team members'}
      assignWithLabel={isArabic ? 'ابدأ المرحلة كـ' : 'Start Stage As'}
      primaryRoleLabel={isArabic ? 'كوكيل تيليسيلز' : 'As Telesales Agent'}
      secondaryRoleLabel={isArabic ? 'كمدير تيليسيلز' : 'As Telesales Manager'}
      freshOptionLabel="Fresh"
      coldCallOptionLabel="Cold Calls"
      showDuplicateOption={false}
      showSameStageOption={false}
      showClearHistoryOption={false}
    />
  )
}
