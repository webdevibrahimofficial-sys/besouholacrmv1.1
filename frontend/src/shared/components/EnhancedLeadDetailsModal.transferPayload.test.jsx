import { buildLeadTransferPayload } from '../utils/leadTransfer'

describe('buildLeadTransferPayload', () => {
  test('defaults to new lead + keep history', () => {
    expect(buildLeadTransferPayload({ method: 'fresh', options: {} })).toEqual({
      stage: 'new_lead',
      history_option: 'keep_history',
    })
  })

  test('maps cold_call to cold_calls stage', () => {
    expect(buildLeadTransferPayload({ method: 'cold_call', options: {} })).toEqual({
      stage: 'cold_calls',
      history_option: 'keep_history',
    })
  })

  test('sameStage overrides method', () => {
    expect(buildLeadTransferPayload({ method: 'cold_call', options: { sameStage: true } })).toEqual({
      stage: 'same_stage',
      history_option: 'keep_history',
    })
  })

  test('clearHistory maps to assign_as_new', () => {
    expect(buildLeadTransferPayload({ method: 'fresh', options: { clearHistory: true } })).toEqual({
      stage: 'new_lead',
      history_option: 'assign_as_new',
    })
  })
})
