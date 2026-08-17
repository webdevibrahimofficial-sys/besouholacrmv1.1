import {
  bucketDateRange,
  calculateAchievementPercent,
  effectiveDateRange,
  fallbackUserTarget,
  formatAchievementPercent,
  formatCompactMoney,
  getPeriodBounds,
  indexUsersById,
  isDateInRange,
  matchCommissionRate,
  periodsCoveredInYear,
  resolveManagerName,
  resolvePeriodTarget,
  resolveRevenueProjectOrItem,
  resolveEffectivePeriodTarget,
  resolveSalespersonRowTarget,
  usesCompanyTarget,
  isFieldSalesRole,
  isMidLevelManagerRole,
  isManagerFilterRole,
  shouldIncludeInSalespersonRows,
  matchesManagerFilter,
  resolveReportKpiTarget,
  countClosedDeals,
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

  test('achievement keeps two decimals so small ratios are not rounded to 0', () => {
    expect(calculateAchievementPercent(21000, 16666666.67)).toBe(0.13)
    expect(calculateAchievementPercent(25000, 83333333.33)).toBe(0.03)
    expect(calculateAchievementPercent(100, 100)).toBe(100)
    expect(calculateAchievementPercent(50, 0)).toBe(0)
    expect(formatAchievementPercent(0.13)).toBe('0.13%')
    expect(formatAchievementPercent(100)).toBe('100%')
  })

  test('compacts large money values for chart axes', () => {
    expect(formatCompactMoney(80000000)).toBe('80M')
    expect(formatCompactMoney(16666666.67)).toBe('16.7M')
    expect(formatCompactMoney(25000)).toBe('25K')
    expect(formatCompactMoney(500)).toBe('500')
    expect(formatCompactMoney(80000000, { rtl: true })).toBe('80 مليون')
  })

  test('resolves manager from nested relation or manager_id lookup', () => {
    const usersById = indexUsersById([
      { id: 1, name: 'sales', manager_id: 9 },
      { id: 9, name: 'Sales Manager' },
    ])

    expect(resolveManagerName({ manager: { name: 'Direct Manager' } }, usersById)).toBe('Direct Manager')
    expect(resolveManagerName({ manager_id: 9 }, usersById)).toBe('Sales Manager')
    expect(resolveManagerName({ manager: 9 }, usersById)).toBe('Sales Manager')
    expect(resolveManagerName({ id: 1, name: 'sales' }, usersById)).toBe('')
  })

  test('leadership roles inherit company target instead of personal target', () => {
    const companyRows = [{ year: 2026, monthly_target: 50000, yearly_target: 600000 }]
    const director = { role: 'Director', monthly_target: 1000 }
    const salesperson = { role: 'Sales Person', monthly_target: 10000 }

    expect(usesCompanyTarget(director)).toBe(true)
    expect(usesCompanyTarget({ role: 'Operation Manager' })).toBe(true)
    expect(usesCompanyTarget({ role: 'Tenant Admin' })).toBe(true)
    expect(usesCompanyTarget(salesperson)).toBe(false)
    expect(usesCompanyTarget({ role: 'Sales Admin' })).toBe(false)

    expect(resolveEffectivePeriodTarget({
      user: director,
      rows: [],
      companyRows,
      yearFilter: '2026',
      type: 'monthly',
      currentYear,
      tenantCreatedYear: 2024,
      now,
    })).toBe(50000)

    expect(resolveEffectivePeriodTarget({
      user: salesperson,
      rows: [],
      companyRows,
      yearFilter: '2026',
      type: 'monthly',
      currentYear,
      tenantCreatedYear: 2024,
      now,
    })).toBe(10000)
  })

  test('salesperson rows ignore leftover company/personal numbers for leadership', () => {
    expect(usesCompanyTarget({ is_primary_admin: true, monthly_target: 83333333.33 })).toBe(true)
    expect(resolveSalespersonRowTarget({
      user: { role: 'Tenant Admin', monthly_target: 83333333.33 },
      rows: [{ year: 2026, monthly_target: 83333333.33 }],
      yearFilter: '2026',
      type: 'monthly',
      currentYear,
      tenantCreatedYear: 2024,
      now,
    })).toBe(0)

    expect(resolveSalespersonRowTarget({
      user: { role: 'Sales Person', monthly_target: 50000 },
      rows: [],
      yearFilter: '2026',
      type: 'monthly',
      currentYear,
      tenantCreatedYear: 2024,
      now,
    })).toBe(50000)
  })

  test('classifies field sales vs mid-level managers vs leadership', () => {
    expect(isFieldSalesRole({ role: 'Sales Person' })).toBe(true)
    expect(isFieldSalesRole({ role: 'Sales Manager' })).toBe(false)
    expect(isMidLevelManagerRole({ role: 'Team Leader' })).toBe(true)
    expect(isMidLevelManagerRole({ role: 'Branch Manager' })).toBe(true)
    expect(isMidLevelManagerRole({ role: 'Director' })).toBe(false)
    expect(isManagerFilterRole({ role: 'Team Leader' })).toBe(true)
    expect(isManagerFilterRole({ role: 'Director' })).toBe(false)
    expect(isManagerFilterRole({ role: 'Sales Person' })).toBe(false)
    expect(isManagerFilterRole({ role: 'Operation Manager' })).toBe(false)
  })

  test('salesperson table includes managers personally and leadership only when they have sales', () => {
    expect(shouldIncludeInSalespersonRows({ role: 'Team Leader' }, { personalTarget: 20000 })).toBe(true)
    expect(shouldIncludeInSalespersonRows({ role: 'Sales Person' }, { personalTarget: 0 })).toBe(true)
    expect(shouldIncludeInSalespersonRows({ role: 'Director' }, { personalTarget: 0, hasRevenue: false })).toBe(false)
    expect(shouldIncludeInSalespersonRows({ role: 'Director' }, { personalTarget: 0, hasRevenue: true })).toBe(true)
  })

  test('manager filter matches the manager plus people they manage', () => {
    const usersById = indexUsersById([
      { id: 1, name: 'Sara TL' },
      { id: 2, name: 'Ahmed', manager_id: 1 },
    ])
    expect(matchesManagerFilter({ id: 1, name: 'Sara TL' }, 'Sara TL', usersById)).toBe(true)
    expect(matchesManagerFilter({ id: 2, name: 'Ahmed', manager_id: 1 }, 'Sara TL', usersById)).toBe(true)
    expect(matchesManagerFilter({ id: 3, name: 'Other' }, 'Sara TL', usersById)).toBe(false)
  })

  test('company KPI uses company target until a manager or salesperson filter is applied', () => {
    expect(resolveReportKpiTarget({
      managerFilter: 'all',
      salesPersonFilter: 'all',
      visibleTargets: [10000, 20000],
      companyTarget: 500000,
    })).toBe(500000)

    expect(resolveReportKpiTarget({
      managerFilter: 'Sara TL',
      salesPersonFilter: 'all',
      visibleTargets: [20000, 10000],
      companyTarget: 500000,
    })).toBe(30000)

    expect(resolveReportKpiTarget({
      managerFilter: 'all',
      salesPersonFilter: 'Ahmed',
      visibleTargets: [10000],
      companyTarget: 500000,
    })).toBe(10000)
  })

  test('deals count matches each closed deal and ignores placeholders', () => {
    const rows = [
      { id: 'empty-1', status: 'No Sales', salesperson: 'A', date: '' },
      { id: 10, salesperson: 'sales', manager: 'Test Admin', date: '2026-08-10' },
      { id: 11, salesperson: 'sales', manager: 'Test Admin', date: '2026-08-17' },
      { id: 12, salesperson: 'Test Admin', date: '2026-08-16' },
      { id: 13, salesperson: 'sales', date: '2026-07-02' },
    ]

    expect(countClosedDeals(rows)).toBe(4)
    expect(countClosedDeals(rows, {
      periodRange: { from: '2026-08-01', to: '2026-08-17' },
    })).toBe(3)
  })
})
