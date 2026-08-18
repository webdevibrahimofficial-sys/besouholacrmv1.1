/* global describe, test, expect */

import {
  mapCommissionTiersFromApi,
  isDefaultCommissionTiers,
  shouldApplyApiTargetAmounts,
  shouldApplyApiCommissions,
  resolveCommissionHydrationFromTarget,
} from './userFormTargetHydration'

describe('userFormTargetHydration', () => {
  test('still hydrates personal tiers when current-year targets are 0', () => {
    const row = {
      year: 2026,
      yearly_target: 0,
      monthly_target: 0,
      commissionTiers: [
        { from_percentage: 0, to_percentage: 80, commission_percentage: 3, scope: 'personal' },
        { from_percentage: 80, to_percentage: null, commission_percentage: 5, scope: 'personal' },
      ],
    }

    expect(shouldApplyApiTargetAmounts({
      targetsEdited: false,
      apiYearly: row.yearly_target,
      apiMonthly: row.monthly_target,
    })).toBe(false)

    expect(shouldApplyApiCommissions({
      commissionsEdited: false,
      commissionsHydrated: false,
    })).toBe(true)

    const { personal } = resolveCommissionHydrationFromTarget(row)
    expect(personal).toHaveLength(2)
    expect(personal[0].commission_percentage).toBe('3')
    expect(personal[1].to_percentage).toBe('')
    expect(personal[1].commission_percentage).toBe('5')
  })

  test('reads camelCase commissionTiers and omitted scope as personal', () => {
    const row = {
      yearly_target: 0,
      commissionTiers: [
        { from_percentage: 0, to_percentage: null, commission_percentage: 4 },
      ],
    }

    const { personal, inherited } = resolveCommissionHydrationFromTarget(row)
    expect(personal).toEqual([
      { from_percentage: '0', to_percentage: '', commission_percentage: '4' },
    ])
    expect(inherited).toEqual([
      { from_percentage: '0', to_percentage: '', commission_percentage: '' },
    ])
  })

  test('keeps inherited manager tiers separate from personal ones', () => {
    const row = {
      commission_tiers: [
        { from_percentage: 0, to_percentage: null, commission_percentage: 2, scope: 'personal' },
        { from_percentage: 0, to_percentage: 100, commission_percentage: 1, scope: 'inherited' },
      ],
      inherited_commission_tiers: [
        { from_percentage: 0, to_percentage: 100, commission_percentage: 1, scope: 'inherited' },
      ],
    }

    const { personal, inherited } = resolveCommissionHydrationFromTarget(row)
    expect(personal).toHaveLength(1)
    expect(personal[0].commission_percentage).toBe('2')
    expect(inherited).toHaveLength(1)
    expect(inherited[0].commission_percentage).toBe('1')
  })

  test('does not re-apply commissions after a real user edit', () => {
    expect(shouldApplyApiCommissions({
      commissionsEdited: true,
      commissionsHydrated: false,
      currentTiers: [
        { from_percentage: '10', to_percentage: '50', commission_percentage: '6' },
      ],
      inheritedTiers: [{ from_percentage: '0', to_percentage: '', commission_percentage: '' }],
      fallbackCommission: '',
    })).toBe(false)
  })

  test('does not re-apply commissions after inherited tiers were edited', () => {
    expect(shouldApplyApiCommissions({
      commissionsEdited: true,
      commissionsHydrated: false,
      currentTiers: [{ from_percentage: '0', to_percentage: '', commission_percentage: '' }],
      inheritedTiers: [
        { from_percentage: '0', to_percentage: '100', commission_percentage: '1' },
      ],
      fallbackCommission: '',
    })).toBe(false)
  })

  test('still hydrates if formatted inputs flipped the dirty flag on the default empty row', () => {
    const fallback = '2'
    const currentTiers = [
      { from_percentage: '0', to_percentage: '', commission_percentage: fallback },
    ]
    expect(isDefaultCommissionTiers(currentTiers, fallback)).toBe(true)
    expect(shouldApplyApiCommissions({
      commissionsEdited: true,
      commissionsHydrated: false,
      currentTiers,
      fallbackCommission: fallback,
    })).toBe(true)
  })

  test('does not overwrite typed target amounts or stored zeros', () => {
    expect(shouldApplyApiTargetAmounts({
      targetsEdited: true,
      apiYearly: 120000,
      apiMonthly: 10000,
    })).toBe(false)
    expect(shouldApplyApiTargetAmounts({
      targetsEdited: false,
      apiYearly: 0,
      apiMonthly: 0,
    })).toBe(false)
    expect(shouldApplyApiTargetAmounts({
      targetsEdited: false,
      apiYearly: 120000,
      apiMonthly: 10000,
    })).toBe(true)
  })

  test('maps empty to_percentage as a blank form field, not a string zero', () => {
    expect(mapCommissionTiersFromApi([
      { from_percentage: 0, to_percentage: null, commission_percentage: 3 },
    ])[0].to_percentage).toBe('')
  })
})
