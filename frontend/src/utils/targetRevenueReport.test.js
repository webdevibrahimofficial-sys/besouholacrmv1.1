import {
  bucketDateRange,
  effectiveDateRange,
  fallbackUserTarget,
  getPeriodBounds,
  isDateInRange,
  matchCommissionRate,
  periodsCoveredInYear,
  resolvePeriodTarget,
  resolveRevenueProjectOrItem,
  resolveTargetForYear,
  resolveTiersForYear,
  timeBucketIndex,
} from './targetRevenueReport'

describe('targetRevenueReport', () => {
  const currentYear = 2026
  const now = new Date('2026-08-16T12:00:00')
  const user = {
    yearly_target: 120000,
    monthly_target: 10000,
    quarterly_target: 30000,
    semi_annual_target: 60000,
    commission_percentage: 4,
  }

  test('uses user numbers only for the current year when no snapshot exists', () => {
    expect(resolveTargetForYear(user, [], 2026, 'monthly', currentYear)).toBe(10000)
    expect(resolveTargetForYear(user, [], 2025, 'monthly', currentYear)).toBe(0)
  })

  test('prefers the saved snapshot for that year', () => {
    const rows = [{ year: 2026, monthly_target: 15000, yearly_target: 180000 }]
    expect(resolveTargetForYear(user, rows, 2026, 'monthly', currentYear)).toBe(15000)
    expect(resolveTargetForYear(user, rows, 2026, 'yearly', currentYear)).toBe(180000)
  })

  test('prorates All years by covered periods', () => {
    const rows = [
      { year: 2025, monthly_target: 8000, yearly_target: 96000 },
      { year: 2026, monthly_target: 10000, yearly_target: 120000 },
    ]
    expect(resolvePeriodTarget({
      user,
      rows,
      yearFilter: 'all',
      type: 'monthly',
      currentYear,
      tenantCreatedYear: 2025,
      now,
    })).toBe(8000 * 12 + 10000 * 8)

    expect(resolvePeriodTarget({
      user,
      rows,
      yearFilter: 'all',
      type: 'yearly',
      currentYear,
      tenantCreatedYear: 2025,
      now,
    })).toBe(96000 + 120000)
  })

  test('monthly period is the current month of the selected year', () => {
    expect(getPeriodBounds({
      yearFilter: '2026',
      targetType: 'monthly',
      now,
      tenantCreatedYear: 2024,
    })).toEqual({ from: '2026-08-01', to: '2026-08-16' })

    expect(getPeriodBounds({
      yearFilter: '2025',
      targetType: 'monthly',
      now,
      tenantCreatedYear: 2024,
    })).toEqual({ from: '2025-08-01', to: '2025-08-31' })
  })

  test('All period starts at tenant created year', () => {
    expect(getPeriodBounds({
      yearFilter: 'all',
      targetType: 'yearly',
      now,
      tenantCreatedYear: 2024,
    })).toEqual({ from: '2024-01-01', to: '2026-08-16' })
  })

  test('date range intersection stays inside the target period', () => {
    const period = { from: '2026-08-01', to: '2026-08-16' }
    expect(effectiveDateRange({ period, dateFrom: '2026-08-10', dateTo: '' })).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
    })
    expect(isDateInRange('2026-08-09', { from: '2026-08-10', to: '2026-08-16' })).toBe(false)
    expect(isDateInRange('2026-08-12', { from: '2026-08-10', to: '2026-08-16' })).toBe(true)
  })

  test('reads the matching commission tier and returns 0 when none match', () => {
    const tiers = [
      { from_percentage: 0, to_percentage: 79.99, commission_percentage: 2 },
      { from_percentage: 80, to_percentage: '', commission_percentage: 5 },
    ]
    expect(matchCommissionRate(tiers, 50)).toBe(2)
    expect(matchCommissionRate(tiers, 80)).toBe(5)
    expect(matchCommissionRate(tiers, 120)).toBe(5)
    expect(matchCommissionRate([], 80)).toBe(0)
  })

  test('uses current-year user commission only when the selected year has no snapshot', () => {
    expect(resolveTiersForYear(user, [], 2026, currentYear)[0].commission_percentage).toBe(4)
    expect(resolveTiersForYear(user, [], 2025, currentYear)).toEqual([])
  })

  test('covered monthly periods stop at the current month', () => {
    expect(periodsCoveredInYear(2025, 'monthly', { now, tenantCreatedYear: 2024 })).toBe(12)
    expect(periodsCoveredInYear(2026, 'monthly', { now, tenantCreatedYear: 2024 })).toBe(8)
    expect(periodsCoveredInYear(2026, 'quarterly', { now, tenantCreatedYear: 2024 })).toBe(3)
  })

  test('time buckets and overlap ranges', () => {
    expect(timeBucketIndex('2026-08-16', 'monthly')).toBe(7)
    expect(timeBucketIndex('2026-08-16', 'quarterly')).toBe(2)
    expect(timeBucketIndex('2026-08-16', 'semi_annual')).toBe(1)
    expect(bucketDateRange(2026, 'quarterly', 2)).toEqual({ from: '2026-07-01', to: '2026-09-30' })
  })

  test('fallback user target keeps the stored split', () => {
    expect(fallbackUserTarget(user, 'semi_annual')).toBe(60000)
    expect(fallbackUserTarget({ yearly_target: 120000 }, 'semi_annual')).toBe(60000)
  })

  test('general tenants use item name, not empty project', () => {
    expect(resolveRevenueProjectOrItem({
      project: '',
      item_name: 'sam',
    }, { companyType: 'general' })).toBe('sam')

    expect(resolveRevenueProjectOrItem({
      item_id: 9,
      project: '',
    }, {
      companyType: 'general',
      itemsById: new Map([['9', 'sam']]),
    })).toBe('sam')

    expect(resolveRevenueProjectOrItem({
      item: 'sam',
      project: '',
    }, { companyType: 'general' })).toBe('sam')

    expect(resolveRevenueProjectOrItem({
      status: 'No Sales',
      project: '-',
      source: '-',
    }, { companyType: 'general' })).toBe('')
  })

  test('closing action item wins over the original lead item', () => {
    expect(resolveRevenueProjectOrItem({
      item_name: 'sam',
      item_id: 9,
      project: '',
    }, {
      companyType: 'general',
      itemsById: new Map([['9', 'sam'], ['12', 'honor']]),
      dealItems: [{ name: 'honor', amount: 25000 }],
    })).toBe('honor')

    expect(resolveRevenueProjectOrItem({
      item_name: 'sam',
      project: '',
    }, {
      companyType: 'general',
      action: {
        details: {
          reservationGeneralItems: [{ item_name: 'honor', line_total: 25000 }],
        },
      },
    })).toBe('honor')
  })

  test('real estate tenants keep the project name', () => {
    expect(resolveRevenueProjectOrItem({
      project: 'Marina',
      item_name: 'sam',
    }, { companyType: 'real estate' })).toBe('Marina')
  })
})
