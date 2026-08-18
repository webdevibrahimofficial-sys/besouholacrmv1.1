/* global describe, test, expect */

import { crmStartCodeFields } from './crmStartCodeFields'

describe('crmStartCodeFields', () => {
  test('shows general inventory and customer document codes only', () => {
    expect(crmStartCodeFields(false)).toEqual([
      'startCategoryCode',
      'startItemCode',
      'startCustomerCode',
      'startInvoiceCode',
      'startOrderCode',
      'startQuotationCode',
      'allowConvertToCustomers',
    ])
  })

  test('shows real-estate property, project, and broker codes only', () => {
    expect(crmStartCodeFields(true)).toEqual([
      'startUnitCode',
      'startProjectCode',
      'startBrokerCode',
    ])
  })
})
