import {
  getCommissionTiers,
  filterTiersByScope,
  COMMISSION_SCOPE_PERSONAL,
  COMMISSION_SCOPE_INHERITED,
} from '../../utils/targetRevenueReport'

export function emptyCommissionTier(commission = '') {
  return {
    from_percentage: '0',
    to_percentage: '',
    commission_percentage: commission,
  }
}

export function mapCommissionTiersFromApi(tiers, fallbackCommission = '') {
  const list = Array.isArray(tiers) ? tiers : []
  if (!list.length) return [emptyCommissionTier(fallbackCommission)]
  return list.map((tier) => ({
    from_percentage: String(tier.from_percentage ?? 0),
    to_percentage: tier.to_percentage === null || tier.to_percentage === undefined ? '' : String(tier.to_percentage),
    commission_percentage: String(tier.commission_percentage ?? ''),
  }))
}

export function isDefaultCommissionTiers(tiers, fallbackCommission = '') {
  if (!Array.isArray(tiers) || tiers.length !== 1) return false
  const tier = tiers[0] || {}
  const from = String(tier.from_percentage ?? '0').trim()
  const to = String(tier.to_percentage ?? '').trim()
  const rate = String(tier.commission_percentage ?? '').trim()
  const fallback = String(fallbackCommission ?? '').trim()
  return (from === '' || from === '0') && to === '' && rate === fallback
}

export function shouldApplyApiTargetAmounts({ targetsEdited = false, apiYearly = 0, apiMonthly = 0 } = {}) {
  if (targetsEdited) return false
  return Number(apiYearly) > 0 || Number(apiMonthly) > 0
}

export function shouldApplyApiCommissions({
  commissionsEdited = false,
  commissionsHydrated = false,
  currentTiers,
  inheritedTiers,
  fallbackCommission = '',
} = {}) {
  if (commissionsHydrated) return false
  if (!commissionsEdited) return true
  const personalDefault = isDefaultCommissionTiers(currentTiers, fallbackCommission)
  const inheritedDefault = inheritedTiers == null || isDefaultCommissionTiers(inheritedTiers, '')
  return personalDefault && inheritedDefault
}

export function resolveCommissionHydrationFromTarget(row, fallbackCommission = '') {
  const tiers = getCommissionTiers(row)
  const explicitInherited = Array.isArray(row?.inherited_commission_tiers)
    ? row.inherited_commission_tiers
    : (Array.isArray(row?.inheritedCommissionTiers) ? row.inheritedCommissionTiers : [])
  const personalTiers = filterTiersByScope(tiers, COMMISSION_SCOPE_PERSONAL)
  const inheritedTiers = explicitInherited.length
    ? filterTiersByScope(explicitInherited, COMMISSION_SCOPE_INHERITED)
    : filterTiersByScope(tiers, COMMISSION_SCOPE_INHERITED)

  return {
    personal: mapCommissionTiersFromApi(personalTiers, fallbackCommission || row?.commission_percentage || ''),
    inherited: mapCommissionTiersFromApi(inheritedTiers),
  }
}
