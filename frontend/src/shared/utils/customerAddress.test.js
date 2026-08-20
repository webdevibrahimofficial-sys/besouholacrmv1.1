import { buildCustomerAddress, resolveDocumentCustomerAddress } from './customerAddress'

describe('customerAddress', () => {
  it('builds address from addressLine / address and location parts', () => {
    expect(buildCustomerAddress({
      addressLine: 'Street 10',
      city: 'Cairo',
      country: 'Egypt',
    })).toBe('Street 10, Cairo, Egypt')

    expect(buildCustomerAddress({
      address: 'Nasr City',
      city: 'Cairo',
    })).toBe('Nasr City, Cairo')
  })

  it('resolves from nested customer when document has no address', () => {
    expect(resolveDocumentCustomerAddress({
      customerName: 'Ibrahi ramsy',
      customerCode: '2',
      customer: { address: 'Maadi', city: 'Cairo' },
    })).toBe('Maadi, Cairo')
  })

  it('looks up customers list by code when nested customer is missing', () => {
    expect(resolveDocumentCustomerAddress(
      { customerCode: 'C-0004', customerName: 'Ibrahi ramsy' },
      [{ id: 4, customer_code: 'C-0004', addressLine: 'Helwan', country: 'Egypt' }]
    )).toBe('Helwan, Egypt')
  })

  it('returns empty string when no address exists', () => {
    expect(resolveDocumentCustomerAddress({ customerName: 'No Address' }, [])).toBe('')
  })
})
