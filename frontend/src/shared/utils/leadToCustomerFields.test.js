import { describe, expect, it } from 'vitest'
import { pickLeadAddressFields } from './leadToCustomerFields'

describe('pickLeadAddressFields', () => {
  it('maps lead location to addressLine and keeps country/city', () => {
    expect(pickLeadAddressFields({
      location: 'Nasr City, Cairo',
      country: 'Egypt',
      city: 'Cairo',
    })).toEqual({
      country: 'Egypt',
      city: 'Cairo',
      addressLine: 'Nasr City, Cairo',
    })
  })

  it('does not copy location when it duplicates country', () => {
    expect(pickLeadAddressFields({
      location: 'Egypt',
      country: 'Egypt',
    })).toEqual({
      country: 'Egypt',
      city: '',
      addressLine: '',
    })
  })

  it('prefers explicit address over location', () => {
    expect(pickLeadAddressFields({
      address: 'Street 10',
      location: 'Giza',
      country: 'Egypt',
    }).addressLine).toBe('Street 10')
  })
})
