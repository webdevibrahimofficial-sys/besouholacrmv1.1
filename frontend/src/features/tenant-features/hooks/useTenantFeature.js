import { useMemo } from 'react'
import { useAppState } from '../../../shared/context/AppStateProvider'

export function useTenantFeature(featureKey) {
  const { tenantFeatures } = useAppState()

  return useMemo(() => Boolean(tenantFeatures?.[featureKey]), [tenantFeatures, featureKey])
}
