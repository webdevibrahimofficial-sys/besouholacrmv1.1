export function crmStartCodeFields(isRealEstate) {
  if (isRealEstate) {
    return ['startUnitCode', 'startProjectCode', 'startBrokerCode']
  }

  return [
    'startCategoryCode',
    'startItemCode',
    'startCustomerCode',
    'startInvoiceCode',
    'startOrderCode',
    'startQuotationCode',
    'allowConvertToCustomers',
  ]
}
